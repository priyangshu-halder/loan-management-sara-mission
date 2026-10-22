import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from "@/lib/errors/app-error";
import { requireOrganizationScope, requirePermission } from "@/lib/permissions/auth-guard";
import { AuthenticatedUser } from "@/lib/permissions/types";

const schemeSchema = z.object({
  organizationId: z.string().uuid(),
  code: z.string().min(3).max(40).regex(/^[A-Z0-9-]+$/),
  name: z.string().min(2).max(120),
  minPrincipal: z.string().refine((v) => Number(v) > 0, "Minimum principal must be greater than zero"),
  maxPrincipal: z.string().refine((v) => Number(v) > 0, "Maximum principal must be greater than zero"),
  termMonths: z.number().int().min(1).max(600),
  interestRate: z.string().refine((v) => Number(v) >= 0, "Interest rate must be non-negative"),
  interestMethod: z.enum(["FLAT", "REDUCING_BALANCE"]),
  repaymentFrequency: z.enum(["MONTHLY", "QUARTERLY", "WEEKLY"]),
  gracePeriodDays: z.number().int().min(0).max(365),
  status: z.enum(["DRAFT", "PUBLISHED"]).default("DRAFT"),
});

const publishSchema = z.object({
  organizationId: z.string().uuid(),
  schemeId: z.string().uuid(),
  effectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notes: z.string().min(1).max(300).optional(),
});

const previewSchema = z.object({
  organizationId: z.string().uuid(),
  schemeId: z.string().uuid(),
  principal: z.string().refine((v) => Number(v) > 0, "Principal must be greater than zero"),
});

export async function createLoanScheme(caller: AuthenticatedUser, input: z.infer<typeof schemeSchema>) {
  requireOrganizationScope(caller, input.organizationId);
  requirePermission(caller, "loan.scheme.manage");

  const parsed = schemeSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message ?? "Invalid loan scheme payload");
  }

  const payload = parsed.data;

  if (Number(payload.minPrincipal) > Number(payload.maxPrincipal)) {
    throw new ValidationError("Minimum principal cannot exceed maximum principal");
  }

  const existingScheme = await prisma.loanScheme.findFirst({
    where: {
      organizationId: payload.organizationId,
      code: payload.code,
    },
  });

  if (existingScheme) {
    throw new ConflictError(`Loan scheme code "${payload.code}" already exists in this organization`);
  }

  return prisma.loanScheme.create({
    data: {
      organizationId: payload.organizationId,
      code: payload.code,
      name: payload.name,
      status: payload.status,
      versions: {
        create: [
          {
            versionNumber: 1,
            minPrincipal: payload.minPrincipal,
            maxPrincipal: payload.maxPrincipal,
            termMonths: payload.termMonths,
            interestRate: payload.interestRate,
            interestMethod: payload.interestMethod,
            repaymentFrequency: payload.repaymentFrequency,
            gracePeriodDays: payload.gracePeriodDays,
            status: payload.status,
            isPublished: payload.status === "PUBLISHED",
            effectiveDate: payload.status === "PUBLISHED" ? new Date().toISOString().slice(0, 10) : null,
          },
        ],
      },
    },
    include: {
      versions: true,
    },
  });
}

export async function publishLoanScheme(caller: AuthenticatedUser, input: z.infer<typeof publishSchema>) {
  requireOrganizationScope(caller, input.organizationId);
  requirePermission(caller, "loan.scheme.manage");

  const parsed = publishSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message ?? "Invalid publish request");
  }

  const scheme = await prisma.loanScheme.findUnique({
    where: { id: parsed.data.schemeId },
    include: { versions: true },
  });

  if (!scheme || scheme.organizationId !== parsed.data.organizationId) {
    throw new NotFoundError("LoanScheme", parsed.data.schemeId);
  }

  const nextVersionNumber = (scheme.versions.at(-1)?.versionNumber ?? 0) + 1;
  const latestVersion = scheme.versions.at(-1);

  const version = await prisma.loanSchemeVersion.create({
    data: {
      loanSchemeId: scheme.id,
      versionNumber: nextVersionNumber,
      minPrincipal: latestVersion?.minPrincipal ?? "0.0000",
      maxPrincipal: latestVersion?.maxPrincipal ?? "0.0000",
      termMonths: latestVersion?.termMonths ?? 1,
      interestRate: latestVersion?.interestRate ?? "0.0000",
      interestMethod: latestVersion?.interestMethod ?? "REDUCING_BALANCE",
      repaymentFrequency: latestVersion?.repaymentFrequency ?? "MONTHLY",
      gracePeriodDays: latestVersion?.gracePeriodDays ?? 0,
      status: "PUBLISHED",
      isPublished: true,
      effectiveDate: new Date(`${parsed.data.effectiveDate}T00:00:00.000Z`),
      notes: parsed.data.notes ?? "Published",
    },
  });

  await prisma.loanScheme.update({
    where: { id: scheme.id },
    data: {
      status: "PUBLISHED",
      currentVersionId: version.id,
    },
  });

  return version;
}

export async function previewLoanScheme(caller: AuthenticatedUser, input: z.infer<typeof previewSchema>) {
  requireOrganizationScope(caller, input.organizationId);
  requirePermission(caller, "loan.scheme.read");

  const parsed = previewSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message ?? "Invalid scheme preview request");
  }

  const scheme = await prisma.loanScheme.findUnique({
    where: { id: parsed.data.schemeId },
    include: { versions: { orderBy: { versionNumber: "desc" } } },
  });

  if (!scheme || scheme.organizationId !== parsed.data.organizationId) {
    throw new NotFoundError("LoanScheme", parsed.data.schemeId);
  }

  const currentVersion = scheme.versions[0];
  if (!currentVersion) {
    throw new NotFoundError("LoanSchemeVersion", scheme.id);
  }

  const principal = Number(parsed.data.principal);
  const rate = Number(currentVersion.interestRate);
  const monthlyInstallment = principal * (rate / 100) / 12 + principal / Math.max(currentVersion.termMonths, 1);

  return {
    schemeId: scheme.id,
    schemeCode: scheme.code,
    versionNumber: currentVersion.versionNumber,
    principal: parsed.data.principal,
    monthlyInstallment: monthlyInstallment.toFixed(4),
    totalRepayment: (principal + principal * (rate / 100)).toFixed(4),
    requiresManualApproval: true,
    notes: "TODO: replace with approved product math and signed-off calculation fixtures.",
  };
}

export async function getLoanSchemes(caller: AuthenticatedUser) {
  requirePermission(caller, "loan.scheme.read");
  return prisma.loanScheme.findMany({
    where: { organizationId: caller.organizationId },
    include: {
      versions: { orderBy: { versionNumber: "desc" } },
    },
    orderBy: { createdAt: "desc" },
  });
}
