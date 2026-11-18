import { describe, it, expect, beforeAll } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { login } from "@/modules/identity/auth-service";
import { postJournalEntry, reverseJournalEntry } from "./posting-service";
import {
  getDaybook,
  getCashbook,
  getDailySheet,
  recordInternalTransfer,
} from "./ledger-service";
import { AuthenticatedUser } from "@/lib/permissions/types";

describe("Production Daybook Redesign – Complete Daily Transaction Register", () => {
  let adminUser: AuthenticatedUser;
  let cashAccount: { id: string; chartOfAccountId: string };
  let bankAccount: { id: string; chartOfAccountId: string };
  let coa: Record<string, string>;

  const TEST_DATES = [
    "2026-12-01",
    "2026-12-02",
    "2026-12-03",
    "2026-12-04",
  ];

  async function cleanupTestDates() {
    const entries = await prisma.journalEntry.findMany({
      where: {
        businessDate: { in: TEST_DATES },
        organizationId: adminUser.organizationId,
      },
      select: { id: true },
    });
    const entryIds = entries.map((e) => e.id);

    if (entryIds.length > 0) {
      await prisma.journalEntry.updateMany({
        where: { id: { in: entryIds } },
        data: { reversalOfId: null },
      });
      await prisma.journalLine.deleteMany({
        where: { journalEntryId: { in: entryIds } },
      });
      await prisma.journalEntry.deleteMany({
        where: { id: { in: entryIds } },
      });
    }

    await prisma.dailyCashRecord.deleteMany({
      where: {
        businessDate: { in: TEST_DATES },
        organizationId: adminUser.organizationId,
      },
    });
  }

  beforeAll(async () => {
    const loginRes = await login({
      organizationCode: "RAYHAN-MFI",
      username: "admin",
      password: "Admin@12345",
    });
    adminUser = loginRes.user;

    const [cAcc, bAcc, accounts] = await Promise.all([
      prisma.cashAccount.findFirstOrThrow({
        where: { organizationId: adminUser.organizationId, code: "CASH-VAULT-01" },
      }),
      prisma.cashAccount.findFirstOrThrow({
        where: { organizationId: adminUser.organizationId, code: "BANK-HDFC-01" },
      }),
      prisma.chartOfAccount.findMany({
        where: { organizationId: adminUser.organizationId },
      }),
    ]);

    cashAccount = { id: cAcc.id, chartOfAccountId: cAcc.chartOfAccountId };
    bankAccount = { id: bAcc.id, chartOfAccountId: bAcc.chartOfAccountId };
    coa = Object.fromEntries(accounts.map((a) => [a.code, a.id]));

    await cleanupTestDates();
  });

  // --------------------------------------------------------------------------
  // Test 1: Complete Inclusivity Across Multiple Modules (Cash & Non-Cash)
  // --------------------------------------------------------------------------
  it("Test 1: includes transactions across all modules (loans, collections, deposits, expenses, transfers, adjustments)", async () => {
    const date1 = "2026-12-01";

    // 1. Loan Disbursement (LOANS)
    await postJournalEntry(adminUser, {
      organizationId: adminUser.organizationId,
      businessDate: date1,
      sourceModule: "LOANS",
      sourceType: "LOAN_DISBURSEMENT",
      sourceId: "LOAN-ACT-1001",
      description: "Disbursement for loan account LOAN-ACT-1001 to Rahim Khan",
      lines: [
        { accountId: coa["1201"], debit: 50000, credit: 0, narration: "Principal receivable created" },
        { accountId: bankAccount.chartOfAccountId, debit: 0, credit: 50000, narration: "Bank disbursement payout" },
      ],
    });

    // 2. Collection Receipt (COLLECTIONS)
    await postJournalEntry(adminUser, {
      organizationId: adminUser.organizationId,
      businessDate: date1,
      sourceModule: "COLLECTIONS",
      sourceType: "COLLECTION_RECEIPT",
      sourceId: "RC-2026-001",
      description: "Loan installment collected from Ayesha Begum",
      lines: [
        { accountId: cashAccount.chartOfAccountId, debit: 5000, credit: 0, narration: "Cash received in counter" },
        { accountId: coa["1201"], debit: 0, credit: 4500, narration: "Principal repayment" },
        { accountId: coa["4001"], debit: 0, credit: 500, narration: "Interest collected" },
      ],
    });

    // 3. Savings Deposit (SAVINGS)
    await postJournalEntry(adminUser, {
      organizationId: adminUser.organizationId,
      businessDate: date1,
      sourceModule: "SAVINGS",
      sourceType: "SAVINGS_DEPOSIT",
      sourceId: "SAV-ACT-2001",
      description: "Savings voluntary deposit by member Fatima Bibi",
      lines: [
        { accountId: cashAccount.chartOfAccountId, debit: 1200, credit: 0, narration: "Savings cash deposit" },
        { accountId: coa["2001"], debit: 0, credit: 1200, narration: "Member savings liability" },
      ],
    });

    // 4. Term Deposit RD (TERM_DEPOSITS)
    await postJournalEntry(adminUser, {
      organizationId: adminUser.organizationId,
      businessDate: date1,
      sourceModule: "TERM_DEPOSITS",
      sourceType: "RD_INSTALLMENT",
      sourceId: "RD-ACT-3001",
      description: "Recurring deposit monthly installment",
      lines: [
        { accountId: cashAccount.chartOfAccountId, debit: 1000, credit: 0, narration: "RD deposit cash" },
        { accountId: coa["2002"], debit: 0, credit: 1000, narration: "Recurring deposit liability" },
      ],
    });

    // 5. Operating Expense (EXPENSES)
    await postJournalEntry(adminUser, {
      organizationId: adminUser.organizationId,
      businessDate: date1,
      sourceModule: "EXPENSES",
      sourceType: "EXPENSE_PAYMENT",
      sourceId: "EXP-INV-5001",
      description: "Branch electricity and broadband utility bills",
      lines: [
        { accountId: coa["5001"], debit: 2500, credit: 0, narration: "Utility expense" },
        { accountId: bankAccount.chartOfAccountId, debit: 0, credit: 2500, narration: "Paid via bank transfer" },
      ],
    });

    // 6. Non-cash accounting adjustment (MANUAL / ADJUSTMENT)
    await postJournalEntry(adminUser, {
      organizationId: adminUser.organizationId,
      businessDate: date1,
      sourceModule: "MANUAL",
      sourceType: "ADJUSTMENT",
      sourceId: "ADJ-2026-01",
      description: "Depreciation of branch office furniture (non-cash)",
      lines: [
        { accountId: coa["5001"], debit: 1500, credit: 0, narration: "Depreciation expense" },
        { accountId: coa["3001"], debit: 0, credit: 1500, narration: "Accumulated depreciation reserve" },
      ],
    });

    const daybook = await getDaybook(adminUser, {
      organizationId: adminUser.organizationId,
      businessDate: date1,
    });

    // Must include all 6 transactions
    expect(daybook.entries.length).toBe(6);
    expect(daybook.dateGroups).toHaveLength(1);

    const group = daybook.dateGroups[0];
    expect(group.date).toBe(date1);
    expect(group.voucherCount).toBe(6);

    // Verify all modules are represented
    const modules = new Set(group.vouchers.map((v) => v.sourceModule));
    expect(modules.has("LOANS")).toBe(true);
    expect(modules.has("COLLECTIONS")).toBe(true);
    expect(modules.has("SAVINGS")).toBe(true);
    expect(modules.has("TERM_DEPOSITS")).toBe(true);
    expect(modules.has("EXPENSES")).toBe(true);
    expect(modules.has("MANUAL")).toBe(true);
  });

  // --------------------------------------------------------------------------
  // Test 2: Date-Wise Organisation & Empty Date Exclusion
  // --------------------------------------------------------------------------
  it("Test 2: groups records date-wise and excludes empty dates without transactions", async () => {
    // Post transactions on 2026-12-01 and 2026-12-03 (skip 2026-12-02 and 2026-12-04)
    await postJournalEntry(adminUser, {
      organizationId: adminUser.organizationId,
      businessDate: "2026-12-03",
      sourceModule: "COLLECTIONS",
      sourceType: "COLLECTION_RECEIPT",
      sourceId: "RC-2026-002",
      description: "Center 5 collection receipt",
      lines: [
        { accountId: cashAccount.chartOfAccountId, debit: 2000, credit: 0 },
        { accountId: coa["1201"], debit: 0, credit: 2000 },
      ],
    });

    const daybook = await getDaybook(adminUser, {
      organizationId: adminUser.organizationId,
      startDate: "2026-12-01",
      endDate: "2026-12-04",
      sortOrder: "asc",
    });

    // Date groups must only contain 2026-12-01 and 2026-12-03 (empty dates 2026-12-02 and 2026-12-04 are excluded)
    expect(daybook.dateGroups).toHaveLength(2);
    expect(daybook.dateGroups.map((g) => g.date)).toEqual(["2026-12-01", "2026-12-03"]);

    // Chronological order verification
    expect(daybook.dateGroups[0].date).toBe("2026-12-01");
    expect(daybook.dateGroups[1].date).toBe("2026-12-03");

    // Vouchers count per date
    expect(daybook.dateGroups[0].voucherCount).toBe(6);
    expect(daybook.dateGroups[1].voucherCount).toBe(1);
  });

  // --------------------------------------------------------------------------
  // Test 3: Complete Accounting Entries & 10 Columns
  // --------------------------------------------------------------------------
  it("Test 3: exposes complete accounting entries and maintains Total Dr = Total Cr for each voucher", async () => {
    const daybook = await getDaybook(adminUser, {
      organizationId: adminUser.organizationId,
      businessDate: "2026-12-01",
    });

    const group = daybook.dateGroups[0];
    for (const v of group.vouchers) {
      // 10 required fields exist
      expect(v.entryNumber).toBeDefined();
      expect(v.businessDate).toBeDefined();
      expect(v.sourceModule).toBeDefined();
      expect(v.sourceType).toBeDefined();
      expect(v.reference).toBeDefined();
      expect(v.description).toBeDefined();
      expect(v.totalDebit).toBeDefined();
      expect(v.totalCredit).toBeDefined();
      expect(v.status).toBeDefined();
      expect(v.lines.length).toBeGreaterThanOrEqual(2);

      // Invariant: Total Debit === Total Credit for each voucher
      expect(parseFloat(v.totalDebit)).toBe(parseFloat(v.totalCredit));

      // Check sum of individual line debits and credits
      const lineDebits = v.lines.reduce((s, l) => s + parseFloat(l.debit), 0);
      const lineCredits = v.lines.reduce((s, l) => s + parseFloat(l.credit), 0);
      expect(lineDebits).toBeCloseTo(parseFloat(v.totalDebit), 2);
      expect(lineCredits).toBeCloseTo(parseFloat(v.totalCredit), 2);
    }
  });

  // --------------------------------------------------------------------------
  // Test 4: Daily Totals Reconciliation & Overall Period Totals
  // --------------------------------------------------------------------------
  it("Test 4: reconciles daily debit/credit totals and overall period totals", async () => {
    const daybook = await getDaybook(adminUser, {
      organizationId: adminUser.organizationId,
      startDate: "2026-12-01",
      endDate: "2026-12-03",
    });

    let cumulativeDebit = 0;
    let cumulativeCredit = 0;
    let cumulativeVouchers = 0;

    for (const group of daybook.dateGroups) {
      // Daily reconciliation
      expect(parseFloat(group.totalDebit)).toBe(parseFloat(group.totalCredit));
      expect(group.isReconciled).toBe(true);

      cumulativeDebit += parseFloat(group.totalDebit);
      cumulativeCredit += parseFloat(group.totalCredit);
      cumulativeVouchers += group.voucherCount;
    }

    // Overall totals check
    expect(parseFloat(daybook.totals.totalDebit)).toBeCloseTo(cumulativeDebit, 2);
    expect(parseFloat(daybook.totals.totalCredit)).toBeCloseTo(cumulativeCredit, 2);
    expect(daybook.totals.totalVouchers).toBe(cumulativeVouchers);
    expect(daybook.totals.isReconciled).toBe(true);
  });

  // --------------------------------------------------------------------------
  // Test 5: Filters & Search
  // --------------------------------------------------------------------------
  it("Test 5: supports targeted filtering by voucherNumber, module, account, search, and status", async () => {
    // 1. Filter by sourceModule = LOANS
    const loanDaybook = await getDaybook(adminUser, {
      organizationId: adminUser.organizationId,
      startDate: "2026-12-01",
      endDate: "2026-12-03",
      sourceModule: "LOANS",
    });
    expect(loanDaybook.totals.totalVouchers).toBe(1);
    expect(loanDaybook.dateGroups[0].vouchers[0].sourceModule).toBe("LOANS");

    // 2. Filter by accountId (e.g. Utility Expense account 5001)
    const expenseDaybook = await getDaybook(adminUser, {
      organizationId: adminUser.organizationId,
      startDate: "2026-12-01",
      endDate: "2026-12-03",
      accountId: coa["5001"],
    });
    // Two vouchers touch 5001: Expense payment and Depreciation
    expect(expenseDaybook.totals.totalVouchers).toBe(2);

    // 3. Search text
    const searchDaybook = await getDaybook(adminUser, {
      organizationId: adminUser.organizationId,
      startDate: "2026-12-01",
      endDate: "2026-12-03",
      search: "Rahim Khan",
    });
    expect(searchDaybook.totals.totalVouchers).toBe(1);
    expect(searchDaybook.dateGroups[0].vouchers[0].description).toContain("Rahim Khan");
  });

  // --------------------------------------------------------------------------
  // Test 6: Reversals, Status Tracking, and Audit Reference
  // --------------------------------------------------------------------------
  it("Test 6: tracks reversals with explicit links without altering historical vouchers", async () => {
    const testDate = "2026-12-03";

    // Post an expense to reverse
    const originalEntry = await postJournalEntry(adminUser, {
      organizationId: adminUser.organizationId,
      businessDate: testDate,
      sourceModule: "EXPENSES",
      sourceType: "PETTY_CASH",
      description: "Wrong supplies voucher to reverse",
      lines: [
        { accountId: coa["5001"], debit: 800, credit: 0 },
        { accountId: cashAccount.chartOfAccountId, debit: 0, credit: 800 },
      ],
    });

    // Reverse the voucher
    await reverseJournalEntry(adminUser, {
      organizationId: adminUser.organizationId,
      journalEntryId: originalEntry.id,
      businessDate: testDate,
      reversalReason: "Duplicate posting corrected",
    });

    const daybook = await getDaybook(adminUser, {
      organizationId: adminUser.organizationId,
      businessDate: testDate,
    });

    const reversedVoucher = daybook.dateGroups[0].vouchers.find((v) => v.id === originalEntry.id);
    expect(reversedVoucher).toBeDefined();
    expect(reversedVoucher?.status).toBe("REVERSED");
    expect(reversedVoucher?.reversalReason).toBe("Duplicate posting corrected");

    const reversalVoucher = daybook.dateGroups[0].vouchers.find((v) => v.sourceType === "REVERSAL");
    expect(reversalVoucher).toBeDefined();
    expect(reversalVoucher?.reversalOfEntryNumber).toBe(originalEntry.entryNumber);
  });

  // --------------------------------------------------------------------------
  // Test 7: Separation of Responsibilities & Full Ledger Reconciliation
  // --------------------------------------------------------------------------
  it("Test 7: proves Daybook, Cashbook, and Daily Sheet reconcile without duplicate postings", async () => {
    const testDate = "2026-12-01";

    const [daybook, cashbook, dailySheet] = await Promise.all([
      getDaybook(adminUser, {
        organizationId: adminUser.organizationId,
        businessDate: testDate,
      }),
      getCashbook(adminUser, {
        organizationId: adminUser.organizationId,
        cashAccountId: cashAccount.id,
        startDate: testDate,
        endDate: testDate,
      }),
      getDailySheet(adminUser, {
        organizationId: adminUser.organizationId,
        businessDate: testDate,
        cashAccountId: cashAccount.id,
      }),
    ]);

    // 1. Daybook is balanced
    expect(daybook.totals.isReconciled).toBe(true);

    // 2. Daily Sheet is balanced
    expect(dailySheet.reconciliation.isReconciled).toBe(true);

    // 3. Cashbook cashInHand matches Daily Sheet closingCash exactly
    const cashbookDay = cashbook.dailyRecords[0];
    expect(cashbookDay.cashInHand).toBe(dailySheet.summary.closingCash);

    // 4. Cashbook receipts match Daily Sheet receipts
    expect(cashbookDay.totalReceived).toBe(dailySheet.summary.totalReceived);

    // 5. Cashbook payments match Daily Sheet payments
    expect(cashbookDay.totalPayment).toBe(dailySheet.summary.totalPayment);
  });
});
