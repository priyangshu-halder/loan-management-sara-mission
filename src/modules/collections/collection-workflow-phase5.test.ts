import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { login } from "@/modules/identity/auth-service";
import { createLoanApplication, submitLoanApplication, approveLoanApplication } from "@/modules/loans/loan-application-service";
import { createLoanDisbursement } from "@/modules/loans/loan-disbursement-service";
import {
  createCollectionReceipt,
  reverseCollectionReceipt,
  getCollectionReceipts,
  getCollectionReceiptById,
} from "./collection-receipt-service";
import {
  getOverdueQueue,
  createFollowUp,
  getFollowUps,
} from "./overdue-service";
import {
  generateCollectionSheet,
  getCollectionSheets,
  collectSheetItem,
  reconcileCollectionSheet,
} from "./collection-sheet-service";
import { ValidationError, ForbiddenError, ConflictError } from "@/lib/errors/app-error";
import bcrypt from "bcryptjs";

describe("Phase 5: Collections, Allocation, Overdue & Sheets Workflow", () => {
  let adminUser: Awaited<ReturnType<typeof login>>["user"];
  let checkerUser: Awaited<ReturnType<typeof login>>["user"];
  let customerId: string;
  let schemeId: string;
  let cashAccountId: string;
  let loanAccountId: string;
  const suffix = Date.now().toString().slice(-6);

  beforeAll(async () => {
    // 1. Admin Login
    const loginRes = await login({
      organizationCode: "RAYHAN-MFI",
      username: "admin",
      password: "Admin@12345",
    });
    adminUser = loginRes.user;

    // 2. Checker Officer
    const checkerPasswordHash = await bcrypt.hash("Checker@12345", 10);
    const checkerDbUser = await prisma.user.create({
      data: {
        organizationId: adminUser.organizationId,
        username: `coll_checker_${suffix}`,
        email: `coll_checker_${suffix}@rayhan-mfi.local`,
        fullName: "Collection Review Officer",
        passwordHash: checkerPasswordHash,
        status: "ACTIVE",
      },
    });

    const adminRole = await prisma.role.findFirstOrThrow({
      where: { organizationId: adminUser.organizationId, code: "ORG_ADMIN" },
    });

    await prisma.userRole.create({
      data: { userId: checkerDbUser.id, roleId: adminRole.id },
    });

    await prisma.userScope.create({
      data: { userId: checkerDbUser.id, scopeType: "ORGANIZATION" },
    });

    const checkerLogin = await login({
      organizationCode: "RAYHAN-MFI",
      username: `coll_checker_${suffix}`,
      password: "Checker@12345",
    });
    checkerUser = checkerLogin.user;

    // 3. Customer
    const group = (await prisma.group.findFirst({
      where: { organizationId: adminUser.organizationId },
    })) ?? (await prisma.group.create({
      data: {
        organizationId: adminUser.organizationId,
        code: `GRP-WF5-${suffix}`,
        name: `Workflow Phase 5 Group ${suffix}`,
        status: "ACTIVE",
      },
    }));

    const customer = await prisma.customer.create({
      data: {
        organizationId: adminUser.organizationId,
        groupId: group.id,
        customerCode: `COLL5-CUST-${suffix}`,
        fullName: "Ramesh Patel",
        phone: `+91-97777${suffix}`,
        email: `ramesh.${suffix}@example.com`,
        status: "ACTIVE",
      },
    });
    customerId = customer.id;

    // 4. Scheme
    const scheme = await prisma.loanScheme.create({
      data: {
        organizationId: adminUser.organizationId,
        code: `COLL5-SCHEME-${suffix}`,
        name: "Collection Test Scheme",
        status: "PUBLISHED",
        versions: {
          create: [
            {
              versionNumber: 1,
              minPrincipal: "10000.0000",
              maxPrincipal: "200000.0000",
              termMonths: 6,
              interestRate: "12.0000",
              interestMethod: "FLAT",
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
    schemeId = scheme.id;

    // 5. Cash Account
    const cashAccount = await prisma.cashAccount.findFirstOrThrow({
      where: { organizationId: adminUser.organizationId, code: "CASH-VAULT-01" },
    });
    cashAccountId = cashAccount.id;

    // 6. Application & Disbursement
    const app = await createLoanApplication(adminUser, {
      organizationId: adminUser.organizationId,
      customerId,
      schemeId,
      requestedPrincipal: "60000.0000",
      requestedTermMonths: 6,
      purpose: "Dairy cattle feed inventory",
      status: "DRAFT",
    });

    await submitLoanApplication(adminUser, {
      organizationId: adminUser.organizationId,
      applicationId: app.id,
      businessPurpose: "Purchase of bulk dairy cattle feed inventory",
    });

    await approveLoanApplication(checkerUser, {
      organizationId: adminUser.organizationId,
      applicationId: app.id,
      approvalReason: "Credit approved for dairy feed",
      enforceMakerChecker: true,
    });

    const disb = await createLoanDisbursement(adminUser, {
      organizationId: adminUser.organizationId,
      applicationId: app.id,
      cashAccountId,
      disbursementDate: "2026-10-10",
      amount: "60000.0000",
      sourceReference: `DISB-COLL-${suffix}`,
    });

    loanAccountId = disb.loanAccountId;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("posts daily collection receipt, allocates across installments, and produces balanced GL voucher", async () => {
    const cashBefore = await prisma.cashAccount.findUniqueOrThrow({
      where: { id: cashAccountId },
    });

    // Record collection repayment: 10,600 (Satisfies installment 1: Principal 10,000 + Interest 600)
    const receiptNumber = `RCPT-COLL-${suffix}-01`;
    const receiptResult = await createCollectionReceipt(adminUser, {
      organizationId: adminUser.organizationId,
      loanAccountId,
      cashAccountId,
      receiptNumber,
      businessDate: "2026-10-23",
      amount: "10600.0000",
      paymentMethod: "CASH",
      reference: "DAILY-COLLECTION-01",
    });

    expect(receiptResult.status).toBe("POSTED");
    expect(receiptResult.amount).toBe("10600.0000");

    // Verify loan account balance was reduced by principal component (10,000)
    const loanAccount = await prisma.loanAccount.findUniqueOrThrow({
      where: { id: loanAccountId },
      include: { installments: { orderBy: { installmentNumber: "asc" } } },
    });

    expect(Number(loanAccount.principalOutstanding).toFixed(4)).toBe("50000.0000");

    // Verify installment 1 is marked PAID
    const inst1 = loanAccount.installments[0];
    expect(inst1?.status).toBe("PAID");
    expect(Number(inst1?.principalPaid).toFixed(4)).toBe("10000.0000");
    expect(Number(inst1?.interestPaid).toFixed(4)).toBe("600.0000");

    // Verify Cash Account was incremented by 10,600 via General Ledger posting
    const cashAfter = await prisma.cashAccount.findUniqueOrThrow({
      where: { id: cashAccountId },
    });
    const cashDiff = Number(cashAfter.balance) - Number(cashBefore.balance);
    expect(cashDiff.toFixed(4)).toBe("10600.0000");

    // Verify General Ledger Journal Entry was posted and balances
    const journalEntry = await prisma.journalEntry.findUniqueOrThrow({
      where: { id: receiptResult.journalEntryId! },
      include: { lines: true },
    });

    expect(journalEntry.status).toBe("POSTED");
    expect(Number(journalEntry.totalDebit).toFixed(4)).toBe("10600.0000");
    expect(Number(journalEntry.totalCredit).toFixed(4)).toBe("10600.0000");
    expect(journalEntry.lines.length).toBe(3); // 1 Debit (Cash), 2 Credits (Principal 1201, Interest 4001)

    // Verify duplicate receipt number is rejected
    await expect(
      createCollectionReceipt(adminUser, {
        organizationId: adminUser.organizationId,
        loanAccountId,
        cashAccountId,
        receiptNumber,
        businessDate: "2026-10-23",
        amount: "10600.0000",
        paymentMethod: "CASH",
      })
    ).rejects.toThrow(ConflictError);
  });

  it("reverses collection receipt with compensating GL reversal and restores loan balance", async () => {
    // Record another receipt to reverse
    const receiptToReverse = await createCollectionReceipt(adminUser, {
      organizationId: adminUser.organizationId,
      loanAccountId,
      cashAccountId,
      receiptNumber: `RCPT-COLL-${suffix}-REV`,
      businessDate: "2026-10-23",
      amount: "5300.0000",
      paymentMethod: "CASH",
      reference: "WRONG-ENTRY",
    });

    const accountAfterReceipt = await prisma.loanAccount.findUniqueOrThrow({
      where: { id: loanAccountId },
    });
    // 5,300 paid allocates 600 to interest and 4,700 to principal -> 50,000 - 4,700 = 45,300
    expect(Number(accountAfterReceipt.principalOutstanding).toFixed(4)).toBe("45300.0000");

    // Reverse receipt
    const reversed = await reverseCollectionReceipt(adminUser, {
      organizationId: adminUser.organizationId,
      receiptId: receiptToReverse.id,
      reversalReason: "Customer payment bounced / cash entry error",
      businessDate: "2026-10-23",
    });

    expect(reversed.status).toBe("REVERSED");
    expect(reversed.isReversed).toBe(true);
    expect(reversed.reversalJournalEntryId).not.toBeNull();

    // Verify loan principal was restored back to 50,000
    const accountRestored = await prisma.loanAccount.findUniqueOrThrow({
      where: { id: loanAccountId },
    });
    expect(Number(accountRestored.principalOutstanding).toFixed(4)).toBe("50000.0000");

    // Verify cannot reverse twice
    await expect(
      reverseCollectionReceipt(adminUser, {
        organizationId: adminUser.organizationId,
        receiptId: receiptToReverse.id,
        reversalReason: "Second reversal attempt",
        businessDate: "2026-10-23",
      })
    ).rejects.toThrow(ValidationError);
  });

  it("calculates overdue queue with days past due and aging buckets", async () => {
    // Boundary check (CALC-02): Installment 2 is due on 2026-12-10. On 2026-12-10 it is current due, NOT overdue.
    const dueTodayResult = await getOverdueQueue(adminUser, {
      asOfDate: "2026-12-10",
    });
    expect(dueTodayResult.items.some((r) => r.loanAccountId === loanAccountId)).toBe(false);

    // On 2026-12-11, it is strictly 1 day past due
    const dayAfterResult = await getOverdueQueue(adminUser, {
      asOfDate: "2026-12-11",
    });
    const dayAfterLoan = dayAfterResult.items.find((r) => r.loanAccountId === loanAccountId);
    expect(dayAfterLoan).toBeDefined();
    expect(dayAfterLoan?.daysPastDue).toBe(1);
    expect(dayAfterLoan?.agingBucket).toBe("1-30");

    // Check overdue queue as of future date: 2026-12-15 (installment 2 is overdue by 5 days)
    const overdueResult = await getOverdueQueue(adminUser, {
      asOfDate: "2026-12-15",
    });

    expect(overdueResult.totalOverdueLoans).toBeGreaterThan(0);
    const targetOverdue = overdueResult.items.find((r) => r.loanAccountId === loanAccountId);
    expect(targetOverdue).toBeDefined();
    expect(targetOverdue?.daysPastDue).toBeGreaterThan(0);
    expect(Number(targetOverdue?.totalOverdue)).toBeGreaterThan(0);

    // Create a follow-up and promise-to-pay
    const followUp = await createFollowUp(adminUser, {
      organizationId: adminUser.organizationId,
      loanAccountId,
      status: "PROMISE_TO_PAY",
      promiseDate: "2026-12-20",
      promiseAmount: "10600.0000",
      notes: "Borrower visited; promised to pay next week upon selling harvest",
    });

    expect(followUp.status).toBe("PROMISE_TO_PAY");
    expect(followUp.promiseDate).not.toBeNull();

    // Query follow-ups
    const followUps = await getFollowUps(adminUser, { loanAccountId });
    expect(followUps.length).toBeGreaterThan(0);
    expect(followUps[0]?.customer.fullName).toBe("Ramesh Patel");
  });

  it("generates, collects from, and reconciles an agent collection sheet", async () => {
    // Generate collection sheet for future due date: 2026-12-15 (where installment 2 is due)
    const sheetResult = await generateCollectionSheet(adminUser, {
      organizationId: adminUser.organizationId,
      businessDate: "2026-12-15",
      notes: "Field Collection Route A",
    });

    expect(sheetResult.sheetNumber).toMatch(/^CS-/);
    expect(sheetResult.itemsCount).toBeGreaterThan(0);
    expect(sheetResult.status).toBe("DRAFT");

    // Fetch full sheet
    const sheet = await prisma.collectionSheet.findUniqueOrThrow({
      where: { id: sheetResult.id },
      include: { items: true },
    });

    const itemToCollect = sheet.items[0];
    expect(itemToCollect).toBeDefined();

    // Collect on the sheet
    const collectResult = await collectSheetItem(adminUser, {
      organizationId: adminUser.organizationId,
      sheetId: sheet.id,
      itemId: itemToCollect!.id,
      cashAccountId,
      paymentMethod: "CASH",
      amount: "5000.0000",
      reference: "FIELD-RECEIPT-01",
    });

    expect(collectResult.success).toBe(true);

    // Reconcile sheet
    const reconciled = await reconcileCollectionSheet(adminUser, {
      organizationId: adminUser.organizationId,
      sheetId: sheet.id,
      notes: "Verified against physical cash bag; reconciled with cashier",
    });

    expect(reconciled.status).toBe("RECONCILED");
    expect(reconciled.reconciledById).toBe(adminUser.userId);
  });
});
