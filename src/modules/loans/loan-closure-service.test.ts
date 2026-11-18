import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { login } from "@/modules/identity/auth-service";
import {
  generateSettlementQuote,
  postLoanClosure,
  reopenLoanClosure,
  getLoanClosureCertificate,
} from "./loan-closure-service";
import { ValidationError } from "@/lib/errors/app-error";

describe("Loan closure", () => {
  let adminUser: Awaited<ReturnType<typeof login>>["user"];
  let loanAccountId: string;
  let advancedLoanAccountId: string;
  let cashAccountId: string;

  beforeAll(async () => {
    const loginRes = await login({
      organizationCode: "RAYHAN-MFI",
      username: "admin",
      password: "Admin@12345",
    });
    adminUser = loginRes.user;

    const cashAccount = await prisma.cashAccount.findFirst({
      where: { organizationId: adminUser.organizationId, isActive: true },
    });
    cashAccountId = cashAccount!.id;

    const group = (await prisma.group.findFirst({
      where: { organizationId: adminUser.organizationId },
    })) ?? (await prisma.group.create({
      data: {
        organizationId: adminUser.organizationId,
        code: `GRP-CLS-${Date.now().toString().slice(-6)}`,
        name: "Closure Test Group",
        status: "ACTIVE",
      },
    }));

    const customer = await prisma.customer.create({
      data: {
        organizationId: adminUser.organizationId,
        groupId: group.id,
        customerCode: `CLOSURE-CUST-${Date.now().toString().slice(-6)}`,
        fullName: "Closure Customer",
        phone: `+91-${Date.now().toString().slice(-9)}`,
        email: `closure.${Date.now().toString().slice(-6)}@example.com`,
        status: "ACTIVE",
      },
    });

    const scheme = await prisma.loanScheme.create({
      data: {
        organizationId: adminUser.organizationId,
        code: `CLOSURE-SCHEME-${Date.now().toString().slice(-6)}`,
        name: "Closure Scheme",
        status: "PUBLISHED",
        versions: {
          create: [
            {
              versionNumber: 1,
              minPrincipal: "5000.0000",
              maxPrincipal: "200000.0000",
              termMonths: 12,
              interestRate: "12.0000",
              interestMethod: "REDUCING_BALANCE",
              repaymentFrequency: "MONTHLY",
              gracePeriodDays: 0,
              status: "PUBLISHED",
              isPublished: true,
              effectiveDate: new Date("2026-10-01T00:00:00.000Z"),
            },
          ],
        },
      },
      include: { versions: true },
    });

    const application = await prisma.loanApplication.create({
      data: {
        organizationId: adminUser.organizationId,
        customerId: customer.id,
        schemeId: scheme.id,
        requestedPrincipal: "100000.0000",
        requestedTermMonths: 12,
        purpose: "Closure test case",
        status: "APPROVED",
        approvalReason: "Approved for closure test",
        approvedAt: new Date(),
        approvedById: adminUser.userId,
      },
    });

    const account = await prisma.loanAccount.create({
      data: {
        organizationId: adminUser.organizationId,
        customerId: customer.id,
        schemeId: scheme.id,
        loanAccountNumber: `CLOSE-LA-${Date.now().toString().slice(-8)}`,
        principalDisbursed: "100000.0000",
        principalOutstanding: "100000.0000",
        status: "ACTIVE",
        nextDueDate: new Date("2026-10-15T00:00:00.000Z"),
      },
    });
    loanAccountId = account.id;

    await prisma.loanDisbursement.create({
      data: {
        organizationId: adminUser.organizationId,
        applicationId: application.id,
        loanAccountId: account.id,
        amount: "100000.0000",
        disbursementDate: new Date("2026-10-01T00:00:00.000Z"),
        sourceReference: "CLOSE-DISB",
        status: "POSTED",
      },
    });

    // Create a second loan account with installments to test full settlement quote and GL posting
    const advAccount = await prisma.loanAccount.create({
      data: {
        organizationId: adminUser.organizationId,
        customerId: customer.id,
        schemeId: scheme.id,
        loanAccountNumber: `ADV-CLOSE-LA-${Date.now().toString().slice(-8)}`,
        principalDisbursed: "50000.0000",
        principalOutstanding: "50000.0000",
        status: "ACTIVE",
        nextDueDate: new Date("2026-10-10T00:00:00.000Z"),
        installments: {
          create: [
            {
              organizationId: adminUser.organizationId,
              installmentNumber: 1,
              dueDate: new Date("2026-10-10T00:00:00.000Z"),
              principalDue: "25000.0000",
              interestDue: "500.0000",
              feeDue: "100.0000",
              penaltyDue: "50.0000",
              totalDue: "25650.0000",
              principalPaid: "0.0000",
              interestPaid: "0.0000",
              feePaid: "0.0000",
              penaltyPaid: "0.0000",
              totalPaid: "0.0000",
              status: "PENDING",
            },
            {
              organizationId: adminUser.organizationId,
              installmentNumber: 2,
              dueDate: new Date("2026-11-10T00:00:00.000Z"),
              principalDue: "25000.0000",
              interestDue: "400.0000",
              feeDue: "0.0000",
              penaltyDue: "0.0000",
              totalDue: "25400.0000",
              principalPaid: "0.0000",
              interestPaid: "0.0000",
              feePaid: "0.0000",
              penaltyPaid: "0.0000",
              totalPaid: "0.0000",
              status: "PENDING",
            },
          ],
        },
      },
    });
    advancedLoanAccountId = advAccount.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("creates a settlement quote and closes the account once the residual is settled", async () => {
    const quote = await generateSettlementQuote(adminUser, {
      organizationId: adminUser.organizationId,
      loanAccountId,
      asOfDate: "2026-10-12",
    });

    expect(quote.principalOutstanding.toString()).toBe("100000.0000");
    expect(quote.totalSettlement.toString()).toBe("100000.0000");

    const closure = await postLoanClosure(adminUser, {
      organizationId: adminUser.organizationId,
      loanAccountId,
      asOfDate: "2026-10-12",
      accruedInterest: "0.0000",
      feeAmount: "0.0000",
      penaltyAmount: "0.0000",
      waiverAmount: "0.0000",
      reason: "Customer settled full outstanding balance",
    });

    expect(closure.status).toBe("POSTED");
    expect(closure.totalSettlement).toBe("100000.0000");

    const account = await prisma.loanAccount.findUnique({ where: { id: loanAccountId } });
    expect(account?.status).toBe("CLOSED");
    expect(account?.principalOutstanding).toBe("0.0000");
  });

  it("rejects closure when the account is already closed or the settlement total is invalid", async () => {
    await expect(
      postLoanClosure(adminUser, {
        organizationId: adminUser.organizationId,
        loanAccountId,
        asOfDate: "2026-10-13",
        accruedInterest: "0.0000",
        feeAmount: "0.0000",
        penaltyAmount: "0.0000",
        waiverAmount: "0.0000",
        reason: "Second closure attempt",
      })
    ).rejects.toThrow(ValidationError);
  });

  it("generates a multi-component settlement quote calculating accrued interest and fees up to asOfDate", async () => {
    const quote = await generateSettlementQuote(adminUser, {
      organizationId: adminUser.organizationId,
      loanAccountId: advancedLoanAccountId,
      asOfDate: "2026-10-15", // After installment 1 (due 10-10) but before installment 2 (due 11-10)
    });

    expect(quote.principalOutstanding).toBe("50000.0000");
    expect(quote.accruedInterest).toBe("500.0000"); // installment 1 interest accrued
    expect(quote.futureInterest).toBe("400.0000");  // installment 2 interest future
    expect(quote.feeAmount).toBe("100.0000");
    expect(quote.penaltyAmount).toBe("50.0000");
    expect(quote.grossSettlement).toBe("50650.0000");
  });

  it("rejects closure when residual balance remains without an authorized waiver", async () => {
    await expect(
      postLoanClosure(adminUser, {
        organizationId: adminUser.organizationId,
        loanAccountId: advancedLoanAccountId,
        asOfDate: "2026-10-15",
        settlementPaymentAmount: "30000.0000", // Less than gross settlement (50650)
        waiverAmount: "0.0000",
        reason: "Underpaid settlement attempt",
      })
    ).rejects.toThrow(ValidationError);
  });

  it("atomically closes the loan with payment and waiver, posts balanced GL entries, and updates installments to PAID", async () => {
    const closure = await postLoanClosure(adminUser, {
      organizationId: adminUser.organizationId,
      loanAccountId: advancedLoanAccountId,
      asOfDate: "2026-10-15",
      cashAccountId,
      paymentMethod: "CASH",
      settlementPaymentAmount: "50550.0000", // 50,650 - 100 waiver
      waiverAmount: "100.0000",
      waiverReason: "Staff authorized fee discount waiver",
      reason: "Full payoff settlement with approved discount",
      idempotencyKey: `LC-IDEM-${Date.now()}`,
    });

    expect(closure.status).toBe("POSTED");
    expect(closure.closureNumber).toMatch(/^LC-20261015-\d{4}$/);
    expect(closure.journalEntryId).not.toBeNull();

    // Verify loan account updated
    const closedAccount = await prisma.loanAccount.findUnique({
      where: { id: advancedLoanAccountId },
      include: { installments: true },
    });
    expect(closedAccount?.status).toBe("CLOSED");
    expect(closedAccount?.principalOutstanding).toBe("0.0000");
    expect(closedAccount?.nextDueDate).toBeNull();

    // Verify installments marked PAID
    for (const inst of closedAccount!.installments) {
      expect(inst.status).toBe("PAID");
    }

    // Verify balanced GL journal entry was posted
    const journal = await prisma.journalEntry.findUnique({
      where: { id: closure.journalEntryId! },
      include: { lines: true },
    });
    expect(journal).not.toBeNull();
    expect(journal?.status).toBe("POSTED");

    // Debits: 50,550 Cash + 100 Waiver = 50,650
    // Credits: 50,000 Principal + 500 Interest + 100 Fee + 50 Penalty = 50,650
    const totalDebits = journal!.lines.reduce((sum, l) => sum + Number(l.debit), 0);
    const totalCredits = journal!.lines.reduce((sum, l) => sum + Number(l.credit), 0);
    expect(totalDebits).toBeCloseTo(50650, 2);
    expect(totalCredits).toBeCloseTo(50650, 2);
    expect(totalDebits).toEqual(totalCredits);

    // Verify closure certificate generation
    const cert = await getLoanClosureCertificate(adminUser, advancedLoanAccountId);
    expect(cert.certificateNumber).toBe(closure.closureNumber);
    expect(cert.customer.fullName).toBe("Closure Customer");
    expect(cert.declarationText).toContain("NIL ($0.00)");
  });

  it("supports controlled reopening of a closed loan with GL reversal and principal restoration", async () => {
    const activeClosure = await prisma.loanClosure.findFirst({
      where: {
        organizationId: adminUser.organizationId,
        loanAccountId: advancedLoanAccountId,
        status: "POSTED",
      },
    });

    expect(activeClosure).not.toBeNull();

    const reopenedClosure = await reopenLoanClosure(adminUser, {
      organizationId: adminUser.organizationId,
      closureId: activeClosure!.id,
      reason: "Borrower cheque bounced / correction requested by branch manager",
    });

    expect(reopenedClosure.status).toBe("REOPENED");
    expect(reopenedClosure.isReopened).toBe(true);
    expect(reopenedClosure.reopenJournalEntryId).not.toBeNull();

    // Verify loan account reinstated to ACTIVE
    const reinstatedAccount = await prisma.loanAccount.findUnique({
      where: { id: advancedLoanAccountId },
    });
    expect(reinstatedAccount?.status).toBe("ACTIVE");
    expect(Number(reinstatedAccount?.principalOutstanding)).toBeGreaterThan(0);

    // Verify compensating reversal journal was created
    const reversalJournal = await prisma.journalEntry.findUnique({
      where: { id: reopenedClosure.reopenJournalEntryId! },
    });
    expect(reversalJournal?.status).toBe("POSTED");
    expect(reversalJournal?.sourceType).toBe("REVERSAL");
  });
});
