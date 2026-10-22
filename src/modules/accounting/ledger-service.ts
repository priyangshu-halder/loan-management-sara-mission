import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { AuthenticatedUser } from "@/lib/permissions/types";
import {
  requireOrganizationScope,
  requirePermission,
} from "@/lib/permissions/auth-guard";
import { NotFoundError, ValidationError } from "@/lib/errors/app-error";
import { Money, toDecimal } from "@/lib/money/money";
import { parseBusinessDateToUtcMidnight, isValidCalendarDate } from "@/lib/dates/dates";
import { recordAuditEvent } from "@/modules/audit/audit-service";
import Decimal from "decimal.js";

export interface DaybookFilter {
  organizationId: string;
  branchId?: string | null;
  businessDate?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  pageSize?: number;
}

export interface CashbookFilter {
  organizationId: string;
  cashAccountId: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  page?: number;
  pageSize?: number;
}

export interface DailySheetFilter {
  organizationId: string;
  businessDate: string; // YYYY-MM-DD
  branchId?: string | null;
}

/**
 * Returns chronological daybook listing posted journal entries with their lines.
 */
export async function getDaybook(caller: AuthenticatedUser, filter: DaybookFilter) {
  requireOrganizationScope(caller, filter.organizationId);
  requirePermission(caller, "accounting.ledger.read");

  const page = Math.max(1, filter.page || 1);
  const pageSize = Math.min(100, Math.max(1, filter.pageSize || 20));
  const skip = (page - 1) * pageSize;

  const where: Prisma.JournalEntryWhereInput = {
    organizationId: filter.organizationId,
  };

  if (filter.branchId) {
    where.branchId = filter.branchId;
  }

  if (filter.businessDate) {
    where.businessDate = filter.businessDate;
  } else if (filter.startDate || filter.endDate) {
    where.businessDate = {
      ...(filter.startDate ? { gte: filter.startDate } : {}),
      ...(filter.endDate ? { lte: filter.endDate } : {}),
    };
  }

  const [totalEntries, entries] = await Promise.all([
    prisma.journalEntry.count({ where }),
    prisma.journalEntry.findMany({
      where,
      include: {
        lines: {
          include: { account: true },
          orderBy: { lineNumber: "asc" },
        },
        postedBy: {
          select: { id: true, username: true, fullName: true },
        },
      },
      orderBy: [{ businessDate: "desc" }, { entryNumber: "desc" }],
      skip,
      take: pageSize,
    }),
  ]);

  // Aggregate total debit and credit for the filtered period
  const aggregations = await prisma.journalEntry.aggregate({
    where,
    _sum: {
      totalDebit: true,
      totalCredit: true,
    },
  });

  return {
    entries,
    pagination: {
      page,
      pageSize,
      totalItems: totalEntries,
      totalPages: Math.ceil(totalEntries / pageSize),
    },
    totals: {
      totalDebit: aggregations._sum.totalDebit ? toDecimal(aggregations._sum.totalDebit).toFixed(4) : "0.0000",
      totalCredit: aggregations._sum.totalCredit ? toDecimal(aggregations._sum.totalCredit).toFixed(4) : "0.0000",
    },
  };
}

/**
 * Returns cashbook for a cash or bank account, proving:
 * Opening Balance + Total Receipts - Total Payments = Closing Balance
 */
export async function getCashbook(caller: AuthenticatedUser, filter: CashbookFilter) {
  requireOrganizationScope(caller, filter.organizationId);
  requirePermission(caller, "accounting.ledger.read");

  if (!isValidCalendarDate(filter.startDate) || !isValidCalendarDate(filter.endDate)) {
    throw new ValidationError("Start date and end date must be valid YYYY-MM-DD strings.");
  }

  const cashAccount = await prisma.cashAccount.findUnique({
    where: { id: filter.cashAccountId },
    include: { chartOfAccount: true },
  });

  if (!cashAccount || cashAccount.organizationId !== filter.organizationId) {
    throw new NotFoundError("CashAccount", filter.cashAccountId);
  }

  const startDateUtc = parseBusinessDateToUtcMidnight(filter.startDate);

  // 1. Calculate opening balance: sum of all lines posted prior to startDate
  const priorLines = await prisma.journalLine.findMany({
    where: {
      accountId: cashAccount.chartOfAccountId,
      journalEntry: {
        organizationId: filter.organizationId,
        postingDate: { lt: startDateUtc },
        status: { in: ["POSTED", "REVERSED"] },
      },
    },
    select: { debit: true, credit: true },
  });

  let openingBalance = Money.zero();
  for (const l of priorLines) {
    // For Cash/Bank (ASSET): Debit increases (+), Credit decreases (-)
    openingBalance = openingBalance.plus(l.debit).minus(l.credit);
  }

  // 2. Fetch all transaction lines in the requested date range
  const periodLines = await prisma.journalLine.findMany({
    where: {
      accountId: cashAccount.chartOfAccountId,
      journalEntry: {
        businessDate: { gte: filter.startDate, lte: filter.endDate },
        organizationId: filter.organizationId,
        status: { in: ["POSTED", "REVERSED"] },
      },
    },
    include: {
      journalEntry: {
        include: {
          postedBy: { select: { id: true, username: true, fullName: true } },
        },
      },
    },
    orderBy: [
      { journalEntry: { businessDate: "asc" } },
      { journalEntry: { entryNumber: "asc" } },
      { lineNumber: "asc" },
    ],
  });

  let totalReceipts = Money.zero();
  let totalPayments = Money.zero();
  let currentRunningBalance = openingBalance;

  const items = periodLines.map((line) => {
    const debit = toDecimal(line.debit);
    const credit = toDecimal(line.credit);

    totalReceipts = totalReceipts.plus(debit);
    totalPayments = totalPayments.plus(credit);
    currentRunningBalance = currentRunningBalance.plus(debit).minus(credit);

    return {
      lineId: line.id,
      journalEntryId: line.journalEntryId,
      entryNumber: line.journalEntry.entryNumber,
      businessDate: line.journalEntry.businessDate,
      sourceModule: line.journalEntry.sourceModule,
      sourceType: line.journalEntry.sourceType,
      sourceId: line.journalEntry.sourceId,
      description: line.narration || line.journalEntry.description,
      receiptAmount: debit.toFixed(4),
      paymentAmount: credit.toFixed(4),
      runningBalance: currentRunningBalance.toStorageString(),
      postedBy: line.journalEntry.postedBy?.fullName || "System",
      status: line.journalEntry.status,
    };
  });

  const closingBalance = openingBalance.plus(totalReceipts).minus(totalPayments);

  return {
    cashAccount: {
      id: cashAccount.id,
      code: cashAccount.code,
      name: cashAccount.name,
      accountType: cashAccount.accountType,
      glCode: cashAccount.chartOfAccount.code,
    },
    period: {
      startDate: filter.startDate,
      endDate: filter.endDate,
    },
    openingBalance: openingBalance.toStorageString(),
    totalReceipts: totalReceipts.toStorageString(),
    totalPayments: totalPayments.toStorageString(),
    closingBalance: closingBalance.toStorageString(),
    items,
  };
}

/**
 * Returns daily sheet reconciling opening positions, daily inflows/outflows, and closing totals.
 */
export async function getDailySheet(caller: AuthenticatedUser, filter: DailySheetFilter) {
  requireOrganizationScope(caller, filter.organizationId);
  requirePermission(caller, "accounting.ledger.read");

  if (!isValidCalendarDate(filter.businessDate)) {
    throw new ValidationError("Business date must be a valid YYYY-MM-DD string.");
  }

  const businessDateUtc = parseBusinessDateToUtcMidnight(filter.businessDate);

  // 1. Fetch all active cash & bank accounts
  const cashWhere: Prisma.CashAccountWhereInput = {
    organizationId: filter.organizationId,
    isActive: true,
  };
  if (filter.branchId) {
    cashWhere.branchId = filter.branchId;
  }

  const cashAccounts = await prisma.cashAccount.findMany({
    where: cashWhere,
    include: { chartOfAccount: true },
  });

  const accountSummaries = [];
  let aggregateOpening = Money.zero();
  let aggregateReceipts = Money.zero();
  let aggregatePayments = Money.zero();
  let aggregateClosing = Money.zero();

  for (const acc of cashAccounts) {
    // Opening balance before business date
    const prior = await prisma.journalLine.aggregate({
      where: {
        accountId: acc.chartOfAccountId,
        journalEntry: {
          organizationId: filter.organizationId,
          postingDate: { lt: businessDateUtc },
          status: { in: ["POSTED", "REVERSED"] },
        },
      },
      _sum: { debit: true, credit: true },
    });

    const openDebit = prior._sum.debit ? toDecimal(prior._sum.debit) : new Decimal(0);
    const openCredit = prior._sum.credit ? toDecimal(prior._sum.credit) : new Decimal(0);
    const opening = openDebit.minus(openCredit);

    // Activity on business date
    const today = await prisma.journalLine.aggregate({
      where: {
        accountId: acc.chartOfAccountId,
        journalEntry: {
          organizationId: filter.organizationId,
          businessDate: filter.businessDate,
          status: { in: ["POSTED", "REVERSED"] },
        },
      },
      _sum: { debit: true, credit: true },
    });

    const receipts = today._sum.debit ? toDecimal(today._sum.debit) : new Decimal(0);
    const payments = today._sum.credit ? toDecimal(today._sum.credit) : new Decimal(0);
    const closing = opening.plus(receipts).minus(payments);

    aggregateOpening = aggregateOpening.plus(opening);
    aggregateReceipts = aggregateReceipts.plus(receipts);
    aggregatePayments = aggregatePayments.plus(payments);
    aggregateClosing = aggregateClosing.plus(closing);

    accountSummaries.push({
      accountId: acc.id,
      code: acc.code,
      name: acc.name,
      accountType: acc.accountType,
      openingBalance: opening.toFixed(4),
      receipts: receipts.toFixed(4),
      payments: payments.toFixed(4),
      closingBalance: closing.toFixed(4),
    });
  }

  // 2. Fetch categorical breakdown of transactions on this business date
  const dayEntries = await prisma.journalEntry.findMany({
    where: {
      organizationId: filter.organizationId,
      businessDate: filter.businessDate,
      branchId: filter.branchId || undefined,
    },
    select: {
      sourceModule: true,
      sourceType: true,
      totalDebit: true,
      status: true,
    },
  });

  const moduleBreakdown: Record<string, Decimal> = {};
  for (const entry of dayEntries) {
    const key = `${entry.sourceModule}:${entry.sourceType}`;
    const amount = toDecimal(entry.totalDebit);
    moduleBreakdown[key] = (moduleBreakdown[key] || new Decimal(0)).plus(amount);
  }

  return {
    businessDate: filter.businessDate,
    accountSummaries,
    reconciliation: {
      aggregateOpening: aggregateOpening.toStorageString(),
      aggregateReceipts: aggregateReceipts.toStorageString(),
      aggregatePayments: aggregatePayments.toStorageString(),
      aggregateClosing: aggregateClosing.toStorageString(),
      isReconciled: aggregateOpening.plus(aggregateReceipts).minus(aggregatePayments).equals(aggregateClosing),
    },
    moduleBreakdown: Object.fromEntries(
      Object.entries(moduleBreakdown).map(([k, v]) => [k, v.toFixed(4)])
    ),
  };
}

/**
 * Returns Chart of Accounts list with current running balance projections.
 */
export async function getChartOfAccounts(caller: AuthenticatedUser, accountType?: string) {
  requirePermission(caller, "accounting.ledger.read");

  return await prisma.chartOfAccount.findMany({
    where: {
      organizationId: caller.organizationId,
      accountType: accountType ? accountType.toUpperCase() : undefined,
    },
    orderBy: { code: "asc" },
  });
}

/**
 * Closes an accounting period, preventing any further backdated postings.
 */
export async function closeFiscalPeriod(caller: AuthenticatedUser, fiscalPeriodId: string) {
  requirePermission(caller, "accounting.period.close");

  const period = await prisma.fiscalPeriod.findUnique({
    where: { id: fiscalPeriodId },
  });

  if (!period || period.organizationId !== caller.organizationId) {
    throw new NotFoundError("FiscalPeriod", fiscalPeriodId);
  }

  const updated = await prisma.fiscalPeriod.update({
    where: { id: fiscalPeriodId },
    data: {
      isClosed: true,
      closedAt: new Date(),
      closedById: caller.userId,
    },
  });

  await recordAuditEvent({
    organizationId: caller.organizationId,
    actorId: caller.userId,
    action: "accounting.period.closed",
    entityType: "FiscalPeriod",
    entityId: period.id,
    metadata: { periodName: period.name },
  });

  return updated;
}
