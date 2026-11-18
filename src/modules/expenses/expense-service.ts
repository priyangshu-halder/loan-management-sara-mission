import Decimal from "decimal.js";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { recordAuditEvent } from "@/modules/audit/audit-service";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors/app-error";
import { requireOrganizationScope, requirePermission } from "@/lib/permissions/auth-guard";
import { AuthenticatedUser } from "@/lib/permissions/types";
import { postJournalEntry, reverseJournalEntry, JournalLineInput } from "@/modules/accounting/posting-service";
import { getTodayBusinessDate } from "@/lib/dates/dates";
import { saveExpenseAttachment, deleteStoredFile, StoredFileMetadata } from "@/lib/storage/storage-provider";
import crypto from "crypto";

const categorySchema = z.object({
  organizationId: z.string().uuid(),
  code: z.string().min(2).max(30),
  name: z.string().min(2).max(100),
  description: z.string().max(200).optional(),
  chartOfAccountId: z.string().uuid().optional(),
});

const createExpenseSchema = z.object({
  organizationId: z.string().uuid(),
  branchId: z.string().uuid().optional(),
  voucherNumber: z.string().min(2).max(60).optional(),
  categoryId: z.string().uuid().optional(),
  category: z.string().min(2).max(80),
  chartOfAccountId: z.string().uuid().optional(),
  amount: z.string().refine((v) => Number(v) > 0, "Expense amount must be positive"),
  expenseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  payee: z.string().min(2).max(120),
  paymentMethod: z.enum(["CASH", "BANK_TRANSFER", "CHEQUE", "UPI"]).default("CASH"),
  description: z.string().min(2).max(400).optional(),
  supportingRef: z.string().min(2).max(120).optional(),
  autoSubmit: z.boolean().default(false),
  attachmentFile: z
    .object({
      fileName: z.string().min(1),
      mimeType: z.string().min(1),
      buffer: z.instanceof(Buffer),
    })
    .optional(),
});

const submitExpenseSchema = z.object({
  organizationId: z.string().uuid(),
  expenseId: z.string().uuid(),
});

const approveExpenseSchema = z.object({
  organizationId: z.string().uuid(),
  expenseId: z.string().uuid(),
  reason: z.string().min(3).max(200).optional(),
});

const rejectExpenseSchema = z.object({
  organizationId: z.string().uuid(),
  expenseId: z.string().uuid(),
  rejectionReason: z.string().min(3).max(300),
});

const postExpensePaymentSchema = z.object({
  organizationId: z.string().uuid(),
  expenseId: z.string().uuid(),
  cashAccountId: z.string().uuid(),
  paymentReference: z.string().min(3).max(60),
  amount: z.string().refine((v) => Number(v) > 0, "Payment amount must be positive"),
  businessDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

const reverseExpenseSchema = z.object({
  organizationId: z.string().uuid(),
  expenseId: z.string().uuid(),
  reversalReason: z.string().min(5).max(300),
  businessDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

/**
 * Creates or updates an operational expense category.
 */
export async function createExpenseCategory(
  caller: AuthenticatedUser,
  input: z.input<typeof categorySchema>
) {
  requireOrganizationScope(caller, input.organizationId);
  requirePermission(caller, "expense.submit");

  const parsed = categorySchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message ?? "Invalid category payload");
  }

  const payload = parsed.data;

  const existing = await prisma.expenseCategory.findUnique({
    where: {
      organizationId_code: {
        organizationId: payload.organizationId,
        code: payload.code,
      },
    },
  });

  if (existing) {
    return prisma.expenseCategory.update({
      where: { id: existing.id },
      data: {
        name: payload.name,
        description: payload.description ?? null,
        chartOfAccountId: payload.chartOfAccountId ?? null,
      },
    });
  }

  return prisma.expenseCategory.create({
    data: {
      organizationId: payload.organizationId,
      code: payload.code,
      name: payload.name,
      description: payload.description ?? null,
      chartOfAccountId: payload.chartOfAccountId ?? null,
    },
  });
}

/**
 * Lists all active expense categories for the organization.
 */
export async function getExpenseCategories(caller: AuthenticatedUser) {
  return prisma.expenseCategory.findMany({
    where: {
      organizationId: caller.organizationId,
      isActive: true,
    },
    include: {
      chartOfAccount: true,
    },
    orderBy: { code: "asc" },
  });
}

/**
 * Creates a new operational expense voucher in DRAFT or SUBMITTED status.
 */
export async function createExpense(
  caller: AuthenticatedUser,
  input: z.input<typeof createExpenseSchema>
) {
  requireOrganizationScope(caller, input.organizationId);
  requirePermission(caller, "expense.submit");

  const parsed = createExpenseSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message ?? "Invalid expense payload");
  }

  const payload = parsed.data;
  const voucherNumber = payload.voucherNumber || `EXP-${payload.expenseDate.replace(/-/g, "")}-${Date.now().toString().slice(-4)}`;

  // If categoryId provided, look up category to resolve default chart of account
  let resolvedCoaId = payload.chartOfAccountId ?? null;
  if (payload.categoryId) {
    const cat = await prisma.expenseCategory.findUnique({ where: { id: payload.categoryId } });
    if (cat?.chartOfAccountId && !resolvedCoaId) {
      resolvedCoaId = cat.chartOfAccountId;
    }
  }

  // If no Chart of Account mapped, fall back to 5001 Branch Rent & Office Expense
  if (!resolvedCoaId) {
    const defaultExpenseCoa = await prisma.chartOfAccount.findUnique({
      where: {
        organizationId_code: {
          organizationId: payload.organizationId,
          code: "5001",
        },
      },
    });
    if (defaultExpenseCoa) {
      resolvedCoaId = defaultExpenseCoa.id;
    }
  }

  const tempExpenseId = crypto.randomUUID();
  let savedFileMetadata: StoredFileMetadata | null = null;

  if (payload.attachmentFile) {
    savedFileMetadata = await saveExpenseAttachment(
      payload.organizationId,
      tempExpenseId,
      payload.attachmentFile
    );
  }

  try {
    const expense = await prisma.expense.create({
      data: {
        id: tempExpenseId,
        organizationId: payload.organizationId,
        branchId: payload.branchId ?? null,
        voucherNumber,
        categoryId: payload.categoryId ?? null,
        category: payload.category,
        chartOfAccountId: resolvedCoaId,
        amount: new Decimal(payload.amount).toFixed(4),
        expenseDate: payload.expenseDate,
        payee: payload.payee,
        paymentMethod: payload.paymentMethod,
        description: payload.description ?? null,
        supportingRef: payload.supportingRef ?? null,
        status: payload.autoSubmit ? "SUBMITTED" : "DRAFT",
        submittedById: caller.userId,
        submittedAt: payload.autoSubmit ? new Date() : null,
        attachmentFileName: savedFileMetadata?.fileName ?? null,
        attachmentStoragePath: savedFileMetadata?.storagePath ?? null,
        attachmentMimeType: savedFileMetadata?.mimeType ?? null,
        attachmentFileSize: savedFileMetadata?.fileSize ?? null,
      },
      include: {
        expenseCategory: true,
        chartOfAccount: true,
      },
    });

    await recordAuditEvent({
      organizationId: payload.organizationId,
      actorId: caller.userId,
      action: payload.autoSubmit ? "expense.submitted" : "expense.created",
      entityType: "Expense",
      entityId: expense.id,
      metadata: {
        voucherNumber,
        category: payload.category,
        amount: payload.amount,
        status: expense.status,
        hasAttachment: !!savedFileMetadata,
        attachmentFileName: savedFileMetadata?.fileName ?? null,
      },
    });

    return expense;
  } catch (err) {
    if (savedFileMetadata) {
      await deleteStoredFile(savedFileMetadata.storagePath).catch(() => {});
    }
    throw err;
  }
}

/**
 * Submits a draft or rejected expense for maker-checker evaluation.
 */
export async function submitExpense(
  caller: AuthenticatedUser,
  input: z.input<typeof submitExpenseSchema>
) {
  requireOrganizationScope(caller, input.organizationId);
  requirePermission(caller, "expense.submit");

  const parsed = submitExpenseSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message ?? "Invalid submission request");
  }

  const payload = parsed.data;

  const expense = await prisma.expense.findUnique({ where: { id: payload.expenseId } });
  if (!expense || expense.organizationId !== payload.organizationId) {
    throw new NotFoundError("Expense", payload.expenseId);
  }

  if (expense.status !== "DRAFT" && expense.status !== "REJECTED") {
    throw new ValidationError("Only draft or rejected expenses can be submitted for approval");
  }

  const updated = await prisma.expense.update({
    where: { id: expense.id },
    data: {
      status: "SUBMITTED",
      submittedById: caller.userId,
      submittedAt: new Date(),
      rejectionReason: null,
      rejectedById: null,
      rejectedAt: null,
    },
  });

  await recordAuditEvent({
    organizationId: payload.organizationId,
    actorId: caller.userId,
    action: "expense.submitted",
    entityType: "Expense",
    entityId: expense.id,
    metadata: { voucherNumber: expense.voucherNumber, amount: expense.amount },
  });

  await prisma.approvalHistory.create({
    data: {
      organizationId: payload.organizationId,
      entityType: "EXPENSE",
      entityId: expense.id,
      action: "SUBMIT",
      statusBefore: expense.status,
      statusAfter: "SUBMITTED",
      makerId: caller.userId,
      checkerId: null,
      comments: "Expense claim submitted for approval",
    },
  });

  return updated;
}

/**
 * Approves an expense claim under maker-checker separation of duties.
 */
export async function approveExpense(
  caller: AuthenticatedUser,
  input: z.input<typeof approveExpenseSchema>
) {
  requireOrganizationScope(caller, input.organizationId);
  requirePermission(caller, "expense.approve");

  const parsed = approveExpenseSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message ?? "Invalid approval request");
  }

  const payload = parsed.data;

  const expense = await prisma.expense.findUnique({ where: { id: payload.expenseId } });
  if (!expense || expense.organizationId !== payload.organizationId) {
    throw new NotFoundError("Expense", payload.expenseId);
  }

  if (expense.status !== "DRAFT" && expense.status !== "SUBMITTED") {
    throw new ValidationError("Only draft or submitted expenses can be approved");
  }

  // Maker-checker separation: non-org-admin cannot approve their own expense submission
  if (expense.submittedById === caller.userId && !caller.isOrgAdmin && !caller.isSuperAdmin) {
    throw new ForbiddenError("Makers cannot approve their own expense claims under separation-of-duties policy");
  }

  const approved = await prisma.expense.update({
    where: { id: expense.id },
    data: {
      status: "APPROVED",
      approvedById: caller.userId,
      approvedAt: new Date(),
      approvalReason: payload.reason ?? "Approved by authorized approver",
    },
  });

  await recordAuditEvent({
    organizationId: payload.organizationId,
    actorId: caller.userId,
    action: "expense.approved",
    entityType: "Expense",
    entityId: approved.id,
    metadata: {
      voucherNumber: expense.voucherNumber,
      amount: expense.amount,
      reason: payload.reason ?? "Approved by authorized staff",
    },
  });

  await prisma.approvalHistory.create({
    data: {
      organizationId: payload.organizationId,
      entityType: "EXPENSE",
      entityId: approved.id,
      action: "APPROVE",
      statusBefore: expense.status,
      statusAfter: "APPROVED",
      makerId: expense.submittedById,
      checkerId: caller.userId,
      comments: payload.reason ?? "Approved by authorized approver",
    },
  });

  return approved;
}

/**
 * Rejects an expense claim with required operational reason.
 */
export async function rejectExpense(
  caller: AuthenticatedUser,
  input: z.input<typeof rejectExpenseSchema>
) {
  requireOrganizationScope(caller, input.organizationId);
  requirePermission(caller, "expense.approve");

  const parsed = rejectExpenseSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message ?? "Invalid rejection request");
  }

  const payload = parsed.data;

  const expense = await prisma.expense.findUnique({ where: { id: payload.expenseId } });
  if (!expense || expense.organizationId !== payload.organizationId) {
    throw new NotFoundError("Expense", payload.expenseId);
  }

  if (expense.status !== "DRAFT" && expense.status !== "SUBMITTED") {
    throw new ValidationError("Only draft or submitted expenses can be rejected");
  }

  const rejected = await prisma.expense.update({
    where: { id: expense.id },
    data: {
      status: "REJECTED",
      rejectedById: caller.userId,
      rejectedAt: new Date(),
      rejectionReason: payload.rejectionReason,
    },
  });

  await recordAuditEvent({
    organizationId: payload.organizationId,
    actorId: caller.userId,
    action: "expense.rejected",
    entityType: "Expense",
    entityId: rejected.id,
    metadata: {
      voucherNumber: expense.voucherNumber,
      rejectionReason: payload.rejectionReason,
    },
  });

  await prisma.approvalHistory.create({
    data: {
      organizationId: payload.organizationId,
      entityType: "EXPENSE",
      entityId: rejected.id,
      action: "REJECT",
      statusBefore: expense.status,
      statusAfter: "REJECTED",
      makerId: expense.submittedById,
      checkerId: caller.userId,
      comments: payload.rejectionReason,
    },
  });

  return rejected;
}

/**
 * Posts an approved expense payment:
 * - Debits Expense Account (GL 5001 / Category COA)
 * - Credits Cash / Bank Account (GL 1001 / 1002)
 * - Updates cash account balance atomically
 * - Sets status: POSTED
 */
export async function postExpensePayment(
  caller: AuthenticatedUser,
  input: z.input<typeof postExpensePaymentSchema>
) {
  requireOrganizationScope(caller, input.organizationId);
  requirePermission(caller, "expense.post");

  const parsed = postExpensePaymentSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message ?? "Invalid expense payment request");
  }

  const payload = parsed.data;
  const businessDate = payload.businessDate || getTodayBusinessDate();

  const expense = await prisma.expense.findUnique({
    where: { id: payload.expenseId },
    include: { chartOfAccount: true, expenseCategory: true },
  });
  if (!expense || expense.organizationId !== payload.organizationId) {
    throw new NotFoundError("Expense", payload.expenseId);
  }

  if (expense.status !== "APPROVED") {
    throw new ValidationError("Only approved expenses can be paid and posted");
  }

  const amount = new Decimal(payload.amount);
  if (amount.gt(new Decimal(expense.amount))) {
    throw new ValidationError("Payment amount exceeds the expense amount");
  }

  const cashAccount = await prisma.cashAccount.findUnique({ where: { id: payload.cashAccountId } });
  if (!cashAccount || cashAccount.organizationId !== payload.organizationId) {
    throw new NotFoundError("CashAccount", payload.cashAccountId);
  }

  return prisma.$transaction(async (tx) => {
    // Determine Expense Debit Account:
    let expenseCoaId = expense.chartOfAccountId;
    if (!expenseCoaId && expense.expenseCategory?.chartOfAccountId) {
      expenseCoaId = expense.expenseCategory.chartOfAccountId;
    }
    if (!expenseCoaId) {
      const defaultExpenseCoa = await tx.chartOfAccount.findUnique({
        where: {
          organizationId_code: {
            organizationId: payload.organizationId,
            code: "5001",
          },
        },
      });
      if (!defaultExpenseCoa) {
        throw new ValidationError("No valid expense Chart of Account found for GL posting");
      }
      expenseCoaId = defaultExpenseCoa.id;
    }

    // Post double-entry General Ledger lines:
    // Debit: Expense COA
    // Credit: Cash / Bank COA
    const journalLines: JournalLineInput[] = [
      {
        accountId: expenseCoaId,
        debit: amount,
        credit: 0,
        narration: `Expense payout (${expense.category}): ${expense.voucherNumber} to ${expense.payee}`,
      },
      {
        accountId: cashAccount.chartOfAccountId,
        debit: 0,
        credit: amount,
        narration: `Cash disbursed for expense voucher ${expense.voucherNumber} (${payload.paymentReference})`,
        cashAccountId: cashAccount.id,
      },
    ];

    const journal = await postJournalEntry(
      caller,
      {
        organizationId: payload.organizationId,
        branchId: expense.branchId ?? cashAccount.branchId ?? null,
        businessDate,
        sourceModule: "EXPENSES",
        sourceType: "EXPENSE_PAYMENT",
        sourceId: expense.id,
        description: `Expense ${expense.voucherNumber} - ${expense.payee} (${expense.category})`,
        idempotencyKey: `EXP-PAY-${payload.paymentReference}`,
        lines: journalLines,
      },
      tx
    );

    const expenseRecord = await tx.expense.update({
      where: { id: expense.id },
      data: {
        status: "POSTED",
        postedById: caller.userId,
        cashAccountId: payload.cashAccountId,
        paymentReference: payload.paymentReference,
        paidAt: new Date(businessDate),
        journalEntryId: journal.id,
        chartOfAccountId: expenseCoaId,
      },
    });

    await recordAuditEvent(
      {
        organizationId: payload.organizationId,
        actorId: caller.userId,
        action: "expense.payment.posted",
        entityType: "Expense",
        entityId: expenseRecord.id,
        metadata: {
          voucherNumber: expense.voucherNumber,
          paymentReference: payload.paymentReference,
          cashAccountId: payload.cashAccountId,
          amount: payload.amount,
          journalEntryId: journal.id,
        },
      },
      tx
    );

    return expenseRecord;
  });
}

/**
 * Reverses a posted expense payout with compensating balanced General Ledger entries.
 */
export async function reverseExpensePayment(
  caller: AuthenticatedUser,
  input: z.input<typeof reverseExpenseSchema>
) {
  requireOrganizationScope(caller, input.organizationId);
  requirePermission(caller, "expense.post");

  const parsed = reverseExpenseSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message ?? "Invalid expense reversal request");
  }

  const payload = parsed.data;
  const businessDate = payload.businessDate || getTodayBusinessDate();

  const expense = await prisma.expense.findUnique({
    where: { id: payload.expenseId },
  });
  if (!expense || expense.organizationId !== payload.organizationId) {
    throw new NotFoundError("Expense", payload.expenseId);
  }

  if (expense.status !== "POSTED" || expense.isReversed) {
    throw new ValidationError("Only posted, unreversed expenses can be reversed");
  }

  if (!expense.cashAccountId || !expense.journalEntryId) {
    throw new ValidationError("Expense is missing linked cash desk or journal entry reference");
  }

  const cashAccount = await prisma.cashAccount.findUnique({
    where: { id: expense.cashAccountId },
  });
  if (!cashAccount || cashAccount.organizationId !== payload.organizationId) {
    throw new NotFoundError("CashAccount", expense.cashAccountId);
  }

  const amount = new Decimal(expense.amount);

  return prisma.$transaction(async (tx) => {
    // Reverse original journal entry
    const reversalJournal = await reverseJournalEntry(
      caller,
      {
        organizationId: payload.organizationId,
        journalEntryId: expense.journalEntryId!,
        reversalReason: `Reversing expense ${expense.voucherNumber}: ${payload.reversalReason}`,
        businessDate,
        idempotencyKey: `REV-EXP-${expense.id}`,
      },
      tx
    );

    const reversedExpense = await tx.expense.update({
      where: { id: expense.id },
      data: {
        status: "REVERSED",
        isReversed: true,
        reversedAt: new Date(businessDate),
        reversedById: caller.userId,
        reversalReason: payload.reversalReason,
        reversalJournalEntryId: reversalJournal.id,
      },
    });

    await recordAuditEvent(
      {
        organizationId: payload.organizationId,
        actorId: caller.userId,
        action: "expense.payment.reversed",
        entityType: "Expense",
        entityId: expense.id,
        metadata: {
          voucherNumber: expense.voucherNumber,
          reversalReason: payload.reversalReason,
          reversalJournalEntryId: reversalJournal.id,
        },
      },
      tx
    );

    return reversedExpense;
  });
}

/**
 * Lists expenses with filtering, search, and pagination.
 */
export async function getExpenses(
  caller: AuthenticatedUser,
  options: {
    status?: string;
    category?: string;
    startDate?: string;
    endDate?: string;
    search?: string;
    limit?: number;
    offset?: number;
  } = {}
) {
  requirePermission(caller, "expense.submit");

  const where: Record<string, unknown> = {
    organizationId: caller.organizationId,
  };

  if (options.status && options.status !== "ALL") {
    where.status = options.status;
  }

  if (options.category && options.category !== "ALL") {
    where.category = options.category;
  }

  if (options.startDate || options.endDate) {
    where.expenseDate = {};
    if (options.startDate) {
      (where.expenseDate as Record<string, string>).gte = options.startDate;
    }
    if (options.endDate) {
      (where.expenseDate as Record<string, string>).lte = options.endDate;
    }
  }

  if (options.search) {
    where.OR = [
      { voucherNumber: { contains: options.search } },
      { payee: { contains: options.search } },
      { description: { contains: options.search } },
      { category: { contains: options.search } },
    ];
  }

  const [items, total] = await Promise.all([
    prisma.expense.findMany({
      where,
      include: {
        expenseCategory: true,
        chartOfAccount: true,
        cashAccount: true,
        branch: true,
      },
      orderBy: { createdAt: "desc" },
      take: options.limit ?? 50,
      skip: options.offset ?? 0,
    }),
    prisma.expense.count({ where }),
  ]);

  return { items, total };
}

/**
 * Retrieves a single expense record with full details.
 */
export async function getExpenseById(caller: AuthenticatedUser, expenseId: string) {
  requirePermission(caller, "expense.submit");

  const expense = await prisma.expense.findUnique({
    where: { id: expenseId },
    include: {
      expenseCategory: true,
      chartOfAccount: true,
      cashAccount: true,
      branch: true,
    },
  });

  if (!expense || expense.organizationId !== caller.organizationId) {
    throw new NotFoundError("Expense", expenseId);
  }

  return expense;
}

/**
 * Returns aggregated portfolio and category summary for operational expenses.
 */
export async function getExpenseSummary(caller: AuthenticatedUser) {
  requirePermission(caller, "expense.submit");

  const allExpenses = await prisma.expense.findMany({
    where: { organizationId: caller.organizationId },
    select: {
      id: true,
      status: true,
      amount: true,
      category: true,
      isReversed: true,
    },
  });

  let totalPostedAmount = new Decimal(0);
  let totalPendingAmount = new Decimal(0);
  let draftCount = 0;
  let submittedCount = 0;
  let approvedCount = 0;
  let postedCount = 0;
  let reversedCount = 0;

  const categoryTotals: Record<string, Decimal> = {};

  for (const exp of allExpenses) {
    const amt = new Decimal(exp.amount);

    if (exp.status === "POSTED" && !exp.isReversed) {
      totalPostedAmount = totalPostedAmount.plus(amt);
      postedCount++;
      categoryTotals[exp.category] = (categoryTotals[exp.category] || new Decimal(0)).plus(amt);
    } else if (exp.status === "SUBMITTED" || exp.status === "DRAFT") {
      totalPendingAmount = totalPendingAmount.plus(amt);
      if (exp.status === "SUBMITTED") submittedCount++;
      else draftCount++;
    } else if (exp.status === "APPROVED") {
      approvedCount++;
    } else if (exp.status === "REVERSED" || exp.isReversed) {
      reversedCount++;
    }
  }

  return {
    totalPostedAmount: totalPostedAmount.toFixed(2),
    totalPendingAmount: totalPendingAmount.toFixed(2),
    draftCount,
    submittedCount,
    approvedCount,
    postedCount,
    reversedCount,
    categoryBreakdown: Object.entries(categoryTotals).map(([cat, sum]) => ({
      category: cat,
      amount: sum.toFixed(2),
    })),
  };
}
