import Decimal from "decimal.js";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { recordAuditEvent } from "@/modules/audit/audit-service";
import { NotFoundError, ValidationError } from "@/lib/errors/app-error";
import { requireOrganizationScope, requirePermission } from "@/lib/permissions/auth-guard";
import { AuthenticatedUser } from "@/lib/permissions/types";

const productSchema = z.object({
  organizationId: z.string().uuid(),
  code: z.string().min(3).max(30),
  name: z.string().min(3).max(100),
  productType: z.enum(["FD", "RD"]),
  interestRate: z.string().refine((v) => Number(v) >= 0, "Interest rate must be non-negative"),
  termMonths: z.number().int().min(1).max(600),
  minPrincipal: z.string().refine((v) => Number(v) > 0, "Minimum principal must be positive"),
  maxPrincipal: z.string().refine((v) => Number(v) > 0, "Maximum principal must be positive"),
  status: z.enum(["ACTIVE", "INACTIVE"]).default("ACTIVE"),
});

const accountSchema = z.object({
  organizationId: z.string().uuid(),
  customerId: z.string().uuid(),
  productId: z.string().uuid(),
  accountNumber: z.string().min(3).max(60),
  principal: z.string().refine((v) => Number(v) > 0, "Principal must be positive"),
  maturityDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  status: z.enum(["ACTIVE", "INACTIVE"]).default("ACTIVE"),
});

const maturityPreviewSchema = z.object({
  organizationId: z.string().uuid(),
  accountId: z.string().uuid(),
  asOfDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export async function createDepositProduct(
  caller: AuthenticatedUser,
  input: z.infer<typeof productSchema>
) {
  requireOrganizationScope(caller, input.organizationId);
  requirePermission(caller, "deposit.product.manage");

  const parsed = productSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message ?? "Invalid deposit product payload");
  }

  const payload = parsed.data;

  const minPrincipal = new Decimal(payload.minPrincipal);
  const maxPrincipal = new Decimal(payload.maxPrincipal);
  if (minPrincipal.gt(maxPrincipal)) {
    throw new ValidationError("Minimum principal cannot be greater than maximum principal");
  }

  const existing = await prisma.depositProduct.findFirst({
    where: { organizationId: payload.organizationId, code: payload.code },
  });
  if (existing) {
    throw new ValidationError("Deposit product code already exists");
  }

  return prisma.depositProduct.create({
    data: {
      organizationId: payload.organizationId,
      code: payload.code,
      name: payload.name,
      productType: payload.productType,
      interestRate: payload.interestRate,
      termMonths: payload.termMonths,
      minPrincipal: payload.minPrincipal,
      maxPrincipal: payload.maxPrincipal,
      status: payload.status,
    },
  });
}

export async function openTermDepositAccount(
  caller: AuthenticatedUser,
  input: z.infer<typeof accountSchema>
) {
  requireOrganizationScope(caller, input.organizationId);
  requirePermission(caller, "deposit.product.manage");

  const parsed = accountSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message ?? "Invalid term deposit account payload");
  }

  const payload = parsed.data;

  const customer = await prisma.customer.findUnique({ where: { id: payload.customerId } });
  if (!customer || customer.organizationId !== payload.organizationId) {
    throw new NotFoundError("Customer", payload.customerId);
  }

  const product = await prisma.depositProduct.findUnique({ where: { id: payload.productId } });
  if (!product || product.organizationId !== payload.organizationId) {
    throw new NotFoundError("DepositProduct", payload.productId);
  }

  const principal = new Decimal(payload.principal);
  const minPrincipal = new Decimal(product.minPrincipal);
  const maxPrincipal = new Decimal(product.maxPrincipal);

  if (principal.lt(minPrincipal) || principal.gt(maxPrincipal)) {
    throw new ValidationError("Principal is outside the configured product limits");
  }

  const duplicateNumber = await prisma.termDepositAccount.findFirst({
    where: { organizationId: payload.organizationId, accountNumber: payload.accountNumber },
  });
  if (duplicateNumber) {
    throw new ValidationError("Term deposit account number already exists");
  }

  const created = await prisma.termDepositAccount.create({
    data: {
      organizationId: payload.organizationId,
      customerId: payload.customerId,
      productId: payload.productId,
      accountNumber: payload.accountNumber,
      principal: payload.principal,
      maturityDate: payload.maturityDate,
      status: payload.status,
    },
  });

  await recordAuditEvent({
    organizationId: payload.organizationId,
    actorId: caller.userId,
    action: "term.deposit.account.opened",
    entityType: "TermDepositAccount",
    entityId: created.id,
    metadata: {
      accountNumber: payload.accountNumber,
      productId: payload.productId,
      principal: payload.principal,
    },
  });

  return created;
}

export async function previewTermDepositMaturity(
  caller: AuthenticatedUser,
  input: z.infer<typeof maturityPreviewSchema>
) {
  requireOrganizationScope(caller, input.organizationId);
  requirePermission(caller, "deposit.product.manage");

  const parsed = maturityPreviewSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message ?? "Invalid maturity preview request");
  }

  const payload = parsed.data;

  const account = await prisma.termDepositAccount.findUnique({
    where: { id: payload.accountId },
    include: { product: true },
  });

  if (!account || account.organizationId !== payload.organizationId) {
    throw new NotFoundError("TermDepositAccount", payload.accountId);
  }

  const rate = new Decimal(account.product.interestRate);
  const principal = new Decimal(account.principal);
  const maturityValue = principal.times(rate.div(100).plus(1));

  return {
    accountId: account.id,
    principalAmount: account.principal,
    productRate: account.product.interestRate,
    maturityDate: account.maturityDate,
    projectedMaturityValue: maturityValue.toFixed(4),
    status: "PROVISIONAL",
    asOfDate: payload.asOfDate,
  };
}
