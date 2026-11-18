import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { recordAuditEvent } from "@/modules/audit/audit-service";
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "@/lib/errors/app-error";
import {
  assertMakerCheckerSeparation,
  requireOrganizationScope,
  requirePermission,
  requireAnyPermission,
} from "@/lib/permissions/auth-guard";
import { AuthenticatedUser } from "@/lib/permissions/types";

const createApplicationSchema = z.object({
  organizationId: z.string().uuid(),
  customerId: z.string().uuid(),
  schemeId: z.string().uuid(),
  requestedPrincipal: z.string().refine((v) => Number(v) > 0, "Requested principal must be greater than zero").optional(),
  requestedTermMonths: z.number().int().min(1).max(600).optional(),
  totalRepaymentAmount: z.string().refine((v) => Number(v) > 0, "Total repayment amount must be greater than zero").optional(),
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
  enforceMakerChecker: z.boolean().optional(),
});

export async function createLoanApplication(
  caller: AuthenticatedUser,
  input: z.input<typeof createApplicationSchema>
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

  const schemeVersion = scheme.versions[0];
  const principal = payload.requestedPrincipal ?? schemeVersion?.principalAmount ?? schemeVersion?.minPrincipal ?? "10000";
  const termMonths = payload.requestedTermMonths ?? schemeVersion?.termMonths ?? 12;
  let totalRepayment = payload.totalRepaymentAmount ?? schemeVersion?.totalRepaymentAmount ?? null;

  if (Number(principal) <= 0) {
    throw new ValidationError("Requested principal must be greater than zero");
  }
  if (totalRepayment !== null && Number(totalRepayment) < Number(principal)) {
    if (payload.totalRepaymentAmount !== undefined) {
      throw new ValidationError("Total repayment amount must be greater than or equal to loan amount");
    }
    totalRepayment = principal;
  }

  return prisma.loanApplication.create({
    data: {
      organizationId: payload.organizationId,
      customerId: payload.customerId,
      schemeId: payload.schemeId,
      requestedPrincipal: principal,
      requestedTermMonths: termMonths,
      totalRepaymentAmount: totalRepayment,
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

  await prisma.approvalHistory.create({
    data: {
      organizationId: parsed.data.organizationId,
      entityType: "LOAN_APPLICATION",
      entityId: updated.id,
      action: "SUBMIT",
      statusBefore: application.status,
      statusAfter: "SUBMITTED",
      makerId: caller.userId,
      checkerId: null,
      comments: parsed.data.businessPurpose || "Submitted for review",
    },
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

  if (parsed.data.enforceMakerChecker) {
    const makerId = application.submittedById || application.createdById;
    if (makerId) {
      assertMakerCheckerSeparation(makerId, caller.userId, "loan application approval");
    }
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

  await prisma.approvalHistory.create({
    data: {
      organizationId: parsed.data.organizationId,
      entityType: "LOAN_APPLICATION",
      entityId: updated.id,
      action: "APPROVE",
      statusBefore: application.status,
      statusAfter: "APPROVED",
      makerId: application.submittedById || application.createdById,
      checkerId: caller.userId,
      comments: updated.approvalReason,
    },
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

  if (parsed.data.enforceMakerChecker) {
    const makerId = application.submittedById || application.createdById;
    if (makerId) {
      assertMakerCheckerSeparation(makerId, caller.userId, "loan application rejection");
    }
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

  await prisma.approvalHistory.create({
    data: {
      organizationId: parsed.data.organizationId,
      entityType: "LOAN_APPLICATION",
      entityId: updated.id,
      action: "REJECT",
      statusBefore: application.status,
      statusAfter: "REJECTED",
      makerId: application.submittedById || application.createdById,
      checkerId: caller.userId,
      comments: updated.rejectionReason,
    },
  });

  return updated;
}

export interface GetLoanApplicationsOptions {
  status?: string;
  customerId?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

export async function getLoanApplications(
  caller: AuthenticatedUser,
  options: GetLoanApplicationsOptions = {}
) {
  requireAnyPermission(
    caller,
    "loan.application.view",
    "loan.application.create",
    "loan.application.approve",
    "loan.application.verify",
    "loan.account.read"
  );

  const where: Record<string, unknown> = {
    organizationId: caller.organizationId,
  };

  if (options.status && options.status !== "ALL") {
    where.status = options.status;
  }

  if (options.customerId) {
    where.customerId = options.customerId;
  }

  if (options.search) {
    where.OR = [
      { id: { contains: options.search } },
      { customer: { fullName: { contains: options.search } } },
      { customer: { customerCode: { contains: options.search } } },
      { purpose: { contains: options.search } },
    ];
  }

  const [items, total] = await Promise.all([
    prisma.loanApplication.findMany({
      where,
      include: {
        customer: {
          select: {
            id: true,
            customerCode: true,
            fullName: true,
            phone: true,
            email: true,
            guardianName: true,
            gender: true,
            dateOfBirth: true,
            aadhaarNumber: true,
            panNumber: true,
            occupation: true,
            residentialAddress: true,
            nomineeName: true,
            guarantorName: true,
            passportPhoto: true,
            status: true,
            maritalStatus: true,
            familyMembers: true,
            primaryOccupation: true,
            community: { select: { id: true, code: true, name: true } },
            education: { select: { id: true, code: true, name: true } },
            annualIncome: true,
            branch: { select: { id: true, name: true, code: true } },
            customerGroups: { include: { group: true } },
            loanAccounts: {
              select: {
                id: true,
                loanAccountNumber: true,
                status: true,
                principalDisbursed: true,
                principalOutstanding: true,
                createdAt: true,
                scheme: { select: { name: true, code: true } },
              },
            },
            savingsAccounts: {
              select: {
                id: true,
                accountNumber: true,
                status: true,
                balance: true,
              },
            },
          },
        },
        scheme: {
          select: {
            id: true,
            code: true,
            name: true,
            versions: {
              where: { isPublished: true },
              orderBy: { versionNumber: "desc" },
              take: 1,
              select: {
                principalAmount: true,
                totalRepaymentAmount: true,
                termMonths: true,
                termsAndConditions: true,
                repaymentFrequency: true,
                interestRate: true,
                interestMethod: true,
                minPrincipal: true,
                maxPrincipal: true,
              },
            },
          },
        },
        disbursements: {
          select: {
            id: true,
            amount: true,
            status: true,
            disbursementDate: true,
            loanAccountId: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: options.limit ?? 50,
      skip: options.offset ?? 0,
    }),
    prisma.loanApplication.count({ where }),
  ]);

  return { items, total };
}

export async function getLoanApplicationById(caller: AuthenticatedUser, applicationId: string) {
  requireAnyPermission(
    caller,
    "loan.application.view",
    "loan.application.create",
    "loan.application.approve",
    "loan.application.verify",
    "loan.account.read"
  );

  const application = await prisma.loanApplication.findUnique({
    where: { id: applicationId },
    include: {
      customer: true,
      scheme: {
        include: {
          versions: {
            orderBy: { versionNumber: "desc" },
          },
        },
      },
      disbursements: {
        include: {
          loanAccount: true,
        },
      },
    },
  });

  if (!application || application.organizationId !== caller.organizationId) {
    throw new NotFoundError("LoanApplication", applicationId);
  }

  return application;
}
