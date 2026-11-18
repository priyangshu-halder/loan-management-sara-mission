import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from "@/lib/errors/app-error";
import { requireOrganizationScope, requirePermission } from "@/lib/permissions/auth-guard";
import { AuthenticatedUser } from "@/lib/permissions/types";
import { calculateRepaymentSchedule } from "./loan-schedule-engine";
import { recordAuditEvent } from "@/modules/audit/audit-service";
import Decimal from "decimal.js";

const stringOrNumberToString = z
  .union([z.string(), z.number()])
  .transform((val) => String(val));

const schemeSchema = z.object({
  organizationId: z.string().uuid(),
  code: z.string().min(3).max(40).regex(/^[A-Z0-9-]+$/, "Scheme code must contain only uppercase letters, numbers, and hyphens"),
  name: z.string().min(2).max(120),
  loanAmount: stringOrNumberToString
    .refine((v) => !isNaN(Number(v)) && Number(v) > 0, "Loan amount (principal) must be greater than zero"),
  repaymentPeriod: z.coerce.number().int().min(1, "Repayment period must be at least 1 month").max(600, "Repayment period cannot exceed 600 months"),
  totalRepaymentAmount: stringOrNumberToString
    .refine((v) => !isNaN(Number(v)) && Number(v) > 0, "Total repayment amount must be greater than zero"),
  termsAndConditions: z.string().max(5000).optional(),
  repaymentFrequency: z.enum(["MONTHLY", "QUARTERLY", "WEEKLY"]).default("MONTHLY"),
  status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]).default("PUBLISHED"),
}).passthrough();

const updateSchemeSchema = z.object({
  organizationId: z.string().uuid(),
  schemeId: z.string().uuid(),
  name: z.string().min(2).max(120).optional(),
  loanAmount: stringOrNumberToString
    .refine((v) => !isNaN(Number(v)) && Number(v) > 0, "Loan amount must be greater than zero")
    .optional(),
  repaymentPeriod: z.coerce.number().int().min(1).max(600).optional(),
  totalRepaymentAmount: stringOrNumberToString
    .refine((v) => !isNaN(Number(v)) && Number(v) > 0, "Total repayment amount must be greater than zero")
    .optional(),
  termsAndConditions: z.string().max(5000).optional(),
  repaymentFrequency: z.enum(["MONTHLY", "QUARTERLY", "WEEKLY"]).optional(),
  status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]).optional(),
}).passthrough();

const previewSchema = z.object({
  organizationId: z.string().uuid(),
  schemeId: z.string().uuid().optional(),
  loanAmount: stringOrNumberToString.optional(),
  principal: stringOrNumberToString.optional(),
  totalRepaymentAmount: stringOrNumberToString.optional(),
  repaymentPeriod: z.coerce.number().int().min(1).max(600).optional(),
  termMonths: z.coerce.number().int().min(1).max(600).optional(),
  repaymentFrequency: z.enum(["MONTHLY", "QUARTERLY", "WEEKLY"]).optional(),
});

export async function createLoanScheme(caller: AuthenticatedUser, input: Record<string, unknown>) {
  requireOrganizationScope(caller, String(input.organizationId));
  requirePermission(caller, "loan.scheme.manage");

  // Normalize aliases: principalAmount / minPrincipal -> loanAmount, termMonths -> repaymentPeriod
  const loanAmt = input.loanAmount ?? input.principalAmount ?? input.principal ?? input.minPrincipal;
  const totalRepay = input.totalRepaymentAmount ?? loanAmt;
  const period = input.repaymentPeriod ?? input.termMonths;

  const normalizedInput = {
    ...input,
    loanAmount: loanAmt,
    repaymentPeriod: period,
    totalRepaymentAmount: totalRepay,
    termsAndConditions: input.termsAndConditions ?? input.notes,
  };

  const parsed = schemeSchema.safeParse(normalizedInput);
  if (!parsed.success) {
    const errorMsg = parsed.error.issues
      .map((i) => (i.path.length ? `${i.path.join(".")}: ${i.message}` : i.message))
      .join("; ");
    throw new ValidationError(errorMsg || "Invalid loan scheme payload");
  }

  const payload = parsed.data;

  const loanAmountDec = new Decimal(payload.loanAmount);
  const totalRepayDec = new Decimal(payload.totalRepaymentAmount);

  // Business Rule: Total Repayment Amount must be greater than or equal to Loan Amount
  if (totalRepayDec.lt(loanAmountDec)) {
    throw new ValidationError("Total repayment amount must be greater than or equal to loan amount");
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

  const formattedLoanAmount = loanAmountDec.toFixed(4);
  const formattedTotalRepay = totalRepayDec.toFixed(4);

  const scheme = await prisma.loanScheme.create({
    data: {
      organizationId: payload.organizationId,
      code: payload.code,
      name: payload.name,
      status: payload.status,
      versions: {
        create: [
          {
            versionNumber: 1,
            principalAmount: formattedLoanAmount,
            totalRepaymentAmount: formattedTotalRepay,
            termMonths: payload.repaymentPeriod,
            termsAndConditions: payload.termsAndConditions ?? null,
            repaymentFrequency: payload.repaymentFrequency,
            minPrincipal: (input.minPrincipal as string) ?? formattedLoanAmount,
            maxPrincipal: (input.maxPrincipal as string) ?? formattedTotalRepay,
            interestRate: (input.interestRate as string) ?? null,
            interestMethod: (input.interestMethod as string) ?? null,
            gracePeriodDays: typeof input.gracePeriodDays === "number" ? input.gracePeriodDays : 0,
            status: payload.status,
            isPublished: payload.status === "PUBLISHED",
            effectiveDate: payload.status === "PUBLISHED" ? new Date() : null,
            notes: payload.termsAndConditions ?? null,
          },
        ],
      },
    },
    include: {
      versions: true,
    },
  });

  if (payload.status === "PUBLISHED" && scheme.versions[0]) {
    await prisma.loanScheme.update({
      where: { id: scheme.id },
      data: { currentVersionId: scheme.versions[0].id },
    });
    scheme.currentVersionId = scheme.versions[0].id;
  }

  await recordAuditEvent({
    organizationId: caller.organizationId,
    actorId: caller.userId,
    action: "loan.scheme.create",
    entityType: "LoanScheme",
    entityId: scheme.id,
    metadata: {
      code: scheme.code,
      name: scheme.name,
      principalAmount: formattedLoanAmount,
      totalRepaymentAmount: formattedTotalRepay,
      repaymentPeriod: payload.repaymentPeriod,
      status: scheme.status,
    },
  });

  return scheme;
}

export async function publishLoanScheme(
  caller: AuthenticatedUser,
  input: { organizationId: string; schemeId: string; effectiveDate: string; notes?: string }
) {
  requireOrganizationScope(caller, input.organizationId);
  requirePermission(caller, "loan.scheme.manage");

  const scheme = await prisma.loanScheme.findUnique({
    where: { id: input.schemeId },
    include: { versions: { orderBy: { versionNumber: "desc" } } },
  });

  if (!scheme || scheme.organizationId !== input.organizationId) {
    throw new NotFoundError("LoanScheme", input.schemeId);
  }

  const latestVersion = scheme.versions[0];
  if (!latestVersion) {
    throw new NotFoundError("LoanSchemeVersion", scheme.id);
  }

  const nextVersionNumber = latestVersion.versionNumber + 1;

  const version = await prisma.loanSchemeVersion.create({
    data: {
      loanSchemeId: scheme.id,
      versionNumber: nextVersionNumber,
      principalAmount: latestVersion.principalAmount,
      totalRepaymentAmount: latestVersion.totalRepaymentAmount,
      termMonths: latestVersion.termMonths,
      termsAndConditions: latestVersion.termsAndConditions,
      repaymentFrequency: latestVersion.repaymentFrequency,
      status: "PUBLISHED",
      isPublished: true,
      effectiveDate: new Date(`${input.effectiveDate}T00:00:00.000Z`),
      notes: input.notes ?? "Published",
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

export async function previewLoanScheme(caller: AuthenticatedUser, input: Record<string, unknown>) {
  requireOrganizationScope(caller, String(input.organizationId));
  requirePermission(caller, "loan.scheme.read");

  const normalizedInput = {
    ...input,
    loanAmount: input.loanAmount ?? input.principalAmount ?? input.principal,
    repaymentPeriod: input.repaymentPeriod ?? input.termMonths,
    totalRepaymentAmount: input.totalRepaymentAmount,
  };

  const parsed = previewSchema.safeParse(normalizedInput);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message ?? "Invalid scheme preview request");
  }

  const data = parsed.data;

  let principalStr: string;
  let totalRepaymentStr: string;
  let termMonthsVal: number;
  let freqVal: string = data.repaymentFrequency ?? "MONTHLY";
  let schemeEntity: any = null;
  let versionNumberVal: number | undefined;

  if (data.schemeId) {
    const scheme = await prisma.loanScheme.findUnique({
      where: { id: data.schemeId },
      include: { versions: { orderBy: { versionNumber: "desc" } } },
    });

    if (!scheme || scheme.organizationId !== data.organizationId) {
      throw new NotFoundError("LoanScheme", data.schemeId);
    }

    schemeEntity = scheme;
    const currentVersion = scheme.versions[0];
    if (!currentVersion) {
      throw new NotFoundError("LoanSchemeVersion", scheme.id);
    }

    versionNumberVal = currentVersion.versionNumber;
    principalStr = data.loanAmount ?? currentVersion.principalAmount ?? currentVersion.minPrincipal ?? "10000";
    totalRepaymentStr = data.totalRepaymentAmount ?? currentVersion.totalRepaymentAmount ?? principalStr;
    if (new Decimal(totalRepaymentStr).lt(new Decimal(principalStr))) {
      totalRepaymentStr = principalStr;
    }
    termMonthsVal = data.repaymentPeriod ?? currentVersion.termMonths ?? 12;
    freqVal = currentVersion.repaymentFrequency ?? "MONTHLY";
  } else {
    if (!data.loanAmount || !data.totalRepaymentAmount || !data.repaymentPeriod) {
      throw new ValidationError("loanAmount, totalRepaymentAmount, and repaymentPeriod are required for preview");
    }
    principalStr = data.loanAmount;
    totalRepaymentStr = data.totalRepaymentAmount;
    termMonthsVal = data.repaymentPeriod;
  }

  const pDec = new Decimal(principalStr);
  const tDec = new Decimal(totalRepaymentStr);

  if (pDec.lte(0)) {
    throw new ValidationError("Loan amount must be greater than zero");
  }
  if (tDec.lt(pDec)) {
    throw new ValidationError("Total repayment amount must be greater than or equal to loan amount");
  }

  const schedule = calculateRepaymentSchedule({
    principal: pDec,
    totalRepaymentAmount: tDec,
    termMonths: termMonthsVal,
    repaymentFrequency: freqVal,
    disbursementDate: new Date(),
  });

  return {
    schemeId: schemeEntity?.id,
    schemeCode: schemeEntity?.code,
    versionNumber: versionNumberVal,
    principal: pDec.toFixed(2),
    loanAmount: pDec.toFixed(2),
    totalRepayment: tDec.toFixed(2),
    totalScheduledRepayment: schedule.totalRepayment.toFixed(2),
    termMonths: termMonthsVal,
    repaymentPeriod: termMonthsVal,
    monthlyInstallment: schedule.monthlyInstallment.toFixed(2),
    indicativeMonthlyInstallment: schedule.monthlyInstallment.toFixed(2),
    calculationType: "MANUAL_DEFINED_REPAYMENT",
    requiresManualApproval: true,
    notes: "Indicative schedule calculation based on manually configured total repayment amount. No automatic interest formula applied. TODO: verify schedule preview against scheme guidelines.",
    schedulePreview: schedule.installments.map((inst) => ({
      installmentNumber: inst.installmentNumber,
      dueDate: inst.dueDateStr,
      principalDue: inst.principalDue.toFixed(2),
      interestDue: "0.00",
      totalDue: inst.totalDue.toFixed(2),
    })),
  };
}

export async function getLoanSchemes(caller: AuthenticatedUser) {
  requirePermission(caller, "loan.scheme.read");
  return prisma.loanScheme.findMany({
    where: { organizationId: caller.organizationId },
    include: {
      versions: { orderBy: { versionNumber: "desc" } },
      _count: {
        select: {
          applications: true,
          loanAccounts: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function getLoanSchemeById(caller: AuthenticatedUser, schemeId: string) {
  requirePermission(caller, "loan.scheme.read");
  const scheme = await prisma.loanScheme.findUnique({
    where: { id: schemeId },
    include: {
      versions: { orderBy: { versionNumber: "desc" } },
      _count: {
        select: {
          applications: true,
          loanAccounts: true,
        },
      },
    },
  });

  if (!scheme || scheme.organizationId !== caller.organizationId) {
    throw new NotFoundError("LoanScheme", schemeId);
  }

  return scheme;
}

export async function updateLoanScheme(caller: AuthenticatedUser, input: Record<string, unknown>) {
  requireOrganizationScope(caller, String(input.organizationId));
  requirePermission(caller, "loan.scheme.manage");

  const loanAmt = input.loanAmount ?? input.principalAmount ?? input.principal ?? input.minPrincipal;
  const totalRepay = input.totalRepaymentAmount ?? input.maxPrincipal;
  const period = input.repaymentPeriod ?? input.termMonths;

  const normalizedInput = {
    ...input,
    loanAmount: loanAmt,
    repaymentPeriod: period,
    totalRepaymentAmount: totalRepay,
    termsAndConditions: input.termsAndConditions ?? input.notes,
  };

  const parsed = updateSchemeSchema.safeParse(normalizedInput);
  if (!parsed.success) {
    const errorMsg = parsed.error.issues
      .map((i) => (i.path.length ? `${i.path.join(".")}: ${i.message}` : i.message))
      .join("; ");
    throw new ValidationError(errorMsg || "Invalid loan scheme update payload");
  }

  const payload = parsed.data;

  const scheme = await prisma.loanScheme.findUnique({
    where: { id: payload.schemeId },
    include: {
      versions: { orderBy: { versionNumber: "desc" } },
      _count: {
        select: {
          applications: true,
          loanAccounts: true,
        },
      },
    },
  });

  if (!scheme || scheme.organizationId !== payload.organizationId) {
    throw new NotFoundError("LoanScheme", payload.schemeId);
  }

  const latestVersion = scheme.versions[0];
  if (!latestVersion) {
    throw new NotFoundError("LoanSchemeVersion", scheme.id);
  }

  const targetLoanAmount = payload.loanAmount ?? latestVersion.principalAmount ?? latestVersion.minPrincipal ?? "10000.0000";
  const targetTotalRepay = payload.totalRepaymentAmount ?? latestVersion.totalRepaymentAmount ?? targetLoanAmount;
  const targetTermMonths = payload.repaymentPeriod ?? latestVersion.termMonths ?? 12;
  const targetTerms = payload.termsAndConditions ?? latestVersion.termsAndConditions ?? latestVersion.notes;
  const targetFreq = payload.repaymentFrequency ?? latestVersion.repaymentFrequency ?? "MONTHLY";
  const targetStatus = payload.status ?? scheme.status;

  const loanAmountDec = new Decimal(targetLoanAmount);
  const totalRepayDec = new Decimal(targetTotalRepay);

  if (loanAmountDec.lte(0)) {
    throw new ValidationError("Loan amount must be greater than zero");
  }
  if (totalRepayDec.lt(loanAmountDec)) {
    throw new ValidationError("Total repayment amount must be greater than or equal to loan amount");
  }

  const financialParamsChanged =
    (payload.loanAmount !== undefined && !new Decimal(payload.loanAmount).equals(new Decimal(latestVersion.principalAmount || "0"))) ||
    (payload.totalRepaymentAmount !== undefined && !new Decimal(payload.totalRepaymentAmount).equals(new Decimal(latestVersion.totalRepaymentAmount || "0"))) ||
    (payload.repaymentPeriod !== undefined && payload.repaymentPeriod !== latestVersion.termMonths) ||
    (input.interestRate !== undefined && input.interestRate !== latestVersion.interestRate) ||
    (payload.repaymentFrequency !== undefined && payload.repaymentFrequency !== latestVersion.repaymentFrequency);

  const legacyMinPrincipal = (input.minPrincipal as string) ?? loanAmountDec.toFixed(4);
  const legacyMaxPrincipal = (input.maxPrincipal as string) ?? totalRepayDec.toFixed(4);
  const legacyInterestRate = (input.interestRate as string) ?? latestVersion.interestRate;

  // Case 1: Scheme is in DRAFT status and has never been used by active applications/accounts
  if (scheme.status === "DRAFT" && scheme._count.applications === 0 && scheme._count.loanAccounts === 0) {
    const updatedVersion = await prisma.loanSchemeVersion.update({
      where: { id: latestVersion.id },
      data: {
        principalAmount: loanAmountDec.toFixed(4),
        totalRepaymentAmount: totalRepayDec.toFixed(4),
        termMonths: targetTermMonths,
        termsAndConditions: targetTerms,
        notes: targetTerms,
        repaymentFrequency: targetFreq,
        minPrincipal: legacyMinPrincipal,
        maxPrincipal: legacyMaxPrincipal,
        interestRate: legacyInterestRate,
        status: targetStatus,
        isPublished: targetStatus === "PUBLISHED",
        effectiveDate: targetStatus === "PUBLISHED" ? new Date() : latestVersion.effectiveDate,
      },
    });

    const updatedScheme = await prisma.loanScheme.update({
      where: { id: scheme.id },
      data: {
        name: payload.name ?? scheme.name,
        status: targetStatus,
        currentVersionId: targetStatus === "PUBLISHED" ? updatedVersion.id : scheme.currentVersionId,
      },
      include: {
        versions: { orderBy: { versionNumber: "desc" } },
      },
    });

    await recordAuditEvent({
      organizationId: caller.organizationId,
      actorId: caller.userId,
      action: "loan.scheme.update",
      entityType: "LoanScheme",
      entityId: scheme.id,
      metadata: {
        code: scheme.code,
        versionNumber: latestVersion.versionNumber,
        status: targetStatus,
        inPlace: true,
      },
    });

    return updatedScheme;
  }

  // Case 2: Financial parameters changed on a published scheme (or scheme with loan records).
  // Increment version to guarantee immutability of historical agreements and accounts.
  if (financialParamsChanged) {
    const nextVersionNumber = latestVersion.versionNumber + 1;
    const newVersion = await prisma.loanSchemeVersion.create({
      data: {
        loanSchemeId: scheme.id,
        versionNumber: nextVersionNumber,
        principalAmount: loanAmountDec.toFixed(4),
        totalRepaymentAmount: totalRepayDec.toFixed(4),
        termMonths: targetTermMonths,
        termsAndConditions: targetTerms,
        notes: targetTerms,
        repaymentFrequency: targetFreq,
        minPrincipal: legacyMinPrincipal,
        maxPrincipal: legacyMaxPrincipal,
        interestRate: legacyInterestRate,
        status: targetStatus,
        isPublished: targetStatus === "PUBLISHED",
        effectiveDate: targetStatus === "PUBLISHED" ? new Date() : null,
      },
    });

    const updatedScheme = await prisma.loanScheme.update({
      where: { id: scheme.id },
      data: {
        name: payload.name ?? scheme.name,
        status: targetStatus,
        currentVersionId: targetStatus === "PUBLISHED" ? newVersion.id : scheme.currentVersionId,
      },
      include: {
        versions: { orderBy: { versionNumber: "desc" } },
      },
    });

    await recordAuditEvent({
      organizationId: caller.organizationId,
      actorId: caller.userId,
      action: "loan.scheme.update",
      entityType: "LoanScheme",
      entityId: scheme.id,
      metadata: {
        code: scheme.code,
        newVersionNumber: nextVersionNumber,
        previousVersionNumber: latestVersion.versionNumber,
        status: targetStatus,
      },
    });

    return updatedScheme;
  }

  // Case 3: Only metadata/status/terms changed
  const updatedScheme = await prisma.loanScheme.update({
    where: { id: scheme.id },
    data: {
      name: payload.name ?? scheme.name,
      status: targetStatus,
    },
    include: {
      versions: { orderBy: { versionNumber: "desc" } },
    },
  });

  if (payload.termsAndConditions !== undefined) {
    await prisma.loanSchemeVersion.update({
      where: { id: latestVersion.id },
      data: {
        termsAndConditions: payload.termsAndConditions,
        notes: payload.termsAndConditions,
      },
    });
  }

  await recordAuditEvent({
    organizationId: caller.organizationId,
    actorId: caller.userId,
    action: "loan.scheme.update",
    entityType: "LoanScheme",
    entityId: scheme.id,
    metadata: {
      code: scheme.code,
      status: targetStatus,
      nameChanged: payload.name !== undefined && payload.name !== scheme.name,
    },
  });

  return updatedScheme;
}

export async function deleteLoanScheme(caller: AuthenticatedUser, schemeId: string) {
  requirePermission(caller, "loan.scheme.manage");

  const scheme = await prisma.loanScheme.findUnique({
    where: { id: schemeId },
    include: {
      _count: {
        select: {
          applications: true,
          loanAccounts: true,
        },
      },
    },
  });

  if (!scheme || scheme.organizationId !== caller.organizationId) {
    throw new NotFoundError("LoanScheme", schemeId);
  }

  if (scheme._count.applications > 0 || scheme._count.loanAccounts > 0) {
    throw new ConflictError(
      `Cannot delete loan scheme "${scheme.code}" because it is linked to ${scheme._count.applications} loan application(s) and ${scheme._count.loanAccounts} loan account(s). You can archive the scheme instead.`
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.loanScheme.update({
      where: { id: scheme.id },
      data: { currentVersionId: null },
    });

    await tx.loanSchemeVersion.deleteMany({
      where: { loanSchemeId: scheme.id },
    });

    await tx.loanScheme.delete({
      where: { id: scheme.id },
    });
  });

  await recordAuditEvent({
    organizationId: caller.organizationId,
    actorId: caller.userId,
    action: "loan.scheme.delete",
    entityType: "LoanScheme",
    entityId: scheme.id,
    metadata: {
      code: scheme.code,
      name: scheme.name,
    },
  });

  return { success: true, deletedSchemeId: scheme.id };
}
