import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { AuthenticatedUser } from "@/lib/permissions/types";
import {
  requireOrganizationScope,
  requirePermission,
} from "@/lib/permissions/auth-guard";
import { NotFoundError, ValidationError } from "@/lib/errors/app-error";
import { Money, toDecimal } from "@/lib/money/money";
import { isValidCalendarDate, getTodayBusinessDate } from "@/lib/dates/dates";
import { recordAuditEvent } from "@/modules/audit/audit-service";
import { postJournalEntry, JournalLineInput } from "./posting-service";
import Decimal from "decimal.js";

export interface DaybookFilter {
  organizationId: string;
  branchId?: string | null;
  businessDate?: string;
  startDate?: string;
  endDate?: string;
  voucherNumber?: string;
  sourceModule?: string;
  sourceType?: string;
  search?: string;
  customerOrMember?: string;
  accountId?: string;
  status?: string;
  page?: number;
  pageSize?: number;
  sortOrder?: "asc" | "desc";
}

export interface DaybookVoucherLine {
  id: string;
  lineNumber: number;
  accountId: string;
  accountCode: string;
  accountName: string;
  accountType: string;
  debit: string;
  credit: string;
  narration?: string | null;
}

export interface DaybookVoucher {
  id: string;
  entryNumber: string;
  businessDate: string;
  postingDate: string;
  createdAt: string;
  sourceModule: string;
  sourceType: string;
  sourceId: string | null;
  reference: string;
  description: string;
  totalDebit: string;
  totalCredit: string;
  status: string;
  reversalOfId?: string | null;
  reversalReason?: string | null;
  reversalOfEntryNumber?: string | null;
  reversedByEntryNumber?: string | null;
  postedBy?: {
    id: string;
    username: string;
    fullName: string;
  } | null;
  lines: DaybookVoucherLine[];
  debitLines: DaybookVoucherLine[];
  creditLines: DaybookVoucherLine[];
}

export interface DaybookDateGroup {
  date: string;
  voucherCount: number;
  totalDebit: string;
  totalCredit: string;
  isReconciled: boolean;
  vouchers: DaybookVoucher[];
}

export interface CashbookFilter {
  organizationId: string;
  cashAccountId: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  page?: number;
  pageSize?: number;
}

export interface CashbookDailyRecord {
  date: string;
  opening: string;
  advance: string;
  repayment: string;
  rd: string;
  fd: string;
  bankTransferReceived: string;
  loanReceived: string;
  miscellaneousReceived: string;
  totalReceived: string;
  savingsWithdrawal: string;
  bankTransferPayment: string;
  loanPayment: string;
  expenses: string;
  miscellaneousPayment: string;
  totalPayment: string;
  cashInHand: string;
  isNegative: boolean;
  hasTransactions: boolean;
}

export interface CashbookSummaryRow {
  opening: string;
  advance: string;
  repayment: string;
  rd: string;
  fd: string;
  bankTransferReceived: string;
  loanReceived: string;
  miscellaneousReceived: string;
  totalReceived: string;
  savingsWithdrawal: string;
  bankTransferPayment: string;
  loanPayment: string;
  expenses: string;
  miscellaneousPayment: string;
  totalPayment: string;
  cashInHand: string;
  isNegative: boolean;
}

export interface DailySheetFilter {
  organizationId: string;
  businessDate: string; // YYYY-MM-DD
  branchId?: string | null;
  cashAccountId?: string;
}

export interface DailySheetCategoryItem {
  key: string;
  label: string;
  amount: string;
  count?: number;
}

export interface DailySheetReceivedSection {
  opening: string;
  advance: string;
  repayment: string;
  rd: string;
  fd: string;
  bankTransfer: string;
  loan: string;
  miscellaneous: string;
  totalReceived: string; // Excludes opening
  categories: DailySheetCategoryItem[];
}

export interface DailySheetPaymentSection {
  savingsWithdrawal: string;
  bankTransfer: string;
  loanPayment: string;
  expenses: string;
  miscellaneous: string;
  totalPayment: string;
  categories: DailySheetCategoryItem[];
}

export interface DailyCashSummary {
  openingCash: string;
  totalReceived: string; // Excludes opening
  totalPayment: string;
  closingCash: string; // Cash in Hand
  formulaText: string;
  isNegative: boolean;
  discrepancyMessage?: string | null;
}

export interface DailySheetRecordStatus {
  isFinalized: boolean;
  isInitial: boolean;
  finalizedAt?: string | null;
  finalizedBy?: string | null;
  previousDayStatus: "FINALIZED" | "UNFINALIZED" | "INITIAL_DAY" | "NO_PREVIOUS_RECORD";
  previousDayDate?: string | null;
  hasBackdatedDiscrepancy: boolean;
  discrepancyVariance?: string | null;
}

export interface FinalizeDailySheetCommand {
  organizationId: string;
  cashAccountId: string;
  businessDate: string;
  notes?: string;
}

export interface SetInitialOpeningBalanceCommand {
  organizationId: string;
  cashAccountId: string;
  businessDate: string;
  openingBalance: string | number;
  notes?: string;
}

export interface InternalTransferCommand {
  organizationId: string;
  fromCashAccountId: string;
  toCashAccountId: string;
  amount: string | number;
  businessDate: string;
  description?: string;
  idempotencyKey?: string;
}

/**
 * Returns chronological Daybook as a complete daily transaction register.
 * Displays all accounting transactions organised date-wise with complete double-entry lines.
 */
export async function getDaybook(caller: AuthenticatedUser, filter: DaybookFilter) {
  requireOrganizationScope(caller, filter.organizationId);
  requirePermission(caller, "accounting.ledger.read");

  const page = Math.max(1, filter.page || 1);
  const pageSize = Math.min(500, Math.max(1, filter.pageSize || 100));
  const skip = (page - 1) * pageSize;
  const sortDirection = filter.sortOrder === "desc" ? "desc" : "asc";

  const where: Prisma.JournalEntryWhereInput = {
    organizationId: filter.organizationId,
  };

  if (filter.branchId) {
    where.branchId = filter.branchId;
  }

  // Business Date / Range filter
  if (filter.businessDate) {
    where.businessDate = filter.businessDate;
  } else if (filter.startDate || filter.endDate) {
    where.businessDate = {
      ...(filter.startDate ? { gte: filter.startDate } : {}),
      ...(filter.endDate ? { lte: filter.endDate } : {}),
    };
  }

  // Voucher Number filter
  if (filter.voucherNumber && filter.voucherNumber.trim() !== "") {
    where.entryNumber = { contains: filter.voucherNumber.trim() };
  }

  // Source Module filter
  if (filter.sourceModule && filter.sourceModule !== "ALL" && filter.sourceModule.trim() !== "") {
    where.sourceModule = filter.sourceModule.trim();
  }

  // Source Type filter
  if (filter.sourceType && filter.sourceType !== "ALL" && filter.sourceType.trim() !== "") {
    where.sourceType = filter.sourceType.trim();
  }

  // Status filter (defaults to posted and reversed)
  if (filter.status && filter.status !== "ALL" && filter.status.trim() !== "") {
    where.status = filter.status.trim();
  } else {
    where.status = { in: ["POSTED", "REVERSED"] };
  }

  // Account / GL filter
  if (filter.accountId && filter.accountId !== "ALL" && filter.accountId.trim() !== "") {
    where.lines = {
      some: {
        accountId: filter.accountId.trim(),
      },
    };
  }

  // Customer / Member / Reference / Description search filter
  const searchTerm = (filter.search || filter.customerOrMember || "").trim();
  if (searchTerm) {
    where.OR = [
      { entryNumber: { contains: searchTerm } },
      { description: { contains: searchTerm } },
      { sourceId: { contains: searchTerm } },
      { lines: { some: { narration: { contains: searchTerm } } } },
    ];
  }

  const [totalEntries, rawEntries] = await Promise.all([
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
        reversalOf: {
          select: { id: true, entryNumber: true, businessDate: true, reversalReason: true },
        },
        reversedBy: {
          select: { id: true, entryNumber: true, businessDate: true, reversalReason: true },
        },
      },
      orderBy: [
        { businessDate: sortDirection },
        { entryNumber: sortDirection },
      ],
      skip,
      take: pageSize,
    }),
  ]);

  // Map into structured vouchers
  const vouchers: DaybookVoucher[] = rawEntries.map((e) => {
    const lines: DaybookVoucherLine[] = e.lines.map((l) => ({
      id: l.id,
      lineNumber: l.lineNumber,
      accountId: l.accountId,
      accountCode: l.account.code,
      accountName: l.account.name,
      accountType: l.account.accountType,
      debit: toDecimal(l.debit).toFixed(2),
      credit: toDecimal(l.credit).toFixed(2),
      narration: l.narration,
    }));

    const debitLines = lines.filter((l) => parseFloat(l.debit) > 0);
    const creditLines = lines.filter((l) => parseFloat(l.credit) > 0);

    return {
      id: e.id,
      entryNumber: e.entryNumber,
      businessDate: e.businessDate,
      postingDate: e.postingDate.toISOString(),
      createdAt: e.createdAt.toISOString(),
      sourceModule: e.sourceModule,
      sourceType: e.sourceType,
      sourceId: e.sourceId,
      reference: e.sourceId || e.entryNumber,
      description: e.description,
      totalDebit: toDecimal(e.totalDebit).toFixed(2),
      totalCredit: toDecimal(e.totalCredit).toFixed(2),
      status: e.status,
      reversalOfId: e.reversalOfId,
      reversalReason: e.reversalReason || e.reversedBy?.reversalReason || null,
      reversalOfEntryNumber: (e.sourceType === "REVERSAL" ? e.reversedBy?.entryNumber : null) || e.reversalOf?.entryNumber || null,
      reversedByEntryNumber: (e.status === "REVERSED" ? e.reversalOf?.entryNumber : null) || e.reversedBy?.entryNumber || null,
      postedBy: e.postedBy
        ? {
            id: e.postedBy.id,
            username: e.postedBy.username,
            fullName: e.postedBy.fullName,
          }
        : null,
      lines,
      debitLines,
      creditLines,
    };
  });

  // Group by businessDate (only including dates where transactions exist)
  const groupsByDate = new Map<string, DaybookVoucher[]>();
  for (const v of vouchers) {
    const list = groupsByDate.get(v.businessDate) || [];
    list.push(v);
    groupsByDate.set(v.businessDate, list);
  }

  const dateGroups: DaybookDateGroup[] = [];
  for (const [date, list] of Array.from(groupsByDate.entries())) {
    let dayDebit = new Decimal(0);
    let dayCredit = new Decimal(0);
    for (const v of list) {
      dayDebit = dayDebit.plus(v.totalDebit);
      dayCredit = dayCredit.plus(v.totalCredit);
    }

    dateGroups.push({
      date,
      voucherCount: list.length,
      totalDebit: dayDebit.toFixed(2),
      totalCredit: dayCredit.toFixed(2),
      isReconciled: dayDebit.equals(dayCredit),
      vouchers: list,
    });
  }

  // Aggregate total debit and credit across the entire query
  const aggregations = await prisma.journalEntry.aggregate({
    where,
    _sum: {
      totalDebit: true,
      totalCredit: true,
    },
  });

  const overallDebit = aggregations._sum.totalDebit ? toDecimal(aggregations._sum.totalDebit) : new Decimal(0);
  const overallCredit = aggregations._sum.totalCredit ? toDecimal(aggregations._sum.totalCredit) : new Decimal(0);

  return {
    entries: rawEntries,
    pagination: {
      page,
      pageSize,
      totalItems: totalEntries,
      totalPages: Math.ceil(totalEntries / pageSize),
    },
    totals: {
      totalDebit: overallDebit.toFixed(4),
      totalCredit: overallCredit.toFixed(4),
      totalVouchers: totalEntries,
      isReconciled: overallDebit.equals(overallCredit),
    },
    dateGroups,
  };
}

/**
 * Generates all calendar dates (YYYY-MM-DD) between startDate and endDate inclusive,
 * in strict chronological order using UTC date increments.
 */
export function generateDateRange(startDate: string, endDate: string): string[] {
  if (!isValidCalendarDate(startDate) || !isValidCalendarDate(endDate)) {
    throw new ValidationError("Start date and end date must be valid YYYY-MM-DD strings.");
  }
  if (startDate > endDate) {
    throw new ValidationError("Start date cannot be after end date.");
  }
  const dates: string[] = [];
  const [sy, sm, sd] = startDate.split("-").map(Number);
  const [ey, em, ed] = endDate.split("-").map(Number);
  const current = new Date(Date.UTC(sy, sm - 1, sd));
  const end = new Date(Date.UTC(ey, em - 1, ed));

  while (current <= end) {
    const y = current.getUTCFullYear();
    const m = String(current.getUTCMonth() + 1).padStart(2, "0");
    const d = String(current.getUTCDate()).padStart(2, "0");
    dates.push(`${y}-${m}-${d}`);
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return dates;
}

/**
 * Returns the earliest available business date recorded in the system for this organization / cash account.
 * Defaults to today's business date if no records exist yet.
 */
export async function getEarliestCashbookDate(
  caller: AuthenticatedUser,
  organizationId: string,
  cashAccountId?: string
): Promise<string> {
  requireOrganizationScope(caller, organizationId);
  requirePermission(caller, "accounting.ledger.read");

  let chartOfAccountId: string | undefined;
  if (cashAccountId) {
    const ca = await prisma.cashAccount.findUnique({
      where: { id: cashAccountId },
      select: { chartOfAccountId: true },
    });
    chartOfAccountId = ca?.chartOfAccountId;
  }

  const [earliestRecord, earliestEntry] = await Promise.all([
    prisma.dailyCashRecord.findFirst({
      where: {
        organizationId,
        ...(cashAccountId ? { cashAccountId } : {}),
      },
      orderBy: { businessDate: "asc" },
      select: { businessDate: true },
    }),
    prisma.journalEntry.findFirst({
      where: {
        organizationId,
        status: { in: ["POSTED", "REVERSED"] },
        ...(chartOfAccountId ? { lines: { some: { accountId: chartOfAccountId } } } : {}),
      },
      orderBy: { businessDate: "asc" },
      select: { businessDate: true },
    }),
  ]);

  const candidates: string[] = [];
  if (earliestRecord?.businessDate) candidates.push(earliestRecord.businessDate);
  if (earliestEntry?.businessDate) candidates.push(earliestEntry.businessDate);

  if (candidates.length === 0) {
    return getTodayBusinessDate();
  }

  candidates.sort();
  return candidates[0];
}

/**
 * Calculates continuous opening balance for a cash/bank account as of a given business date.
 * Prioritizes DailyCashRecord snapshots when present, falling back to cumulative journal lines.
 */
export async function calculateOpeningBalanceAsOfDate(
  organizationId: string,
  cashAccountId: string,
  chartOfAccountId: string,
  businessDate: string
): Promise<{
  openingBalance: Decimal;
  isFinalized: boolean;
  isInitial: boolean;
  finalizedAt: string | null;
  finalizedBy: string | null;
  previousDayStatus: "FINALIZED" | "UNFINALIZED" | "INITIAL_DAY" | "NO_PREVIOUS_RECORD";
  previousDayDate: string | null;
}> {
  // 1. Check if today has a snapshot record
  const todayRecord = await prisma.dailyCashRecord.findUnique({
    where: {
      organizationId_cashAccountId_businessDate: {
        organizationId,
        cashAccountId,
        businessDate,
      },
    },
    include: {
      finalizedBy: { select: { fullName: true, username: true } },
    },
  });

  if (todayRecord) {
    return {
      openingBalance: new Decimal(todayRecord.openingBalance),
      isFinalized: todayRecord.isFinalized,
      isInitial: todayRecord.isInitial,
      finalizedAt: todayRecord.finalizedAt?.toISOString() || null,
      finalizedBy: todayRecord.finalizedBy?.fullName || todayRecord.finalizedBy?.username || null,
      previousDayStatus: "FINALIZED",
      previousDayDate: null,
    };
  }

  // 2. Find most recent previous record for carry-forward
  const previousRecord = await prisma.dailyCashRecord.findFirst({
    where: {
      organizationId,
      cashAccountId,
      businessDate: { lt: businessDate },
    },
    orderBy: { businessDate: "desc" },
  });

  if (previousRecord) {
    let opening = new Decimal(previousRecord.closingBalance);
    const previousDayStatus = previousRecord.isFinalized ? "FINALIZED" : "UNFINALIZED";
    const previousDayDate = previousRecord.businessDate;

    // Account for any intermediate transactions posted between previousRecord.businessDate and businessDate
    const intermediateLines = await prisma.journalLine.aggregate({
      where: {
        accountId: chartOfAccountId,
        journalEntry: {
          organizationId,
          businessDate: {
            gt: previousRecord.businessDate,
            lt: businessDate,
          },
          status: { in: ["POSTED", "REVERSED"] },
        },
      },
      _sum: { debit: true, credit: true },
    });
    const intDebit = intermediateLines._sum.debit ? toDecimal(intermediateLines._sum.debit) : new Decimal(0);
    const intCredit = intermediateLines._sum.credit ? toDecimal(intermediateLines._sum.credit) : new Decimal(0);
    opening = opening.plus(intDebit).minus(intCredit);

    return {
      openingBalance: opening,
      isFinalized: false,
      isInitial: false,
      finalizedAt: null,
      finalizedBy: null,
      previousDayStatus,
      previousDayDate,
    };
  }

  // 3. No snapshot record: compute cumulative running balance prior to this date
  const priorLines = await prisma.journalLine.aggregate({
    where: {
      accountId: chartOfAccountId,
      journalEntry: {
        organizationId,
        businessDate: { lt: businessDate },
        status: { in: ["POSTED", "REVERSED"] },
      },
    },
    _sum: { debit: true, credit: true },
  });
  const openDebit = priorLines._sum.debit ? toDecimal(priorLines._sum.debit) : new Decimal(0);
  const openCredit = priorLines._sum.credit ? toDecimal(priorLines._sum.credit) : new Decimal(0);
  const opening = openDebit.minus(openCredit);

  return {
    openingBalance: opening,
    isFinalized: false,
    isInitial: false,
    finalizedAt: null,
    finalizedBy: null,
    previousDayStatus: "NO_PREVIOUS_RECORD",
    previousDayDate: null,
  };
}

export interface ClassifiedEntriesResult {
  advance: Decimal;
  repayment: Decimal;
  rd: Decimal;
  fd: Decimal;
  bankTransferReceived: Decimal;
  loanReceived: Decimal;
  miscReceived: Decimal;
  totalReceived: Decimal;
  savingsWithdrawal: Decimal;
  bankTransferPayment: Decimal;
  loanPayment: Decimal;
  expenses: Decimal;
  miscPayment: Decimal;
  totalPayment: Decimal;
  hasTransactions: boolean;
  transactions?: Array<{
    journalEntryId: string;
    entryNumber: string;
    businessDate: string;
    sourceModule: string;
    sourceType: string;
    category: string;
    type: "RECEIVED" | "PAYMENT";
    amount: string;
    description: string;
    postedBy: string;
  }>;
}

/**
 * Classifies journal entries for a given cash account into the 7 Received categories and 5 Payment categories.
 * Guarantees exact parity between Cashbook and DailySheet.
 */
export function classifyEntriesForAccount(
  entries: Array<
    Prisma.JournalEntryGetPayload<{
      include: {
        lines: { include: { account: true } };
        postedBy: { select: { id: true; username: true; fullName: true } };
      };
    }>
  >,
  cashChartOfAccountId: string,
  allCashChartOfAccountIds: Set<string>,
  collectTransactions = false
): ClassifiedEntriesResult {
  let advance = new Decimal(0);
  let repayment = new Decimal(0);
  let rd = new Decimal(0);
  let fd = new Decimal(0);
  let bankTransferReceived = new Decimal(0);
  let loanReceived = new Decimal(0);
  let miscReceived = new Decimal(0);

  let savingsWithdrawal = new Decimal(0);
  let bankTransferPayment = new Decimal(0);
  let loanPayment = new Decimal(0);
  let expenses = new Decimal(0);
  let miscPayment = new Decimal(0);

  let hasTransactions = false;
  const transactionsList: Array<{
    journalEntryId: string;
    entryNumber: string;
    businessDate: string;
    sourceModule: string;
    sourceType: string;
    category: string;
    type: "RECEIVED" | "PAYMENT";
    amount: string;
    description: string;
    postedBy: string;
  }> = [];

  const reversalEntries = entries.filter((e) => e.sourceType === "REVERSAL" && e.sourceId);
  const reversedSourceIds = new Set(reversalEntries.map((e) => e.sourceId));

  for (const entry of entries) {
    if (reversedSourceIds.has(entry.id) && entry.status === "REVERSED") {
      continue;
    }
    if (entry.sourceType === "REVERSAL" && entry.sourceId) {
      const originalToday = entries.find((e) => e.id === entry.sourceId);
      if (originalToday) {
        continue;
      }
    }

    const cashLines = entry.lines.filter((l) => l.accountId === cashChartOfAccountId);
    const otherLines = entry.lines.filter((l) => l.accountId !== cashChartOfAccountId);

    for (const cLine of cashLines) {
      const debitAmt = toDecimal(cLine.debit);
      const creditAmt = toDecimal(cLine.credit);

      if (debitAmt.gt(0)) {
        hasTransactions = true;
        const totalOtherCredit = otherLines.reduce((sum, l) => sum.plus(toDecimal(l.credit)), new Decimal(0));

        if (totalOtherCredit.isZero() || otherLines.length === 0) {
          miscReceived = miscReceived.plus(debitAmt);
          if (collectTransactions) {
            transactionsList.push({
              journalEntryId: entry.id,
              entryNumber: entry.entryNumber,
              businessDate: entry.businessDate,
              sourceModule: entry.sourceModule,
              sourceType: entry.sourceType,
              category: "Miscellaneous",
              type: "RECEIVED",
              amount: debitAmt.toFixed(4),
              description: entry.description,
              postedBy: entry.postedBy?.fullName || "System",
            });
          }
        } else {
          for (const oLine of otherLines) {
            const oCredit = toDecimal(oLine.credit);
            if (oCredit.lte(0)) continue;

            const proportion = totalOtherCredit.gt(0) ? oCredit.div(totalOtherCredit) : new Decimal(1);
            const lineAmt = debitAmt.mul(proportion);

            let cat = "Miscellaneous";
            if (
              oLine.account.code === "2004" ||
              oLine.narration?.toLowerCase().includes("advance") ||
              entry.description?.toLowerCase().includes("advance")
            ) {
              advance = advance.plus(lineAmt);
              cat = "Advance";
            } else if (
              entry.sourceModule === "COLLECTIONS" ||
              ["1201", "1202", "1203", "1204", "4001", "4002", "4003"].includes(oLine.account.code)
            ) {
              repayment = repayment.plus(lineAmt);
              cat = "Repayment";
            } else if (
              oLine.account.code === "2002" ||
              (entry.sourceModule === "TERM_DEPOSITS" &&
                (entry.sourceType === "RD_OPENING" || entry.sourceType === "RD_INSTALLMENT"))
            ) {
              rd = rd.plus(lineAmt);
              cat = "RD";
            } else if (
              oLine.account.code === "2003" ||
              (entry.sourceModule === "TERM_DEPOSITS" && entry.sourceType === "FD_OPENING")
            ) {
              fd = fd.plus(lineAmt);
              cat = "FD";
            } else if (
              allCashChartOfAccountIds.has(oLine.accountId) ||
              entry.sourceType === "BANK_TRANSFER" ||
              entry.sourceType === "INTERNAL_TRANSFER"
            ) {
              bankTransferReceived = bankTransferReceived.plus(lineAmt);
              cat = "Bank Transfer";
            } else if (
              entry.sourceModule === "LOANS" ||
              entry.sourceType === "LOAN_CLOSURE"
            ) {
              loanReceived = loanReceived.plus(lineAmt);
              cat = "Loan";
            } else {
              miscReceived = miscReceived.plus(lineAmt);
              cat = "Miscellaneous";
            }

            if (collectTransactions) {
              transactionsList.push({
                journalEntryId: entry.id,
                entryNumber: entry.entryNumber,
                businessDate: entry.businessDate,
                sourceModule: entry.sourceModule,
                sourceType: entry.sourceType,
                category: cat,
                type: "RECEIVED",
                amount: lineAmt.toFixed(4),
                description: oLine.narration || entry.description,
                postedBy: entry.postedBy?.fullName || "System",
              });
            }
          }
        }
      }

      if (creditAmt.gt(0)) {
        hasTransactions = true;
        const totalOtherDebit = otherLines.reduce((sum, l) => sum.plus(toDecimal(l.debit)), new Decimal(0));

        if (totalOtherDebit.isZero() || otherLines.length === 0) {
          miscPayment = miscPayment.plus(creditAmt);
          if (collectTransactions) {
            transactionsList.push({
              journalEntryId: entry.id,
              entryNumber: entry.entryNumber,
              businessDate: entry.businessDate,
              sourceModule: entry.sourceModule,
              sourceType: entry.sourceType,
              category: "Miscellaneous",
              type: "PAYMENT",
              amount: creditAmt.toFixed(4),
              description: entry.description,
              postedBy: entry.postedBy?.fullName || "System",
            });
          }
        } else {
          for (const oLine of otherLines) {
            const oDebit = toDecimal(oLine.debit);
            if (oDebit.lte(0)) continue;

            const proportion = totalOtherDebit.gt(0) ? oDebit.div(totalOtherDebit) : new Decimal(1);
            const lineAmt = creditAmt.mul(proportion);

            let cat = "Miscellaneous";
            if (
              oLine.account.code === "2001" ||
              (entry.sourceModule === "SAVINGS" && entry.sourceType === "SAVINGS_WITHDRAWAL")
            ) {
              savingsWithdrawal = savingsWithdrawal.plus(lineAmt);
              cat = "Savings Withdrawal";
            } else if (
              allCashChartOfAccountIds.has(oLine.accountId) ||
              entry.sourceType === "BANK_TRANSFER" ||
              entry.sourceType === "INTERNAL_TRANSFER"
            ) {
              bankTransferPayment = bankTransferPayment.plus(lineAmt);
              cat = "Bank Transfer";
            } else if (
              entry.sourceModule === "LOANS" ||
              entry.sourceType === "LOAN_DISBURSEMENT" ||
              entry.sourceType === "DISBURSEMENT" ||
              oLine.account.code === "1201"
            ) {
              loanPayment = loanPayment.plus(lineAmt);
              cat = "Loan Payment";
            } else if (
              entry.sourceModule === "EXPENSES" ||
              oLine.account.accountType === "EXPENSE" ||
              oLine.account.code.startsWith("5")
            ) {
              expenses = expenses.plus(lineAmt);
              cat = "Expenses";
            } else {
              miscPayment = miscPayment.plus(lineAmt);
              cat = "Miscellaneous";
            }

            if (collectTransactions) {
              transactionsList.push({
                journalEntryId: entry.id,
                entryNumber: entry.entryNumber,
                businessDate: entry.businessDate,
                sourceModule: entry.sourceModule,
                sourceType: entry.sourceType,
                category: cat,
                type: "PAYMENT",
                amount: lineAmt.toFixed(4),
                description: oLine.narration || entry.description,
                postedBy: entry.postedBy?.fullName || "System",
              });
            }
          }
        }
      }
    }
  }

  const totalReceived = advance
    .plus(repayment)
    .plus(rd)
    .plus(fd)
    .plus(bankTransferReceived)
    .plus(loanReceived)
    .plus(miscReceived);

  const totalPayment = savingsWithdrawal
    .plus(bankTransferPayment)
    .plus(loanPayment)
    .plus(expenses)
    .plus(miscPayment);

  return {
    advance,
    repayment,
    rd,
    fd,
    bankTransferReceived,
    loanReceived,
    miscReceived,
    totalReceived,
    savingsWithdrawal,
    bankTransferPayment,
    loanPayment,
    expenses,
    miscPayment,
    totalPayment,
    hasTransactions,
    transactions: collectTransactions ? transactionsList : undefined,
  };
}

/**
 * Returns date-wise Cashbook table with continuous daily carry-forward and 17 columns in exact order:
 * Date | Opening | Advance | Repayment | RD | FD | Bank Transfer (Rec) | Loan | Misc (Rec) | Total Received
 * | Savings Withdrawal | Bank Transfer (Pay) | Loan Payment | Expenses | Misc (Pay) | Total Payment | Cash in Hand
 *
 * Invariants:
 * 1. Total Received = Advance + Repayment + RD + FD + Bank Transfer Rec + Loan + Misc Rec (excluding Opening).
 * 2. Total Payment = Savings Withdrawal + Bank Transfer Pay + Loan Payment + Expenses + Misc Pay.
 * 3. Cash in Hand = Opening + Total Received - Total Payment.
 * 4. Next day's Opening = Previous day's Cash in Hand.
 * 5. Every business date within selected range is included (dates with no transactions show 0.00 / —).
 * 6. Summary row aggregates category sums, initial opening, and final cash in hand (does NOT sum daily openings/closings).
 */
export async function getCashbook(caller: AuthenticatedUser, filter: CashbookFilter) {
  requireOrganizationScope(caller, filter.organizationId);
  requirePermission(caller, "accounting.ledger.read");

  if (!isValidCalendarDate(filter.startDate) || !isValidCalendarDate(filter.endDate)) {
    throw new ValidationError("Start date and end date must be valid YYYY-MM-DD strings.");
  }

  if (filter.startDate > filter.endDate) {
    throw new ValidationError("Start date cannot be after end date.");
  }

  const cashAccount = await prisma.cashAccount.findUnique({
    where: { id: filter.cashAccountId },
    include: { chartOfAccount: true },
  });

  if (!cashAccount || cashAccount.organizationId !== filter.organizationId) {
    throw new NotFoundError("CashAccount", filter.cashAccountId);
  }

  // 1. Calculate opening balance as of startDate
  const openingInfo = await calculateOpeningBalanceAsOfDate(
    filter.organizationId,
    cashAccount.id,
    cashAccount.chartOfAccountId,
    filter.startDate
  );
  const initialOpening = openingInfo.openingBalance;

  // 2. Fetch all org cash accounts to correctly detect internal transfers
  const orgCashAccounts = await prisma.cashAccount.findMany({
    where: { organizationId: filter.organizationId, isActive: true },
    select: { chartOfAccountId: true },
  });
  const allCashChartOfAccountIds = new Set(orgCashAccounts.map((c) => c.chartOfAccountId));

  // 3. Fetch all transaction entries in the requested date range
  const periodEntries = await prisma.journalEntry.findMany({
    where: {
      organizationId: filter.organizationId,
      businessDate: { gte: filter.startDate, lte: filter.endDate },
      status: { in: ["POSTED", "REVERSED"] },
      lines: {
        some: {
          accountId: cashAccount.chartOfAccountId,
        },
      },
    },
    include: {
      lines: {
        include: { account: true },
        orderBy: { lineNumber: "asc" },
      },
      postedBy: {
        select: { id: true, username: true, fullName: true },
      },
    },
    orderBy: [
      { businessDate: "asc" },
      { entryNumber: "asc" },
    ],
  });

  const entriesByDate = new Map<string, typeof periodEntries>();
  for (const entry of periodEntries) {
    const list = entriesByDate.get(entry.businessDate) || [];
    list.push(entry);
    entriesByDate.set(entry.businessDate, list);
  }

  // 4. Generate all continuous dates in range (chronological ascending order)
  const dateList = generateDateRange(filter.startDate, filter.endDate);

  let runningOpening = initialOpening;

  let sumAdvance = new Decimal(0);
  let sumRepayment = new Decimal(0);
  let sumRd = new Decimal(0);
  let sumFd = new Decimal(0);
  let sumBankTransferReceived = new Decimal(0);
  let sumLoanReceived = new Decimal(0);
  let sumMiscReceived = new Decimal(0);
  let sumTotalReceived = new Decimal(0);

  let sumSavingsWithdrawal = new Decimal(0);
  let sumBankTransferPayment = new Decimal(0);
  let sumLoanPayment = new Decimal(0);
  let sumExpenses = new Decimal(0);
  let sumMiscPayment = new Decimal(0);
  let sumTotalPayment = new Decimal(0);

  const dailyRecords: CashbookDailyRecord[] = [];

  for (const date of dateList) {
    const entriesOnDate = entriesByDate.get(date) || [];
    const totals = classifyEntriesForAccount(entriesOnDate, cashAccount.chartOfAccountId, allCashChartOfAccountIds, false);

    const dayOpening = runningOpening;
    const dayCashInHand = dayOpening.plus(totals.totalReceived).minus(totals.totalPayment);
    const isNegative = dayCashInHand.isNegative();

    dailyRecords.push({
      date,
      opening: dayOpening.toFixed(2),
      advance: totals.advance.toFixed(2),
      repayment: totals.repayment.toFixed(2),
      rd: totals.rd.toFixed(2),
      fd: totals.fd.toFixed(2),
      bankTransferReceived: totals.bankTransferReceived.toFixed(2),
      loanReceived: totals.loanReceived.toFixed(2),
      miscellaneousReceived: totals.miscReceived.toFixed(2),
      totalReceived: totals.totalReceived.toFixed(2),
      savingsWithdrawal: totals.savingsWithdrawal.toFixed(2),
      bankTransferPayment: totals.bankTransferPayment.toFixed(2),
      loanPayment: totals.loanPayment.toFixed(2),
      expenses: totals.expenses.toFixed(2),
      miscellaneousPayment: totals.miscPayment.toFixed(2),
      totalPayment: totals.totalPayment.toFixed(2),
      cashInHand: dayCashInHand.toFixed(2),
      isNegative,
      hasTransactions: totals.hasTransactions,
    });

    sumAdvance = sumAdvance.plus(totals.advance);
    sumRepayment = sumRepayment.plus(totals.repayment);
    sumRd = sumRd.plus(totals.rd);
    sumFd = sumFd.plus(totals.fd);
    sumBankTransferReceived = sumBankTransferReceived.plus(totals.bankTransferReceived);
    sumLoanReceived = sumLoanReceived.plus(totals.loanReceived);
    sumMiscReceived = sumMiscReceived.plus(totals.miscReceived);
    sumTotalReceived = sumTotalReceived.plus(totals.totalReceived);

    sumSavingsWithdrawal = sumSavingsWithdrawal.plus(totals.savingsWithdrawal);
    sumBankTransferPayment = sumBankTransferPayment.plus(totals.bankTransferPayment);
    sumLoanPayment = sumLoanPayment.plus(totals.loanPayment);
    sumExpenses = sumExpenses.plus(totals.expenses);
    sumMiscPayment = sumMiscPayment.plus(totals.miscPayment);
    sumTotalPayment = sumTotalPayment.plus(totals.totalPayment);

    // Continuous carry-forward: next day's opening is today's closing cash in hand
    runningOpening = dayCashInHand;
  }

  const finalCashInHand = runningOpening;

  const summaryRow: CashbookSummaryRow = {
    opening: initialOpening.toFixed(2),
    advance: sumAdvance.toFixed(2),
    repayment: sumRepayment.toFixed(2),
    rd: sumRd.toFixed(2),
    fd: sumFd.toFixed(2),
    bankTransferReceived: sumBankTransferReceived.toFixed(2),
    loanReceived: sumLoanReceived.toFixed(2),
    miscellaneousReceived: sumMiscReceived.toFixed(2),
    totalReceived: sumTotalReceived.toFixed(2),
    savingsWithdrawal: sumSavingsWithdrawal.toFixed(2),
    bankTransferPayment: sumBankTransferPayment.toFixed(2),
    loanPayment: sumLoanPayment.toFixed(2),
    expenses: sumExpenses.toFixed(2),
    miscellaneousPayment: sumMiscPayment.toFixed(2),
    totalPayment: sumTotalPayment.toFixed(2),
    cashInHand: finalCashInHand.toFixed(2),
    isNegative: finalCashInHand.isNegative(),
  };

  // 5. Build legacy items for backward compatibility and flat voucher inspections
  const legacyPeriodLines = await prisma.journalLine.findMany({
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

  let legacyRunning = initialOpening;
  const items = legacyPeriodLines.map((line) => {
    const debit = toDecimal(line.debit);
    const credit = toDecimal(line.credit);
    legacyRunning = legacyRunning.plus(debit).minus(credit);

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
      runningBalance: legacyRunning.toFixed(4),
      postedBy: line.journalEntry.postedBy?.fullName || "System",
      status: line.journalEntry.status,
    };
  });

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
    openingBalance: initialOpening.toFixed(4),
    totalReceipts: sumTotalReceived.toFixed(4),
    totalPayments: sumTotalPayment.toFixed(4),
    closingBalance: finalCashInHand.toFixed(4),
    items,
    dailyRecords,
    summaryRow,
  };
}

/**
 * Returns completely redesigned daily cash statement with Received, Payment, and Daily Cash Summary.
 * Also provides multi-account summary to ensure Daybook, Cashbook, and Ledger reconciliation.
 */
export async function getDailySheet(caller: AuthenticatedUser, filter: DailySheetFilter) {
  requireOrganizationScope(caller, filter.organizationId);
  requirePermission(caller, "accounting.ledger.read");

  if (!isValidCalendarDate(filter.businessDate)) {
    throw new ValidationError("Business date must be a valid YYYY-MM-DD string.");
  }

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
    orderBy: [{ accountType: "asc" }, { code: "asc" }],
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
          businessDate: { lt: filter.businessDate },
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

  // 2. Determine selected cash account for category-wise daily statement
  let selectedCashAccount = filter.cashAccountId
    ? cashAccounts.find((c) => c.id === filter.cashAccountId)
    : cashAccounts.find((c) => c.accountType === "CASH") || cashAccounts[0];

  if (!selectedCashAccount && cashAccounts.length > 0) {
    selectedCashAccount = cashAccounts[0];
  }

  // 3. Determine opening balance carry-forward for selected cash account
  let openingBalance = new Decimal(0);
  let isFinalized = false;
  let isInitial = false;
  let finalizedAt: string | null = null;
  let finalizedBy: string | null = null;
  let previousDayStatus: "FINALIZED" | "UNFINALIZED" | "INITIAL_DAY" | "NO_PREVIOUS_RECORD" = "NO_PREVIOUS_RECORD";
  let previousDayDate: string | null = null;
  let hasBackdatedDiscrepancy = false;
  let discrepancyVariance: string | null = null;

  if (selectedCashAccount) {
    const openingInfo = await calculateOpeningBalanceAsOfDate(
      filter.organizationId,
      selectedCashAccount.id,
      selectedCashAccount.chartOfAccountId,
      filter.businessDate
    );
    openingBalance = openingInfo.openingBalance;
    isFinalized = openingInfo.isFinalized;
    isInitial = openingInfo.isInitial;
    finalizedAt = openingInfo.finalizedAt;
    finalizedBy = openingInfo.finalizedBy;
    previousDayStatus = openingInfo.previousDayStatus;
    previousDayDate = openingInfo.previousDayDate;
  }

  // 4. Categorize today's transactions for selected cash account
  const allCashChartOfAccountIds = new Set(cashAccounts.map((c) => c.chartOfAccountId));

  let advance = new Decimal(0);
  let repayment = new Decimal(0);
  let rd = new Decimal(0);
  let fd = new Decimal(0);
  let bankTransferReceived = new Decimal(0);
  let loanReceived = new Decimal(0);
  let miscReceived = new Decimal(0);

  let savingsWithdrawal = new Decimal(0);
  let bankTransferPayment = new Decimal(0);
  let loanPayment = new Decimal(0);
  let expenses = new Decimal(0);
  let miscPayment = new Decimal(0);

  let transactionsList: Array<{
    journalEntryId: string;
    entryNumber: string;
    businessDate: string;
    sourceModule: string;
    sourceType: string;
    category: string;
    type: "RECEIVED" | "PAYMENT";
    amount: string;
    description: string;
    postedBy: string;
  }> = [];

  if (selectedCashAccount) {
    const dayJournalEntries = await prisma.journalEntry.findMany({
      where: {
        organizationId: filter.organizationId,
        businessDate: filter.businessDate,
        status: { in: ["POSTED", "REVERSED"] },
        lines: {
          some: {
            accountId: selectedCashAccount.chartOfAccountId,
          },
        },
      },
      include: {
        lines: {
          include: { account: true },
          orderBy: { lineNumber: "asc" },
        },
        postedBy: {
          select: { id: true, username: true, fullName: true },
        },
      },
      orderBy: [{ entryNumber: "asc" }],
    });

    const classified = classifyEntriesForAccount(
      dayJournalEntries,
      selectedCashAccount.chartOfAccountId,
      allCashChartOfAccountIds,
      true
    );

    advance = classified.advance;
    repayment = classified.repayment;
    rd = classified.rd;
    fd = classified.fd;
    bankTransferReceived = classified.bankTransferReceived;
    loanReceived = classified.loanReceived;
    miscReceived = classified.miscReceived;

    savingsWithdrawal = classified.savingsWithdrawal;
    bankTransferPayment = classified.bankTransferPayment;
    loanPayment = classified.loanPayment;
    expenses = classified.expenses;
    miscPayment = classified.miscPayment;

    transactionsList = classified.transactions || [];
  }

  // 5. Total Received (excluding Opening) and Total Payment
  const totalReceived = advance
    .plus(repayment)
    .plus(rd)
    .plus(fd)
    .plus(bankTransferReceived)
    .plus(loanReceived)
    .plus(miscReceived);

  const totalPayment = savingsWithdrawal
    .plus(bankTransferPayment)
    .plus(loanPayment)
    .plus(expenses)
    .plus(miscPayment);

  const closingCash = openingBalance.plus(totalReceived).minus(totalPayment);
  const isNegative = closingCash.isNegative();

  if (isFinalized && selectedCashAccount) {
    const lockedRecord = await prisma.dailyCashRecord.findUnique({
      where: {
        organizationId_cashAccountId_businessDate: {
          organizationId: filter.organizationId,
          cashAccountId: selectedCashAccount.id,
          businessDate: filter.businessDate,
        },
      },
    });
    if (lockedRecord) {
      const lockedClose = new Decimal(lockedRecord.closingBalance);
      if (!lockedClose.equals(closingCash)) {
        hasBackdatedDiscrepancy = true;
        discrepancyVariance = closingCash.minus(lockedClose).toFixed(4);
      }
    }
  }

  // Categories formatted arrays
  const receivedCategories: DailySheetCategoryItem[] = [
    { key: "opening", label: "Opening", amount: openingBalance.toFixed(2) },
    { key: "advance", label: "Advance", amount: advance.toFixed(2) },
    { key: "repayment", label: "Repayment", amount: repayment.toFixed(2) },
    { key: "rd", label: "RD", amount: rd.toFixed(2) },
    { key: "fd", label: "FD", amount: fd.toFixed(2) },
    { key: "bankTransfer", label: "Bank Transfer", amount: bankTransferReceived.toFixed(2) },
    { key: "loan", label: "Loan", amount: loanReceived.toFixed(2) },
    { key: "miscellaneous", label: "Miscellaneous", amount: miscReceived.toFixed(2) },
    { key: "totalReceived", label: "Total Received", amount: totalReceived.toFixed(2) },
  ];

  const paymentCategories: DailySheetCategoryItem[] = [
    { key: "savingsWithdrawal", label: "Savings Withdrawal", amount: savingsWithdrawal.toFixed(2) },
    { key: "bankTransfer", label: "Bank Transfer", amount: bankTransferPayment.toFixed(2) },
    { key: "loanPayment", label: "Loan Payment", amount: loanPayment.toFixed(2) },
    { key: "expenses", label: "Expenses", amount: expenses.toFixed(2) },
    { key: "miscellaneous", label: "Miscellaneous", amount: miscPayment.toFixed(2) },
    { key: "totalPayment", label: "Total Payment", amount: totalPayment.toFixed(2) },
  ];

  return {
    businessDate: filter.businessDate,
    selectedCashAccount: selectedCashAccount
      ? {
          id: selectedCashAccount.id,
          code: selectedCashAccount.code,
          name: selectedCashAccount.name,
          accountType: selectedCashAccount.accountType,
          glCode: selectedCashAccount.chartOfAccount.code,
        }
      : null,
    cashAccounts: cashAccounts.map((ca) => ({
      id: ca.id,
      code: ca.code,
      name: ca.name,
      accountType: ca.accountType,
      glCode: ca.chartOfAccount.code,
    })),
    received: {
      opening: openingBalance.toFixed(2),
      advance: advance.toFixed(2),
      repayment: repayment.toFixed(2),
      rd: rd.toFixed(2),
      fd: fd.toFixed(2),
      bankTransfer: bankTransferReceived.toFixed(2),
      loan: loanReceived.toFixed(2),
      miscellaneous: miscReceived.toFixed(2),
      totalReceived: totalReceived.toFixed(2),
      categories: receivedCategories,
    },
    payment: {
      savingsWithdrawal: savingsWithdrawal.toFixed(2),
      bankTransfer: bankTransferPayment.toFixed(2),
      loanPayment: loanPayment.toFixed(2),
      expenses: expenses.toFixed(2),
      miscellaneous: miscPayment.toFixed(2),
      totalPayment: totalPayment.toFixed(2),
      categories: paymentCategories,
    },
    summary: {
      openingCash: openingBalance.toFixed(2),
      totalReceived: totalReceived.toFixed(2),
      totalPayment: totalPayment.toFixed(2),
      closingCash: closingCash.toFixed(2),
      formulaText: `₹${openingBalance.toFixed(2)} (Opening) + ₹${totalReceived.toFixed(2)} (Received) - ₹${totalPayment.toFixed(2)} (Payment) = ₹${closingCash.toFixed(2)}`,
      isNegative,
      discrepancyMessage: isNegative
        ? `⚠️ Cash In Hand Discrepancy: Closing cash balance is negative (₹${closingCash.toFixed(2)}). Physical cash cannot be negative. Please verify unrecorded receipts or incorrect payment vouchers.`
        : null,
    },
    status: {
      isFinalized,
      isInitial,
      finalizedAt,
      finalizedBy,
      previousDayStatus,
      previousDayDate,
      hasBackdatedDiscrepancy,
      discrepancyVariance,
    },
    transactions: transactionsList,
    accountSummaries,
    reconciliation: {
      aggregateOpening: aggregateOpening.toStorageString(),
      aggregateReceipts: aggregateReceipts.toStorageString(),
      aggregatePayments: aggregatePayments.toStorageString(),
      aggregateClosing: aggregateClosing.toStorageString(),
      isReconciled: aggregateOpening.plus(aggregateReceipts).minus(aggregatePayments).equals(aggregateClosing),
    },
  };
}

/**
 * Finalizes and locks the daily sheet snapshot for an account and business date.
 */
export async function finalizeDailySheet(
  caller: AuthenticatedUser,
  command: FinalizeDailySheetCommand
) {
  requireOrganizationScope(caller, command.organizationId);
  requirePermission(caller, "accounting.ledger.read");

  const sheet = await getDailySheet(caller, {
    organizationId: command.organizationId,
    businessDate: command.businessDate,
    cashAccountId: command.cashAccountId,
  });

  const record = await prisma.dailyCashRecord.upsert({
    where: {
      organizationId_cashAccountId_businessDate: {
        organizationId: command.organizationId,
        cashAccountId: command.cashAccountId,
        businessDate: command.businessDate,
      },
    },
    update: {
      openingBalance: new Decimal(sheet.summary.openingCash),
      totalReceived: new Decimal(sheet.summary.totalReceived),
      totalPayment: new Decimal(sheet.summary.totalPayment),
      closingBalance: new Decimal(sheet.summary.closingCash),
      isFinalized: true,
      finalizedAt: new Date(),
      finalizedById: caller.userId,
      notes: command.notes || null,
    },
    create: {
      organizationId: command.organizationId,
      cashAccountId: command.cashAccountId,
      businessDate: command.businessDate,
      openingBalance: new Decimal(sheet.summary.openingCash),
      totalReceived: new Decimal(sheet.summary.totalReceived),
      totalPayment: new Decimal(sheet.summary.totalPayment),
      closingBalance: new Decimal(sheet.summary.closingCash),
      isFinalized: true,
      finalizedAt: new Date(),
      finalizedById: caller.userId,
      notes: command.notes || null,
    },
  });

  await recordAuditEvent({
    organizationId: command.organizationId,
    actorId: caller.userId,
    action: "accounting.dailysheet.finalized",
    entityType: "DailyCashRecord",
    entityId: record.id,
    metadata: {
      businessDate: command.businessDate,
      cashAccountId: command.cashAccountId,
      closingBalance: sheet.summary.closingCash,
    },
  });

  return record;
}

/**
 * Allows an authorized user to establish the initial opening cash balance for the first day of operation.
 */
export async function setInitialDailyOpeningBalance(
  caller: AuthenticatedUser,
  command: SetInitialOpeningBalanceCommand
) {
  requireOrganizationScope(caller, command.organizationId);
  requirePermission(caller, "accounting.ledger.read");

  const openDec = new Decimal(command.openingBalance);

  const sheet = await getDailySheet(caller, {
    organizationId: command.organizationId,
    businessDate: command.businessDate,
    cashAccountId: command.cashAccountId,
  });

  const receivedDec = new Decimal(sheet.summary.totalReceived);
  const paymentDec = new Decimal(sheet.summary.totalPayment);
  const closingDec = openDec.plus(receivedDec).minus(paymentDec);

  const record = await prisma.dailyCashRecord.upsert({
    where: {
      organizationId_cashAccountId_businessDate: {
        organizationId: command.organizationId,
        cashAccountId: command.cashAccountId,
        businessDate: command.businessDate,
      },
    },
    update: {
      openingBalance: openDec,
      totalReceived: receivedDec,
      totalPayment: paymentDec,
      closingBalance: closingDec,
      isInitial: true,
      notes: command.notes || "Initial opening cash balance established by authorized maker",
    },
    create: {
      organizationId: command.organizationId,
      cashAccountId: command.cashAccountId,
      businessDate: command.businessDate,
      openingBalance: openDec,
      totalReceived: receivedDec,
      totalPayment: paymentDec,
      closingBalance: closingDec,
      isInitial: true,
      notes: command.notes || "Initial opening cash balance established by authorized maker",
    },
  });

  await recordAuditEvent({
    organizationId: command.organizationId,
    actorId: caller.userId,
    action: "accounting.dailysheet.initial_opening_set",
    entityType: "DailyCashRecord",
    entityId: record.id,
    metadata: {
      businessDate: command.businessDate,
      cashAccountId: command.cashAccountId,
      openingBalance: openDec.toFixed(4),
    },
  });

  return record;
}

/**
 * Records an internal fund transfer between two cash or bank accounts without creating artificial income/expense.
 */
export async function recordInternalTransfer(
  caller: AuthenticatedUser,
  command: InternalTransferCommand
) {
  requireOrganizationScope(caller, command.organizationId);
  requirePermission(caller, "accounting.ledger.read");

  const amountDec = new Decimal(command.amount);
  if (amountDec.lte(0)) {
    throw new ValidationError("Transfer amount must be greater than zero.");
  }
  if (command.fromCashAccountId === command.toCashAccountId) {
    throw new ValidationError("Source and destination cash accounts cannot be identical.");
  }

  const [fromAcc, toAcc] = await Promise.all([
    prisma.cashAccount.findUnique({ where: { id: command.fromCashAccountId }, include: { chartOfAccount: true } }),
    prisma.cashAccount.findUnique({ where: { id: command.toCashAccountId }, include: { chartOfAccount: true } }),
  ]);

  if (!fromAcc || fromAcc.organizationId !== command.organizationId) {
    throw new NotFoundError("CashAccount", command.fromCashAccountId);
  }
  if (!toAcc || toAcc.organizationId !== command.organizationId) {
    throw new NotFoundError("CashAccount", command.toCashAccountId);
  }

  const lines: JournalLineInput[] = [
    {
      accountId: toAcc.chartOfAccountId,
      cashAccountId: toAcc.id,
      debit: amountDec,
      credit: 0,
      narration: `Transfer received from ${fromAcc.code} (${fromAcc.name})`,
    },
    {
      accountId: fromAcc.chartOfAccountId,
      cashAccountId: fromAcc.id,
      debit: 0,
      credit: amountDec,
      narration: `Transfer sent to ${toAcc.code} (${toAcc.name})`,
    },
  ];

  const journal = await postJournalEntry(caller, {
    organizationId: command.organizationId,
    businessDate: command.businessDate,
    sourceModule: "MANUAL",
    sourceType: "BANK_TRANSFER",
    description: command.description || `Internal fund transfer: ${fromAcc.name} -> ${toAcc.name}`,
    lines,
    idempotencyKey: command.idempotencyKey,
  });

  return journal;
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
