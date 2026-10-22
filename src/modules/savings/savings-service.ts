import Decimal from "decimal.js";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { recordAuditEvent } from "@/modules/audit/audit-service";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors/app-error";
import { requireOrganizationScope, requirePermission } from "@/lib/permissions/auth-guard";
import { AuthenticatedUser } from "@/lib/permissions/types";

const openSavingsAccountSchema = z.object({
  organizationId: z.string().uuid(),
  customerId: z.string().uuid(),
  accountNumber: z.string().min(3).max(60),
  productName: z.string().min(2).max(80),
  status: z.enum(["ACTIVE", "INACTIVE"]).default("ACTIVE"),
});

const depositSchema = z.object({
  organizationId: z.string().uuid(),
  accountId: z.string().uuid(),
  amount: z.string().refine((v) => Number(v) > 0, "Deposit amount must be positive"),
  transactionRef: z.string().min(3).max(60),
  note: z.string().min(2).max(200).optional(),
});

const withdrawalSchema = z.object({
  organizationId: z.string().uuid(),
  accountId: z.string().uuid(),
  amount: z.string().refine((v) => Number(v) > 0, "Withdrawal amount must be positive"),
  transactionRef: z.string().min(3).max(60),
  note: z.string().min(2).max(200).optional(),
});

export async function openSavingsAccount(
  caller: AuthenticatedUser,
  input: z.infer<typeof openSavingsAccountSchema>
) {
  requireOrganizationScope(caller, input.organizationId);
  requirePermission(caller, "savings.account.manage");

  const parsed = openSavingsAccountSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message ?? "Invalid savings account payload");
  }

  const payload = parsed.data;

  const customer = await prisma.customer.findUnique({ where: { id: payload.customerId } });
  if (!customer || customer.organizationId !== payload.organizationId) {
    throw new NotFoundError("Customer", payload.customerId);
  }

  const existingAccount = await prisma.savingsAccount.findFirst({
    where: { organizationId: payload.organizationId, accountNumber: payload.accountNumber },
  });

  if (existingAccount) {
    throw new ValidationError("Savings account number already exists");
  }

  return prisma.savingsAccount.create({
    data: {
      organizationId: payload.organizationId,
      customerId: payload.customerId,
      accountNumber: payload.accountNumber,
      productName: payload.productName,
      balance: "0.0000",
      status: payload.status,
    },
  });
}

export async function depositToSavingsAccount(
  caller: AuthenticatedUser,
  input: z.infer<typeof depositSchema>
) {
  requireOrganizationScope(caller, input.organizationId);
  requirePermission(caller, "savings.deposit.create");

  const parsed = depositSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message ?? "Invalid deposit request");
  }

  const payload = parsed.data;

  const account = await prisma.savingsAccount.findUnique({ where: { id: payload.accountId } });
  if (!account || account.organizationId !== payload.organizationId) {
    throw new NotFoundError("SavingsAccount", payload.accountId);
  }

  if (account.status !== "ACTIVE") {
    throw new ForbiddenError("Only active savings accounts can receive deposits");
  }

  const duplicateRef = await prisma.savingsTransaction.findFirst({
    where: { organizationId: payload.organizationId, transactionRef: payload.transactionRef },
  });

  if (duplicateRef) {
    throw new ValidationError("Duplicate transaction reference is not allowed");
  }

  const amount = new Decimal(payload.amount);
  const balanceAfter = new Decimal(account.balance).plus(amount);

  return prisma.$transaction(async (tx) => {
    const transaction = await tx.savingsTransaction.create({
      data: {
        organizationId: payload.organizationId,
        accountId: payload.accountId,
        type: "DEPOSIT",
        amount: payload.amount,
        balanceAfter: balanceAfter.toFixed(4),
        transactionRef: payload.transactionRef,
        note: payload.note ?? null,
        status: "POSTED",
      },
    });

    await tx.savingsAccount.update({
      where: { id: payload.accountId },
      data: { balance: balanceAfter.toFixed(4) },
    });

    await recordAuditEvent(
      {
        organizationId: payload.organizationId,
        actorId: caller.userId,
        action: "savings.deposit.posted",
        entityType: "SavingsTransaction",
        entityId: transaction.id,
        metadata: {
          accountId: payload.accountId,
          amount: payload.amount,
          transactionRef: payload.transactionRef,
        },
      },
      tx
    );

    return transaction;
  });
}

export async function withdrawFromSavingsAccount(
  caller: AuthenticatedUser,
  input: z.infer<typeof withdrawalSchema>
) {
  requireOrganizationScope(caller, input.organizationId);
  requirePermission(caller, "savings.withdrawal.approve");

  const parsed = withdrawalSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message ?? "Invalid withdrawal request");
  }

  const payload = parsed.data;

  const account = await prisma.savingsAccount.findUnique({ where: { id: payload.accountId } });
  if (!account || account.organizationId !== payload.organizationId) {
    throw new NotFoundError("SavingsAccount", payload.accountId);
  }

  if (account.status !== "ACTIVE") {
    throw new ForbiddenError("Only active savings accounts can be withdrawn from");
  }

  const duplicateRef = await prisma.savingsTransaction.findFirst({
    where: { organizationId: payload.organizationId, transactionRef: payload.transactionRef },
  });

  if (duplicateRef) {
    throw new ValidationError("Duplicate transaction reference is not allowed");
  }

  const amount = new Decimal(payload.amount);
  const currentBalance = new Decimal(account.balance);

  if (amount.gt(currentBalance)) {
    throw new ValidationError("Withdrawal amount exceeds available savings balance");
  }

  const balanceAfter = currentBalance.minus(amount);

  return prisma.$transaction(async (tx) => {
    const transaction = await tx.savingsTransaction.create({
      data: {
        organizationId: payload.organizationId,
        accountId: payload.accountId,
        type: "WITHDRAWAL",
        amount: payload.amount,
        balanceAfter: balanceAfter.toFixed(4),
        transactionRef: payload.transactionRef,
        note: payload.note ?? null,
        status: "POSTED",
      },
    });

    await tx.savingsAccount.update({
      where: { id: payload.accountId },
      data: { balance: balanceAfter.toFixed(4) },
    });

    await recordAuditEvent(
      {
        organizationId: payload.organizationId,
        actorId: caller.userId,
        action: "savings.withdrawal.posted",
        entityType: "SavingsTransaction",
        entityId: transaction.id,
        metadata: {
          accountId: payload.accountId,
          amount: payload.amount,
          transactionRef: payload.transactionRef,
        },
      },
      tx
    );

    return transaction;
  });
}
