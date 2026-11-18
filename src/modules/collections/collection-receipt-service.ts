import Decimal from "decimal.js";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { recordAuditEvent } from "@/modules/audit/audit-service";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "@/lib/errors/app-error";
import {
  requireOrganizationScope,
  requirePermission,
} from "@/lib/permissions/auth-guard";
import { AuthenticatedUser } from "@/lib/permissions/types";
import {
  postJournalEntry,
  reverseJournalEntry,
  JournalLineInput,
} from "@/modules/accounting/posting-service";
import { calculatePaymentAllocation } from "./payment-allocation-engine";

const receiptSchema = z.object({
  organizationId: z.string().uuid(),
  loanAccountId: z.string().uuid(),
  cashAccountId: z.string().uuid(),
  receiptNumber: z.string().min(3).max(60),
  businessDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  amount: z.string().refine((v) => Number(v) > 0, "Receipt amount must be positive"),
  paymentMethod: z.enum(["CASH", "BANK_TRANSFER", "UPI", "CHEQUE"]),
  reference: z.string().min(2).max(120).optional(),
  // Optional explicit allocation breakdown; if omitted, automatically computed by policy
  allocation: z
    .object({
      principalAmount: z.string().optional(),
      interestAmount: z.string().optional(),
      feeAmount: z.string().optional(),
      penaltyAmount: z.string().optional(),
      advanceAmount: z.string().optional(),
    })
    .optional(),
});

const reverseReceiptSchema = z.object({
  organizationId: z.string().uuid(),
  receiptId: z.string().uuid(),
  reversalReason: z.string().min(5).max(300),
  businessDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

const allocationSchema = z.object({
  organizationId: z.string().uuid(),
  receiptId: z.string().uuid(),
  loanAccountId: z.string().uuid(),
  principalAmount: z.string().refine((v) => Number(v) >= 0),
  interestAmount: z.string().refine((v) => Number(v) >= 0),
  feeAmount: z.string().refine((v) => Number(v) >= 0),
  penaltyAmount: z.string().refine((v) => Number(v) >= 0),
});

export async function createCollectionReceipt(
  caller: AuthenticatedUser,
  input: z.infer<typeof receiptSchema>
) {
  requireOrganizationScope(caller, input.organizationId);
  requirePermission(caller, "collection.receipt.create");

  const parsed = receiptSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message ?? "Invalid receipt payload");
  }

  const payload = parsed.data;

  const cashAccount = await prisma.cashAccount.findUnique({
    where: { id: payload.cashAccountId },
    include: { chartOfAccount: true },
  });

  if (!cashAccount || cashAccount.organizationId !== payload.organizationId) {
    throw new NotFoundError("CashAccount", payload.cashAccountId);
  }

  // Resolve GL accounts for double-entry ledger impact
  const [pCoa, iCoa, fCoa, penCoa, advCoa] = await Promise.all([
    prisma.chartOfAccount.findUnique({
      where: { organizationId_code: { organizationId: payload.organizationId, code: "1201" } },
    }),
    prisma.chartOfAccount.findUnique({
      where: { organizationId_code: { organizationId: payload.organizationId, code: "4001" } },
    }),
    prisma.chartOfAccount.findUnique({
      where: { organizationId_code: { organizationId: payload.organizationId, code: "4002" } },
    }),
    prisma.chartOfAccount.findUnique({
      where: { organizationId_code: { organizationId: payload.organizationId, code: "4003" } },
    }),
    prisma.chartOfAccount.findUnique({
      where: { organizationId_code: { organizationId: payload.organizationId, code: "2004" } },
    }),
  ]);

  if (!pCoa) {
    throw new NotFoundError("ChartOfAccount", "1201 (Loan Principal Receivable)");
  }

  return prisma.$transaction(async (tx) => {
    // 1. Acquire pessimistic lock on the loan account
    const [lockedLoan] = await tx.$queryRaw<
      Array<{ id: string; organizationId: string; loanAccountNumber: string; principalOutstanding: string; status: string }>
    >`SELECT id, organizationId, loanAccountNumber, principalOutstanding, status FROM loan_accounts WHERE id = ${payload.loanAccountId} FOR UPDATE`;

    if (!lockedLoan || lockedLoan.organizationId !== payload.organizationId) {
      throw new NotFoundError("LoanAccount", payload.loanAccountId);
    }

    if (lockedLoan.status === "CLOSED") {
      throw new ValidationError("Cannot collect payments on a closed loan account");
    }

    const loanAccount = await tx.loanAccount.findUnique({
      where: { id: payload.loanAccountId },
      include: {
        customer: true,
        scheme: true,
      },
    });

    if (!loanAccount) {
      throw new NotFoundError("LoanAccount", payload.loanAccountId);
    }

    const existingReceipt = await tx.collectionReceipt.findFirst({
      where: {
        organizationId: payload.organizationId,
        receiptNumber: payload.receiptNumber,
      },
    });

    if (existingReceipt) {
      throw new ConflictError(`Receipt number "${payload.receiptNumber}" already exists`);
    }

    // 2. Fetch fresh installments under the lock
    const freshInstallments = await tx.repaymentInstallment.findMany({
      where: { loanAccountId: payload.loanAccountId },
      orderBy: { installmentNumber: "asc" },
    });

    const receiptAmount = new Decimal(payload.amount);
    const outstanding = new Decimal(lockedLoan.principalOutstanding);

    // Compute or validate allocation breakdown
    let principalAlloc: Decimal;
    let interestAlloc: Decimal;
    let feeAlloc: Decimal;
    let penaltyAlloc: Decimal;
    let advanceAlloc: Decimal;
    let affectedInstallments: ReturnType<typeof calculatePaymentAllocation>["affectedInstallments"] = [];

    if (payload.allocation) {
      principalAlloc = new Decimal(payload.allocation.principalAmount || "0");
      interestAlloc = new Decimal(payload.allocation.interestAmount || "0");
      feeAlloc = new Decimal(payload.allocation.feeAmount || "0");
      penaltyAlloc = new Decimal(payload.allocation.penaltyAmount || "0");
      advanceAlloc = new Decimal(payload.allocation.advanceAmount || "0");

      const totalAllocated = principalAlloc
        .plus(interestAlloc)
        .plus(feeAlloc)
        .plus(penaltyAlloc)
        .plus(advanceAlloc);

      if (!totalAllocated.equals(receiptAmount)) {
        throw new ValidationError(
          `Allocation sum (${totalAllocated.toFixed(4)}) must equal receipt amount (${receiptAmount.toFixed(4)})`
        );
      }
    } else if (freshInstallments.length > 0) {
      const allocationResult = calculatePaymentAllocation(
        freshInstallments,
        receiptAmount
      );
      principalAlloc = allocationResult.principalAmount;
      interestAlloc = allocationResult.interestAmount;
      feeAlloc = allocationResult.feeAmount;
      penaltyAlloc = allocationResult.penaltyAmount;
      advanceAlloc = allocationResult.advanceAmount;
      affectedInstallments = allocationResult.affectedInstallments;
    } else {
      // Default fallback: allocate up to outstanding principal
      principalAlloc = Decimal.min(receiptAmount, outstanding);
      interestAlloc = new Decimal(0);
      feeAlloc = new Decimal(0);
      penaltyAlloc = new Decimal(0);
      advanceAlloc = Decimal.max(0, receiptAmount.minus(principalAlloc));
    }

    // 3. Create Collection Receipt
    const receipt = await tx.collectionReceipt.create({
      data: {
        organizationId: payload.organizationId,
        loanAccountId: payload.loanAccountId,
        cashAccountId: payload.cashAccountId,
        receiptNumber: payload.receiptNumber,
        businessDate: payload.businessDate,
        amount: payload.amount,
        paymentMethod: payload.paymentMethod,
        reference: payload.reference ?? null,
        status: "POSTED",
        recordedById: caller.userId,
      },
    });

    // 2. Create Receipt Allocation record
    const allocationType = penaltyAlloc.gt(0)
      ? "PENALTY"
      : feeAlloc.gt(0)
      ? "FEE"
      : interestAlloc.gt(0)
      ? "INTEREST"
      : advanceAlloc.gt(0) && principalAlloc.isZero()
      ? "ADVANCE"
      : "PRINCIPAL";

    const allocation = await tx.collectionReceiptAllocation.create({
      data: {
        organizationId: payload.organizationId,
        receiptId: receipt.id,
        loanAccountId: payload.loanAccountId,
        amount: payload.amount,
        allocationType,
        principalAmount: principalAlloc.toFixed(4),
        interestAmount: interestAlloc.toFixed(4),
        feeAmount: feeAlloc.toFixed(4),
        penaltyAmount: penaltyAlloc.toFixed(4),
        status: "POSTED",
      },
    });

    // 3. Update affected installments
    for (const aff of affectedInstallments) {
      await tx.repaymentInstallment.update({
        where: { id: aff.installmentId },
        data: {
          principalPaid: aff.newPrincipalPaid,
          interestPaid: aff.newInterestPaid,
          feePaid: aff.newFeePaid,
          penaltyPaid: aff.newPenaltyPaid,
          totalPaid: aff.newTotalPaid,
          status: aff.newStatus,
          paidAt: aff.newStatus === "PAID" ? new Date() : undefined,
        },
      });
    }

    // 4. Update Loan Account balance, total paid, and next due date
    const newOutstanding = Decimal.max(0, outstanding.minus(principalAlloc));
    const currentPaid = new Decimal(loanAccount.totalPaid || 0);
    const newTotalPaid = currentPaid.plus(principalAlloc).plus(interestAlloc);

    const nextUnpaidInstallment = await tx.repaymentInstallment.findFirst({
      where: {
        loanAccountId: payload.loanAccountId,
        status: { in: ["PENDING", "PARTIALLY_PAID"] },
      },
      orderBy: { installmentNumber: "asc" },
    });

    const isFullyPaid = newOutstanding.isZero() && !nextUnpaidInstallment;

    await tx.loanAccount.update({
      where: { id: payload.loanAccountId },
      data: {
        principalOutstanding: newOutstanding.toFixed(4),
        totalPaid: newTotalPaid.toFixed(4),
        nextDueDate: nextUnpaidInstallment?.dueDate ?? null,
        status: isFullyPaid ? "CLOSED" : undefined,
      },
    });

    // 5. Post Balanced Double-Entry General Ledger Journal Entry
    // Debit: Cash/Bank Account (Asset increases)
    // Credit: Principal (1201), Interest (4001), Fee (4002), Penalty (4003), Advance (2004)
    const journalLines: JournalLineInput[] = [
      {
        accountId: cashAccount.chartOfAccountId,
        debit: receiptAmount,
        credit: 0,
        narration: `Collection received via ${payload.paymentMethod} (Ref: ${payload.receiptNumber})`,
      },
    ];

    if (principalAlloc.gt(0)) {
      journalLines.push({
        accountId: pCoa.id,
        debit: 0,
        credit: principalAlloc,
        narration: `Principal repayment for ${loanAccount.loanAccountNumber}`,
      });
    }

    if (interestAlloc.gt(0) && iCoa) {
      journalLines.push({
        accountId: iCoa.id,
        debit: 0,
        credit: interestAlloc,
        narration: `Interest collected for ${loanAccount.loanAccountNumber}`,
      });
    }

    if (feeAlloc.gt(0) && fCoa) {
      journalLines.push({
        accountId: fCoa.id,
        debit: 0,
        credit: feeAlloc,
        narration: `Fee collected for ${loanAccount.loanAccountNumber}`,
      });
    }

    if (penaltyAlloc.gt(0) && penCoa) {
      journalLines.push({
        accountId: penCoa.id,
        debit: 0,
        credit: penaltyAlloc,
        narration: `Late penalty collected for ${loanAccount.loanAccountNumber}`,
      });
    }

    if (advanceAlloc.gt(0) && advCoa) {
      journalLines.push({
        accountId: advCoa.id,
        debit: 0,
        credit: advanceAlloc,
        narration: `Unapplied advance collection credit for ${loanAccount.loanAccountNumber}`,
      });
    }

    const journalEntry = await postJournalEntry(
      caller,
      {
        organizationId: payload.organizationId,
        businessDate: payload.businessDate,
        sourceModule: "COLLECTIONS",
        sourceType: "COLLECTION_RECEIPT",
        sourceId: receipt.id,
        description: `Loan collection receipt ${receipt.receiptNumber} (${loanAccount.customer.fullName})`,
        idempotencyKey: `RCPT-${receipt.id}`,
        lines: journalLines,
      },
      tx
    );

    // Link journal entry id to receipt
    const updatedReceipt = await tx.collectionReceipt.update({
      where: { id: receipt.id },
      data: { journalEntryId: journalEntry.id },
      include: {
        loanAccount: true,
        allocations: true,
      },
    });

    await recordAuditEvent(
      {
        organizationId: payload.organizationId,
        actorId: caller.userId,
        action: "collection.receipt.created",
        entityType: "CollectionReceipt",
        entityId: receipt.id,
        metadata: {
          receiptNumber: payload.receiptNumber,
          amount: payload.amount,
          paymentMethod: payload.paymentMethod,
          principalAmount: principalAlloc.toFixed(4),
          interestAmount: interestAlloc.toFixed(4),
          journalEntryId: journalEntry.id,
          journalEntryNumber: journalEntry.entryNumber,
        },
      },
      tx
    );

    return {
      ...updatedReceipt,
      allocation,
      journalEntry,
    };
  });
}

export async function reverseCollectionReceipt(
  caller: AuthenticatedUser,
  input: z.infer<typeof reverseReceiptSchema>
) {
  requireOrganizationScope(caller, input.organizationId);
  requirePermission(caller, "collection.receipt.reverse");

  const parsed = reverseReceiptSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message ?? "Invalid reversal payload");
  }

  const payload = parsed.data;

  const receipt = await prisma.collectionReceipt.findUnique({
    where: { id: payload.receiptId },
    include: {
      loanAccount: {
        include: {
          installments: { orderBy: { installmentNumber: "asc" } },
        },
      },
      allocations: true,
    },
  });

  if (!receipt || receipt.organizationId !== payload.organizationId) {
    throw new NotFoundError("CollectionReceipt", payload.receiptId);
  }

  if (receipt.isReversed || receipt.status === "REVERSED") {
    throw new ValidationError("This collection receipt has already been reversed");
  }

  const allocation = receipt.allocations[0];
  const principalReversed = new Decimal(allocation?.principalAmount || receipt.amount);
  const interestReversed = new Decimal(allocation?.interestAmount || "0");

  return prisma.$transaction(async (tx) => {
    // 1. Acquire pessimistic lock on the loan account
    const [lockedLoan] = await tx.$queryRaw<
      Array<{ id: string; organizationId: string; principalOutstanding: string; status: string }>
    >`SELECT id, organizationId, principalOutstanding, status FROM loan_accounts WHERE id = ${receipt.loanAccountId} FOR UPDATE`;

    if (!lockedLoan) {
      throw new NotFoundError("LoanAccount", receipt.loanAccountId);
    }

    // 2. Post compensating General Ledger reversal entry
    let reversalJournalId: string | null = null;
    if (receipt.journalEntryId) {
      const reversalJournal = await reverseJournalEntry(
        caller,
        {
          organizationId: payload.organizationId,
          journalEntryId: receipt.journalEntryId,
          reversalReason: payload.reversalReason,
          businessDate: payload.businessDate,
          idempotencyKey: `REV-RCPT-${receipt.id}`,
        },
        tx
      );
      reversalJournalId = reversalJournal.id;
    }

    // 3. Restore Loan Account principal balance and total paid under lock
    const currentOutstanding = new Decimal(lockedLoan.principalOutstanding);
    const restoredOutstanding = currentOutstanding.plus(principalReversed);
    const currentPaid = new Decimal(receipt.loanAccount.totalPaid || 0);
    const restoredPaid = Decimal.max(0, currentPaid.minus(principalReversed).minus(interestReversed));

    await tx.loanAccount.update({
      where: { id: receipt.loanAccountId },
      data: {
        principalOutstanding: restoredOutstanding.toFixed(4),
        totalPaid: restoredPaid.toFixed(4),
        status: "ACTIVE", // Reopen if closed
      },
    });

    // 4. Mark Receipt as REVERSED
    const updated = await tx.collectionReceipt.update({
      where: { id: receipt.id },
      data: {
        isReversed: true,
        status: "REVERSED",
        reversedAt: new Date(),
        reversedById: caller.userId,
        reversalReason: payload.reversalReason,
        reversalJournalEntryId: reversalJournalId,
      },
    });

    await recordAuditEvent(
      {
        organizationId: payload.organizationId,
        actorId: caller.userId,
        action: "collection.receipt.reversed",
        entityType: "CollectionReceipt",
        entityId: receipt.id,
        metadata: {
          receiptNumber: receipt.receiptNumber,
          reversalReason: payload.reversalReason,
          restoredPrincipal: principalReversed.toFixed(4),
          reversalJournalEntryId: reversalJournalId,
        },
      },
      tx
    );

    return updated;
  });
}

export async function allocateReceiptToLoan(
  caller: AuthenticatedUser,
  input: z.infer<typeof allocationSchema>
) {
  requireOrganizationScope(caller, input.organizationId);
  requirePermission(caller, "collection.receipt.create");

  const parsed = allocationSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message ?? "Invalid allocation request");
  }

  const payload = parsed.data;

  const receipt = await prisma.collectionReceipt.findUnique({ where: { id: payload.receiptId } });
  if (!receipt || receipt.organizationId !== payload.organizationId) {
    throw new NotFoundError("CollectionReceipt", payload.receiptId);
  }

  const total = new Decimal(payload.principalAmount)
    .plus(payload.interestAmount)
    .plus(payload.feeAmount)
    .plus(payload.penaltyAmount);

  if (total.lte(0)) {
    throw new ValidationError("Allocation total must be positive");
  }

  if (!total.equals(new Decimal(receipt.amount))) {
    throw new ValidationError("Allocation total must equal the receipt amount");
  }

  const allocationType =
    new Decimal(payload.penaltyAmount).gt(0)
      ? "PENALTY"
      : new Decimal(payload.feeAmount).gt(0)
      ? "FEE"
      : new Decimal(payload.interestAmount).gt(0)
      ? "INTEREST"
      : "PRINCIPAL";

  return prisma.collectionReceiptAllocation.create({
    data: {
      organizationId: payload.organizationId,
      receiptId: payload.receiptId,
      loanAccountId: payload.loanAccountId,
      amount: receipt.amount,
      allocationType,
      principalAmount: payload.principalAmount,
      interestAmount: payload.interestAmount,
      feeAmount: payload.feeAmount,
      penaltyAmount: payload.penaltyAmount,
      status: "POSTED",
    },
  });
}

export interface GetCollectionReceiptsOptions {
  loanAccountId?: string;
  status?: string;
  businessDate?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

export async function getCollectionReceipts(
  caller: AuthenticatedUser,
  options: GetCollectionReceiptsOptions = {}
) {
  requirePermission(caller, "collection.receipt.create");

  const where: Record<string, unknown> = {
    organizationId: caller.organizationId,
  };

  if (options.loanAccountId) {
    where.loanAccountId = options.loanAccountId;
  }

  if (options.status && options.status !== "ALL") {
    where.status = options.status;
  }

  if (options.businessDate) {
    where.businessDate = options.businessDate;
  }

  if (options.search) {
    where.OR = [
      { receiptNumber: { contains: options.search } },
      { reference: { contains: options.search } },
      { loanAccount: { loanAccountNumber: { contains: options.search } } },
      { loanAccount: { customer: { fullName: { contains: options.search } } } },
      { loanAccount: { customer: { customerCode: { contains: options.search } } } },
    ];
  }

  const [items, total] = await Promise.all([
    prisma.collectionReceipt.findMany({
      where,
      include: {
        loanAccount: {
          select: {
            id: true,
            loanAccountNumber: true,
            customer: {
              select: {
                id: true,
                fullName: true,
                customerCode: true,
                phone: true,
              },
            },
            scheme: {
              select: {
                name: true,
                code: true,
              },
            },
          },
        },
        cashAccount: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
        allocations: true,
      },
      orderBy: { createdAt: "desc" },
      take: options.limit ?? 50,
      skip: options.offset ?? 0,
    }),
    prisma.collectionReceipt.count({ where }),
  ]);

  return { items, total };
}

export async function getCollectionReceiptById(caller: AuthenticatedUser, receiptId: string) {
  requirePermission(caller, "collection.receipt.create");

  const receipt = await prisma.collectionReceipt.findUnique({
    where: { id: receiptId },
    include: {
      loanAccount: {
        include: {
          customer: true,
          scheme: true,
          installments: true,
        },
      },
      cashAccount: true,
      allocations: true,
    },
  });

  if (!receipt || receipt.organizationId !== caller.organizationId) {
    throw new NotFoundError("CollectionReceipt", receiptId);
  }

  return receipt;
}
