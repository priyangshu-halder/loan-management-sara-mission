import { describe, it, expect, beforeAll } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { login } from "@/modules/identity/auth-service";
import { postJournalEntry, reverseJournalEntry } from "./posting-service";
import {
  getDailySheet,
  finalizeDailySheet,
  setInitialDailyOpeningBalance,
  recordInternalTransfer,
  getCashbook,
  getDaybook,
} from "./ledger-service";
import { AuthenticatedUser } from "@/lib/permissions/types";

describe("Redesigned Daily Sheet, Cashbook & Daybook Accounting Logic", () => {
  let adminUser: AuthenticatedUser;
  let cashAccount: { id: string; chartOfAccountId: string };
  let bankAccount: { id: string; chartOfAccountId: string };
  let coa: Record<string, string>;

  const TEST_DATES = [
    "2026-11-20",
    "2026-11-21",
    "2026-11-22",
    "2026-11-23",
    "2026-11-24",
    "2026-11-25",
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
      // Disconnect any reversalOf links to avoid foreign key cycle
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
  // Test A: Basic Daily Reconciliation
  // --------------------------------------------------------------------------
  it("Test A: Reconciles basic daily received, payment, and closing cash balance", async () => {
    const testDate = "2026-11-20";

    // 1. Establish initial opening balance of ₹10,000 for testDate
    await setInitialDailyOpeningBalance(adminUser, {
      organizationId: adminUser.organizationId,
      cashAccountId: cashAccount.id,
      businessDate: testDate,
      openingBalance: 10000,
      notes: "Test A opening balance setup",
    });

    // 2. Post Advance collection receipt: ₹2,000 (credit 2004 Advance Collections)
    await postJournalEntry(adminUser, {
      organizationId: adminUser.organizationId,
      businessDate: testDate,
      sourceModule: "COLLECTIONS",
      sourceType: "COLLECTION_RECEIPT",
      description: "Advance collection receipt",
      lines: [
        { accountId: cashAccount.chartOfAccountId, cashAccountId: cashAccount.id, debit: 2000, credit: 0 },
        { accountId: coa["2004"], debit: 0, credit: 2000, narration: "Advance payment" },
      ],
    });

    // 3. Post Repayment collection receipt: ₹5,000 (credit 1201 Loan Principal)
    await postJournalEntry(adminUser, {
      organizationId: adminUser.organizationId,
      businessDate: testDate,
      sourceModule: "COLLECTIONS",
      sourceType: "COLLECTION_RECEIPT",
      description: "Loan installment repayment",
      lines: [
        { accountId: cashAccount.chartOfAccountId, cashAccountId: cashAccount.id, debit: 5000, credit: 0 },
        { accountId: coa["1201"], debit: 0, credit: 5000, narration: "Installment repayment" },
      ],
    });

    // 4. Post RD deposit: ₹1,000 (credit 2002 RD Liability)
    await postJournalEntry(adminUser, {
      organizationId: adminUser.organizationId,
      businessDate: testDate,
      sourceModule: "TERM_DEPOSITS",
      sourceType: "RD_INSTALLMENT",
      description: "RD installment receipt",
      lines: [
        { accountId: cashAccount.chartOfAccountId, cashAccountId: cashAccount.id, debit: 1000, credit: 0 },
        { accountId: coa["2002"], debit: 0, credit: 1000, narration: "RD installment" },
      ],
    });

    // 5. Post FD deposit: ₹2,000 (credit 2003 FD Liability)
    await postJournalEntry(adminUser, {
      organizationId: adminUser.organizationId,
      businessDate: testDate,
      sourceModule: "TERM_DEPOSITS",
      sourceType: "FD_OPENING",
      description: "FD deposit opening",
      lines: [
        { accountId: cashAccount.chartOfAccountId, cashAccountId: cashAccount.id, debit: 2000, credit: 0 },
        { accountId: coa["2003"], debit: 0, credit: 2000, narration: "FD principal" },
      ],
    });

    // 6. Post Miscellaneous receipt: ₹500 (credit 3001 Capital or 4004 Misc income)
    await postJournalEntry(adminUser, {
      organizationId: adminUser.organizationId,
      businessDate: testDate,
      sourceModule: "MANUAL",
      sourceType: "ADJUSTMENT",
      description: "Miscellaneous receipt voucher",
      lines: [
        { accountId: cashAccount.chartOfAccountId, cashAccountId: cashAccount.id, debit: 500, credit: 0 },
        { accountId: coa["3001"], debit: 0, credit: 500, narration: "Member capital contribution" },
      ],
    });

    // 7. Post Savings withdrawal: ₹1,500 (debit 2001 Member Savings)
    await postJournalEntry(adminUser, {
      organizationId: adminUser.organizationId,
      businessDate: testDate,
      sourceModule: "SAVINGS",
      sourceType: "SAVINGS_WITHDRAWAL",
      description: "Member savings withdrawal",
      lines: [
        { accountId: coa["2001"], debit: 1500, credit: 0, narration: "Savings withdrawal" },
        { accountId: cashAccount.chartOfAccountId, cashAccountId: cashAccount.id, debit: 0, credit: 1500 },
      ],
    });

    // 8. Post Expense payment: ₹1,000 (debit 5001 Office Rent)
    await postJournalEntry(adminUser, {
      organizationId: adminUser.organizationId,
      businessDate: testDate,
      sourceModule: "EXPENSES",
      sourceType: "EXPENSE_PAYMENT",
      description: "Branch office rent payment",
      lines: [
        { accountId: coa["5001"], debit: 1000, credit: 0, narration: "Office rent" },
        { accountId: cashAccount.chartOfAccountId, cashAccountId: cashAccount.id, debit: 0, credit: 1000 },
      ],
    });

    // 9. Fetch Daily Sheet
    const sheet = await getDailySheet(adminUser, {
      organizationId: adminUser.organizationId,
      businessDate: testDate,
      cashAccountId: cashAccount.id,
    });

    // Assertions matching Test A specifications:
    expect(Number(sheet.received.opening)).toBe(10000);
    expect(Number(sheet.received.advance)).toBe(2000);
    expect(Number(sheet.received.repayment)).toBe(5000);
    expect(Number(sheet.received.rd)).toBe(1000);
    expect(Number(sheet.received.fd)).toBe(2000);
    expect(Number(sheet.received.miscellaneous)).toBe(500);
    expect(Number(sheet.received.totalReceived)).toBe(10500); // 2000 + 5000 + 1000 + 2000 + 500

    expect(Number(sheet.payment.savingsWithdrawal)).toBe(1500);
    expect(Number(sheet.payment.expenses)).toBe(1000);
    expect(Number(sheet.payment.totalPayment)).toBe(2500); // 1500 + 1000

    // Closing Cash = Opening + Received - Payment = 10000 + 10500 - 2500 = 18000
    expect(Number(sheet.summary.openingCash)).toBe(10000);
    expect(Number(sheet.summary.totalReceived)).toBe(10500);
    expect(Number(sheet.summary.totalPayment)).toBe(2500);
    expect(Number(sheet.summary.closingCash)).toBe(18000);
    expect(sheet.summary.isNegative).toBe(false);
  });

  // --------------------------------------------------------------------------
  // Test B: Next-Day Opening Carry-Forward
  // --------------------------------------------------------------------------
  it("Test B: Automatically carries forward previous day's finalized closing as next day's opening", async () => {
    const day1Date = "2026-11-20";
    const day2Date = "2026-11-21";

    // Finalize Day 1 (closing: ₹18,000)
    await finalizeDailySheet(adminUser, {
      organizationId: adminUser.organizationId,
      cashAccountId: cashAccount.id,
      businessDate: day1Date,
      notes: "Day 1 finalized closing",
    });

    // Next day receipts: ₹4,000 (Repayment)
    await postJournalEntry(adminUser, {
      organizationId: adminUser.organizationId,
      businessDate: day2Date,
      sourceModule: "COLLECTIONS",
      sourceType: "COLLECTION_RECEIPT",
      description: "Day 2 loan repayment receipt",
      lines: [
        { accountId: cashAccount.chartOfAccountId, cashAccountId: cashAccount.id, debit: 4000, credit: 0 },
        { accountId: coa["1201"], debit: 0, credit: 4000, narration: "Installment" },
      ],
    });

    // Next day payments: ₹2,000 (Loan disbursement payment)
    await postJournalEntry(adminUser, {
      organizationId: adminUser.organizationId,
      businessDate: day2Date,
      sourceModule: "LOANS",
      sourceType: "LOAN_DISBURSEMENT",
      description: "Day 2 loan disbursement payment",
      lines: [
        { accountId: coa["1201"], debit: 2000, credit: 0, narration: "Disbursed principal" },
        { accountId: cashAccount.chartOfAccountId, cashAccountId: cashAccount.id, debit: 0, credit: 2000 },
      ],
    });

    // Fetch Day 2 Daily Sheet
    const day2Sheet = await getDailySheet(adminUser, {
      organizationId: adminUser.organizationId,
      businessDate: day2Date,
      cashAccountId: cashAccount.id,
    });

    // Assertions matching Test B specifications:
    expect(Number(day2Sheet.summary.openingCash)).toBe(18000);
    expect(Number(day2Sheet.received.opening)).toBe(18000);
    expect(Number(day2Sheet.summary.totalReceived)).toBe(4000);
    expect(Number(day2Sheet.summary.totalPayment)).toBe(2000);
    expect(Number(day2Sheet.summary.closingCash)).toBe(20000); // 18000 + 4000 - 2000 = 20000
    expect(day2Sheet.status.previousDayStatus).toBe("FINALIZED");
  });

  // --------------------------------------------------------------------------
  // Test C: No Transactions
  // --------------------------------------------------------------------------
  it("Test C: Handles day with no receipts or payments, maintaining exact opening as closing", async () => {
    const testDate = "2026-11-22";

    // Set opening ₹5,000
    await setInitialDailyOpeningBalance(adminUser, {
      organizationId: adminUser.organizationId,
      cashAccountId: cashAccount.id,
      businessDate: testDate,
      openingBalance: 5000,
      notes: "Test C idle day opening",
    });

    const sheet = await getDailySheet(adminUser, {
      organizationId: adminUser.organizationId,
      businessDate: testDate,
      cashAccountId: cashAccount.id,
    });

    expect(Number(sheet.summary.openingCash)).toBe(5000);
    expect(Number(sheet.summary.totalReceived)).toBe(0);
    expect(Number(sheet.summary.totalPayment)).toBe(0);
    expect(Number(sheet.summary.closingCash)).toBe(5000);
    expect(sheet.summary.isNegative).toBe(false);
  });

  // --------------------------------------------------------------------------
  // Test D: Negative Balance & Discrepancy Warning
  // --------------------------------------------------------------------------
  it("Test D: Accurately computes negative closing cash and renders discrepancy alert without zeroing", async () => {
    const testDate = "2026-11-23";

    // Opening ₹1,000
    await setInitialDailyOpeningBalance(adminUser, {
      organizationId: adminUser.organizationId,
      cashAccountId: cashAccount.id,
      businessDate: testDate,
      openingBalance: 1000,
    });

    // Receipts: ₹500
    await postJournalEntry(adminUser, {
      organizationId: adminUser.organizationId,
      businessDate: testDate,
      sourceModule: "COLLECTIONS",
      sourceType: "COLLECTION_RECEIPT",
      description: "Day collections",
      lines: [
        { accountId: cashAccount.chartOfAccountId, cashAccountId: cashAccount.id, debit: 500, credit: 0 },
        { accountId: coa["1201"], debit: 0, credit: 500 },
      ],
    });

    // Payments: ₹2,000
    await postJournalEntry(adminUser, {
      organizationId: adminUser.organizationId,
      businessDate: testDate,
      sourceModule: "EXPENSES",
      sourceType: "EXPENSE_PAYMENT",
      description: "Operating expense",
      lines: [
        { accountId: coa["5001"], debit: 2000, credit: 0 },
        { accountId: cashAccount.chartOfAccountId, cashAccountId: cashAccount.id, debit: 0, credit: 2000 },
      ],
    });

    const sheet = await getDailySheet(adminUser, {
      organizationId: adminUser.organizationId,
      businessDate: testDate,
      cashAccountId: cashAccount.id,
    });

    expect(Number(sheet.summary.openingCash)).toBe(1000);
    expect(Number(sheet.summary.totalReceived)).toBe(500);
    expect(Number(sheet.summary.totalPayment)).toBe(2000);
    expect(Number(sheet.summary.closingCash)).toBe(-500);
    expect(sheet.summary.isNegative).toBe(true);
    expect(sheet.summary.discrepancyMessage).toContain("negative");
  });

  // --------------------------------------------------------------------------
  // Test E: Bank Transfer Treatment
  // --------------------------------------------------------------------------
  it("Test E: Accurately classifies internal transfers without inflating income, expense, or consolidated cash", async () => {
    const testDate = "2026-11-24";

    await setInitialDailyOpeningBalance(adminUser, {
      organizationId: adminUser.organizationId,
      cashAccountId: cashAccount.id,
      businessDate: testDate,
      openingBalance: 10000,
    });

    // 1. Transfer ₹3,000 from Cash Vault to Bank Account
    await recordInternalTransfer(adminUser, {
      organizationId: adminUser.organizationId,
      fromCashAccountId: cashAccount.id,
      toCashAccountId: bankAccount.id,
      amount: 3000,
      businessDate: testDate,
      description: "Cash deposit to HDFC bank",
    });

    // Inspect Cash Sheet
    const cashSheet = await getDailySheet(adminUser, {
      organizationId: adminUser.organizationId,
      businessDate: testDate,
      cashAccountId: cashAccount.id,
    });

    // Cash has an outflow of ₹3,000 under Bank Transfer payment
    expect(Number(cashSheet.payment.bankTransfer)).toBe(3000);
    expect(Number(cashSheet.summary.closingCash)).toBe(7000); // 10000 - 3000 = 7000

    // Inspect Bank Sheet
    const bankSheet = await getDailySheet(adminUser, {
      organizationId: adminUser.organizationId,
      businessDate: testDate,
      cashAccountId: bankAccount.id,
    });

    // Bank has an inflow of ₹3,000 under Bank Transfer received
    expect(Number(bankSheet.received.bankTransfer)).toBe(3000);

    // 2. Transfer ₹1,000 back from Bank to Cash Vault
    await recordInternalTransfer(adminUser, {
      organizationId: adminUser.organizationId,
      fromCashAccountId: bankAccount.id,
      toCashAccountId: cashAccount.id,
      amount: 1000,
      businessDate: testDate,
      description: "Cash withdrawal from HDFC bank",
    });

    const updatedCashSheet = await getDailySheet(adminUser, {
      organizationId: adminUser.organizationId,
      businessDate: testDate,
      cashAccountId: cashAccount.id,
    });

    // Cash received bankTransfer: ₹1,000, Payment bankTransfer: ₹3,000
    expect(Number(updatedCashSheet.received.bankTransfer)).toBe(1000);
    expect(Number(updatedCashSheet.payment.bankTransfer)).toBe(3000);
    // Closing cash = 10000 + 1000 - 3000 = 8000
    expect(Number(updatedCashSheet.summary.closingCash)).toBe(8000);
  });

  // --------------------------------------------------------------------------
  // Test F: Transaction Integrity & Reversal Protection
  // --------------------------------------------------------------------------
  it("Test F: Reversals correctly negate cancelled transactions without double counting or inflating categories", async () => {
    const testDate = "2026-11-25";

    await setInitialDailyOpeningBalance(adminUser, {
      organizationId: adminUser.organizationId,
      cashAccountId: cashAccount.id,
      businessDate: testDate,
      openingBalance: 5000,
    });

    // Post repayment of ₹3,000
    const originalEntry = await postJournalEntry(adminUser, {
      organizationId: adminUser.organizationId,
      businessDate: testDate,
      sourceModule: "COLLECTIONS",
      sourceType: "COLLECTION_RECEIPT",
      description: "Mistaken collection receipt",
      lines: [
        { accountId: cashAccount.chartOfAccountId, cashAccountId: cashAccount.id, debit: 3000, credit: 0 },
        { accountId: coa["1201"], debit: 0, credit: 3000 },
      ],
    });

    // Reverse the repayment on same day
    await reverseJournalEntry(adminUser, {
      organizationId: adminUser.organizationId,
      journalEntryId: originalEntry.id,
      reversalReason: "Wrong borrower selected",
      businessDate: testDate,
    });

    // Post genuine repayment of ₹2,000
    await postJournalEntry(adminUser, {
      organizationId: adminUser.organizationId,
      businessDate: testDate,
      sourceModule: "COLLECTIONS",
      sourceType: "COLLECTION_RECEIPT",
      description: "Valid repayment receipt",
      lines: [
        { accountId: cashAccount.chartOfAccountId, cashAccountId: cashAccount.id, debit: 2000, credit: 0 },
        { accountId: coa["1201"], debit: 0, credit: 2000 },
      ],
    });

    const sheet = await getDailySheet(adminUser, {
      organizationId: adminUser.organizationId,
      businessDate: testDate,
      cashAccountId: cashAccount.id,
    });

    // The reversed ₹3,000 must NOT inflate receipts or payments
    expect(Number(sheet.received.repayment)).toBe(2000);
    expect(Number(sheet.received.totalReceived)).toBe(2000);
    expect(Number(sheet.payment.totalPayment)).toBe(0);
    expect(Number(sheet.summary.closingCash)).toBe(7000); // 5000 + 2000 = 7000

    // Reconcile with Cashbook net activity for the day
    const cashbook = await getCashbook(adminUser, {
      organizationId: adminUser.organizationId,
      cashAccountId: cashAccount.id,
      startDate: testDate,
      endDate: testDate,
    });

    const netCashbookMovement = Number(cashbook.totalReceipts) - Number(cashbook.totalPayments);
    const netDailySheetMovement = Number(sheet.summary.totalReceived) - Number(sheet.summary.totalPayment);
    expect(netCashbookMovement).toBe(netDailySheetMovement);

    const daybook = await getDaybook(adminUser, {
      organizationId: adminUser.organizationId,
      businessDate: testDate,
    });

    expect(daybook.entries.length).toBeGreaterThanOrEqual(2);
  });
});
