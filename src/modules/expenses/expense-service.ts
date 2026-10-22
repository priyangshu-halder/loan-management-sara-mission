import Decimal from "decimal.js";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { recordAuditEvent } from "@/modules/audit/audit-service";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors/app-error";
import { requireOrganizationScope, requirePermission } from "@/lib/permissions/auth-guard";
import { AuthenticatedUser } from "@/lib/permissions/types";

const createExpenseSchema = z.object({
  organizationId: z.string().uuid(),
  category: z.string().min(2).max(80),
  amount: z.string().refine((v) => Number(v) > 0, "Expense amount must be positive"),
  expenseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  payee: z.string().min(2).max(120),
  paymentMethod: z.enum(["CASH", "BANK_TRANSFER", "CHEQUE", "UPI"]),
  description: z.string().min(2).max(400).optional(),
  supportingRef: z.string().min(2).max(120).optional(),
});

const approveExpenseSchema = z.object({
  organizationId: z.string().uuid(),
  expenseId: z.string().uuid(),
  reason: z.string().min(3).max(200).optional(),
});

const postExpensePaymentSchema = z.object({
  organizationId: z.string().uuid(),
  expenseId: z.string().uuid(),
  cashAccountId: z.string().uuid(),
  paymentReference: z.string().min(3).max(60),
  amount: z.string().refine((v) => Number(v) > 0, "Payment amount must be positive"),
});

export async function createExpense(
  caller: AuthenticatedUser,
  input: z.infer<typeof createExpenseSchema>
) {
  requireOrganizationScope(caller, input.organizationId);
  requirePermission(caller, "expense.submit");

  const parsed = createExpenseSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message ?? "Invalid expense payload");
  }

  const payload = parsed.data;

  return prisma.expense.create({
    data: {
      organizationId: payload.organizationId,
      category: payload.category,
      amount: payload.amount,
      expenseDate: payload.expenseDate,
      payee: payload.payee,
      paymentMethod: payload.paymentMethod,
      description: payload.description ?? null,
      supportingRef: payload.supportingRef ?? null,
      status: "DRAFT",
      submittedById: caller.userId,
    },
  });
}

export async function approveExpense(
  caller: AuthenticatedUser,
  input: z.infer<typeof approveExpenseSchema>
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

  if (expense.status !== "DRAFT") {
    throw new ValidationError("Only draft expenses can be approved");
  }

  const approved = await prisma.expense.update({
    where: { id: expense.id },
    data: {
      status: "APPROVED",
      approvedById: caller.userId,
    },
  });

  await recordAuditEvent({
    organizationId: payload.organizationId,
    actorId: caller.userId,
    action: "expense.approved",
    entityType: "Expense",
    entityId: approved.id,
    metadata: { reason: payload.reason ?? "Approved by authorized staff" },
  });

  return approved;
}

export async function postExpensePayment(
  caller: AuthenticatedUser,
  input: z.infer<typeof postExpensePaymentSchema>
) {
  requireOrganizationScope(caller, input.organizationId);
  requirePermission(caller, "expense.post");

  const parsed = postExpensePaymentSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message ?? "Invalid expense payment request");
  }

  const payload = parsed.data;

  const expense = await prisma.expense.findUnique({ where: { id: payload.expenseId } });
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

  const posted = await prisma.$transaction(async (tx) => {
    const expenseRecord = await tx.expense.update({
      where: { id: expense.id },
      data: {
        status: "POSTED",
        postedById: caller.userId,
      },
    });

    await tx.cashAccount.update({
      where: { id: payload.cashAccountId },
      data: {
        balance: { decrement: amount.toNumber() },
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
          paymentReference: payload.paymentReference,
          cashAccountId: payload.cashAccountId,
          amount: payload.amount,
        },
      },
      tx
    );

    return expenseRecord;
  });

  return {
    ...posted,
    amount: posted.amount,
  };
}
