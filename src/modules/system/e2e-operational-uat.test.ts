import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { login } from "@/modules/identity/auth-service";
import { createCustomer } from "@/modules/customers/customer-service";
import { createLoanScheme } from "@/modules/loans/loan-scheme-service";
import {
  createLoanApplication,
  submitLoanApplication,
  approveLoanApplication,
} from "@/modules/loans/loan-application-service";
import { createLoanDisbursement } from "@/modules/loans/loan-disbursement-service";
import { createCollectionReceipt } from "@/modules/collections/collection-receipt-service";
import { openSavingsAccount, depositToSavingsAccount } from "@/modules/savings/savings-service";
import {
  createDepositProduct,
  openTermDepositAccount,
  postTermDepositInterest,
} from "@/modules/term-deposits/term-deposit-service";
import { createExpense, submitExpense, approveExpense, postExpensePayment } from "@/modules/expenses/expense-service";
import { generateSettlementQuote, postLoanClosure } from "@/modules/loans/loan-closure-service";
import { getDaybook, getDailySheet } from "@/modules/accounting/ledger-service";
import {
  getPortfolioDashboard,
  getFinancialStatementsReport,
  exportReportCsv,
} from "@/modules/reports/report-service";
import { AuthenticatedUser } from "@/lib/permissions/types";
import { Money } from "@/lib/money/money";
import bcrypt from "bcryptjs";

describe("Phase 10: End-to-End Operational Lifecycle & UAT Integration Suite", () => {
  let adminUser: AuthenticatedUser;
  let creditOfficer: AuthenticatedUser;
  let branchManager: AuthenticatedUser;
  let fieldCollector: AuthenticatedUser;
  let accountant: AuthenticatedUser;

  let testCustomer: any;
  let testScheme: any;
  let testApplication: any;
  let testLoanAccount: any;
  let testCashAccount: any;
  let testSavingsAccount: any;
  let testFdProduct: any;
  let testFdAccount: any;

  beforeAll(async () => {
    const loginRes = await login({
      organizationCode: "RAYHAN-MFI",
      username: "admin",
      password: "Admin@12345",
    });
    adminUser = loginRes.user;

    const dummyHash = await bcrypt.hash("Staff@12345", 8);
    const suffix = Date.now().toString().slice(-6);

    // Create real DB user records for each staff persona to satisfy foreign keys in audit trail
    const officerDb = await prisma.user.create({
      data: {
        organizationId: adminUser.organizationId,
        username: `officer_${suffix}`,
        email: `officer_${suffix}@example.com`,
        fullName: "Rohit Sharma (Credit Officer)",
        passwordHash: dummyHash,
        status: "ACTIVE",
      },
    });

    const managerDb = await prisma.user.create({
      data: {
        organizationId: adminUser.organizationId,
        username: `manager_${suffix}`,
        email: `manager_${suffix}@example.com`,
        fullName: "Priya Patel (Branch Manager)",
        passwordHash: dummyHash,
        status: "ACTIVE",
      },
    });

    const collectorDb = await prisma.user.create({
      data: {
        organizationId: adminUser.organizationId,
        username: `collector_${suffix}`,
        email: `collector_${suffix}@example.com`,
        fullName: "Amit Kumar (Field Collector)",
        passwordHash: dummyHash,
        status: "ACTIVE",
      },
    });

    const accountantDb = await prisma.user.create({
      data: {
        organizationId: adminUser.organizationId,
        username: `accountant_${suffix}`,
        email: `accountant_${suffix}@example.com`,
        fullName: "Neha Gupta (Chief Accountant)",
        passwordHash: dummyHash,
        status: "ACTIVE",
      },
    });

    creditOfficer = {
      ...adminUser,
      userId: officerDb.id,
      username: officerDb.username,
      fullName: officerDb.fullName,
      isSuperAdmin: false,
      permissions: new Set([
        "customer.create",
        "loan.scheme.read",
        "loan.application.create",
        "loan.application.submit",
        "loan.disbursement.create",
        "loan.account.read",
        "savings.account.manage",
        "savings.deposit.create",
        "deposit.product.manage",
        "expense.submit",
        "report.read",
      ]),
    };

    branchManager = {
      ...adminUser,
      userId: managerDb.id,
      username: managerDb.username,
      fullName: managerDb.fullName,
      isSuperAdmin: false,
      permissions: new Set([
        "loan.application.approve",
        "loan.disbursement.create",
        "loan.disbursement.approve",
        "loan.disbursement.post",
        "loan.account.read",
        "loan.account.manage",
        "deposit.product.manage",
        "deposit.interest.post",
        "expense.approve",
        "expense.post",
        "report.read",
        "report.export",
      ]),
    };

    fieldCollector = {
      ...adminUser,
      userId: collectorDb.id,
      username: collectorDb.username,
      fullName: collectorDb.fullName,
      isSuperAdmin: false,
      permissions: new Set([
        "collection.receipt.create",
        "collection.sheet.manage",
        "loan.account.read",
      ]),
    };

    accountant = {
      ...adminUser,
      userId: accountantDb.id,
      username: accountantDb.username,
      fullName: accountantDb.fullName,
      isSuperAdmin: false,
      permissions: new Set([
        "accounting.ledger.read",
        "accounting.period.close",
        "report.read",
        "report.export",
      ]),
    };

    testCashAccount = await prisma.cashAccount.findFirstOrThrow({
      where: { organizationId: adminUser.organizationId },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // --------------------------------------------------------------------------
  // Journey 1: KYC Onboarding & Loan Scheme Setup
  // --------------------------------------------------------------------------
  it("Journey 1: Onboards customer and configures published loan scheme", async () => {
    const group = (await prisma.group.findFirst({
      where: { organizationId: adminUser.organizationId },
    })) ?? (await prisma.group.create({
      data: {
        organizationId: adminUser.organizationId,
        code: `GRP-UAT-${Date.now().toString().slice(-6)}`,
        name: "UAT Customer Group",
        status: "ACTIVE",
      },
    }));

    testCustomer = await createCustomer(creditOfficer, {
      organizationId: adminUser.organizationId,
      groupId: group.id,
      customerCode: `CUST-UAT-${Date.now().toString().slice(-6)}`,
      fullName: "Fatima Bi",
      phone: `+91-${Date.now().toString().slice(-9)}`,
      email: `fatima.${Date.now().toString().slice(-5)}@example.com`,
      status: "ACTIVE",
    });

    expect(testCustomer.id).toBeDefined();
    expect(testCustomer.customerCode).toBeDefined();

    testScheme = await createLoanScheme(adminUser, {
      organizationId: adminUser.organizationId,
      code: `UAT-MFI-${Date.now().toString().slice(-6)}`,
      name: "UAT Micro Enterprise Loan",
      minPrincipal: "5000.0000",
      maxPrincipal: "50000.0000",
      termMonths: 6,
      interestRate: "12.0000",
      interestMethod: "REDUCING_BALANCE",
      repaymentFrequency: "MONTHLY",
      gracePeriodDays: 0,
      status: "PUBLISHED",
    });

    expect(testScheme.versions[0].versionNumber).toBe(1);
    expect(testScheme.versions[0].status).toBe("PUBLISHED");
  });

  // --------------------------------------------------------------------------
  // Journey 2: Loan Application & Maker-Checker Approval
  // --------------------------------------------------------------------------
  it("Journey 2: Creates, submits, and approves loan application with maker-checker separation", async () => {
    testApplication = await createLoanApplication(creditOfficer, {
      organizationId: adminUser.organizationId,
      customerId: testCustomer.id,
      schemeId: testScheme.id,
      requestedPrincipal: "20000.0000",
      requestedTermMonths: 6,
      purpose: "Dairy shop inventory expansion",
    });
    expect(testApplication.status).toBe("DRAFT");

    const submitted = await submitLoanApplication(creditOfficer, {
      organizationId: adminUser.organizationId,
      applicationId: testApplication.id,
      businessPurpose: "Dairy shop inventory expansion and equipment purchase",
    });
    expect(submitted.status).toBe("SUBMITTED");

    // Enforce maker-checker: Officer cannot approve their own application
    await expect(
      approveLoanApplication(creditOfficer, {
        organizationId: adminUser.organizationId,
        applicationId: testApplication.id,
        approvalReason: "Self-approval attempt",
        enforceMakerChecker: true,
      })
    ).rejects.toThrow();

    // Branch manager approves application
    const approved = await approveLoanApplication(branchManager, {
      organizationId: adminUser.organizationId,
      applicationId: testApplication.id,
      approvalReason: "Satisfactory credit assessment and home verification verified",
      enforceMakerChecker: true,
    });
    expect(approved.status).toBe("APPROVED");
    expect(approved.approvedById).toBe(branchManager.userId);
  });

  // --------------------------------------------------------------------------
  // Journey 3: Disbursement & Ledger Double-Entry Creation
  // --------------------------------------------------------------------------
  it("Journey 3: Disburses loan, generates repayment schedule, and posts balanced GL entries", async () => {
    const disburseRes = await createLoanDisbursement(branchManager, {
      organizationId: adminUser.organizationId,
      applicationId: testApplication.id,
      cashAccountId: testCashAccount.id,
      disbursementDate: "2026-10-23",
      amount: "20000.0000",
      sourceReference: `DISB-UAT-${Date.now().toString().slice(-8)}`,
    });

    expect(disburseRes.loanAccount).toBeDefined();
    expect(disburseRes.id).toBeDefined();
    expect(disburseRes.journalEntry).toBeDefined();

    testLoanAccount = disburseRes.loanAccount;
    expect(testLoanAccount.status).toBe("ACTIVE");
    expect(Number(testLoanAccount.principalDisbursed)).toBe(20000);
    expect(Number(testLoanAccount.principalOutstanding)).toBe(20000);

    // Verify installments created (6 installments)
    const installments = await prisma.repaymentInstallment.findMany({
      where: { loanAccountId: testLoanAccount.id },
      orderBy: { installmentNumber: "asc" },
    });
    expect(installments.length).toBe(6);

    // Verify balanced journal lines (Debit 1201 Loan Principal, Credit 1001 Cash in Vault)
    const journal = await prisma.journalEntry.findUniqueOrThrow({
      where: { id: disburseRes.journalEntry.id },
      include: { lines: { include: { account: true } } },
    });
    expect(journal.totalDebit.toString()).toBe(journal.totalCredit.toString());
    expect(Number(journal.totalDebit)).toBe(20000);
  });

  // --------------------------------------------------------------------------
  // Journey 4: Collection Recording & Waterfall Allocation
  // --------------------------------------------------------------------------
  it("Journey 4: Records daily repayment with allocation waterfall and updates loan balance", async () => {
    const receipt = await createCollectionReceipt(fieldCollector, {
      organizationId: adminUser.organizationId,
      loanAccountId: testLoanAccount.id,
      cashAccountId: testCashAccount.id,
      receiptNumber: `REC-UAT-${Date.now().toString().slice(-8)}`,
      businessDate: "2026-10-23",
      amount: "3450.0000",
      paymentMethod: "CASH",
      reference: "Weekly center collection meeting",
    });

    expect(receipt.id).toBeDefined();
    expect(receipt.status).toBe("POSTED");

    // Verify allocations: principal + interest
    const allocations = await prisma.collectionReceiptAllocation.findMany({
      where: { receiptId: receipt.id },
    });
    expect(allocations.length).toBeGreaterThanOrEqual(1);

    const allocSum = allocations.reduce(
      (sum, a) =>
        sum
          .plus(a.principalAmount)
          .plus(a.interestAmount)
          .plus(a.feeAmount)
          .plus(a.penaltyAmount),
      Money.zero()
    );
    expect(allocSum.amount.toNumber()).toBe(3450);

    // Verify loan balance decreased
    const updatedLoan = await prisma.loanAccount.findUniqueOrThrow({
      where: { id: testLoanAccount.id },
    });
    expect(Number(updatedLoan.principalOutstanding)).toBeLessThan(20000);
  });

  // --------------------------------------------------------------------------
  // Journey 5: Savings & Term Deposit Operations
  // --------------------------------------------------------------------------
  it("Journey 5: Manages voluntary savings deposits and term deposits with interest posting", async () => {
    const savingsAccNum = `SAV-${Date.now().toString().slice(-6)}`;
    testSavingsAccount = await openSavingsAccount(creditOfficer, {
      organizationId: adminUser.organizationId,
      customerId: testCustomer.id,
      accountNumber: savingsAccNum,
      productName: "Member Standard Savings",
      minBalance: "0.0000",
      interestRate: "4.0000",
    });
    expect(Number(testSavingsAccount.balance)).toBe(0);

    const depositRes = await depositToSavingsAccount(creditOfficer, {
      organizationId: adminUser.organizationId,
      accountId: testSavingsAccount.id,
      amount: "4000.0000",
      transactionRef: `SAV-DEP-${Date.now().toString().slice(-6)}`,
      cashAccountId: testCashAccount.id,
      businessDate: "2026-10-23",
      note: "Initial savings opening deposit",
    });
    expect(Number(depositRes.balanceAfter)).toBe(4000);

    // Configure and open Fixed Deposit
    const fdProductCode = `UAT-FD-${Date.now().toString().slice(-6)}`;
    testFdProduct = await createDepositProduct(branchManager, {
      organizationId: adminUser.organizationId,
      code: fdProductCode,
      name: "1-Year Growth FD",
      productType: "FD",
      interestRate: "8.0000",
      termMonths: 12,
      minPrincipal: "1000.0000",
      maxPrincipal: "500000.0000",
      status: "ACTIVE",
    });

    testFdAccount = await openTermDepositAccount(creditOfficer, {
      organizationId: adminUser.organizationId,
      customerId: testCustomer.id,
      productId: testFdProduct.id,
      accountNumber: `FD-ACC-${Date.now().toString().slice(-6)}`,
      principal: "10000.0000",
      cashAccountId: testCashAccount.id,
      payoutInstruction: "PAYOUT_TO_SAVINGS",
      depositDate: "2026-10-23",
    });
    expect(Number(testFdAccount.principal)).toBe(10000);
    expect(Number(testFdAccount.projectedMaturityValue)).toBe(10800);

    // Post periodic interest
    const interestPosting = await postTermDepositInterest(branchManager, {
      organizationId: adminUser.organizationId,
      accountId: testFdAccount.id,
      accrualPeriod: "2026-10",
      calculationDate: "2026-10-23",
    });
    expect(interestPosting).toBeDefined();
    expect(Number(interestPosting.interestAmount)).toBeGreaterThan(0);
  });

  // --------------------------------------------------------------------------
  // Journey 6: Operational Expense Lifecycle & Approval
  // --------------------------------------------------------------------------
  it("Journey 6: Submits, approves, and pays operational expense voucher with balanced ledger posting", async () => {
    const expense = await createExpense(creditOfficer, {
      organizationId: adminUser.organizationId,
      category: "Travel",
      amount: "650.0000",
      expenseDate: "2026-10-23",
      payee: "Regional Express Bus Lines",
      paymentMethod: "CASH",
      description: "Center visit field recovery conveyance",
    });
    expect(expense.status).toBe("DRAFT");

    const submittedExp = await submitExpense(creditOfficer, {
      organizationId: adminUser.organizationId,
      expenseId: expense.id,
    });
    expect(submittedExp.status).toBe("SUBMITTED");

    const approvedExp = await approveExpense(branchManager, {
      organizationId: adminUser.organizationId,
      expenseId: expense.id,
      reason: "Conveyance claim conforms to field travel policy",
    });
    expect(approvedExp.status).toBe("APPROVED");

    const paidExp = await postExpensePayment(branchManager, {
      organizationId: adminUser.organizationId,
      expenseId: expense.id,
      cashAccountId: testCashAccount.id,
      paymentReference: "VOUCHER-EXP-001",
      amount: "650.0000",
    });
    expect(paidExp.status).toBe("POSTED");
    expect(paidExp.journalEntryId).toBeDefined();
  });

  // --------------------------------------------------------------------------
  // Journey 7: Settlement Quote & Early Loan Closure
  // --------------------------------------------------------------------------
  it("Journey 7: Generates settlement quote and closes loan account cleanly with zero residual balance", async () => {
    const quote = await generateSettlementQuote(creditOfficer, {
      organizationId: adminUser.organizationId,
      loanAccountId: testLoanAccount.id,
      asOfDate: "2026-10-23",
    });
    expect(Number(quote.netSettlement)).toBeGreaterThan(0);
    expect(quote.principalOutstanding).toBeDefined();

    const closureRes = await postLoanClosure(branchManager, {
      organizationId: adminUser.organizationId,
      loanAccountId: testLoanAccount.id,
      asOfDate: "2026-10-23",
      settlementPaymentAmount: quote.netSettlement,
      cashAccountId: testCashAccount.id,
      paymentMethod: "CASH",
      reason: "Early voluntary full prepayment",
    });

    expect(closureRes.loanAccount.status).toBe("CLOSED");
    expect(Number(closureRes.loanAccount.principalOutstanding)).toBe(0);
    expect(closureRes.closureNumber).toBeDefined();
  });

  // --------------------------------------------------------------------------
  // Journey 8: Daybook, Cashbook, & General Ledger Reconciliation
  // --------------------------------------------------------------------------
  it("Journey 8: Reconciles daybook, daily sheet, and confirms balanced Balance Sheet", async () => {
    const daybook = await getDaybook(accountant, {
      organizationId: adminUser.organizationId,
      businessDate: "2026-10-23",
    });
    expect(daybook.entries.length).toBeGreaterThanOrEqual(1);

    const dailySheet = await getDailySheet(accountant, {
      organizationId: adminUser.organizationId,
      businessDate: "2026-10-23",
    });
    expect(dailySheet.reconciliation.isReconciled).toBe(true);

    const financials = await getFinancialStatementsReport(accountant, {
      organizationId: adminUser.organizationId,
      startDate: "2026-10-01",
      endDate: "2026-10-31",
    });
    expect(financials.balanceSheet.isBalanced).toBe(true);
    expect(Number(financials.balanceSheet.reconciliationDifference)).toBeLessThanOrEqual(0.0001);
  });

  // --------------------------------------------------------------------------
  // Journey 9: Audited CSV Exports & Audit Trail Persistence
  // --------------------------------------------------------------------------
  it("Journey 9: Exports sensitive reports to CSV and verifies tamper-evident audit logging", async () => {
    const exportResult = await exportReportCsv(accountant, {
      organizationId: adminUser.organizationId,
      reportType: "financial_pnl",
      filters: { startDate: "2026-10-01", endDate: "2026-10-31" },
    });

    expect(exportResult.filename).toContain("report_financial_pnl_");
    expect(exportResult.csvContent).toContain("# RAYHAN MICROFINANCE REPORT EXPORT");
    expect(exportResult.rowCount).toBeGreaterThanOrEqual(1);

    // Verify audit event persisted
    const auditRecord = await prisma.auditEvent.findFirst({
      where: {
        organizationId: adminUser.organizationId,
        action: "report.exported",
        actorId: accountant.userId,
      },
      orderBy: { createdAt: "desc" },
    });
    expect(auditRecord).not.toBeNull();
    expect(auditRecord?.entityId).toBe("financial_pnl");
  });
});
