import Decimal from "decimal.js";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { recordAuditEvent } from "@/modules/audit/audit-service";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors/app-error";
import { requireOrganizationScope, requirePermission } from "@/lib/permissions/auth-guard";
import { AuthenticatedUser } from "@/lib/permissions/types";

const receiptSchema = z.object({
  organizationId: z.string().uuid(),
  loanAccountId: z.string().uuid(),
  cashAccountId: z.string().uuid(),
  receiptNumber: z.string().min(3).max(60),
  businessDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  amount: z.string().refine((v) => Number(v) > 0, "Receipt amount must be positive"),
  paymentMethod: z.enum(["CASH", "BANK_TRANSFER", "UPI", "CHEQUE"]),
  reference: z.string().min(2).max(120).optional(),
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

  const loanAccount = await prisma.loanAccount.findUnique({ where: { id: payload.loanAccountId } });
  if (!loanAccount || loanAccount.organizationId !== payload.organizationId) {
    throw new NotFoundError("LoanAccount", payload.loanAccountId);
  }

  const cashAccount = await prisma.cashAccount.findUnique({ where: { id: payload.cashAccountId } });
  if (!cashAccount || cashAccount.organizationId !== payload.organizationId) {
    throw new NotFoundError("CashAccount", payload.cashAccountId);
  }

  const existingReceipt = await prisma.collectionReceipt.findFirst({
    where: {
      organizationId: payload.organizationId,
      receiptNumber: payload.receiptNumber,
    },
  });

  if (existingReceipt) {
    throw new ForbiddenError(`Receipt number "${payload.receiptNumber}" already exists`);
  }

  if (Number(payload.amount) <= 0) {
    throw new ValidationError("Receipt amount must be greater than zero");
  }

  return prisma.$transaction(async (tx) => {
    const loanAccountForUpdate = await tx.loanAccount.findUnique({
      where: { id: payload.loanAccountId },
    });

    if (!loanAccountForUpdate) {
      throw new NotFoundError("LoanAccount", payload.loanAccountId);
    }

    const outstanding = new Decimal(loanAccountForUpdate.principalOutstanding);
    const receiptAmount = new Decimal(payload.amount);

    if (receiptAmount.gt(outstanding)) {
      throw new ValidationError("Receipt amount exceeds the current outstanding principal");
    }

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

    await tx.loanAccount.update({
      where: { id: payload.loanAccountId },
      data: {
        principalOutstanding: outstanding.minus(receiptAmount).toFixed(4),
      },
    });

    await tx.cashAccount.update({
      where: { id: payload.cashAccountId },
      data: {
        balance: {
          increment: receiptAmount.toNumber(),
        },
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
        },
      },
      tx
    );

    return receipt;
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
