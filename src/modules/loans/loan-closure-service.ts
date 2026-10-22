import Decimal from "decimal.js";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { recordAuditEvent } from "@/modules/audit/audit-service";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors/app-error";
import { requireOrganizationScope, requirePermission } from "@/lib/permissions/auth-guard";
import { AuthenticatedUser } from "@/lib/permissions/types";

const settlementQuoteSchema = z.object({
  organizationId: z.string().uuid(),
  loanAccountId: z.string().uuid(),
  asOfDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

const closeLoanSchema = z.object({
  organizationId: z.string().uuid(),
  loanAccountId: z.string().uuid(),
  asOfDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  accruedInterest: z.string().refine((v) => Number(v) >= 0),
  feeAmount: z.string().refine((v) => Number(v) >= 0),
  penaltyAmount: z.string().refine((v) => Number(v) >= 0),
  waiverAmount: z.string().refine((v) => Number(v) >= 0),
  reason: z.string().min(5).max(300),
});

export async function generateSettlementQuote(
  caller: AuthenticatedUser,
  input: z.infer<typeof settlementQuoteSchema>
) {
  requireOrganizationScope(caller, input.organizationId);
  requirePermission(caller, "loan.account.manage");

  const parsed = settlementQuoteSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message ?? "Invalid settlement quote request");
  }

  const payload = parsed.data;

  const loanAccount = await prisma.loanAccount.findUnique({
    where: { id: payload.loanAccountId },
  });

  if (!loanAccount || loanAccount.organizationId !== payload.organizationId) {
    throw new NotFoundError("LoanAccount", payload.loanAccountId);
  }

  if (loanAccount.status === "CLOSED") {
    throw new ValidationError("This loan account is already closed");
  }

  const principalOutstanding = new Decimal(loanAccount.principalOutstanding);
  const totalSettlement = principalOutstanding;

  return {
    loanAccountId: loanAccount.id,
    asOfDate: payload.asOfDate,
    principalOutstanding: principalOutstanding.toFixed(4),
    accruedInterest: "0.0000",
    feeAmount: "0.0000",
    penaltyAmount: "0.0000",
    waiverAmount: "0.0000",
    totalSettlement: totalSettlement.toFixed(4),
  };
}

export async function postLoanClosure(
  caller: AuthenticatedUser,
  input: z.infer<typeof closeLoanSchema>
) {
  requireOrganizationScope(caller, input.organizationId);
  requirePermission(caller, "loan.account.manage");

  const parsed = closeLoanSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message ?? "Invalid closure request");
  }

  const payload = parsed.data;

  const loanAccount = await prisma.loanAccount.findUnique({
    where: { id: payload.loanAccountId },
  });

  if (!loanAccount || loanAccount.organizationId !== payload.organizationId) {
    throw new NotFoundError("LoanAccount", payload.loanAccountId);
  }

  if (loanAccount.status === "CLOSED") {
    throw new ValidationError("This loan account is already closed");
  }

  const principalOutstanding = new Decimal(loanAccount.principalOutstanding);
  const accruedInterest = new Decimal(payload.accruedInterest);
  const feeAmount = new Decimal(payload.feeAmount);
  const penaltyAmount = new Decimal(payload.penaltyAmount);
  const waiverAmount = new Decimal(payload.waiverAmount);
  const totalSettlement = principalOutstanding
    .plus(accruedInterest)
    .plus(feeAmount)
    .plus(penaltyAmount)
    .minus(waiverAmount);

  if (totalSettlement.lte(0)) {
    throw new ValidationError("Settlement total must be greater than zero to close the loan");
  }

  const existingClosure = await prisma.loanClosure.findFirst({
    where: { organizationId: payload.organizationId, loanAccountId: payload.loanAccountId },
  });

  if (existingClosure) {
    throw new ValidationError("Loan closure already exists for this account");
  }

  return prisma.$transaction(async (tx) => {
    const closure = await tx.loanClosure.create({
      data: {
        organizationId: payload.organizationId,
        loanAccountId: payload.loanAccountId,
        asOfDate: payload.asOfDate,
        principalOutstanding: principalOutstanding.toFixed(4),
        accruedInterest: accruedInterest.toFixed(4),
        feeAmount: feeAmount.toFixed(4),
        penaltyAmount: penaltyAmount.toFixed(4),
        waiverAmount: waiverAmount.toFixed(4),
        totalSettlement: totalSettlement.toFixed(4),
        status: "POSTED",
        reason: payload.reason,
        createdById: caller.userId,
      },
    });

    await tx.loanAccount.update({
      where: { id: payload.loanAccountId },
      data: {
        status: "CLOSED",
        principalOutstanding: "0.0000",
        nextDueDate: null,
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
          loanAccountId: payload.loanAccountId,
          totalSettlement: totalSettlement.toFixed(4),
          reason: payload.reason,
        },
      },
      tx
    );

    return {
      ...closure,
      totalSettlement: totalSettlement.toFixed(4),
    };
  });
}
