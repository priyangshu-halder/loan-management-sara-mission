import { z } from "zod";
import Decimal from "decimal.js";
import { prisma } from "@/lib/db/prisma";
import { ValidationError, ForbiddenError } from "@/lib/errors/app-error";
import { requireOrganizationScope, requirePermission } from "@/lib/permissions/auth-guard";
import { AuthenticatedUser } from "@/lib/permissions/types";
import { Money, toDecimal } from "@/lib/money/money";
import { recordAuditEvent } from "@/modules/audit/audit-service";
import { getOverdueQueue } from "@/modules/collections/overdue-service";

// ============================================================================
// Schemas
// ============================================================================

const portfolioDashboardSchema = z.object({
  organizationId: z.string().uuid(),
  asOfDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  branchId: z.string().uuid().optional(),
});

const portfolioAgingSchema = z.object({
  organizationId: z.string().uuid(),
  asOfDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  branchId: z.string().uuid().optional(),
  schemeId: z.string().uuid().optional(),
});

const collectionPerformanceSchema = z.object({
  organizationId: z.string().uuid(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  branchId: z.string().uuid().optional(),
  groupId: z.string().uuid().optional(),
  collectorId: z.string().uuid().optional(),
});

const depositMaturitiesSchema = z.object({
  organizationId: z.string().uuid(),
  asOfDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  branchId: z.string().uuid().optional(),
});

const financialStatementsSchema = z.object({
  organizationId: z.string().uuid(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  branchId: z.string().uuid().optional(),
});

const exportReportSchema = z.object({
  organizationId: z.string().uuid(),
  reportType: z.enum([
    "portfolio_aging",
    "collections",
    "deposits",
    "financial_pnl",
    "financial_bs",
    "expenses",
  ]),
  filters: z.record(z.any()).default({}),
});

// ============================================================================
// Types
// ============================================================================

export interface PortfolioDashboardReport {
  asOfDate: string;
  customers: {
    active: number;
    total: number;
    kycVerified?: number;
  };
  loanPortfolio: {
    disbursed: string;
    outstanding: string;
    activeAccounts: number;
    overdue: string;
    par30Amount?: string;
    par90Amount?: string;
  };
  collections: {
    today: string;
    total: string;
  };
  savings: {
    totalBalance: string;
    activeAccounts: number;
  };
  termDeposits: {
    totalPrincipal: string;
    activeAccounts: number;
  };
  expenses: {
    totalPosted: string;
    count: number;
  };
  recentCollections?: {
    id: string;
    receiptNumber: string;
    customerName: string;
    amount: string;
    businessDate: string;
    paymentMethod: string;
    status: string;
  }[];
  applicationsPipeline?: {
    draft: number;
    submitted: number;
    approved: number;
    rejected: number;
    activeLoans: number;
    closedLoans: number;
  };
}

export interface PortfolioAgingReport {
  asOfDate: string;
  summary: {
    totalDisbursed: string;
    totalOutstanding: string;
    activeAccountsCount: number;
    totalArrears: string;
    currentPortfolio: {
      accountsCount: number;
      principalOutstanding: string;
    };
    par1to30: {
      accountsCount: number;
      principalOutstanding: string;
      arrears: string;
    };
    par31to60: {
      accountsCount: number;
      principalOutstanding: string;
      arrears: string;
    };
    par61to90: {
      accountsCount: number;
      principalOutstanding: string;
      arrears: string;
    };
    par90PlusNPA: {
      accountsCount: number;
      principalOutstanding: string;
      arrears: string;
    };
    par30Amount: string;
    par30RatioPercent: string;
    par90Amount: string;
    par90RatioPercent: string;
  };
  pipeline: {
    draft: number;
    submitted: number;
    approved: number;
    rejected: number;
    activeLoans: number;
    closedLoans: number;
  };
  overdueLoans: Array<{
    loanAccountId: string;
    loanAccountNumber: string;
    customerCode: string;
    customerName: string;
    phone: string;
    schemeName: string;
    principalDisbursed: string;
    principalOutstanding: string;
    earliestDueDate: string;
    daysPastDue: number;
    agingBucket: "1-30" | "31-60" | "61-90" | "90+";
    principalOverdue: string;
    interestOverdue: string;
    feeOverdue: string;
    penaltyOverdue: string;
    totalOverdue: string;
    followUpStatus: string | null;
  }>;
}

export interface CollectionPerformanceReport {
  period: {
    startDate: string;
    endDate: string;
  };
  summary: {
    totalCollected: string;
    receiptsCount: number;
    allocation: {
      principal: string;
      interest: string;
      fee: string;
      penalty: string;
    };
    paymentMethods: Record<string, { count: number; amount: string }>;
  };
  dailyTrend: Array<{
    date: string;
    receiptsCount: number;
    totalAmount: string;
  }>;
  collectors: Array<{
    userId: string;
    fullName: string;
    receiptsCount: number;
    totalAmount: string;
  }>;
  groups: Array<{
    groupId: string;
    groupCode: string;
    name: string;
    membersCount: number;
    totalCollected: string;
  }>;
}

export interface DepositMaturitiesReport {
  asOfDate: string;
  liquidSavings: {
    totalBalance: string;
    activeAccounts: number;
    averageBalance: string;
  };
  recurringDeposits: {
    activeAccounts: number;
    totalCurrentBalance: string;
    pendingInstallmentsCount: number;
    pendingInstallmentsAmount: string;
  };
  fixedDeposits: {
    activeAccounts: number;
    totalPrincipal: string;
    totalProjectedMaturity: string;
  };
  maturityBuckets: {
    overdueMatured: { count: number; principal: string; projectedPayout: string };
    days0to30: { count: number; principal: string; projectedPayout: string };
    days31to60: { count: number; principal: string; projectedPayout: string };
    days61to90: { count: number; principal: string; projectedPayout: string };
    over90Days: { count: number; principal: string; projectedPayout: string };
  };
  upcomingMaturities: Array<{
    accountId: string;
    accountNumber: string;
    customerName: string;
    customerCode: string;
    productType: string;
    productName: string;
    principal: string;
    depositDate: string;
    maturityDate: string;
    projectedMaturityValue: string;
    payoutInstruction: string;
    status: string;
    daysUntilMaturity: number;
  }>;
}

export interface FinancialStatementsReport {
  period: {
    startDate: string;
    endDate: string;
  };
  incomeStatement: {
    income: Array<{ code: string; name: string; amount: string }>;
    totalIncome: string;
    expenses: Array<{ code: string; name: string; amount: string }>;
    totalExpenses: string;
    netOperatingSurplus: string;
  };
  balanceSheet: {
    asOfDate: string;
    assets: Array<{ code: string; name: string; amount: string }>;
    totalAssets: string;
    liabilities: Array<{ code: string; name: string; amount: string }>;
    totalLiabilities: string;
    equity: Array<{ code: string; name: string; amount: string }>;
    totalEquity: string;
    isBalanced: boolean;
    reconciliationDifference: string;
  };
  expenseBreakdown: Array<{
    category: string;
    count: number;
    amount: string;
    percentage: string;
  }>;
}

export interface ExportReportResult {
  filename: string;
  csvContent: string;
  rowCount: number;
  reportType: string;
  exportedAt: string;
}

// ============================================================================
// Helpers
// ============================================================================

function toCsvRow(fields: (string | number | null | undefined)[]): string {
  return fields
    .map((field) => {
      if (field === null || field === undefined) return '""';
      const str = String(field);
      if (str.includes('"') || str.includes(",") || str.includes("\n") || str.includes("\r")) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return `"${str}"`;
    })
    .join(",");
}

// ============================================================================
// 1. Portfolio Dashboard
// ============================================================================

export async function getPortfolioDashboard(
  caller: AuthenticatedUser,
  input: z.infer<typeof portfolioDashboardSchema>
): Promise<PortfolioDashboardReport> {
  requireOrganizationScope(caller, input.organizationId);
  requirePermission(caller, "report.read");

  const parsed = portfolioDashboardSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message ?? "Invalid portfolio dashboard request");
  }

  const payload = parsed.data;

  const [
    customerSummary,
    loanAggResult,
    collectionAggResult,
    savingsAggResult,
    depositAggResult,
    expenseAggResult,
    overdueQueueResult,
    pipelineDraft,
    pipelineSubmitted,
    pipelineApproved,
    pipelineRejected,
    activeLoanAccountsCount,
    closedLoanAccountsCount,
    recentCollections,
  ] = await Promise.all([
    prisma.customer.groupBy({
      by: ["status"],
      _count: { id: true },
      where: { organizationId: payload.organizationId },
    }),
    prisma.$queryRaw<Array<{ disbursed: string | number | null; outstanding: string | number | null; count: number | bigint }>>`
      SELECT
        COALESCE(SUM(CAST(principalDisbursed AS DECIMAL(19,4))), 0) AS disbursed,
        COALESCE(SUM(CASE WHEN status = 'ACTIVE' THEN CAST(principalOutstanding AS DECIMAL(19,4)) ELSE 0 END), 0) AS outstanding,
        COUNT(CASE WHEN status = 'ACTIVE' THEN 1 ELSE NULL END) AS count
      FROM loan_accounts
      WHERE organizationId = ${payload.organizationId}
    `,
    prisma.$queryRaw<Array<{ total: string | number | null }>>`
      SELECT COALESCE(SUM(CAST(amount AS DECIMAL(19,4))), 0) AS total
      FROM collection_receipts
      WHERE organizationId = ${payload.organizationId}
        AND businessDate = ${payload.asOfDate}
        AND status = 'POSTED'
    `,
    prisma.$queryRaw<Array<{ total: string | number | null; count: number | bigint }>>`
      SELECT
        COALESCE(SUM(CAST(balance AS DECIMAL(19,4))), 0) AS total,
        COUNT(*) AS count
      FROM savings_accounts
      WHERE organizationId = ${payload.organizationId}
        AND status = 'ACTIVE'
    `,
    prisma.$queryRaw<Array<{ total: string | number | null; count: number | bigint }>>`
      SELECT
        COALESCE(SUM(CAST(principal AS DECIMAL(19,4))), 0) AS total,
        COUNT(*) AS count
      FROM term_deposit_accounts
      WHERE organizationId = ${payload.organizationId}
        AND status = 'ACTIVE'
    `,
    prisma.$queryRaw<Array<{ total: string | number | null; count: number | bigint }>>`
      SELECT
        COALESCE(SUM(CAST(amount AS DECIMAL(19,4))), 0) AS total,
        COUNT(*) AS count
      FROM expenses
      WHERE organizationId = ${payload.organizationId}
        AND status = 'POSTED'
        AND expenseDate = ${payload.asOfDate}
    `,
    getOverdueQueue(caller, {
      asOfDate: payload.asOfDate,
      branchId: payload.branchId,
    }),
    prisma.loanApplication.count({
      where: { organizationId: payload.organizationId, status: "DRAFT" },
    }),
    prisma.loanApplication.count({
      where: { organizationId: payload.organizationId, status: "SUBMITTED" },
    }),
    prisma.loanApplication.count({
      where: { organizationId: payload.organizationId, status: "APPROVED" },
    }),
    prisma.loanApplication.count({
      where: { organizationId: payload.organizationId, status: "REJECTED" },
    }),
    prisma.loanAccount.count({
      where: { organizationId: payload.organizationId, status: "ACTIVE" },
    }),
    prisma.loanAccount.count({
      where: { organizationId: payload.organizationId, status: "CLOSED" },
    }),
    prisma.collectionReceipt.findMany({
      where: { organizationId: payload.organizationId, status: "POSTED" },
      take: 6,
      orderBy: { createdAt: "desc" },
      include: {
        loanAccount: {
          include: {
            customer: { select: { fullName: true } },
          },
        },
      },
    }),
  ]);

  const activeCustomers = customerSummary.find((entry) => entry.status === "ACTIVE")?._count.id ?? 0;
  const totalCustomers = customerSummary.reduce((sum, entry) => sum + (entry._count.id ?? 0), 0);

  const loanAgg = loanAggResult[0] || { disbursed: "0", outstanding: "0", count: 0 };
  const loanDisbursed = toDecimal(loanAgg.disbursed ?? 0);
  const loanOutstanding = toDecimal(loanAgg.outstanding ?? 0);
  const loanCount = Number(loanAgg.count ?? 0);

  const totalTodayCollections = toDecimal(collectionAggResult[0]?.total ?? 0);
  const totalSavings = toDecimal(savingsAggResult[0]?.total ?? 0);
  const totalTermDeposits = toDecimal(depositAggResult[0]?.total ?? 0);
  const totalExpenseAmount = toDecimal(expenseAggResult[0]?.total ?? 0);

  return {
    asOfDate: payload.asOfDate,
    customers: {
      active: activeCustomers,
      total: totalCustomers,
      kycVerified: activeCustomers,
    },
    loanPortfolio: {
      disbursed: loanDisbursed.toFixed(4),
      outstanding: loanOutstanding.toFixed(4),
      activeAccounts: loanCount,
      overdue: overdueQueueResult.summary.totalArrearsAmount,
      par30Amount: overdueQueueResult.summary.par30Amount,
      par90Amount: overdueQueueResult.summary.par90Amount,
    },
    collections: {
      today: totalTodayCollections.toFixed(4),
      total: totalTodayCollections.toFixed(4),
    },
    savings: {
      totalBalance: totalSavings.toFixed(4),
      activeAccounts: Number(savingsAggResult[0]?.count ?? 0),
    },
    termDeposits: {
      totalPrincipal: totalTermDeposits.toFixed(4),
      activeAccounts: Number(depositAggResult[0]?.count ?? 0),
    },
    expenses: {
      totalPosted: totalExpenseAmount.toFixed(4),
      count: Number(expenseAggResult[0]?.count ?? 0),
    },
    recentCollections: recentCollections.map((rc) => ({
      id: rc.id,
      receiptNumber: rc.receiptNumber,
      customerName: rc.loanAccount.customer.fullName,
      amount: toDecimal(rc.amount).toFixed(4),
      businessDate: rc.businessDate,
      paymentMethod: rc.paymentMethod,
      status: rc.status,
    })),
    applicationsPipeline: {
      draft: pipelineDraft,
      submitted: pipelineSubmitted,
      approved: pipelineApproved,
      rejected: pipelineRejected,
      activeLoans: activeLoanAccountsCount,
      closedLoans: closedLoanAccountsCount,
    },
  };
}

// ============================================================================
// 2. Portfolio Aging & Overdue Report
// ============================================================================

export async function getPortfolioAgingReport(
  caller: AuthenticatedUser,
  input: z.infer<typeof portfolioAgingSchema>
): Promise<PortfolioAgingReport> {
  requireOrganizationScope(caller, input.organizationId);
  requirePermission(caller, "report.read");

  const parsed = portfolioAgingSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message ?? "Invalid portfolio aging request");
  }

  const payload = parsed.data;
  const asOfDate = payload.asOfDate || new Date().toISOString().slice(0, 10);

  // 1. Run overdue queue calculation for PAR buckets
  const overdueResult = await getOverdueQueue(caller, {
    asOfDate,
    branchId: payload.branchId,
    agingBucket: "ALL",
  });

  // 2. Fetch all active loan accounts
  const activeLoans = await prisma.loanAccount.findMany({
    where: {
      organizationId: payload.organizationId,
      status: "ACTIVE",
      ...(payload.schemeId ? { schemeId: payload.schemeId } : {}),
      ...(payload.branchId ? { customer: { branchId: payload.branchId } } : {}),
    },
    select: {
      id: true,
      principalDisbursed: true,
      principalOutstanding: true,
    },
  });

  const totalDisbursed = activeLoans.reduce(
    (sum, l) => sum.plus(toDecimal(l.principalDisbursed)),
    new Decimal(0)
  );
  const totalOutstanding = activeLoans.reduce(
    (sum, l) => sum.plus(toDecimal(l.principalOutstanding)),
    new Decimal(0)
  );

  // Bucket aggregations
  const overdueLoanIds = new Set(overdueResult.items.map((i) => i.loanAccountId));
  const currentLoans = activeLoans.filter((l) => !overdueLoanIds.has(l.id));

  const currentPrincipal = currentLoans.reduce(
    (sum, l) => sum.plus(toDecimal(l.principalOutstanding)),
    new Decimal(0)
  );

  const b1to30 = { count: 0, outstanding: new Decimal(0), arrears: new Decimal(0) };
  const b31to60 = { count: 0, outstanding: new Decimal(0), arrears: new Decimal(0) };
  const b61to90 = { count: 0, outstanding: new Decimal(0), arrears: new Decimal(0) };
  const b90plus = { count: 0, outstanding: new Decimal(0), arrears: new Decimal(0) };

  for (const item of overdueResult.items) {
    const outstanding = toDecimal(item.principalOutstanding);
    const arrears = toDecimal(item.totalOverdue);

    if (item.agingBucket === "1-30") {
      b1to30.count += 1;
      b1to30.outstanding = b1to30.outstanding.plus(outstanding);
      b1to30.arrears = b1to30.arrears.plus(arrears);
    } else if (item.agingBucket === "31-60") {
      b31to60.count += 1;
      b31to60.outstanding = b31to60.outstanding.plus(outstanding);
      b31to60.arrears = b31to60.arrears.plus(arrears);
    } else if (item.agingBucket === "61-90") {
      b61to90.count += 1;
      b61to90.outstanding = b61to90.outstanding.plus(outstanding);
      b61to90.arrears = b61to90.arrears.plus(arrears);
    } else if (item.agingBucket === "90+") {
      b90plus.count += 1;
      b90plus.outstanding = b90plus.outstanding.plus(outstanding);
      b90plus.arrears = b90plus.arrears.plus(arrears);
    }
  }

  const par30Outstanding = b31to60.outstanding.plus(b61to90.outstanding).plus(b90plus.outstanding);
  const par90Outstanding = b90plus.outstanding;

  const par30Ratio = totalOutstanding.isZero()
    ? "0.00"
    : par30Outstanding.dividedBy(totalOutstanding).times(100).toFixed(2);

  const par90Ratio = totalOutstanding.isZero()
    ? "0.00"
    : par90Outstanding.dividedBy(totalOutstanding).times(100).toFixed(2);

  // 3. Pipeline counts
  const [pipelineDraft, pipelineSubmitted, pipelineApproved, pipelineRejected, closedCount] =
    await Promise.all([
      prisma.loanApplication.count({
        where: { organizationId: payload.organizationId, status: "DRAFT" },
      }),
      prisma.loanApplication.count({
        where: { organizationId: payload.organizationId, status: "SUBMITTED" },
      }),
      prisma.loanApplication.count({
        where: { organizationId: payload.organizationId, status: "APPROVED" },
      }),
      prisma.loanApplication.count({
        where: { organizationId: payload.organizationId, status: "REJECTED" },
      }),
      prisma.loanAccount.count({
        where: { organizationId: payload.organizationId, status: "CLOSED" },
      }),
    ]);

  return {
    asOfDate,
    summary: {
      totalDisbursed: totalDisbursed.toFixed(4),
      totalOutstanding: totalOutstanding.toFixed(4),
      activeAccountsCount: activeLoans.length,
      totalArrears: overdueResult.summary.totalArrearsAmount,
      currentPortfolio: {
        accountsCount: currentLoans.length,
        principalOutstanding: currentPrincipal.toFixed(4),
      },
      par1to30: {
        accountsCount: b1to30.count,
        principalOutstanding: b1to30.outstanding.toFixed(4),
        arrears: b1to30.arrears.toFixed(4),
      },
      par31to60: {
        accountsCount: b31to60.count,
        principalOutstanding: b31to60.outstanding.toFixed(4),
        arrears: b31to60.arrears.toFixed(4),
      },
      par61to90: {
        accountsCount: b61to90.count,
        principalOutstanding: b61to90.outstanding.toFixed(4),
        arrears: b61to90.arrears.toFixed(4),
      },
      par90PlusNPA: {
        accountsCount: b90plus.count,
        principalOutstanding: b90plus.outstanding.toFixed(4),
        arrears: b90plus.arrears.toFixed(4),
      },
      par30Amount: par30Outstanding.toFixed(4),
      par30RatioPercent: par30Ratio,
      par90Amount: par90Outstanding.toFixed(4),
      par90RatioPercent: par90Ratio,
    },
    pipeline: {
      draft: pipelineDraft,
      submitted: pipelineSubmitted,
      approved: pipelineApproved,
      rejected: pipelineRejected,
      activeLoans: activeLoans.length,
      closedLoans: closedCount,
    },
    overdueLoans: overdueResult.items.map((item) => ({
      loanAccountId: item.loanAccountId,
      loanAccountNumber: item.loanAccountNumber,
      customerCode: item.customer.customerCode,
      customerName: item.customer.fullName,
      phone: item.customer.phone,
      schemeName: item.scheme.name,
      principalDisbursed: item.principalDisbursed,
      principalOutstanding: item.principalOutstanding,
      earliestDueDate: item.earliestDueDate,
      daysPastDue: item.daysPastDue,
      agingBucket: item.agingBucket,
      principalOverdue: item.principalOverdue,
      interestOverdue: item.interestOverdue,
      feeOverdue: item.feeOverdue,
      penaltyOverdue: item.penaltyOverdue,
      totalOverdue: item.totalOverdue,
      followUpStatus: item.latestFollowUp?.status ?? null,
    })),
  };
}

// ============================================================================
// 3. Collection Performance & Agent/Group Report
// ============================================================================

export async function getCollectionPerformanceReport(
  caller: AuthenticatedUser,
  input: z.infer<typeof collectionPerformanceSchema>
): Promise<CollectionPerformanceReport> {
  requireOrganizationScope(caller, input.organizationId);
  requirePermission(caller, "report.read");

  const parsed = collectionPerformanceSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message ?? "Invalid collection performance request");
  }

  const payload = parsed.data;

  // 1. Fetch collection receipts in period
  const receipts = await prisma.collectionReceipt.findMany({
    where: {
      organizationId: payload.organizationId,
      status: "POSTED",
      businessDate: {
        gte: payload.startDate,
        lte: payload.endDate,
      },
      ...(payload.collectorId ? { recordedById: payload.collectorId } : {}),
    },
    include: {
      loanAccount: {
        include: {
          customer: {
            include: {
              customerGroups: { include: { group: true } },
            },
          },
        },
      },
      allocations: true,
    },
    orderBy: { businessDate: "asc" },
  });

  let totalCollected = new Decimal(0);
  let principalAllocated = new Decimal(0);
  let interestAllocated = new Decimal(0);
  let feeAllocated = new Decimal(0);
  let penaltyAllocated = new Decimal(0);

  const paymentMethods: Record<string, { count: number; amount: Decimal }> = {};
  const dailyMap: Record<string, { count: number; amount: Decimal }> = {};
  const collectorMap: Record<string, { fullName: string; count: number; amount: Decimal }> = {};
  const groupMap: Record<string, { groupCode: string; name: string; count: number; amount: Decimal }> = {};

  for (const rc of receipts) {
    const rcAmount = toDecimal(rc.amount);
    totalCollected = totalCollected.plus(rcAmount);

    // Allocations
    for (const alloc of rc.allocations) {
      principalAllocated = principalAllocated.plus(toDecimal(alloc.principalAmount));
      interestAllocated = interestAllocated.plus(toDecimal(alloc.interestAmount));
      feeAllocated = feeAllocated.plus(toDecimal(alloc.feeAmount));
      penaltyAllocated = penaltyAllocated.plus(toDecimal(alloc.penaltyAmount));
    }

    // Payment methods
    if (!paymentMethods[rc.paymentMethod]) {
      paymentMethods[rc.paymentMethod] = { count: 0, amount: new Decimal(0) };
    }
    paymentMethods[rc.paymentMethod]!.count += 1;
    paymentMethods[rc.paymentMethod]!.amount = paymentMethods[rc.paymentMethod]!.amount.plus(rcAmount);

    // Daily trend
    if (!dailyMap[rc.businessDate]) {
      dailyMap[rc.businessDate] = { count: 0, amount: new Decimal(0) };
    }
    dailyMap[rc.businessDate]!.count += 1;
    dailyMap[rc.businessDate]!.amount = dailyMap[rc.businessDate]!.amount.plus(rcAmount);

    // Collector
    const collectorId = rc.recordedById || "system";
    if (!collectorMap[collectorId]) {
      collectorMap[collectorId] = { fullName: "System / Field Officer", count: 0, amount: new Decimal(0) };
    }
    collectorMap[collectorId]!.count += 1;
    collectorMap[collectorId]!.amount = collectorMap[collectorId]!.amount.plus(rcAmount);

    // Group
    for (const cg of rc.loanAccount.customer.customerGroups) {
      const g = cg.group;
      if (!groupMap[g.id]) {
        groupMap[g.id] = { groupCode: g.code, name: g.name, count: 0, amount: new Decimal(0) };
      }
      groupMap[g.id]!.count += 1;
      groupMap[g.id]!.amount = groupMap[g.id]!.amount.plus(rcAmount);
    }
  }

  // Resolve collector names
  const collectorUserIds = Object.keys(collectorMap).filter((id) => id !== "system");
  if (collectorUserIds.length > 0) {
    const users = await prisma.user.findMany({
      where: { id: { in: collectorUserIds } },
      select: { id: true, fullName: true, username: true },
    });
    for (const u of users) {
      if (collectorMap[u.id]) {
        collectorMap[u.id]!.fullName = u.fullName || u.username;
      }
    }
  }

  // Fetch groups member count
  const allGroups = await prisma.group.findMany({
    where: { organizationId: payload.organizationId },
    include: { _count: { select: { customerGroups: true } } },
  });

  const groupReport = allGroups.map((g) => {
    const data = groupMap[g.id];
    return {
      groupId: g.id,
      groupCode: g.code,
      name: g.name,
      membersCount: g._count.customerGroups,
      totalCollected: data ? data.amount.toFixed(4) : "0.0000",
    };
  });

  return {
    period: {
      startDate: payload.startDate,
      endDate: payload.endDate,
    },
    summary: {
      totalCollected: totalCollected.toFixed(4),
      receiptsCount: receipts.length,
      allocation: {
        principal: principalAllocated.toFixed(4),
        interest: interestAllocated.toFixed(4),
        fee: feeAllocated.toFixed(4),
        penalty: penaltyAllocated.toFixed(4),
      },
      paymentMethods: Object.fromEntries(
        Object.entries(paymentMethods).map(([k, v]) => [
          k,
          { count: v.count, amount: v.amount.toFixed(4) },
        ])
      ),
    },
    dailyTrend: Object.entries(dailyMap).map(([date, v]) => ({
      date,
      receiptsCount: v.count,
      totalAmount: v.amount.toFixed(4),
    })),
    collectors: Object.entries(collectorMap).map(([userId, v]) => ({
      userId,
      fullName: v.fullName,
      receiptsCount: v.count,
      totalAmount: v.amount.toFixed(4),
    })),
    groups: groupReport,
  };
}

// ============================================================================
// 4. Deposit & Maturities Report
// ============================================================================

export async function getDepositMaturitiesReport(
  caller: AuthenticatedUser,
  input: z.infer<typeof depositMaturitiesSchema>
): Promise<DepositMaturitiesReport> {
  requireOrganizationScope(caller, input.organizationId);
  requirePermission(caller, "report.read");

  const parsed = depositMaturitiesSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message ?? "Invalid deposit maturities request");
  }

  const payload = parsed.data;
  const asOfDate = payload.asOfDate || new Date().toISOString().slice(0, 10);
  const asOfTime = new Date(`${asOfDate}T00:00:00.000Z`).getTime();

  // 1. Savings accounts
  const savingsAccounts = await prisma.savingsAccount.findMany({
    where: {
      organizationId: payload.organizationId,
      status: "ACTIVE",
      ...(payload.branchId ? { customer: { branchId: payload.branchId } } : {}),
    },
    select: { balance: true },
  });

  const totalSavings = savingsAccounts.reduce(
    (sum, a) => sum.plus(toDecimal(a.balance)),
    new Decimal(0)
  );
  const avgSavings = savingsAccounts.length > 0
    ? totalSavings.dividedBy(savingsAccounts.length)
    : new Decimal(0);

  // 2. Term deposits (FD & RD)
  const termDeposits = await prisma.termDepositAccount.findMany({
    where: {
      organizationId: payload.organizationId,
      status: "ACTIVE",
      ...(payload.branchId ? { customer: { branchId: payload.branchId } } : {}),
    },
    include: {
      customer: { select: { fullName: true, customerCode: true } },
      product: { select: { name: true, productType: true } },
      rdInstallments: {
        where: { status: "PENDING" },
      },
    },
  });

  let rdAccountsCount = 0;
  let rdTotalBalance = new Decimal(0);
  let rdPendingInstallmentsCount = 0;
  let rdPendingInstallmentsAmount = new Decimal(0);

  let fdAccountsCount = 0;
  let fdTotalPrincipal = new Decimal(0);
  let fdTotalProjectedMaturity = new Decimal(0);

  const buckets = {
    overdueMatured: { count: 0, principal: new Decimal(0), projectedPayout: new Decimal(0) },
    days0to30: { count: 0, principal: new Decimal(0), projectedPayout: new Decimal(0) },
    days31to60: { count: 0, principal: new Decimal(0), projectedPayout: new Decimal(0) },
    days61to90: { count: 0, principal: new Decimal(0), projectedPayout: new Decimal(0) },
    over90Days: { count: 0, principal: new Decimal(0), projectedPayout: new Decimal(0) },
  };

  const upcomingList: DepositMaturitiesReport["upcomingMaturities"] = [];

  for (const td of termDeposits) {
    const isRd = td.product.productType === "RECURRING_DEPOSIT";
    const principal = toDecimal(td.principal);
    const projectedMaturity = toDecimal(td.projectedMaturityValue);

    if (isRd) {
      rdAccountsCount += 1;
      rdTotalBalance = rdTotalBalance.plus(toDecimal(td.currentBalance));
      for (const inst of td.rdInstallments) {
        rdPendingInstallmentsCount += 1;
        rdPendingInstallmentsAmount = rdPendingInstallmentsAmount.plus(toDecimal(inst.amountDue));
      }
    } else {
      fdAccountsCount += 1;
      fdTotalPrincipal = fdTotalPrincipal.plus(principal);
      fdTotalProjectedMaturity = fdTotalProjectedMaturity.plus(projectedMaturity);
    }

    const matTime = new Date(`${td.maturityDate}T00:00:00.000Z`).getTime();
    const diffDays = Math.floor((matTime - asOfTime) / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      buckets.overdueMatured.count += 1;
      buckets.overdueMatured.principal = buckets.overdueMatured.principal.plus(principal);
      buckets.overdueMatured.projectedPayout = buckets.overdueMatured.projectedPayout.plus(projectedMaturity);
    } else if (diffDays <= 30) {
      buckets.days0to30.count += 1;
      buckets.days0to30.principal = buckets.days0to30.principal.plus(principal);
      buckets.days0to30.projectedPayout = buckets.days0to30.projectedPayout.plus(projectedMaturity);
    } else if (diffDays <= 60) {
      buckets.days31to60.count += 1;
      buckets.days31to60.principal = buckets.days31to60.principal.plus(principal);
      buckets.days31to60.projectedPayout = buckets.days31to60.projectedPayout.plus(projectedMaturity);
    } else if (diffDays <= 90) {
      buckets.days61to90.count += 1;
      buckets.days61to90.principal = buckets.days61to90.principal.plus(principal);
      buckets.days61to90.projectedPayout = buckets.days61to90.projectedPayout.plus(projectedMaturity);
    } else {
      buckets.over90Days.count += 1;
      buckets.over90Days.principal = buckets.over90Days.principal.plus(principal);
      buckets.over90Days.projectedPayout = buckets.over90Days.projectedPayout.plus(projectedMaturity);
    }

    upcomingList.push({
      accountId: td.id,
      accountNumber: td.accountNumber,
      customerName: td.customer.fullName,
      customerCode: td.customer.customerCode,
      productType: td.product.productType,
      productName: td.product.name,
      principal: principal.toFixed(4),
      depositDate: td.depositDate,
      maturityDate: td.maturityDate,
      projectedMaturityValue: projectedMaturity.toFixed(4),
      payoutInstruction: td.payoutInstruction,
      status: td.status,
      daysUntilMaturity: diffDays,
    });
  }

  // Sort upcoming maturities by closest maturity date first
  upcomingList.sort((a, b) => a.daysUntilMaturity - b.daysUntilMaturity);

  return {
    asOfDate,
    liquidSavings: {
      totalBalance: totalSavings.toFixed(4),
      activeAccounts: savingsAccounts.length,
      averageBalance: avgSavings.toFixed(4),
    },
    recurringDeposits: {
      activeAccounts: rdAccountsCount,
      totalCurrentBalance: rdTotalBalance.toFixed(4),
      pendingInstallmentsCount: rdPendingInstallmentsCount,
      pendingInstallmentsAmount: rdPendingInstallmentsAmount.toFixed(4),
    },
    fixedDeposits: {
      activeAccounts: fdAccountsCount,
      totalPrincipal: fdTotalPrincipal.toFixed(4),
      totalProjectedMaturity: fdTotalProjectedMaturity.toFixed(4),
    },
    maturityBuckets: {
      overdueMatured: {
        count: buckets.overdueMatured.count,
        principal: buckets.overdueMatured.principal.toFixed(4),
        projectedPayout: buckets.overdueMatured.projectedPayout.toFixed(4),
      },
      days0to30: {
        count: buckets.days0to30.count,
        principal: buckets.days0to30.principal.toFixed(4),
        projectedPayout: buckets.days0to30.projectedPayout.toFixed(4),
      },
      days31to60: {
        count: buckets.days31to60.count,
        principal: buckets.days31to60.principal.toFixed(4),
        projectedPayout: buckets.days31to60.projectedPayout.toFixed(4),
      },
      days61to90: {
        count: buckets.days61to90.count,
        principal: buckets.days61to90.principal.toFixed(4),
        projectedPayout: buckets.days61to90.projectedPayout.toFixed(4),
      },
      over90Days: {
        count: buckets.over90Days.count,
        principal: buckets.over90Days.principal.toFixed(4),
        projectedPayout: buckets.over90Days.projectedPayout.toFixed(4),
      },
    },
    upcomingMaturities: upcomingList,
  };
}

// ============================================================================
// 5. Financial Statements (P&L & Balance Sheet) & Expense Summaries
// ============================================================================

export async function getFinancialStatementsReport(
  caller: AuthenticatedUser,
  input: z.infer<typeof financialStatementsSchema>
): Promise<FinancialStatementsReport> {
  requireOrganizationScope(caller, input.organizationId);
  requirePermission(caller, "report.read");

  const parsed = financialStatementsSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message ?? "Invalid financial statements request");
  }

  const payload = parsed.data;

  // 1. Fetch Chart of Accounts for organization
  const coaList = await prisma.chartOfAccount.findMany({
    where: { organizationId: payload.organizationId },
    orderBy: { code: "asc" },
  });

  const coaMap = new Map(coaList.map((c) => [c.id, c]));

  // 2. Fetch cumulative journal lines up to endDate
  const allLines = await prisma.journalLine.findMany({
    where: {
      journalEntry: {
        organizationId: payload.organizationId,
        status: { in: ["POSTED", "REVERSED"] },
        businessDate: {
          lte: payload.endDate,
        },
        ...(payload.branchId ? { branchId: payload.branchId } : {}),
      },
    },
    include: {
      account: true,
      journalEntry: { select: { businessDate: true } },
    },
  });

  // Track period P&L and prior surplus
  const pnlTotals: Record<string, { debit: Decimal; credit: Decimal }> = {};
  let priorIncome = new Decimal(0);
  let priorExpenses = new Decimal(0);

  const bsTotals: Record<string, { debit: Decimal; credit: Decimal }> = {};

  for (const line of allLines) {
    const debit = toDecimal(line.debit);
    const credit = toDecimal(line.credit);
    const bDate = line.journalEntry.businessDate;

    // Cumulative balance sheet totals for ASSET, LIABILITY, EQUITY
    if (!bsTotals[line.accountId]) {
      bsTotals[line.accountId] = { debit: new Decimal(0), credit: new Decimal(0) };
    }
    bsTotals[line.accountId]!.debit = bsTotals[line.accountId]!.debit.plus(debit);
    bsTotals[line.accountId]!.credit = bsTotals[line.accountId]!.credit.plus(credit);

    if (bDate >= payload.startDate) {
      // In current period
      if (!pnlTotals[line.accountId]) {
        pnlTotals[line.accountId] = { debit: new Decimal(0), credit: new Decimal(0) };
      }
      pnlTotals[line.accountId]!.debit = pnlTotals[line.accountId]!.debit.plus(debit);
      pnlTotals[line.accountId]!.credit = pnlTotals[line.accountId]!.credit.plus(credit);
    } else {
      // In prior periods
      if (line.account.accountType === "INCOME") {
        priorIncome = priorIncome.plus(credit.minus(debit));
      } else if (line.account.accountType === "EXPENSE") {
        priorExpenses = priorExpenses.plus(debit.minus(credit));
      }
    }
  }

  const incomeItems: Array<{ code: string; name: string; amount: string }> = [];
  let totalIncome = new Decimal(0);

  const expenseItems: Array<{ code: string; name: string; amount: string }> = [];
  let totalExpenses = new Decimal(0);

  for (const coa of coaList) {
    const totals = pnlTotals[coa.id] || { debit: new Decimal(0), credit: new Decimal(0) };
    if (coa.accountType === "INCOME") {
      const net = totals.credit.minus(totals.debit);
      totalIncome = totalIncome.plus(net);
      incomeItems.push({ code: coa.code, name: coa.name, amount: net.toFixed(4) });
    } else if (coa.accountType === "EXPENSE") {
      const net = totals.debit.minus(totals.credit);
      totalExpenses = totalExpenses.plus(net);
      expenseItems.push({ code: coa.code, name: coa.name, amount: net.toFixed(4) });
    }
  }

  const netOperatingSurplus = totalIncome.minus(totalExpenses);
  const priorSurplus = priorIncome.minus(priorExpenses);

  const assetItems: Array<{ code: string; name: string; amount: string }> = [];
  let totalAssets = new Decimal(0);

  const liabilityItems: Array<{ code: string; name: string; amount: string }> = [];
  let totalLiabilities = new Decimal(0);

  const equityItems: Array<{ code: string; name: string; amount: string }> = [];
  let totalEquity = new Decimal(0);

  for (const coa of coaList) {
    const totals = bsTotals[coa.id] || { debit: new Decimal(0), credit: new Decimal(0) };
    if (coa.accountType === "ASSET") {
      const net = totals.debit.minus(totals.credit);
      totalAssets = totalAssets.plus(net);
      assetItems.push({ code: coa.code, name: coa.name, amount: net.toFixed(4) });
    } else if (coa.accountType === "LIABILITY") {
      const net = totals.credit.minus(totals.debit);
      totalLiabilities = totalLiabilities.plus(net);
      liabilityItems.push({ code: coa.code, name: coa.name, amount: net.toFixed(4) });
    } else if (coa.accountType === "EQUITY") {
      const net = totals.credit.minus(totals.debit);
      totalEquity = totalEquity.plus(net);
      equityItems.push({ code: coa.code, name: coa.name, amount: net.toFixed(4) });
    }
  }

  // Include prior surplus and period Net Surplus into Equity to balance the ledger
  if (!priorSurplus.isZero()) {
    equityItems.push({
      code: "PRIOR_SURPLUS",
      name: "Prior Accumulated Surplus / (Deficit)",
      amount: priorSurplus.toFixed(4),
    });
  }

  equityItems.push({
    code: "SURPLUS",
    name: "Current Period Net Surplus / (Deficit)",
    amount: netOperatingSurplus.toFixed(4),
  });

  const balanceSheetEquity = totalEquity.plus(priorSurplus).plus(netOperatingSurplus);
  const diff = totalAssets.minus(totalLiabilities.plus(balanceSheetEquity)).abs();
  const isBalanced = diff.lessThanOrEqualTo("0.0001");

  // 4. Operational expense breakdown
  const expenses = await prisma.expense.findMany({
    where: {
      organizationId: payload.organizationId,
      status: "POSTED",
      expenseDate: {
        gte: payload.startDate,
        lte: payload.endDate,
      },
    },
    select: {
      category: true,
      amount: true,
    },
  });

  const catMap: Record<string, { count: number; amount: Decimal }> = {};
  let totalExpAmount = new Decimal(0);

  for (const exp of expenses) {
    const amt = toDecimal(exp.amount);
    totalExpAmount = totalExpAmount.plus(amt);
    if (!catMap[exp.category]) {
      catMap[exp.category] = { count: 0, amount: new Decimal(0) };
    }
    catMap[exp.category]!.count += 1;
    catMap[exp.category]!.amount = catMap[exp.category]!.amount.plus(amt);
  }

  const expenseBreakdown = Object.entries(catMap).map(([category, data]) => {
    const pct = totalExpAmount.isZero()
      ? "0.00"
      : data.amount.dividedBy(totalExpAmount).times(100).toFixed(2);
    return {
      category,
      count: data.count,
      amount: data.amount.toFixed(4),
      percentage: pct,
    };
  });

  return {
    period: {
      startDate: payload.startDate,
      endDate: payload.endDate,
    },
    incomeStatement: {
      income: incomeItems,
      totalIncome: totalIncome.toFixed(4),
      expenses: expenseItems,
      totalExpenses: totalExpenses.toFixed(4),
      netOperatingSurplus: netOperatingSurplus.toFixed(4),
    },
    balanceSheet: {
      asOfDate: payload.endDate,
      assets: assetItems,
      totalAssets: totalAssets.toFixed(4),
      liabilities: liabilityItems,
      totalLiabilities: totalLiabilities.toFixed(4),
      equity: equityItems,
      totalEquity: balanceSheetEquity.toFixed(4),
      isBalanced,
      reconciliationDifference: diff.toFixed(4),
    },
    expenseBreakdown,
  };
}

// ============================================================================
// 6. Audited CSV Export Service
// ============================================================================

export async function exportReportCsv(
  caller: AuthenticatedUser,
  input: z.infer<typeof exportReportSchema>
): Promise<ExportReportResult> {
  requireOrganizationScope(caller, input.organizationId);
  requirePermission(caller, "report.export");

  const parsed = exportReportSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message ?? "Invalid report export request");
  }

  const { organizationId, reportType, filters } = parsed.data;
  const now = new Date();
  const timestampIso = now.toISOString();
  const dateStr = timestampIso.slice(0, 10);

  let filename = `report_${reportType}_${dateStr}.csv`;
  const lines: string[] = [];

  // Metadata headers
  lines.push(`# RAYHAN MICROFINANCE REPORT EXPORT`);
  lines.push(`# Report Type: ${reportType.toUpperCase()}`);
  lines.push(`# Organization ID: ${organizationId}`);
  lines.push(`# Generated By: ${caller.fullName} (${caller.username})`);
  lines.push(`# Generated At: ${timestampIso}`);
  lines.push(`# Applied Filters: ${JSON.stringify(filters)}`);
  lines.push("");

  let rowCount = 0;

  switch (reportType) {
    case "portfolio_aging": {
      const aging = await getPortfolioAgingReport(caller, {
        organizationId,
        asOfDate: filters.asOfDate || dateStr,
        branchId: filters.branchId,
        schemeId: filters.schemeId,
      });

      lines.push(
        toCsvRow([
          "Loan Account No",
          "Customer Code",
          "Customer Name",
          "Phone",
          "Scheme",
          "Disbursed (INR)",
          "Outstanding (INR)",
          "Earliest Due Date",
          "Days Past Due",
          "Aging Bucket",
          "Principal Overdue",
          "Interest Overdue",
          "Fee Overdue",
          "Penalty Overdue",
          "Total Overdue (INR)",
          "Follow-up Status",
        ])
      );

      for (const item of aging.overdueLoans) {
        lines.push(
          toCsvRow([
            item.loanAccountNumber,
            item.customerCode,
            item.customerName,
            item.phone,
            item.schemeName,
            item.principalDisbursed,
            item.principalOutstanding,
            item.earliestDueDate,
            item.daysPastDue,
            item.agingBucket,
            item.principalOverdue,
            item.interestOverdue,
            item.feeOverdue,
            item.penaltyOverdue,
            item.totalOverdue,
            item.followUpStatus || "None",
          ])
        );
        rowCount++;
      }
      break;
    }

    case "collections": {
      const startDate = filters.startDate || dateStr;
      const endDate = filters.endDate || dateStr;
      const perf = await getCollectionPerformanceReport(caller, {
        organizationId,
        startDate,
        endDate,
        branchId: filters.branchId,
        groupId: filters.groupId,
        collectorId: filters.collectorId,
      });

      lines.push(
        toCsvRow([
          "Date",
          "Receipts Count",
          "Total Collected (INR)",
        ])
      );

      for (const trend of perf.dailyTrend) {
        lines.push(
          toCsvRow([
            trend.date,
            trend.receiptsCount,
            trend.totalAmount,
          ])
        );
        rowCount++;
      }

      lines.push("");
      lines.push(toCsvRow(["Collector Name", "Receipts Count", "Amount (INR)"]));
      for (const col of perf.collectors) {
        lines.push(toCsvRow([col.fullName, col.receiptsCount, col.totalAmount]));
        rowCount++;
      }
      break;
    }

    case "deposits": {
      const deps = await getDepositMaturitiesReport(caller, {
        organizationId,
        asOfDate: filters.asOfDate || dateStr,
        branchId: filters.branchId,
      });

      lines.push(
        toCsvRow([
          "Account No",
          "Customer Code",
          "Customer Name",
          "Product Type",
          "Product Name",
          "Principal (INR)",
          "Deposit Date",
          "Maturity Date",
          "Projected Payout (INR)",
          "Days Until Maturity",
          "Payout Instruction",
          "Status",
        ])
      );

      for (const item of deps.upcomingMaturities) {
        lines.push(
          toCsvRow([
            item.accountNumber,
            item.customerCode,
            item.customerName,
            item.productType,
            item.productName,
            item.principal,
            item.depositDate,
            item.maturityDate,
            item.projectedMaturityValue,
            item.daysUntilMaturity,
            item.payoutInstruction,
            item.status,
          ])
        );
        rowCount++;
      }
      break;
    }

    case "financial_pnl": {
      const startDate = filters.startDate || `${dateStr.slice(0, 7)}-01`;
      const endDate = filters.endDate || dateStr;
      const fin = await getFinancialStatementsReport(caller, {
        organizationId,
        startDate,
        endDate,
        branchId: filters.branchId,
      });

      lines.push(toCsvRow(["Category", "Account Code", "Account Name", "Amount (INR)"]));
      for (const item of fin.incomeStatement.income) {
        lines.push(toCsvRow(["INCOME", item.code, item.name, item.amount]));
        rowCount++;
      }
      for (const item of fin.incomeStatement.expenses) {
        lines.push(toCsvRow(["EXPENSE", item.code, item.name, item.amount]));
        rowCount++;
      }
      lines.push(
        toCsvRow([
          "SUMMARY",
          "NET_SURPLUS",
          "Net Operating Surplus / (Deficit)",
          fin.incomeStatement.netOperatingSurplus,
        ])
      );
      rowCount++;
      break;
    }

    case "financial_bs": {
      const startDate = filters.startDate || `${dateStr.slice(0, 7)}-01`;
      const endDate = filters.endDate || dateStr;
      const fin = await getFinancialStatementsReport(caller, {
        organizationId,
        startDate,
        endDate,
        branchId: filters.branchId,
      });

      lines.push(toCsvRow(["Classification", "Account Code", "Account Name", "Balance (INR)"]));
      for (const item of fin.balanceSheet.assets) {
        lines.push(toCsvRow(["ASSET", item.code, item.name, item.amount]));
        rowCount++;
      }
      for (const item of fin.balanceSheet.liabilities) {
        lines.push(toCsvRow(["LIABILITY", item.code, item.name, item.amount]));
        rowCount++;
      }
      for (const item of fin.balanceSheet.equity) {
        lines.push(toCsvRow(["EQUITY", item.code, item.name, item.amount]));
        rowCount++;
      }
      break;
    }

    case "expenses": {
      const startDate = filters.startDate || `${dateStr.slice(0, 7)}-01`;
      const endDate = filters.endDate || dateStr;
      const expenses = await prisma.expense.findMany({
        where: {
          organizationId,
          status: "POSTED",
          expenseDate: { gte: startDate, lte: endDate },
        },
        orderBy: { expenseDate: "desc" },
      });

      lines.push(
        toCsvRow([
          "Expense ID",
          "Date",
          "Category",
          "Payee",
          "Payment Method",
          "Amount (INR)",
          "Status",
          "Description",
        ])
      );

      for (const exp of expenses) {
        lines.push(
          toCsvRow([
            exp.id,
            exp.expenseDate,
            exp.category,
            exp.payee,
            exp.paymentMethod,
            toDecimal(exp.amount).toFixed(4),
            exp.status,
            exp.description,
          ])
        );
        rowCount++;
      }
      break;
    }
  }

  // Record audit event
  await recordAuditEvent({
    organizationId,
    actorId: caller.userId,
    action: "report.exported",
    entityType: "Report",
    entityId: reportType,
    metadata: {
      reportType,
      rowCount,
      filters,
      filename,
    },
  });

  return {
    filename,
    csvContent: lines.join("\n"),
    rowCount,
    reportType,
    exportedAt: timestampIso,
  };
}
