import { describe, it, expect, beforeAll } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { login } from "@/modules/identity/auth-service";
import { postJournalEntry, reverseJournalEntry } from "./posting-service";
import {
  getCashbook,
  getDailySheet,
  getEarliestCashbookDate,
  recordInternalTransfer,
  setInitialDailyOpeningBalance,
  generateDateRange,
} from "./ledger-service";
import { AuthenticatedUser } from "@/lib/permissions/types";

describe("Production Cashbook Redesign – Date-Wise Financial Table", () => {
  let adminUser: AuthenticatedUser;
  let cashAccount: { id: string; chartOfAccountId: string };
  let bankAccount: { id: string; chartOfAccountId: string };
  let coa: Record<string, string>;

  const TEST_DATES = [
    "2026-11-26",
    "2026-11-27",
    "2026-11-28",
    "2026-11-29",
    "2026-11-30",
  ];

  async function cleanupTestDates() {
    await prisma.dailyCashRecord.deleteMany({
      where: {
        businessDate: { in: TEST_DATES },
        organizationId: adminUser.organizationId,
      },
    });

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
  // Test 1: Date Range and Continuous Empty Date Inclusion (Section 2 & 3)
  // --------------------------------------------------------------------------
  it("Test 1: includes every business date in range chronologically without omitting empty dates", async () => {
    const startDate = "2026-11-26";
    const endDate = "2026-11-29";

    // Set an initial baseline opening balance for the test window
    await setInitialDailyOpeningBalance(adminUser, {
      organizationId: adminUser.organizationId,
      cashAccountId: cashAccount.id,
      businessDate: startDate,
      openingBalance: 15000,
      notes: "Test 1 opening baseline",
    });

    // Post transactions on Day 1 (2026-11-26) and Day 3 (2026-11-28)
    // Day 2 (2026-11-27) and Day 4 (2026-11-29) have ZERO transactions
    await postJournalEntry(adminUser, {
      organizationId: adminUser.organizationId,
      businessDate: "2026-11-26",
      sourceModule: "COLLECTIONS",
      sourceType: "REPAYMENT",
      description: "Loan installment collected",
      lines: [
        { accountId: cashAccount.chartOfAccountId, debit: 3000, credit: 0 },
        { accountId: coa["1201"], debit: 0, credit: 3000 },
      ],
    });

    await postJournalEntry(adminUser, {
      organizationId: adminUser.organizationId,
      businessDate: "2026-11-28",
      sourceModule: "EXPENSES",
      sourceType: "OFFICE_RENT",
      description: "Branch office rent",
      lines: [
        { accountId: coa["5001"], debit: 2000, credit: 0 },
        { accountId: cashAccount.chartOfAccountId, debit: 0, credit: 2000 },
      ],
    });

    const cashbook = await getCashbook(adminUser, {
      organizationId: adminUser.organizationId,
      cashAccountId: cashAccount.id,
      startDate,
      endDate,
    });

    // Must return exactly 4 daily records
    expect(cashbook.dailyRecords).toHaveLength(4);
    expect(cashbook.dailyRecords.map((r) => r.date)).toEqual([
      "2026-11-26",
      "2026-11-27",
      "2026-11-28",
      "2026-11-29",
    ]);

    // Verify 17 columns exist on every row
    for (const r of cashbook.dailyRecords) {
      expect(r).toHaveProperty("date");
      expect(r).toHaveProperty("opening");
      expect(r).toHaveProperty("advance");
      expect(r).toHaveProperty("repayment");
      expect(r).toHaveProperty("rd");
      expect(r).toHaveProperty("fd");
      expect(r).toHaveProperty("bankTransferReceived");
      expect(r).toHaveProperty("loanReceived");
      expect(r).toHaveProperty("miscellaneousReceived");
      expect(r).toHaveProperty("totalReceived");
      expect(r).toHaveProperty("savingsWithdrawal");
      expect(r).toHaveProperty("bankTransferPayment");
      expect(r).toHaveProperty("loanPayment");
      expect(r).toHaveProperty("expenses");
      expect(r).toHaveProperty("miscellaneousPayment");
      expect(r).toHaveProperty("totalPayment");
      expect(r).toHaveProperty("cashInHand");
    }

    // Day 2 (empty day): hasTransactions is false, categories are 0.00, opening equals cash in hand
    const day2 = cashbook.dailyRecords[1];
    expect(day2.date).toBe("2026-11-27");
    expect(day2.hasTransactions).toBe(false);
    expect(Number(day2.totalReceived)).toBe(0);
    expect(Number(day2.totalPayment)).toBe(0);
    expect(Number(day2.opening)).toBe(18000); // 15000 + 3000
    expect(Number(day2.cashInHand)).toBe(18000);

    // Day 4 (empty day): opening equals day 3 closing
    const day4 = cashbook.dailyRecords[3];
    expect(day4.date).toBe("2026-11-29");
    expect(day4.hasTransactions).toBe(false);
    expect(Number(day4.opening)).toBe(16000); // 18000 - 2000
    expect(Number(day4.cashInHand)).toBe(16000);
  });

  // --------------------------------------------------------------------------
  // Test 2: Mathematical Carry-Forward & Non-Inclusion of Opening in Total Received
  // --------------------------------------------------------------------------
  it("Test 2: strictly maintains carry-forward chain and excludes opening from total received", async () => {
    const cashbook = await getCashbook(adminUser, {
      organizationId: adminUser.organizationId,
      cashAccountId: cashAccount.id,
      startDate: "2026-11-26",
      endDate: "2026-11-29",
    });

    for (let i = 0; i < cashbook.dailyRecords.length; i++) {
      const r = cashbook.dailyRecords[i];
      const rec =
        Number(r.advance) +
        Number(r.repayment) +
        Number(r.rd) +
        Number(r.fd) +
        Number(r.bankTransferReceived) +
        Number(r.loanReceived) +
        Number(r.miscellaneousReceived);

      const pay =
        Number(r.savingsWithdrawal) +
        Number(r.bankTransferPayment) +
        Number(r.loanPayment) +
        Number(r.expenses) +
        Number(r.miscellaneousPayment);

      // Invariant 1: Total Received = sum of 7 receipt categories (excluding opening)
      expect(Number(r.totalReceived)).toBeCloseTo(rec, 4);

      // Invariant 2: Total Payment = sum of 5 payment categories
      expect(Number(r.totalPayment)).toBeCloseTo(pay, 4);

      // Invariant 3: Cash in Hand = Opening + Total Received - Total Payment
      const expectedCashInHand = Number(r.opening) + rec - pay;
      expect(Number(r.cashInHand)).toBeCloseTo(expectedCashInHand, 4);

      // Invariant 4: Continuous carry-forward to next day's opening
      if (i > 0) {
        const prev = cashbook.dailyRecords[i - 1];
        expect(Number(r.opening)).toBeCloseTo(Number(prev.cashInHand), 4);
      }
    }
  });

  // --------------------------------------------------------------------------
  // Test 3: Internal Bank Transfer Treatment (Section 5)
  // --------------------------------------------------------------------------
  it("Test 3: classifies cash-to-bank and bank-to-cash accurately without inflating income or expenses", async () => {
    const testDate = "2026-11-30";

    // 1. Cash transferred to Bank: ₹5,000 (Payment -> Bank Transfer Payment)
    await recordInternalTransfer(adminUser, {
      organizationId: adminUser.organizationId,
      fromCashAccountId: cashAccount.id,
      toCashAccountId: bankAccount.id,
      amount: 5000,
      businessDate: testDate,
      description: "Transfer cash in vault to HDFC bank account",
    });

    // 2. Bank transferred to Cash: ₹2,000 (Received -> Bank Transfer Received)
    await recordInternalTransfer(adminUser, {
      organizationId: adminUser.organizationId,
      fromCashAccountId: bankAccount.id,
      toCashAccountId: cashAccount.id,
      amount: 2000,
      businessDate: testDate,
      description: "Withdraw cash from HDFC bank for vault",
    });

    const cashbook = await getCashbook(adminUser, {
      organizationId: adminUser.organizationId,
      cashAccountId: cashAccount.id,
      startDate: testDate,
      endDate: testDate,
    });

    const record = cashbook.dailyRecords[0];
    expect(Number(record.bankTransferReceived)).toBe(2000);
    expect(Number(record.bankTransferPayment)).toBe(5000);

    // Internal transfers must not be counted as income (Repayment/Advance/Misc) or expenses
    expect(Number(record.advance)).toBe(0);
    expect(Number(record.repayment)).toBe(0);
    expect(Number(record.expenses)).toBe(0);

    // Physical cash net movement for the day is -₹3,000 (+2000 - 5000)
    expect(Number(record.totalReceived)).toBe(2000);
    expect(Number(record.totalPayment)).toBe(5000);
    expect(Number(record.cashInHand)).toBe(Number(record.opening) - 3000);
  });

  // --------------------------------------------------------------------------
  // Test 4: Reversals and Cancelled Transactions
  // --------------------------------------------------------------------------
  it("Test 4: handles reversals cleanly without double counting or inflating categories", async () => {
    const testDate = "2026-11-26";

    // Post a ₹4,000 RD deposit on 2026-11-26
    const entry = await postJournalEntry(adminUser, {
      organizationId: adminUser.organizationId,
      businessDate: testDate,
      sourceModule: "TERM_DEPOSITS",
      sourceType: "RD_INSTALLMENT",
      description: "RD deposit to reverse",
      lines: [
        { accountId: cashAccount.chartOfAccountId, debit: 4000, credit: 0 },
        { accountId: coa["2002"], debit: 0, credit: 4000 },
      ],
    });

    // Immediately reverse the entry on the same business date
    await reverseJournalEntry(adminUser, {
      organizationId: adminUser.organizationId,
      journalEntryId: entry.id,
      businessDate: testDate,
      reversalReason: "Member cancelled RD deposit",
    });

    const cashbook = await getCashbook(adminUser, {
      organizationId: adminUser.organizationId,
      cashAccountId: cashAccount.id,
      startDate: testDate,
      endDate: testDate,
    });

    const record = cashbook.dailyRecords[0];
    // RD must remain 0 since both original and reversal occurred on this business date
    expect(Number(record.rd)).toBe(0);
  });

  // --------------------------------------------------------------------------
  // Test 5: Summary Row Aggregations (Section 6)
  // --------------------------------------------------------------------------
  it("Test 5: aggregates category totals without summing daily openings or cash-in-hands", async () => {
    const cashbook = await getCashbook(adminUser, {
      organizationId: adminUser.organizationId,
      cashAccountId: cashAccount.id,
      startDate: "2026-11-26",
      endDate: "2026-11-30",
    });

    const s = cashbook.summaryRow;
    const records = cashbook.dailyRecords;

    // Summary Opening must be the opening of the first date
    expect(s.opening).toBe(records[0].opening);

    // Summary Cash in Hand must be the cash in hand of the last date
    expect(s.cashInHand).toBe(records[records.length - 1].cashInHand);

    // Sum of each category
    const sumRepayment = records.reduce((sum, r) => sum + Number(r.repayment), 0);
    const sumExpenses = records.reduce((sum, r) => sum + Number(r.expenses), 0);
    const sumBankIn = records.reduce((sum, r) => sum + Number(r.bankTransferReceived), 0);
    const sumBankOut = records.reduce((sum, r) => sum + Number(r.bankTransferPayment), 0);
    const sumTotRec = records.reduce((sum, r) => sum + Number(r.totalReceived), 0);
    const sumTotPay = records.reduce((sum, r) => sum + Number(r.totalPayment), 0);

    expect(Number(s.repayment)).toBeCloseTo(sumRepayment, 2);
    expect(Number(s.expenses)).toBeCloseTo(sumExpenses, 2);
    expect(Number(s.bankTransferReceived)).toBeCloseTo(sumBankIn, 2);
    expect(Number(s.bankTransferPayment)).toBeCloseTo(sumBankOut, 2);
    expect(Number(s.totalReceived)).toBeCloseTo(sumTotRec, 2);
    expect(Number(s.totalPayment)).toBeCloseTo(sumTotPay, 2);

    // Period reconciliation: Opening + Total Received - Total Payment = Final Cash in Hand
    const expectedFinal = Number(s.opening) + Number(s.totalReceived) - Number(s.totalPayment);
    expect(Number(s.cashInHand)).toBeCloseTo(expectedFinal, 2);
  });

  // --------------------------------------------------------------------------
  // Test 6: Negative Cash In Hand Handling (Section 6)
  // --------------------------------------------------------------------------
  it("Test 6: flags negative cash in hand accurately without masking or zeroing deficits", async () => {
    const testDate = "2026-11-27";

    // Set opening balance to ₹500 on 2026-11-27
    await setInitialDailyOpeningBalance(adminUser, {
      organizationId: adminUser.organizationId,
      cashAccountId: cashAccount.id,
      businessDate: testDate,
      openingBalance: 500,
    });

    // Post ₹2,500 expense on 2026-11-27 (exceeding opening balance)
    await postJournalEntry(adminUser, {
      organizationId: adminUser.organizationId,
      businessDate: testDate,
      sourceModule: "EXPENSES",
      sourceType: "PETTY_CASH",
      description: "Emergency supplies overdrawing cash",
      lines: [
        { accountId: coa["5001"], debit: 2500, credit: 0 },
        { accountId: cashAccount.chartOfAccountId, debit: 0, credit: 2500 },
      ],
    });

    const cashbook = await getCashbook(adminUser, {
      organizationId: adminUser.organizationId,
      cashAccountId: cashAccount.id,
      startDate: testDate,
      endDate: testDate,
    });

    const row = cashbook.dailyRecords[0];
    expect(Number(row.opening)).toBe(500);
    expect(Number(row.totalPayment)).toBe(2500);
    expect(Number(row.cashInHand)).toBe(-2000);
    expect(row.isNegative).toBe(true);
    expect(cashbook.summaryRow.isNegative).toBe(true);
  });

  // --------------------------------------------------------------------------
  // Test 7: Full Parity and Reconciliation with Daily Sheet
  // --------------------------------------------------------------------------
  it("Test 7: verifies complete parity between Daily Sheet categories and Cashbook row", async () => {
    const testDate = "2026-11-28";

    const [dailySheet, cashbook] = await Promise.all([
      getDailySheet(adminUser, {
        organizationId: adminUser.organizationId,
        businessDate: testDate,
        cashAccountId: cashAccount.id,
      }),
      getCashbook(adminUser, {
        organizationId: adminUser.organizationId,
        cashAccountId: cashAccount.id,
        startDate: testDate,
        endDate: testDate,
      }),
    ]);

    const cashbookRow = cashbook.dailyRecords[0];

    // Received categories must match exactly
    expect(cashbookRow.opening).toBe(dailySheet.received.opening);
    expect(cashbookRow.advance).toBe(dailySheet.received.advance);
    expect(cashbookRow.repayment).toBe(dailySheet.received.repayment);
    expect(cashbookRow.rd).toBe(dailySheet.received.rd);
    expect(cashbookRow.fd).toBe(dailySheet.received.fd);
    expect(cashbookRow.bankTransferReceived).toBe(dailySheet.received.bankTransfer);
    expect(cashbookRow.loanReceived).toBe(dailySheet.received.loan);
    expect(cashbookRow.miscellaneousReceived).toBe(dailySheet.received.miscellaneous);
    expect(cashbookRow.totalReceived).toBe(dailySheet.received.totalReceived);

    // Payment categories must match exactly
    expect(cashbookRow.savingsWithdrawal).toBe(dailySheet.payment.savingsWithdrawal);
    expect(cashbookRow.bankTransferPayment).toBe(dailySheet.payment.bankTransfer);
    expect(cashbookRow.loanPayment).toBe(dailySheet.payment.loanPayment);
    expect(cashbookRow.expenses).toBe(dailySheet.payment.expenses);
    expect(cashbookRow.miscellaneousPayment).toBe(dailySheet.payment.miscellaneous);
    expect(cashbookRow.totalPayment).toBe(dailySheet.payment.totalPayment);

    // Closing cash / Cash in Hand must match exactly
    expect(cashbookRow.cashInHand).toBe(dailySheet.summary.closingCash);
  });

  // --------------------------------------------------------------------------
  // Test 8: Date Range Utilities and Earliest Date
  // --------------------------------------------------------------------------
  it("Test 8: generates date range cleanly and rejects inverted dates", async () => {
    const range = generateDateRange("2026-02-27", "2026-03-02");
    expect(range).toEqual(["2026-02-27", "2026-02-28", "2026-03-01", "2026-03-02"]);

    expect(() => generateDateRange("2026-11-30", "2026-11-01")).toThrowError(
      "Start date cannot be after end date."
    );

    const earliest = await getEarliestCashbookDate(adminUser, adminUser.organizationId);
    expect(earliest).toBeDefined();
    expect(/^\d{4}-\d{2}-\d{2}$/.test(earliest)).toBe(true);
  });
});
