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
  requireAnyPermission,
} from "@/lib/permissions/auth-guard";
import { AuthenticatedUser } from "@/lib/permissions/types";
import {
  postJournalEntry,
  reverseJournalEntry,
  JournalLineInput,
} from "@/modules/accounting/posting-service";

const settlementQuoteSchema = z.object({
  organizationId: z.string().uuid(),
  loanAccountId: z.string().uuid(),
  asOfDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  waiverAmount: z.string().refine((v) => Number(v) >= 0).optional(),
});

const closeLoanSchema = z.object({
  organizationId: z.string().uuid(),
  loanAccountId: z.string().uuid(),
  asOfDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  accruedInterest: z.string().refine((v) => Number(v) >= 0).optional(),
  feeAmount: z.string().refine((v) => Number(v) >= 0).optional(),
  penaltyAmount: z.string().refine((v) => Number(v) >= 0).optional(),
  waiverAmount: z.string().refine((v) => Number(v) >= 0).default("0.0000"),
  waiverReason: z.string().max(300).optional(),
  settlementPaymentAmount: z.string().refine((v) => Number(v) >= 0).optional(),
  cashAccountId: z.string().uuid().optional(),
  paymentMethod: z.enum(["CASH", "BANK_TRANSFER", "CHEQUE", "UPI"]).default("CASH"),
  reason: z.string().min(5).max(300),
  idempotencyKey: z.string().max(100).optional(),
});

const reopenClosureSchema = z.object({
  organizationId: z.string().uuid(),
  closureId: z.string().uuid(),
  businessDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  reason: z.string().min(5).max(300),
});

/**
 * Calculates a comprehensive settlement quote as of a given business date.
 * Components: Principal Outstanding, Accrued Interest up to As-Of Date, Unpaid Fees,
 * Unpaid Penalties, and optional requested Waiver.
 */
export async function generateSettlementQuote(
  caller: AuthenticatedUser,
  input: z.input<typeof settlementQuoteSchema>
) {
  requireOrganizationScope(caller, input.organizationId);
  requirePermission(caller, "loan.account.read");

  const parsed = settlementQuoteSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message ?? "Invalid settlement quote request");
  }

  const payload = parsed.data;

  const loanAccount = await prisma.loanAccount.findUnique({
    where: { id: payload.loanAccountId },
    include: {
      customer: true,
      scheme: true,
      installments: {
        orderBy: { installmentNumber: "asc" },
      },
    },
  });

  if (!loanAccount || loanAccount.organizationId !== payload.organizationId) {
    throw new NotFoundError("LoanAccount", payload.loanAccountId);
  }

  if (loanAccount.status === "CLOSED") {
    throw new ValidationError("This loan account is already closed");
  }

  const principalOutstanding = new Decimal(loanAccount.principalOutstanding);
  const asOfDateTime = new Date(`${payload.asOfDate}T23:59:59.999Z`);

  let accruedInterest = new Decimal(0);
  let futureInterest = new Decimal(0);
  let feeAmount = new Decimal(0);
  let penaltyAmount = new Decimal(0);

  for (const inst of loanAccount.installments) {
    const uInterest = Decimal.max(0, new Decimal(inst.interestDue).minus(new Decimal(inst.interestPaid)));
    const uFee = Decimal.max(0, new Decimal(inst.feeDue).minus(new Decimal(inst.feePaid)));
    const uPenalty = Decimal.max(0, new Decimal(inst.penaltyDue).minus(new Decimal(inst.penaltyPaid)));

    if (inst.dueDate <= asOfDateTime) {
      accruedInterest = accruedInterest.plus(uInterest);
    } else {
      futureInterest = futureInterest.plus(uInterest);
    }

    feeAmount = feeAmount.plus(uFee);
    penaltyAmount = penaltyAmount.plus(uPenalty);
  }

  const grossSettlement = principalOutstanding
    .plus(accruedInterest)
    .plus(feeAmount)
    .plus(penaltyAmount);

  const waiverAmount = new Decimal(payload.waiverAmount || 0);
  const netSettlement = Decimal.max(0, grossSettlement.minus(waiverAmount));

  return {
    loanAccountId: loanAccount.id,
    loanAccountNumber: loanAccount.loanAccountNumber,
    asOfDate: payload.asOfDate,
    customer: {
      id: loanAccount.customer.id,
      customerCode: loanAccount.customer.customerCode,
      fullName: loanAccount.customer.fullName,
      phone: loanAccount.customer.phone,
    },
    schemeName: loanAccount.scheme.name,
    principalOutstanding: principalOutstanding.toFixed(4),
    accruedInterest: accruedInterest.toFixed(4),
    futureInterest: futureInterest.toFixed(4),
    feeAmount: feeAmount.toFixed(4),
    penaltyAmount: penaltyAmount.toFixed(4),
    waiverAmount: waiverAmount.toFixed(4),
    grossSettlement: grossSettlement.toFixed(4),
    netSettlement: netSettlement.toFixed(4),
    totalSettlement: grossSettlement.toFixed(4), // backward compatibility for existing callers/tests
    isFullyPaid: grossSettlement.isZero(),
  };
}

/**
 * Posts a formal loan closure, settling any remaining balance via settlement payment and/or approved waiver,
 * posting balanced General Ledger entries, marking installments PAID, and updating loan status to CLOSED.
 */
export async function postLoanClosure(
  caller: AuthenticatedUser,
  input: z.input<typeof closeLoanSchema>
) {
  requireOrganizationScope(caller, input.organizationId);
  requirePermission(caller, "loan.account.manage");

  const parsed = closeLoanSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message ?? "Invalid closure request");
  }

  const payload = parsed.data;

  // Idempotency check
  if (payload.idempotencyKey) {
    const existingByIdempotency = await prisma.loanClosure.findUnique({
      where: { idempotencyKey: payload.idempotencyKey },
      include: {
        loanAccount: {
          include: { customer: true, scheme: true },
        },
        cashAccount: true,
      },
    });
    if (existingByIdempotency) {
      return {
        ...existingByIdempotency,
        totalSettlement: existingByIdempotency.totalSettlement,
      };
    }
  }

  const loanAccount = await prisma.loanAccount.findUnique({
    where: { id: payload.loanAccountId },
    include: {
      customer: true,
      scheme: true,
      installments: {
        orderBy: { installmentNumber: "asc" },
      },
    },
  });

  if (!loanAccount || loanAccount.organizationId !== payload.organizationId) {
    throw new NotFoundError("LoanAccount", payload.loanAccountId);
  }

  if (loanAccount.status === "CLOSED") {
    throw new ValidationError("This loan account is already closed");
  }

  const existingActiveClosure = await prisma.loanClosure.findFirst({
    where: {
      organizationId: payload.organizationId,
      loanAccountId: payload.loanAccountId,
      status: "POSTED",
    },
  });

  if (existingActiveClosure) {
    throw new ValidationError("Active loan closure already exists for this account");
  }

  const principalOutstanding = new Decimal(loanAccount.principalOutstanding);
  const asOfDateTime = new Date(`${payload.asOfDate}T23:59:59.999Z`);

  let accruedInterest = payload.accruedInterest != null
    ? new Decimal(payload.accruedInterest)
    : new Decimal(0);
  let feeAmount = payload.feeAmount != null
    ? new Decimal(payload.feeAmount)
    : new Decimal(0);
  let penaltyAmount = payload.penaltyAmount != null
    ? new Decimal(payload.penaltyAmount)
    : new Decimal(0);

  if (payload.accruedInterest == null && loanAccount.installments.length > 0) {
    for (const inst of loanAccount.installments) {
      if (inst.dueDate <= asOfDateTime) {
        const uInterest = Decimal.max(0, new Decimal(inst.interestDue).minus(new Decimal(inst.interestPaid)));
        accruedInterest = accruedInterest.plus(uInterest);
      }
    }
  }

  if (payload.feeAmount == null && loanAccount.installments.length > 0) {
    for (const inst of loanAccount.installments) {
      const uFee = Decimal.max(0, new Decimal(inst.feeDue).minus(new Decimal(inst.feePaid)));
      feeAmount = feeAmount.plus(uFee);
    }
  }

  if (payload.penaltyAmount == null && loanAccount.installments.length > 0) {
    for (const inst of loanAccount.installments) {
      const uPenalty = Decimal.max(0, new Decimal(inst.penaltyDue).minus(new Decimal(inst.penaltyPaid)));
      penaltyAmount = penaltyAmount.plus(uPenalty);
    }
  }

  const waiverAmount = new Decimal(payload.waiverAmount || 0);
  const grossSettlement = principalOutstanding
    .plus(accruedInterest)
    .plus(feeAmount)
    .plus(penaltyAmount);

  // If settlement payment amount is explicitly provided, use it; otherwise default to the net settlement
  const settlementPaymentAmount = payload.settlementPaymentAmount != null
    ? new Decimal(payload.settlementPaymentAmount)
    : Decimal.max(0, grossSettlement.minus(waiverAmount));

  const totalCovered = settlementPaymentAmount.plus(waiverAmount);
  const residual = grossSettlement.minus(totalCovered);

  // Strict residual check: cannot close account with unresolved residual balance unless covered
  if (residual.gt(new Decimal("0.0001"))) {
    throw new ValidationError(
      `Cannot close loan while an un-waived residual balance of ${residual.toFixed(2)} remains. The balance must be fully settled or explicitly waived.`
    );
  }

  if (grossSettlement.gt(0) && totalCovered.lte(0)) {
    throw new ValidationError("Settlement total must be greater than zero to close the loan");
  }

  if (waiverAmount.gt(0) && (!payload.waiverReason || payload.waiverReason.trim() === "")) {
    payload.waiverReason = payload.reason;
  }

  return prisma.$transaction(async (tx) => {
    // Generate unique sequential closure receipt number
    const closureCount = await tx.loanClosure.count({
      where: { organizationId: payload.organizationId },
    });
    const dateStamp = payload.asOfDate.replace(/-/g, "");
    const closureNumber = `LC-${dateStamp}-${(closureCount + 1).toString().padStart(4, "0")}`;

    let journalEntryId: string | null = null;
    let cashAccountIdToRecord: string | null = null;

    // Post double-entry General Ledger entry if money or waiver is moving
    if (settlementPaymentAmount.gt(0) || waiverAmount.gt(0)) {
      let cashAccount = null;
      if (payload.cashAccountId) {
        cashAccount = await tx.cashAccount.findUnique({
          where: { id: payload.cashAccountId },
        });
        if (!cashAccount || cashAccount.organizationId !== payload.organizationId) {
          throw new NotFoundError("CashAccount", payload.cashAccountId);
        }
      } else if (settlementPaymentAmount.gt(0)) {
        cashAccount = await tx.cashAccount.findFirst({
          where: { organizationId: payload.organizationId, isActive: true },
        });
      }

      if (settlementPaymentAmount.gt(0) && cashAccount) {
        cashAccountIdToRecord = cashAccount.id;
      }

      // Lookup Chart of Accounts
      const [pCoa, iCoa, fCoa, penCoa, provCoa] = await Promise.all([
        tx.chartOfAccount.findUnique({
          where: { organizationId_code: { organizationId: payload.organizationId, code: "1201" } },
        }),
        tx.chartOfAccount.findUnique({
          where: { organizationId_code: { organizationId: payload.organizationId, code: "4001" } },
        }),
        tx.chartOfAccount.findUnique({
          where: { organizationId_code: { organizationId: payload.organizationId, code: "4002" } },
        }),
        tx.chartOfAccount.findUnique({
          where: { organizationId_code: { organizationId: payload.organizationId, code: "4003" } },
        }),
        tx.chartOfAccount.findUnique({
          where: { organizationId_code: { organizationId: payload.organizationId, code: "5003" } },
        }),
      ]);

      const journalLines: JournalLineInput[] = [];

      // 1. Debits: Cash/Bank and/or Provision/Waiver Expense
      if (settlementPaymentAmount.gt(0) && cashAccount) {
        journalLines.push({
          accountId: cashAccount.chartOfAccountId,
          debit: settlementPaymentAmount,
          credit: 0,
          narration: `Closure settlement payment for loan ${loanAccount.loanAccountNumber} (${closureNumber})`,
        });
      }

      if (waiverAmount.gt(0) && provCoa) {
        journalLines.push({
          accountId: provCoa.id,
          debit: waiverAmount,
          credit: 0,
          narration: `Authorized waiver on closure for loan ${loanAccount.loanAccountNumber}: ${payload.waiverReason}`,
        });
      }

      // 2. Credits: Allocate settlement across Penalty, Fee, Interest, Principal
      if (penaltyAmount.gt(0) && penCoa) {
        journalLines.push({
          accountId: penCoa.id,
          debit: 0,
          credit: penaltyAmount,
          narration: `Penalty settlement on loan ${loanAccount.loanAccountNumber}`,
        });
      }

      if (feeAmount.gt(0) && fCoa) {
        journalLines.push({
          accountId: fCoa.id,
          debit: 0,
          credit: feeAmount,
          narration: `Fee settlement on loan ${loanAccount.loanAccountNumber}`,
        });
      }

      if (accruedInterest.gt(0) && iCoa) {
        journalLines.push({
          accountId: iCoa.id,
          debit: 0,
          credit: accruedInterest,
          narration: `Interest settlement on loan ${loanAccount.loanAccountNumber}`,
        });
      }

      if (principalOutstanding.gt(0) && pCoa) {
        journalLines.push({
          accountId: pCoa.id,
          debit: 0,
          credit: principalOutstanding,
          narration: `Principal settlement on loan ${loanAccount.loanAccountNumber}`,
        });
      }

      // Only post GL if we have at least 2 lines and valid accounts
      if (journalLines.length >= 2) {
        const entry = await postJournalEntry(
          caller,
          {
            organizationId: payload.organizationId,
            businessDate: payload.asOfDate,
            sourceModule: "LOANS",
            sourceType: "LOAN_CLOSURE",
            sourceId: loanAccount.id,
            description: `Loan closure settlement for ${loanAccount.loanAccountNumber} (${loanAccount.customer.fullName})`,
            idempotencyKey: `LC-JRNL-${closureNumber}`,
            lines: journalLines,
          },
          tx
        );
        journalEntryId = entry.id;
      }
    }

    // Mark all installments of the loan account as PAID
    await tx.repaymentInstallment.updateMany({
      where: {
        loanAccountId: payload.loanAccountId,
        status: { in: ["PENDING", "PARTIALLY_PAID", "OVERDUE"] },
      },
      data: {
        status: "PAID",
        paidAt: new Date(payload.asOfDate),
      },
    });

    // Close the loan account
    await tx.loanAccount.update({
      where: { id: payload.loanAccountId },
      data: {
        status: "CLOSED",
        principalOutstanding: "0.0000",
        nextDueDate: null,
      },
    });

    // Create immutable LoanClosure record
    const closure = await tx.loanClosure.create({
      data: {
        organizationId: payload.organizationId,
        loanAccountId: payload.loanAccountId,
        closureNumber,
        asOfDate: payload.asOfDate,
        principalOutstanding: principalOutstanding.toFixed(4),
        accruedInterest: accruedInterest.toFixed(4),
        feeAmount: feeAmount.toFixed(4),
        penaltyAmount: penaltyAmount.toFixed(4),
        waiverAmount: waiverAmount.toFixed(4),
        waiverReason: payload.waiverReason ?? null,
        totalSettlement: grossSettlement.toFixed(4),
        settlementPaymentAmount: settlementPaymentAmount.toFixed(4),
        cashAccountId: cashAccountIdToRecord,
        paymentMethod: payload.paymentMethod,
        journalEntryId,
        idempotencyKey: payload.idempotencyKey ?? null,
        status: "POSTED",
        reason: payload.reason,
        createdById: caller.userId,
      },
      include: {
        loanAccount: {
          include: { customer: true, scheme: true },
        },
        cashAccount: true,
      },
    });

    await recordAuditEvent(
      {
        organizationId: payload.organizationId,
        actorId: caller.userId,
        action: "loan.account.closed",
        entityType: "LoanClosure",
        entityId: closure.id,
        metadata: {
          closureNumber,
          loanAccountId: payload.loanAccountId,
          totalSettlement: grossSettlement.toFixed(4),
          settlementPaymentAmount: settlementPaymentAmount.toFixed(4),
          waiverAmount: waiverAmount.toFixed(4),
          journalEntryId,
          reason: payload.reason,
        },
      },
      tx
    );

    return {
      ...closure,
      totalSettlement: grossSettlement.toFixed(4),
    };
  });
}

/**
 * Reopens a closed loan account with elevated authorization.
 * Reverses the closure journal entry, restores loan balance and installment states,
 * and maintains an immutable audit trail.
 */
export async function reopenLoanClosure(
  caller: AuthenticatedUser,
  input: z.input<typeof reopenClosureSchema>
) {
  requireOrganizationScope(caller, input.organizationId);
  requirePermission(caller, "loan.account.manage");

  const parsed = reopenClosureSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message ?? "Invalid reopen request");
  }

  const payload = parsed.data;

  const closure = await prisma.loanClosure.findUnique({
    where: { id: payload.closureId },
    include: {
      loanAccount: {
        include: {
          installments: { orderBy: { installmentNumber: "asc" } },
        },
      },
    },
  });

  if (!closure || closure.organizationId !== payload.organizationId) {
    throw new NotFoundError("LoanClosure", payload.closureId);
  }

  if (closure.status === "REOPENED" || closure.isReopened) {
    throw new ValidationError("This loan closure has already been reopened");
  }

  if (closure.loanAccount.status !== "CLOSED") {
    throw new ValidationError("Associated loan account is not currently closed");
  }

  return prisma.$transaction(async (tx) => {
    let reopenJournalEntryId: string | null = null;

    // If an accounting journal was posted at closure, reverse it
    if (closure.journalEntryId) {
      const reversalJournal = await reverseJournalEntry(
        caller,
        {
          organizationId: payload.organizationId,
          journalEntryId: closure.journalEntryId,
          reversalReason: `Reopening loan closure ${closure.closureNumber ?? closure.id}: ${payload.reason}`,
          businessDate: payload.businessDate ?? closure.asOfDate,
          idempotencyKey: `REOPEN-CLOSURE-${closure.id}`,
        },
        tx
      );
      reopenJournalEntryId = reversalJournal.id;
    }

    // Mark closure record as REOPENED
    const updatedClosure = await tx.loanClosure.update({
      where: { id: closure.id },
      data: {
        status: "REOPENED",
        isReopened: true,
        reopenedAt: new Date(),
        reopenedById: caller.userId,
        reopenReason: payload.reason,
        reopenJournalEntryId,
      },
    });

    // Determine next due date from installments
    let earliestPendingDueDate: Date | null = null;
    for (const inst of closure.loanAccount.installments) {
      if (new Decimal(inst.principalPaid).lt(inst.principalDue)) {
        if (!earliestPendingDueDate || inst.dueDate < earliestPendingDueDate) {
          earliestPendingDueDate = inst.dueDate;
        }
      }
    }

    // Restore LoanAccount status to ACTIVE and reinstate principal outstanding
    await tx.loanAccount.update({
      where: { id: closure.loanAccountId },
      data: {
        status: "ACTIVE",
        principalOutstanding: closure.principalOutstanding,
        nextDueDate: earliestPendingDueDate,
      },
    });

    // Restore installments that were marked PAID at closure
    // If an installment had principalPaid == 0 prior to closure, revert it to PENDING
    for (const inst of closure.loanAccount.installments) {
      if (new Decimal(inst.principalPaid).isZero()) {
        await tx.repaymentInstallment.update({
          where: { id: inst.id },
          data: {
            status: "PENDING",
            paidAt: null,
          },
        });
      }
    }

    await recordAuditEvent(
      {
        organizationId: payload.organizationId,
        actorId: caller.userId,
        action: "loan.account.reopened",
        entityType: "LoanClosure",
        entityId: closure.id,
        metadata: {
          closureNumber: closure.closureNumber,
          loanAccountId: closure.loanAccountId,
          restoredPrincipal: closure.principalOutstanding,
          reversalJournalEntryId: reopenJournalEntryId,
          reason: payload.reason,
        },
      },
      tx
    );

    return updatedClosure;
  });
}

/**
 * Generates official loan closure / No Dues Certificate data for a closed loan account.
 */
export async function getLoanClosureCertificate(
  caller: AuthenticatedUser,
  loanAccountId: string
) {
  requirePermission(caller, "loan.account.read");

  const loanAccount = await prisma.loanAccount.findUnique({
    where: { id: loanAccountId },
    include: {
      customer: true,
      scheme: true,
      disbursements: {
        orderBy: { disbursementDate: "desc" },
        take: 1,
      },
      loanClosures: {
        where: { status: "POSTED" },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
      collectionReceipts: {
        where: { isReversed: false },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!loanAccount || loanAccount.organizationId !== caller.organizationId) {
    throw new NotFoundError("LoanAccount", loanAccountId);
  }

  const closure = loanAccount.loanClosures[0];
  if (!closure) {
    throw new NotFoundError("LoanClosure", loanAccountId);
  }

  const latestDisbursement = loanAccount.disbursements[0];

  return {
    certificateNumber: closure.closureNumber ?? `CERT-${closure.id.slice(0, 8).toUpperCase()}`,
    issuedDate: closure.asOfDate,
    status: closure.status,
    customer: {
      id: loanAccount.customer.id,
      customerCode: loanAccount.customer.customerCode,
      fullName: loanAccount.customer.fullName,
      phone: loanAccount.customer.phone,
      email: loanAccount.customer.email,
    },
    loan: {
      loanAccountNumber: loanAccount.loanAccountNumber,
      schemeName: loanAccount.scheme.name,
      principalDisbursed: loanAccount.principalDisbursed,
      disbursementDate: latestDisbursement?.disbursementDate
        ? latestDisbursement.disbursementDate.toISOString().slice(0, 10)
        : null,
    },
    settlement: {
      asOfDate: closure.asOfDate,
      principalSettled: closure.principalOutstanding,
      accruedInterest: closure.accruedInterest,
      feeAmount: closure.feeAmount,
      penaltyAmount: closure.penaltyAmount,
      waiverAmount: closure.waiverAmount,
      waiverReason: closure.waiverReason,
      totalSettlement: closure.totalSettlement,
      settlementPaymentAmount: closure.settlementPaymentAmount,
      closedAt: closure.createdAt.toISOString(),
      closedByUserId: closure.createdById,
    },
    declarationText: `This is to certify that borrower ${loanAccount.customer.fullName} (Customer Code: ${loanAccount.customer.customerCode}) has fully settled all financial obligations for loan account ${loanAccount.loanAccountNumber} under scheme "${loanAccount.scheme.name}". The outstanding balance is NIL ($0.00) and the account is formally and permanently CLOSED.`,
  };
}

/**
 * Retrieves a list of loan closures with pagination and filters.
 */
export async function getLoanClosures(
  caller: AuthenticatedUser,
  options: {
    status?: string;
    search?: string;
    limit?: number;
    offset?: number;
  } = {}
) {
  requireAnyPermission(caller, "loan.account.read", "loan.account.close", "loan.application.view");

  const where: Record<string, unknown> = {
    organizationId: caller.organizationId,
  };

  if (options.status && options.status !== "ALL") {
    where.status = options.status;
  }

  if (options.search) {
    where.OR = [
      { closureNumber: { contains: options.search } },
      { loanAccount: { loanAccountNumber: { contains: options.search } } },
      { loanAccount: { customer: { fullName: { contains: options.search } } } },
      { loanAccount: { customer: { customerCode: { contains: options.search } } } },
    ];
  }

  const [items, total] = await Promise.all([
    prisma.loanClosure.findMany({
      where,
      include: {
        loanAccount: {
          include: {
            customer: true,
            scheme: true,
          },
        },
        cashAccount: true,
      },
      orderBy: { createdAt: "desc" },
      take: options.limit ?? 50,
      skip: options.offset ?? 0,
    }),
    prisma.loanClosure.count({ where }),
  ]);

  return { items, total };
}
