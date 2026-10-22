import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { recordAuditEvent } from "@/modules/audit/audit-service";
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "@/lib/errors/app-error";
import { requireOrganizationScope, requirePermission } from "@/lib/permissions/auth-guard";
import { AuthenticatedUser } from "@/lib/permissions/types";

const createApplicationSchema = z.object({
  organizationId: z.string().uuid(),
  customerId: z.string().uuid(),
  schemeId: z.string().uuid(),
  requestedPrincipal: z.string().refine((v) => Number(v) > 0, "Requested principal must be greater than zero"),
  requestedTermMonths: z.number().int().min(1).max(600),
  purpose: z.string().min(3).max(300),
  status: z.enum(["DRAFT", "SUBMITTED", "APPROVED", "REJECTED"]).default("DRAFT"),
});

const submitApplicationSchema = z.object({
  organizationId: z.string().uuid(),
  applicationId: z.string().uuid(),
  businessPurpose: z.string().min(5).max(400),
});

const decisionSchema = z.object({
  organizationId: z.string().uuid(),
  applicationId: z.string().uuid(),
  approvalReason: z.string().min(5).max(400).optional(),
  rejectionReason: z.string().min(5).max(400).optional(),
});

export async function createLoanApplication(
  caller: AuthenticatedUser,
  input: z.infer<typeof createApplicationSchema>
) {
  requireOrganizationScope(caller, input.organizationId);
  requirePermission(caller, "loan.application.create");

  const parsed = createApplicationSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message ?? "Invalid application payload");
  }

  const payload = parsed.data;

  const customer = await prisma.customer.findUnique({ where: { id: payload.customerId } });
  if (!customer || customer.organizationId !== payload.organizationId) {
    throw new NotFoundError("Customer", payload.customerId);
  }

  const scheme = await prisma.loanScheme.findUnique({
    where: { id: payload.schemeId },
    include: { versions: { orderBy: { versionNumber: "desc" } } },
  });

  if (!scheme || scheme.organizationId !== payload.organizationId) {
    throw new NotFoundError("LoanScheme", payload.schemeId);
  }

  if (Number(payload.requestedPrincipal) < Number(scheme.versions[0]?.minPrincipal ?? 0)) {
    throw new ValidationError("Requested principal is below the scheme minimum");
  }

  if (Number(payload.requestedPrincipal) > Number(scheme.versions[0]?.maxPrincipal ?? Number.MAX_SAFE_INTEGER)) {
    throw new ValidationError("Requested principal is above the scheme maximum");
  }

  return prisma.loanApplication.create({
    data: {
      organizationId: payload.organizationId,
      customerId: payload.customerId,
      schemeId: payload.schemeId,
      requestedPrincipal: payload.requestedPrincipal,
      requestedTermMonths: payload.requestedTermMonths,
      purpose: payload.purpose,
      status: payload.status,
      submittedById: caller.userId,
      createdById: caller.userId,
    },
  });
}

export async function submitLoanApplication(
  caller: AuthenticatedUser,
  input: z.infer<typeof submitApplicationSchema>
) {
  requireOrganizationScope(caller, input.organizationId);
  requirePermission(caller, "loan.application.submit");

  const parsed = submitApplicationSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message ?? "Invalid submit request");
  }

  const application = await prisma.loanApplication.findUnique({
    where: { id: parsed.data.applicationId },
  });

  if (!application || application.organizationId !== parsed.data.organizationId) {
    throw new NotFoundError("LoanApplication", parsed.data.applicationId);
  }

  if (application.status !== "DRAFT") {
    throw new ForbiddenError("Only draft applications can be submitted");
  }

  if (!parsed.data.businessPurpose || parsed.data.businessPurpose.trim().length < 5) {
    throw new ValidationError("Business purpose must be at least 5 characters");
  }

  const updated = await prisma.loanApplication.update({
    where: { id: application.id },
    data: {
      status: "SUBMITTED",
      businessPurpose: parsed.data.businessPurpose,
      submittedAt: new Date(),
      submittedById: caller.userId,
    },
  });

  await recordAuditEvent({
    organizationId: parsed.data.organizationId,
    actorId: caller.userId,
    action: "loan.application.submitted",
    entityType: "LoanApplication",
    entityId: updated.id,
    metadata: { status: "SUBMITTED", businessPurpose: parsed.data.businessPurpose },
  });

  return updated;
}

export async function approveLoanApplication(
  caller: AuthenticatedUser,
  input: z.infer<typeof decisionSchema>
) {
  requireOrganizationScope(caller, input.organizationId);
  requirePermission(caller, "loan.application.approve");

  const parsed = decisionSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message ?? "Invalid approval request");
  }

  const application = await prisma.loanApplication.findUnique({
    where: { id: parsed.data.applicationId },
  });

  if (!application || application.organizationId !== parsed.data.organizationId) {
    throw new NotFoundError("LoanApplication", parsed.data.applicationId);
  }

  if (application.status !== "SUBMITTED") {
    throw new ForbiddenError("Only submitted applications can be approved");
  }

  const updated = await prisma.loanApplication.update({
    where: { id: application.id },
    data: {
      status: "APPROVED",
      approvalReason: parsed.data.approvalReason ?? "Approved by authorized staff",
      approvedAt: new Date(),
      approvedById: caller.userId,
    },
  });

  await recordAuditEvent({
    organizationId: parsed.data.organizationId,
    actorId: caller.userId,
    action: "loan.application.approved",
    entityType: "LoanApplication",
    entityId: updated.id,
    metadata: { approvalReason: updated.approvalReason },
  });

  return updated;
}

export async function rejectLoanApplication(
  caller: AuthenticatedUser,
  input: z.infer<typeof decisionSchema>
) {
  requireOrganizationScope(caller, input.organizationId);
  requirePermission(caller, "loan.application.approve");

  const parsed = decisionSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message ?? "Invalid rejection request");
  }

  const application = await prisma.loanApplication.findUnique({
    where: { id: parsed.data.applicationId },
  });

  if (!application || application.organizationId !== parsed.data.organizationId) {
    throw new NotFoundError("LoanApplication", parsed.data.applicationId);
  }

  if (application.status !== "SUBMITTED") {
    throw new ForbiddenError("Only submitted applications can be rejected");
  }

  if (!parsed.data.rejectionReason || parsed.data.rejectionReason.trim().length < 5) {
    throw new ValidationError("Rejection reason must be at least 5 characters");
  }

  const updated = await prisma.loanApplication.update({
    where: { id: application.id },
    data: {
      status: "REJECTED",
      rejectionReason: parsed.data.rejectionReason,
      rejectedAt: new Date(),
      rejectedById: caller.userId,
    },
  });

  await recordAuditEvent({
    organizationId: parsed.data.organizationId,
    actorId: caller.userId,
    action: "loan.application.rejected",
    entityType: "LoanApplication",
    entityId: updated.id,
    metadata: { rejectionReason: updated.rejectionReason },
  });

  return updated;
}
