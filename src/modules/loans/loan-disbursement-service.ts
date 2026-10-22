import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { recordAuditEvent } from "@/modules/audit/audit-service";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors/app-error";
import { requireOrganizationScope, requirePermission } from "@/lib/permissions/auth-guard";
import { AuthenticatedUser } from "@/lib/permissions/types";

const disbursementSchema = z.object({
  organizationId: z.string().uuid(),
  applicationId: z.string().uuid(),
  cashAccountId: z.string().uuid(),
  disbursementDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  amount: z.string().refine((v) => Number(v) > 0, "Disbursement amount must be positive"),
  sourceReference: z.string().min(3).max(100),
});

export async function createLoanDisbursement(
  caller: AuthenticatedUser,
  input: z.infer<typeof disbursementSchema>
) {
  requireOrganizationScope(caller, input.organizationId);
  requirePermission(caller, "loan.disbursement.create");

  const parsed = disbursementSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message ?? "Invalid disbursement request");
  }

  const payload = parsed.data;

  const application = await prisma.loanApplication.findUnique({
    where: { id: payload.applicationId },
    include: { customer: true, scheme: { include: { versions: { orderBy: { versionNumber: "desc" } } } } },
  });

  if (!application || application.organizationId !== payload.organizationId) {
    throw new NotFoundError("LoanApplication", payload.applicationId);
  }

  if (application.status !== "APPROVED") {
    throw new ForbiddenError("Disbursement is only allowed for approved applications");
  }

  if (Number(payload.amount) !== Number(application.requestedPrincipal)) {
    throw new ValidationError("Disbursement amount must match the approved application principal");
  }

  const cashAccount = await prisma.cashAccount.findUnique({
    where: { id: payload.cashAccountId },
  });

  if (!cashAccount || cashAccount.organizationId !== payload.organizationId) {
    throw new NotFoundError("CashAccount", payload.cashAccountId);
  }

  const existingDisbursement = await prisma.loanDisbursement.findFirst({
    where: {
      organizationId: payload.organizationId,
      applicationId: payload.applicationId,
    },
  });

  if (existingDisbursement) {
    throw new ValidationError("Duplicate disbursement is not allowed for the same approved application");
  }

  return prisma.$transaction(async (tx) => {
    const account = await tx.loanAccount.create({
      data: {
        organizationId: payload.organizationId,
        customerId: application.customerId,
        schemeId: application.schemeId,
        loanAccountNumber: `LA-${Date.now().toString().slice(-8)}`,
        principalDisbursed: payload.amount,
        principalOutstanding: payload.amount,
        status: "ACTIVE",
        nextDueDate: new Date(`${payload.disbursementDate}T00:00:00.000Z`),
      },
    });

    const disbursement = await tx.loanDisbursement.create({
      data: {
        organizationId: payload.organizationId,
        applicationId: payload.applicationId,
        loanAccountId: account.id,
        amount: payload.amount,
        disbursementDate: new Date(`${payload.disbursementDate}T00:00:00.000Z`),
        sourceReference: payload.sourceReference,
        status: "POSTED",
        createdById: caller.userId,
      },
      include: {
        loanAccount: true,
      },
    });

    await tx.cashAccount.update({
      where: { id: payload.cashAccountId },
      data: {
        balance: { decrement: Number(payload.amount) },
      },
    });

    await recordAuditEvent(
      {
        organizationId: payload.organizationId,
        actorId: caller.userId,
        action: "loan.disbursement.posted",
        entityType: "LoanDisbursement",
        entityId: disbursement.id,
        metadata: {
          loanAccountId: account.id,
          amount: payload.amount,
          sourceReference: payload.sourceReference,
        },
      },
      tx
    );

    return {
      ...disbursement,
      loanAccount: account,
    };
  });
}
