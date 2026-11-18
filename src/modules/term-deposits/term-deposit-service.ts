import Decimal from "decimal.js";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { recordAuditEvent } from "@/modules/audit/audit-service";
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "@/lib/errors/app-error";
import {
  requireOrganizationScope,
  requirePermission,
} from "@/lib/permissions/auth-guard";
import { AuthenticatedUser } from "@/lib/permissions/types";
import {
  postJournalEntry,
  JournalLineInput,
} from "@/modules/accounting/posting-service";
import { getTodayBusinessDate } from "@/lib/dates/dates";

const productSchema = z.object({
  organizationId: z.string().uuid(),
  code: z.string().min(3).max(30),
  name: z.string().min(3).max(100),
  productType: z.enum(["FD", "RD"]),
  interestRate: z.string().refine((v) => Number(v) >= 0, "Interest rate must be non-negative"),
  interestMethod: z.enum(["SIMPLE", "COMPOUND_ANNUAL", "COMPOUND_QUARTERLY"]).default("SIMPLE"),
  termMonths: z.number().int().min(1).max(600),
  minPrincipal: z.string().refine((v) => Number(v) > 0, "Minimum principal must be positive"),
  maxPrincipal: z.string().refine((v) => Number(v) > 0, "Maximum principal must be positive"),
  prematurePenaltyRate: z.string().refine((v) => Number(v) >= 0).default("1.0000"),
  installmentFrequency: z.enum(["MONTHLY", "WEEKLY", "DAILY"]).default("MONTHLY"),
  status: z.enum(["ACTIVE", "INACTIVE"]).default("ACTIVE"),
});

const accountSchema = z.object({
  organizationId: z.string().uuid(),
  customerId: z.string().uuid(),
  productId: z.string().uuid(),
  accountNumber: z.string().min(3).max(60),
  principal: z.string().refine((v) => Number(v) > 0, "Principal must be positive"),
  depositDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  maturityDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  payoutInstruction: z.enum(["PAYOUT_TO_SAVINGS", "PAYOUT_TO_BANK", "REINVEST"]).default("PAYOUT_TO_SAVINGS"),
  cashAccountId: z.string().uuid().optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).default("ACTIVE"),
});

const payRdInstallmentSchema = z.object({
  organizationId: z.string().uuid(),
  accountId: z.string().uuid(),
  installmentNumber: z.number().int().min(1),
  amount: z.string().refine((v) => Number(v) > 0),
  transactionRef: z.string().min(3).max(60),
  businessDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  cashAccountId: z.string().uuid().optional(),
});

const maturityPreviewSchema = z.object({
  organizationId: z.string().uuid(),
  accountId: z.string().uuid(),
  asOfDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

const postDepositInterestSchema = z.object({
  organizationId: z.string().uuid(),
  accountId: z.string().uuid(),
  accrualPeriod: z.string().regex(/^\d{4}-\d{2}$/), // e.g. "2026-10"
  calculationDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

const maturityPayoutSchema = z.object({
  organizationId: z.string().uuid(),
  accountId: z.string().uuid(),
  payoutDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  cashAccountId: z.string().uuid().optional(),
  savingsAccountId: z.string().uuid().optional(),
});

const prematureCloseSchema = z.object({
  organizationId: z.string().uuid(),
  accountId: z.string().uuid(),
  closureDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  cashAccountId: z.string().uuid().optional(),
  reason: z.string().min(5).max(300),
});

/**
 * Creates a term deposit product configuration (Fixed Deposit or Recurring Deposit).
 */
export async function createDepositProduct(
  caller: AuthenticatedUser,
  input: z.input<typeof productSchema>
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
      interestMethod: payload.interestMethod,
      termMonths: payload.termMonths,
      minPrincipal: payload.minPrincipal,
      maxPrincipal: payload.maxPrincipal,
      prematurePenaltyRate: payload.prematurePenaltyRate,
      installmentFrequency: payload.installmentFrequency,
      status: payload.status,
    },
  });
}

/**
 * Retrieves all deposit products for the organization.
 */
export async function getDepositProducts(
  caller: AuthenticatedUser,
  options: { productType?: "FD" | "RD"; status?: string } = {}
) {
  requirePermission(caller, "deposit.product.manage");

  const where: Record<string, unknown> = {
    organizationId: caller.organizationId,
  };

  if (options.productType) {
    where.productType = options.productType;
  }
  if (options.status && options.status !== "ALL") {
    where.status = options.status;
  }

  return prisma.depositProduct.findMany({
    where,
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Opens a Fixed Deposit (FD) or Recurring Deposit (RD) account.
 * For FD: captures upfront deposit and computes maturity value.
 * For RD: generates the installment amortization schedule and collects installment 1.
 * Posts balanced General Ledger entries atomically.
 */
export async function openTermDepositAccount(
  caller: AuthenticatedUser,
  input: z.input<typeof accountSchema>
) {
  requireOrganizationScope(caller, input.organizationId);
  requirePermission(caller, "deposit.product.manage");

  const parsed = accountSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message ?? "Invalid term deposit account payload");
  }

  const payload = parsed.data;
  const depositDate = payload.depositDate || getTodayBusinessDate();

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

  // Calculate maturity date: depositDate + product.termMonths
  let calculatedMaturityDate = payload.maturityDate;
  if (!calculatedMaturityDate) {
    const d = new Date(depositDate);
    d.setMonth(d.getMonth() + product.termMonths);
    calculatedMaturityDate = d.toISOString().slice(0, 10);
  }

  const rate = new Decimal(product.interestRate);
  const n = product.termMonths;

  let projectedMaturityValue = new Decimal(0);
  if (product.productType === "FD") {
    // Simple Interest FD: P * (1 + (r * t / 1200))
    const totalInterest = principal.times(rate).times(n).div(1200);
    projectedMaturityValue = principal.plus(totalInterest).toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
  } else {
    // Recurring Deposit: Total Principal = P * n.
    // Standard Banking RD Simple Interest = P * n(n+1) * r / 2400
    const totalPrincipal = principal.times(n);
    const totalInterest = principal.times(n * (n + 1)).times(rate).div(2400);
    projectedMaturityValue = totalPrincipal.plus(totalInterest).toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
  }

  return prisma.$transaction(async (tx) => {
    let journalEntryId: string | null = null;
    let cashAccountIdToRecord: string | null = null;

    let cashAccount = null;
    if (payload.cashAccountId) {
      cashAccount = await tx.cashAccount.findUnique({ where: { id: payload.cashAccountId } });
      if (!cashAccount || cashAccount.organizationId !== payload.organizationId) {
        throw new NotFoundError("CashAccount", payload.cashAccountId);
      }
    } else {
      cashAccount = await tx.cashAccount.findFirst({
        where: { organizationId: payload.organizationId, isActive: true },
      });
    }

    if (cashAccount) {
      cashAccountIdToRecord = cashAccount.id;
    }

    // Liability Chart of Account: 2003 for FD, 2002 for RD
    const liabilityAccountCode = product.productType === "FD" ? "2003" : "2002";
    const liabilityCoa = await tx.chartOfAccount.findUnique({
      where: { organizationId_code: { organizationId: payload.organizationId, code: liabilityAccountCode } },
    });

    if (cashAccount && liabilityCoa) {
      const journalLines: JournalLineInput[] = [
        {
          accountId: cashAccount.chartOfAccountId,
          debit: principal,
          credit: 0,
          narration: `Initial deposit for ${product.productType} account ${payload.accountNumber} (${customer.fullName})`,
        },
        {
          accountId: liabilityCoa.id,
          debit: 0,
          credit: principal,
          narration: `${product.productType} deposit liability credit - ${payload.accountNumber}`,
        },
      ];

      const journal = await postJournalEntry(
        caller,
        {
          organizationId: payload.organizationId,
          businessDate: depositDate,
          sourceModule: "TERM_DEPOSITS",
          sourceType: product.productType === "FD" ? "FD_OPENING" : "RD_OPENING",
          sourceId: payload.accountNumber,
          description: `Term deposit ${product.productType} opening for ${customer.fullName} (${payload.accountNumber})`,
          idempotencyKey: `TD-OPEN-${payload.accountNumber}`,
          lines: journalLines,
        },
        tx
      );
      journalEntryId = journal.id;
    }

    const created = await tx.termDepositAccount.create({
      data: {
        organizationId: payload.organizationId,
        customerId: payload.customerId,
        productId: payload.productId,
        accountNumber: payload.accountNumber,
        principal: principal.toFixed(4),
        currentBalance: principal.toFixed(4), // For both FD & RD, first deposit collected on opening
        interestRate: product.interestRate,
        depositDate,
        maturityDate: calculatedMaturityDate,
        projectedMaturityValue: projectedMaturityValue.toFixed(4),
        payoutInstruction: payload.payoutInstruction,
        cashAccountId: cashAccountIdToRecord,
        journalEntryId,
        status: payload.status,
      },
      include: {
        customer: true,
        product: true,
      },
    });

    // If Recurring Deposit (RD), generate scheduled installments
    if (product.productType === "RD") {
      const installmentRows = [];
      const baseDate = new Date(depositDate);

      for (let i = 1; i <= n; i++) {
        const dueDate = new Date(baseDate);
        dueDate.setMonth(dueDate.getMonth() + (i - 1));

        const isFirst = i === 1;
        installmentRows.push({
          organizationId: payload.organizationId,
          accountId: created.id,
          installmentNumber: i,
          dueDate,
          amountDue: principal,
          amountPaid: isFirst ? principal : new Decimal(0),
          status: isFirst ? "PAID" : "PENDING",
          paidAt: isFirst ? new Date(depositDate) : null,
          receiptNumber: isFirst ? `RD-INIT-${payload.accountNumber}` : null,
        });
      }

      await tx.rdInstallment.createMany({
        data: installmentRows,
      });
    }

    await recordAuditEvent(
      {
        organizationId: payload.organizationId,
        actorId: caller.userId,
        action: "term.deposit.account.opened",
        entityType: "TermDepositAccount",
        entityId: created.id,
        metadata: {
          accountNumber: payload.accountNumber,
          productId: payload.productId,
          productType: product.productType,
          principal: payload.principal,
          projectedMaturityValue: projectedMaturityValue.toFixed(4),
          journalEntryId,
        },
      },
      tx
    );

    return created;
  });
}

/**
 * Collects a scheduled Recurring Deposit (RD) monthly installment,
 * updates installment status to PAID, increments account balance,
 * and posts balanced General Ledger entries (Debit Cash, Credit RD Liability 2002).
 */
export async function payRdInstallment(
  caller: AuthenticatedUser,
  input: z.input<typeof payRdInstallmentSchema>
) {
  requireOrganizationScope(caller, input.organizationId);
  requirePermission(caller, "deposit.product.manage");

  const parsed = payRdInstallmentSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message ?? "Invalid RD installment payment request");
  }

  const payload = parsed.data;
  const businessDate = payload.businessDate || getTodayBusinessDate();

  const account = await prisma.termDepositAccount.findUnique({
    where: { id: payload.accountId },
    include: { product: true, customer: true },
  });

  if (!account || account.organizationId !== payload.organizationId) {
    throw new NotFoundError("TermDepositAccount", payload.accountId);
  }

  if (account.status !== "ACTIVE" || account.product.productType !== "RD") {
    throw new ValidationError("Only active Recurring Deposit (RD) accounts accept installment payments");
  }

  const installment = await prisma.rdInstallment.findUnique({
    where: {
      organizationId_accountId_installmentNumber: {
        organizationId: payload.organizationId,
        accountId: payload.accountId,
        installmentNumber: payload.installmentNumber,
      },
    },
  });

  if (!installment) {
    throw new NotFoundError("RdInstallment", `Account ${account.accountNumber} #${payload.installmentNumber}`);
  }

  if (installment.status === "PAID") {
    throw new ValidationError(`Installment #${payload.installmentNumber} has already been paid`);
  }

  const amount = new Decimal(payload.amount);
  const newBalance = new Decimal(account.currentBalance).plus(amount);

  return prisma.$transaction(async (tx) => {
    let cashAccount = null;
    if (payload.cashAccountId) {
      cashAccount = await tx.cashAccount.findUnique({ where: { id: payload.cashAccountId } });
      if (!cashAccount || cashAccount.organizationId !== payload.organizationId) {
        throw new NotFoundError("CashAccount", payload.cashAccountId);
      }
    } else {
      cashAccount = await tx.cashAccount.findFirst({
        where: { organizationId: payload.organizationId, isActive: true },
      });
    }

    const rdLiabilityCoa = await tx.chartOfAccount.findUnique({
      where: { organizationId_code: { organizationId: payload.organizationId, code: "2002" } },
    });

    if (cashAccount && rdLiabilityCoa) {
      const journalLines: JournalLineInput[] = [
        {
          accountId: cashAccount.chartOfAccountId,
          debit: amount,
          credit: 0,
          narration: `RD installment #${payload.installmentNumber} for ${account.accountNumber} (${payload.transactionRef})`,
        },
        {
          accountId: rdLiabilityCoa.id,
          debit: 0,
          credit: amount,
          narration: `RD liability credit for ${account.customer.fullName} (${account.accountNumber})`,
        },
      ];

      await postJournalEntry(
        caller,
        {
          organizationId: payload.organizationId,
          businessDate,
          sourceModule: "TERM_DEPOSITS",
          sourceType: "RD_INSTALLMENT",
          sourceId: account.id,
          description: `RD installment #${payload.installmentNumber} payment (${account.accountNumber})`,
          idempotencyKey: `RD-INST-${payload.transactionRef}`,
          lines: journalLines,
        },
        tx
      );
    }

    const updatedInstallment = await tx.rdInstallment.update({
      where: { id: installment.id },
      data: {
        status: "PAID",
        amountPaid: amount,
        paidAt: new Date(businessDate),
        receiptNumber: payload.transactionRef,
      },
    });

    await tx.termDepositAccount.update({
      where: { id: account.id },
      data: { currentBalance: newBalance.toFixed(4) },
    });

    await recordAuditEvent(
      {
        organizationId: payload.organizationId,
        actorId: caller.userId,
        action: "rd.installment.paid",
        entityType: "RdInstallment",
        entityId: installment.id,
        metadata: {
          accountId: account.id,
          installmentNumber: payload.installmentNumber,
          amount: amount.toFixed(4),
          newBalance: newBalance.toFixed(4),
          transactionRef: payload.transactionRef,
        },
      },
      tx
    );

    return updatedInstallment;
  });
}

/**
 * Calculates and posts periodic interest on an active FD or RD account.
 * Guaranteed idempotent per account and accrual period (e.g. "2026-10").
 */
export async function postTermDepositInterest(
  caller: AuthenticatedUser,
  input: z.input<typeof postDepositInterestSchema>
) {
  requireOrganizationScope(caller, input.organizationId);
  requirePermission(caller, "deposit.interest.post");

  const parsed = postDepositInterestSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message ?? "Invalid deposit interest payload");
  }

  const payload = parsed.data;
  const calculationDate = payload.calculationDate || getTodayBusinessDate();

  const account = await prisma.termDepositAccount.findUnique({
    where: { id: payload.accountId },
    include: { product: true, customer: true },
  });

  if (!account || account.organizationId !== payload.organizationId) {
    throw new NotFoundError("TermDepositAccount", payload.accountId);
  }

  if (account.status !== "ACTIVE") {
    throw new ValidationError("Interest can only be posted to active term deposit accounts");
  }

  const accrualKey = `${payload.organizationId}:${account.product.productType}:${account.id}:${payload.accrualPeriod}`;
  const existingPosting = await prisma.depositInterestPosting.findUnique({
    where: { accrualKey },
  });
  if (existingPosting) {
    throw new ValidationError(`Interest has already been posted for period ${payload.accrualPeriod}`);
  }

  // Monthly interest accrual:
  // For FD: Principal * (Rate / 1200)
  // For RD: Current Balance * (Rate / 1200)
  const balanceBasis = account.product.productType === "FD"
    ? new Decimal(account.principal)
    : new Decimal(account.currentBalance);

  const rate = new Decimal(account.interestRate);
  const monthlyInterest = balanceBasis.times(rate).div(1200).toDecimalPlaces(4, Decimal.ROUND_HALF_UP);

  if (monthlyInterest.lte(0)) {
    throw new ValidationError("Calculated interest amount is zero; no interest to post");
  }

  return prisma.$transaction(async (tx) => {
    let journalEntryId: string | null = null;

    const liabilityCode = account.product.productType === "FD" ? "2003" : "2002";
    const [intExpCoa, liabilityCoa] = await Promise.all([
      tx.chartOfAccount.findUnique({
        where: { organizationId_code: { organizationId: payload.organizationId, code: "5004" } },
      }),
      tx.chartOfAccount.findUnique({
        where: { organizationId_code: { organizationId: payload.organizationId, code: liabilityCode } },
      }),
    ]);

    if (intExpCoa && liabilityCoa) {
      const journalLines: JournalLineInput[] = [
        {
          accountId: intExpCoa.id,
          debit: monthlyInterest,
          credit: 0,
          narration: `Periodic ${account.product.productType} interest expense (${payload.accrualPeriod}) for ${account.accountNumber}`,
        },
        {
          accountId: liabilityCoa.id,
          debit: 0,
          credit: monthlyInterest,
          narration: `${account.product.productType} interest credit to deposit liability for ${account.customer.fullName} (${account.accountNumber})`,
        },
      ];

      const journal = await postJournalEntry(
        caller,
        {
          organizationId: payload.organizationId,
          businessDate: calculationDate,
          sourceModule: "TERM_DEPOSITS",
          sourceType: "INTEREST_POSTING",
          sourceId: account.id,
          description: `${account.product.productType} interest accrual for ${account.accountNumber} (${payload.accrualPeriod})`,
          idempotencyKey: `TD-INT-${accrualKey}`,
          lines: journalLines,
        },
        tx
      );
      journalEntryId = journal.id;
    }

    const posting = await tx.depositInterestPosting.create({
      data: {
        organizationId: payload.organizationId,
        termAccountId: account.id,
        accountType: account.product.productType,
        accrualPeriod: payload.accrualPeriod,
        accrualKey,
        calculationDate,
        rateApplied: rate.toFixed(4),
        interestAmount: monthlyInterest.toFixed(4),
        balanceBasis: balanceBasis.toFixed(4),
        journalEntryId,
        status: "POSTED",
      },
    });

    await recordAuditEvent(
      {
        organizationId: payload.organizationId,
        actorId: caller.userId,
        action: "term.deposit.interest.posted",
        entityType: "DepositInterestPosting",
        entityId: posting.id,
        metadata: {
          accountId: account.id,
          accrualPeriod: payload.accrualPeriod,
          interestAmount: monthlyInterest.toFixed(4),
          balanceBasis: balanceBasis.toFixed(4),
          journalEntryId,
        },
      },
      tx
    );

    return posting;
  });
}

/**
 * Previews maturity projection and current balance status for a term deposit account.
 */
export async function previewTermDepositMaturity(
  caller: AuthenticatedUser,
  input: z.input<typeof maturityPreviewSchema>
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
    include: {
      product: true,
      customer: true,
      rdInstallments: { orderBy: { installmentNumber: "asc" } },
      interestPostings: true,
    },
  });

  if (!account || account.organizationId !== payload.organizationId) {
    throw new NotFoundError("TermDepositAccount", payload.accountId);
  }

  const totalInterestPosted = account.interestPostings.reduce(
    (sum, p) => sum.plus(new Decimal(p.interestAmount)),
    new Decimal(0)
  );

  return {
    accountId: account.id,
    accountNumber: account.accountNumber,
    productName: account.product.name,
    productType: account.product.productType,
    customerName: account.customer.fullName,
    principalAmount: account.principal,
    currentBalance: account.currentBalance,
    productRate: account.product.interestRate,
    termMonths: account.product.termMonths,
    depositDate: account.depositDate,
    maturityDate: account.maturityDate,
    projectedMaturityValue: account.projectedMaturityValue,
    totalInterestPosted: totalInterestPosted.toFixed(4),
    status: account.status === "ACTIVE" ? "PROVISIONAL" : account.status,
    asOfDate: payload.asOfDate,
    rdProgress: account.product.productType === "RD" ? {
      totalInstallments: account.rdInstallments.length,
      paidInstallments: account.rdInstallments.filter((i) => i.status === "PAID").length,
      pendingInstallments: account.rdInstallments.filter((i) => i.status === "PENDING").length,
    } : null,
  };
}

/**
 * Executes formal maturity payout of an FD or RD account.
 * Payout can be credited to customer's savings account or disbursed via Cash/Bank.
 * Debits deposit liability, credits Cash/Savings, and marks account MATURED.
 */
export async function payoutTermDepositMaturity(
  caller: AuthenticatedUser,
  input: z.input<typeof maturityPayoutSchema>
) {
  requireOrganizationScope(caller, input.organizationId);
  requirePermission(caller, "deposit.product.manage");

  const parsed = maturityPayoutSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message ?? "Invalid maturity payout request");
  }

  const payload = parsed.data;
  const payoutDate = payload.payoutDate || getTodayBusinessDate();

  const account = await prisma.termDepositAccount.findUnique({
    where: { id: payload.accountId },
    include: {
      product: true,
      customer: true,
      interestPostings: true,
    },
  });

  if (!account || account.organizationId !== payload.organizationId) {
    throw new NotFoundError("TermDepositAccount", payload.accountId);
  }

  if (account.status !== "ACTIVE") {
    throw new ValidationError("Only active term deposit accounts can be settled for maturity payout");
  }

  // Payout total is the projected maturity value or principal + accrued interest
  const totalInterestPosted = account.interestPostings.reduce(
    (sum, p) => sum.plus(new Decimal(p.interestAmount)),
    new Decimal(0)
  );
  const payoutAmount = new Decimal(account.projectedMaturityValue);

  return prisma.$transaction(async (tx) => {
    let closureJournalEntryId: string | null = null;
    const liabilityCode = account.product.productType === "FD" ? "2003" : "2002";

    const liabilityCoa = await tx.chartOfAccount.findUnique({
      where: { organizationId_code: { organizationId: payload.organizationId, code: liabilityCode } },
    });

    if (payload.savingsAccountId) {
      // Payout directly to customer savings account
      const savingsAccount = await tx.savingsAccount.findUnique({
        where: { id: payload.savingsAccountId },
      });
      if (!savingsAccount || savingsAccount.organizationId !== payload.organizationId) {
        throw new NotFoundError("SavingsAccount", payload.savingsAccountId);
      }

      const savingsLiabilityCoa = await tx.chartOfAccount.findUnique({
        where: { organizationId_code: { organizationId: payload.organizationId, code: "2001" } },
      });

      if (liabilityCoa && savingsLiabilityCoa) {
        const journal = await postJournalEntry(
          caller,
          {
            organizationId: payload.organizationId,
            businessDate: payoutDate,
            sourceModule: "TERM_DEPOSITS",
            sourceType: "MATURITY_PAYOUT",
            sourceId: account.id,
            description: `${account.product.productType} maturity payout transferred to savings (${account.accountNumber})`,
            idempotencyKey: `TD-MAT-${account.id}`,
            lines: [
              {
                accountId: liabilityCoa.id,
                debit: payoutAmount,
                credit: 0,
                narration: `Clear ${account.product.productType} liability on maturity - ${account.accountNumber}`,
              },
              {
                accountId: savingsLiabilityCoa.id,
                debit: 0,
                credit: payoutAmount,
                narration: `Credit savings liability for ${account.customer.fullName} (${savingsAccount.accountNumber})`,
              },
            ],
          },
          tx
        );
        closureJournalEntryId = journal.id;
      }

      const newSavingsBalance = new Decimal(savingsAccount.balance).plus(payoutAmount);
      await tx.savingsAccount.update({
        where: { id: savingsAccount.id },
        data: { balance: newSavingsBalance.toFixed(4) },
      });

      await tx.savingsTransaction.create({
        data: {
          organizationId: payload.organizationId,
          accountId: savingsAccount.id,
          type: "DEPOSIT",
          amount: payoutAmount.toFixed(4),
          balanceAfter: newSavingsBalance.toFixed(4),
          businessDate: payoutDate,
          journalEntryId: closureJournalEntryId,
          transactionRef: `MAT-${account.accountNumber}`,
          note: `Maturity payout from ${account.product.productType} ${account.accountNumber}`,
          status: "POSTED",
        },
      });
    } else {
      // Payout in Cash or Bank
      let cashAccount = null;
      if (payload.cashAccountId) {
        cashAccount = await tx.cashAccount.findUnique({ where: { id: payload.cashAccountId } });
      } else {
        cashAccount = await tx.cashAccount.findFirst({
          where: { organizationId: payload.organizationId, isActive: true },
        });
      }

      if (cashAccount && liabilityCoa) {
        const journal = await postJournalEntry(
          caller,
          {
            organizationId: payload.organizationId,
            businessDate: payoutDate,
            sourceModule: "TERM_DEPOSITS",
            sourceType: "MATURITY_PAYOUT",
            sourceId: account.id,
            description: `${account.product.productType} maturity cash payout (${account.accountNumber})`,
            idempotencyKey: `TD-MAT-${account.id}`,
            lines: [
              {
                accountId: liabilityCoa.id,
                debit: payoutAmount,
                credit: 0,
                narration: `Clear ${account.product.productType} liability on maturity - ${account.accountNumber}`,
              },
              {
                accountId: cashAccount.chartOfAccountId,
                debit: 0,
                credit: payoutAmount,
                narration: `Maturity payout disbursed to ${account.customer.fullName}`,
              },
            ],
          },
          tx
        );
        closureJournalEntryId = journal.id;
      }
    }

    const updated = await tx.termDepositAccount.update({
      where: { id: account.id },
      data: {
        status: "MATURED",
        closureDate: payoutDate,
        closureAmount: payoutAmount.toFixed(4),
        closureJournalEntryId,
        closureReason: "Maturity reached and settled in full",
      },
    });

    await recordAuditEvent(
      {
        organizationId: payload.organizationId,
        actorId: caller.userId,
        action: "term.deposit.matured",
        entityType: "TermDepositAccount",
        entityId: account.id,
        metadata: {
          accountNumber: account.accountNumber,
          payoutAmount: payoutAmount.toFixed(4),
          closureJournalEntryId,
          payoutDate,
        },
      },
      tx
    );

    return updated;
  });
}

/**
 * Prematurely closes an FD or RD account before maturity.
 * Calculates penal rate discount (e.g. rate - penaltyRate), computes prorated interest,
 * and clears liability with balanced General Ledger entries.
 */
export async function prematureCloseTermDeposit(
  caller: AuthenticatedUser,
  input: z.input<typeof prematureCloseSchema>
) {
  requireOrganizationScope(caller, input.organizationId);
  requirePermission(caller, "deposit.product.manage");

  const parsed = prematureCloseSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message ?? "Invalid premature closure payload");
  }

  const payload = parsed.data;
  const closureDate = payload.closureDate || getTodayBusinessDate();

  const account = await prisma.termDepositAccount.findUnique({
    where: { id: payload.accountId },
    include: { product: true, customer: true },
  });

  if (!account || account.organizationId !== payload.organizationId) {
    throw new NotFoundError("TermDepositAccount", payload.accountId);
  }

  if (account.status !== "ACTIVE") {
    throw new ValidationError("Only active term deposit accounts can be prematurely closed");
  }

  const productRate = new Decimal(account.interestRate);
  const penaltyRate = new Decimal(account.product.prematurePenaltyRate || "1.0000");
  const effectivePenalRate = Decimal.max(0, productRate.minus(penaltyRate));

  // Determine months elapsed
  const startDate = new Date(account.depositDate);
  const endDate = new Date(closureDate);
  const monthsElapsed = Math.max(
    1,
    (endDate.getFullYear() - startDate.getFullYear()) * 12 + (endDate.getMonth() - startDate.getMonth())
  );

  const principal = account.product.productType === "FD"
    ? new Decimal(account.principal)
    : new Decimal(account.currentBalance);

  // Interest earned at penal rate for elapsed time
  const proratedInterest = principal
    .times(effectivePenalRate)
    .times(monthsElapsed)
    .div(1200)
    .toDecimalPlaces(4, Decimal.ROUND_HALF_UP);

  const totalPayout = principal.plus(proratedInterest);

  return prisma.$transaction(async (tx) => {
    let closureJournalEntryId: string | null = null;
    const liabilityCode = account.product.productType === "FD" ? "2003" : "2002";

    let cashAccount = null;
    if (payload.cashAccountId) {
      cashAccount = await tx.cashAccount.findUnique({ where: { id: payload.cashAccountId } });
    } else {
      cashAccount = await tx.cashAccount.findFirst({
        where: { organizationId: payload.organizationId, isActive: true },
      });
    }

    const [liabilityCoa, intExpCoa] = await Promise.all([
      tx.chartOfAccount.findUnique({
        where: { organizationId_code: { organizationId: payload.organizationId, code: liabilityCode } },
      }),
      tx.chartOfAccount.findUnique({
        where: { organizationId_code: { organizationId: payload.organizationId, code: "5004" } },
      }),
    ]);

    // Query prior periodic interest postings to prevent orphan liabilities (FIN-04)
    const priorPostings = await tx.depositInterestPosting.findMany({
      where: {
        termAccountId: account.id,
        organizationId: payload.organizationId,
        status: "POSTED",
        isReversed: false,
      },
    });
    const totalPriorAccrued = priorPostings.reduce(
      (sum, p) => sum.plus(new Decimal(p.interestAmount)),
      new Decimal(0)
    );
    const totalLiabilityToClear = principal.plus(totalPriorAccrued);

    if (cashAccount && liabilityCoa) {
      const journalLines: JournalLineInput[] = [
        {
          accountId: liabilityCoa.id,
          debit: totalLiabilityToClear,
          credit: 0,
          narration: `Clear full ${account.product.productType} liability on premature closure - ${account.accountNumber}`,
        },
      ];

      // Reconcile periodic interest vs prorated penal interest
      if (proratedInterest.gt(totalPriorAccrued) && intExpCoa) {
        journalLines.push({
          accountId: intExpCoa.id,
          debit: proratedInterest.minus(totalPriorAccrued),
          credit: 0,
          narration: `Net additional interest expense at penal rate for ${account.accountNumber}`,
        });
      } else if (totalPriorAccrued.gt(proratedInterest) && intExpCoa) {
        journalLines.push({
          accountId: intExpCoa.id,
          debit: 0,
          credit: totalPriorAccrued.minus(proratedInterest),
          narration: `Reversal of excess periodic accrued interest on premature closure for ${account.accountNumber}`,
        });
      }

      journalLines.push({
        accountId: cashAccount.chartOfAccountId,
        debit: 0,
        credit: totalPayout,
        narration: `Premature payout to ${account.customer.fullName} (${account.accountNumber})`,
      });

      const journal = await postJournalEntry(
        caller,
        {
          organizationId: payload.organizationId,
          businessDate: closureDate,
          sourceModule: "TERM_DEPOSITS",
          sourceType: "PREMATURE_CLOSURE",
          sourceId: account.id,
          description: `Premature closure payout for ${account.accountNumber}`,
          idempotencyKey: `TD-PREMAT-${account.id}`,
          lines: journalLines,
        },
        tx
      );
      closureJournalEntryId = journal.id;
    }

    const updated = await tx.termDepositAccount.update({
      where: { id: account.id },
      data: {
        status: "PREMATURE_CLOSED",
        currentBalance: "0.0000",
        closureDate,
        closureAmount: totalPayout.toFixed(4),
        closureJournalEntryId,
        closureReason: payload.reason,
      },
    });

    await recordAuditEvent(
      {
        organizationId: payload.organizationId,
        actorId: caller.userId,
        action: "term.deposit.premature_closed",
        entityType: "TermDepositAccount",
        entityId: account.id,
        metadata: {
          accountNumber: account.accountNumber,
          penalRate: effectivePenalRate.toFixed(4),
          totalPayout: totalPayout.toFixed(4),
          closureJournalEntryId,
          reason: payload.reason,
        },
      },
      tx
    );

    return updated;
  });
}

/**
 * Retrieves term deposit accounts with pagination and filters.
 */
export async function getTermDepositAccounts(
  caller: AuthenticatedUser,
  options: {
    productType?: "FD" | "RD";
    status?: string;
    search?: string;
    limit?: number;
    offset?: number;
  } = {}
) {
  requirePermission(caller, "deposit.product.manage");

  const where: Record<string, unknown> = {
    organizationId: caller.organizationId,
  };

  if (options.productType) {
    where.product = { productType: options.productType };
  }
  if (options.status && options.status !== "ALL") {
    where.status = options.status;
  }
  if (options.search) {
    where.OR = [
      { accountNumber: { contains: options.search } },
      { customer: { fullName: { contains: options.search } } },
      { customer: { customerCode: { contains: options.search } } },
    ];
  }

  const [items, total] = await Promise.all([
    prisma.termDepositAccount.findMany({
      where,
      include: {
        customer: true,
        product: true,
        _count: { select: { rdInstallments: true, interestPostings: true } },
      },
      orderBy: { createdAt: "desc" },
      take: options.limit ?? 50,
      skip: options.offset ?? 0,
    }),
    prisma.termDepositAccount.count({ where }),
  ]);

  return { items, total };
}

/**
 * Retrieves term deposit account details including installments and interest postings.
 */
export async function getTermDepositAccountById(caller: AuthenticatedUser, accountId: string) {
  requirePermission(caller, "deposit.product.manage");

  const account = await prisma.termDepositAccount.findUnique({
    where: { id: accountId },
    include: {
      customer: true,
      product: true,
      cashAccount: true,
      rdInstallments: {
        orderBy: { installmentNumber: "asc" },
      },
      interestPostings: {
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!account || account.organizationId !== caller.organizationId) {
    throw new NotFoundError("TermDepositAccount", accountId);
  }

  return account;
}
