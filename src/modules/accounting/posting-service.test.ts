import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { login } from "@/modules/identity/auth-service";
import { postJournalEntry, reverseJournalEntry } from "./posting-service";
import { getDaybook, getCashbook, getDailySheet, closeFiscalPeriod } from "./ledger-service";
import { InvariantViolationError, ValidationError, ForbiddenError } from "@/lib/errors/app-error";
import { AuthenticatedUser } from "@/lib/permissions/types";

describe("Accounting Foundation and Posting Engine", () => {
  let adminUser: AuthenticatedUser;
  let cashAccountId: string;
  let capitalAccountId: string;
  let expenseAccountId: string;
  let loanReceivableAccountId: string;
  let cashAccountRecordId: string;

  beforeAll(async () => {
    const loginRes = await login({
      organizationCode: "RAYHAN-MFI",
      username: "admin",
      password: "Admin@12345",
    });
    adminUser = loginRes.user;

    const [cashCoa, capitalCoa, expCoa, loanCoa, cashAcc] = await Promise.all([
      prisma.chartOfAccount.findUniqueOrThrow({
        where: { organizationId_code: { organizationId: adminUser.organizationId, code: "1001" } },
      }),
      prisma.chartOfAccount.findUniqueOrThrow({
        where: { organizationId_code: { organizationId: adminUser.organizationId, code: "3001" } },
      }),
      prisma.chartOfAccount.findUniqueOrThrow({
        where: { organizationId_code: { organizationId: adminUser.organizationId, code: "5001" } },
      }),
      prisma.chartOfAccount.findUniqueOrThrow({
        where: { organizationId_code: { organizationId: adminUser.organizationId, code: "1201" } },
      }),
      prisma.cashAccount.findFirstOrThrow({
        where: { organizationId: adminUser.organizationId, code: "CASH-VAULT-01" },
      }),
    ]);

    cashAccountId = cashCoa.id;
    capitalAccountId = capitalCoa.id;
    expenseAccountId = expCoa.id;
    loanReceivableAccountId = loanCoa.id;
    cashAccountRecordId = cashAcc.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe("Balanced Journal Invariant", () => {
    it("strictly rejects unbalanced journal entries (Debits != Credits)", async () => {
      await expect(
        postJournalEntry(adminUser, {
          organizationId: adminUser.organizationId,
          businessDate: "2026-10-22",
          sourceModule: "MANUAL",
          sourceType: "CAPITAL_INJECTION",
          description: "Unbalanced capital test",
          lines: [
            { accountId: cashAccountId, debit: "50000.0000", credit: "0" },
            { accountId: capitalAccountId, debit: "0", credit: "40000.0000" }, // 10,000 difference!
          ],
        })
      ).rejects.toThrow(InvariantViolationError);
    });

    it("rejects zero-amount postings and negative values", async () => {
      await expect(
        postJournalEntry(adminUser, {
          organizationId: adminUser.organizationId,
          businessDate: "2026-10-22",
          sourceModule: "MANUAL",
          sourceType: "ADJUSTMENT",
          description: "Zero amount test",
          lines: [
            { accountId: cashAccountId, debit: "0", credit: "0" },
            { accountId: capitalAccountId, debit: "0", credit: "0" },
          ],
        })
      ).rejects.toThrow(ValidationError);

      await expect(
        postJournalEntry(adminUser, {
          organizationId: adminUser.organizationId,
          businessDate: "2026-10-22",
          sourceModule: "MANUAL",
          sourceType: "ADJUSTMENT",
          description: "Negative amount test",
          lines: [
            { accountId: cashAccountId, debit: "-1000", credit: "0" },
            { accountId: capitalAccountId, debit: "0", credit: "-1000" },
          ],
        })
      ).rejects.toThrow(ValidationError);
    });

    it("successfully posts balanced journal entry and updates running balances atomically", async () => {
      const initialCash = await prisma.chartOfAccount.findUniqueOrThrow({ where: { id: cashAccountId } });
      const initialCapital = await prisma.chartOfAccount.findUniqueOrThrow({ where: { id: capitalAccountId } });

      const entry = await postJournalEntry(adminUser, {
        organizationId: adminUser.organizationId,
        businessDate: "2026-10-22",
        sourceModule: "MANUAL",
        sourceType: "CAPITAL_INJECTION",
        description: "Initial equity capital contribution to cash vault",
        lines: [
          { accountId: cashAccountId, debit: "100000.0000", credit: "0", narration: "Cash received" },
          { accountId: capitalAccountId, debit: "0", credit: "100000.0000", narration: "Equity allocated" },
        ],
      });

      expect(entry.entryNumber).toMatch(/^JNL-202610-\d{6}$/);
      expect(entry.status).toBe("POSTED");
      expect(entry.totalDebit.toString()).toBe("100000");
      expect(entry.totalCredit.toString()).toBe("100000");
      expect(entry.lines.length).toBe(2);

      // Verify balance projections updated
      const updatedCash = await prisma.chartOfAccount.findUniqueOrThrow({ where: { id: cashAccountId } });
      const updatedCapital = await prisma.chartOfAccount.findUniqueOrThrow({ where: { id: capitalAccountId } });

      // Asset increases with debit
      expect(parseFloat(updatedCash.balance.toString())).toBe(
        parseFloat(initialCash.balance.toString()) + 100000
      );
      // Equity increases with credit
      expect(parseFloat(updatedCapital.balance.toString())).toBe(
        parseFloat(initialCapital.balance.toString()) + 100000
      );
    });
  });

  describe("Idempotency Protection", () => {
    it("guarantees duplicate requests with same idempotency key do not duplicate postings or balance movements", async () => {
      const idempotencyKey = `idemp-test-${Date.now()}`;

      const initialCash = await prisma.chartOfAccount.findUniqueOrThrow({ where: { id: cashAccountId } });

      // First posting
      const firstEntry = await postJournalEntry(adminUser, {
        organizationId: adminUser.organizationId,
        businessDate: "2026-10-22",
        sourceModule: "EXPENSES",
        sourceType: "OFFICE_RENT",
        description: "Branch office rent payment",
        idempotencyKey,
        lines: [
          { accountId: expenseAccountId, debit: "5000.0000", credit: "0" },
          { accountId: cashAccountId, debit: "0", credit: "5000.0000" },
        ],
      });

      const cashAfterFirst = await prisma.chartOfAccount.findUniqueOrThrow({ where: { id: cashAccountId } });
      expect(parseFloat(cashAfterFirst.balance.toString())).toBe(
        parseFloat(initialCash.balance.toString()) - 5000
      );

      // Duplicate posting with identical idempotencyKey
      const secondEntry = await postJournalEntry(adminUser, {
        organizationId: adminUser.organizationId,
        businessDate: "2026-10-22",
        sourceModule: "EXPENSES",
        sourceType: "OFFICE_RENT",
        description: "Branch office rent payment",
        idempotencyKey,
        lines: [
          { accountId: expenseAccountId, debit: "5000.0000", credit: "0" },
          { accountId: cashAccountId, debit: "0", credit: "5000.0000" },
        ],
      });

      // Must return identical entry ID
      expect(secondEntry.id).toBe(firstEntry.id);

      // Cash balance must NOT be deducted twice!
      const cashAfterSecond = await prisma.chartOfAccount.findUniqueOrThrow({ where: { id: cashAccountId } });
      expect(parseFloat(cashAfterSecond.balance.toString())).toBe(
        parseFloat(cashAfterFirst.balance.toString())
      );
    });
  });

  describe("Reversal Flow", () => {
    it("reverses a posted journal entry, creating compensating lines and preserving immutable history", async () => {
      const initialCash = await prisma.chartOfAccount.findUniqueOrThrow({ where: { id: cashAccountId } });

      // 1. Post a test disbursement voucher
      const original = await postJournalEntry(adminUser, {
        organizationId: adminUser.organizationId,
        businessDate: "2026-10-22",
        sourceModule: "LOANS",
        sourceType: "DISBURSEMENT",
        description: "Erroneous loan disbursement requiring reversal",
        lines: [
          { accountId: loanReceivableAccountId, debit: "15000.0000", credit: "0" },
          { accountId: cashAccountId, debit: "0", credit: "15000.0000" },
        ],
      });

      const cashAfterPosting = await prisma.chartOfAccount.findUniqueOrThrow({ where: { id: cashAccountId } });
      expect(parseFloat(cashAfterPosting.balance.toString())).toBe(
        parseFloat(initialCash.balance.toString()) - 15000
      );

      // 2. Reverse the entry
      const reversal = await reverseJournalEntry(adminUser, {
        organizationId: adminUser.organizationId,
        journalEntryId: original.id,
        reversalReason: "Incorrect borrower disbursement payout method",
        businessDate: "2026-10-22",
      });

      expect(reversal.status).toBe("POSTED");
      expect(reversal.sourceType).toBe("REVERSAL");

      // Verify original entry marked REVERSED and linked
      const updatedOriginal = await prisma.journalEntry.findUniqueOrThrow({ where: { id: original.id } });
      expect(updatedOriginal.status).toBe("REVERSED");
      expect(updatedOriginal.reversalOfId).toBe(reversal.id);

      // Verify balance restored in reverse
      const cashAfterReversal = await prisma.chartOfAccount.findUniqueOrThrow({ where: { id: cashAccountId } });
      expect(parseFloat(cashAfterReversal.balance.toString())).toBe(
        parseFloat(initialCash.balance.toString())
      );

      // Verify audit trail logged
      const reversalAudit = await prisma.auditEvent.findFirst({
        where: {
          organizationId: adminUser.organizationId,
          action: "accounting.journal.reversed",
          entityId: original.id,
        },
      });
      expect(reversalAudit).not.toBeNull();
    });
  });

  describe("Ledger Reconciliation Reports", () => {
    it("verifies cashbook reconciliation invariant: Opening + Receipts - Payments = Closing", async () => {
      const cashbook = await getCashbook(adminUser, {
        organizationId: adminUser.organizationId,
        cashAccountId: cashAccountRecordId,
        startDate: "2026-10-01",
        endDate: "2026-10-31",
      });

      const opening = parseFloat(cashbook.openingBalance);
      const receipts = parseFloat(cashbook.totalReceipts);
      const payments = parseFloat(cashbook.totalPayments);
      const closing = parseFloat(cashbook.closingBalance);

      expect(Math.abs(opening + receipts - payments - closing)).toBeLessThan(0.0001);
      expect(cashbook.items.length).toBeGreaterThan(0);
    });

    it("verifies daily sheet reconciliation for business date", async () => {
      const sheet = await getDailySheet(adminUser, {
        organizationId: adminUser.organizationId,
        businessDate: "2026-10-22",
      });

      expect(sheet.reconciliation.isReconciled).toBe(true);
      expect(sheet.accountSummaries.length).toBeGreaterThan(0);
    });

    it("includes backdated postings in cashbook opening balance without date skew (FIN-03)", async () => {
      const cashAcc = await prisma.cashAccount.findUniqueOrThrow({ where: { id: cashAccountRecordId } });
      const equityAcc = await prisma.chartOfAccount.findUniqueOrThrow({
        where: { organizationId_code: { organizationId: adminUser.organizationId, code: "3001" } },
      });

      const cashbookBefore = await getCashbook(adminUser, {
        organizationId: adminUser.organizationId,
        cashAccountId: cashAccountRecordId,
        startDate: "2026-10-15",
        endDate: "2026-10-31",
      });
      const openingBefore = parseFloat(cashbookBefore.openingBalance);

      await postJournalEntry(adminUser, {
        organizationId: adminUser.organizationId,
        businessDate: "2026-10-10",
        sourceModule: "MANUAL",
        sourceType: "BACKDATED_TEST",
        description: "Backdated test entry for opening balance",
        lines: [
          {
            accountId: cashAcc.chartOfAccountId,
            debit: 750,
            credit: 0,
            narration: "Debit cash backdated",
          },
          {
            accountId: equityAcc.id,
            debit: 0,
            credit: 750,
            narration: "Credit retained earnings",
          },
        ],
      });

      const cashbookAfter = await getCashbook(adminUser, {
        organizationId: adminUser.organizationId,
        cashAccountId: cashAccountRecordId,
        startDate: "2026-10-15",
        endDate: "2026-10-31",
      });

      const openingAfter = parseFloat(cashbookAfter.openingBalance);
      expect(Math.abs(openingAfter - (openingBefore + 750))).toBeLessThan(0.0001);
    });

    it("verifies daybook totals match sum of debit and credit lines", async () => {
      const daybook = await getDaybook(adminUser, {
        organizationId: adminUser.organizationId,
        businessDate: "2026-10-22",
        page: 1,
        pageSize: 50,
      });

      expect(daybook.entries.length).toBeGreaterThan(0);
      expect(parseFloat(daybook.totals.totalDebit)).toBe(parseFloat(daybook.totals.totalCredit));
    });
  });

  describe("Fiscal Period Locking", () => {
    it("rejects postings to closed fiscal periods", async () => {
      // Create a temporary closed test period
      const closedPeriod = await prisma.fiscalPeriod.create({
        data: {
          organizationId: adminUser.organizationId,
          name: "FY2025-CLOSED-TEST",
          startDate: new Date("2025-01-01T00:00:00.000Z"),
          endDate: new Date("2025-01-31T23:59:59.999Z"),
          isClosed: true,
          closedAt: new Date(),
          closedById: adminUser.userId,
        },
      });

      await expect(
        postJournalEntry(adminUser, {
          organizationId: adminUser.organizationId,
          businessDate: "2025-01-15",
          sourceModule: "MANUAL",
          sourceType: "ADJUSTMENT",
          description: "Attempted posting to closed period",
          lines: [
            { accountId: cashAccountId, debit: "100.0000", credit: "0" },
            { accountId: capitalAccountId, debit: "0", credit: "100.0000" },
          ],
        })
      ).rejects.toThrow(ForbiddenError);

      // Clean up test period
      await prisma.fiscalPeriod.delete({ where: { id: closedPeriod.id } });
    });
  });
});

