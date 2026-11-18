import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { login } from "@/modules/identity/auth-service";
import {
  getPortfolioDashboard,
  getPortfolioAgingReport,
  getCollectionPerformanceReport,
  getDepositMaturitiesReport,
  getFinancialStatementsReport,
  exportReportCsv,
} from "./report-service";
import { ForbiddenError } from "@/lib/errors/app-error";

describe("Reports and Dashboards Module", () => {
  let adminUser: Awaited<ReturnType<typeof login>>["user"];
  let testCustomer: any;
  let testScheme: any;
  let testLoanAccount: any;
  let testCashAccount: any;

  beforeAll(async () => {
    const loginRes = await login({
      organizationCode: "RAYHAN-MFI",
      username: "admin",
      password: "Admin@12345",
    });

    adminUser = loginRes.user;

    const group = (await prisma.group.findFirst({
      where: { organizationId: adminUser.organizationId },
    })) ?? (await prisma.group.create({
      data: {
        organizationId: adminUser.organizationId,
        code: `GRP-RPT-${Date.now().toString().slice(-6)}`,
        name: "Reports Test Group",
        status: "ACTIVE",
      },
    }));

    testCustomer = await prisma.customer.create({
      data: {
        organizationId: adminUser.organizationId,
        groupId: group.id,
        customerCode: `PORT-${Date.now().toString().slice(-6)}`,
        fullName: "Portfolio Customer",
        phone: `+91-${Date.now().toString().slice(-9)}`,
        email: `portfolio.${Date.now().toString().slice(-6)}@example.com`,
        status: "ACTIVE",
      },
    });

    testScheme = await prisma.loanScheme.create({
      data: {
        organizationId: adminUser.organizationId,
        code: `PORT-SCHEME-${Date.now().toString().slice(-6)}`,
        name: "Portfolio Scheme",
        status: "PUBLISHED",
        versions: {
          create: [
            {
              versionNumber: 1,
              minPrincipal: "5000.0000",
              maxPrincipal: "500000.0000",
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
        customerId: testCustomer.id,
        schemeId: testScheme.id,
        requestedPrincipal: "15000.0000",
        requestedTermMonths: 12,
        purpose: "Portfolio dashboard KPI seed",
        status: "APPROVED",
        approvalReason: "Approved for reporting fixture",
        approvedAt: new Date(),
        approvedById: adminUser.userId,
      },
    });

    testLoanAccount = await prisma.loanAccount.create({
      data: {
        organizationId: adminUser.organizationId,
        customerId: testCustomer.id,
        schemeId: testScheme.id,
        loanAccountNumber: `PORT-LA-${Date.now().toString().slice(-8)}`,
        principalDisbursed: "15000.0000",
        principalOutstanding: "12000.0000",
        status: "ACTIVE",
        nextDueDate: new Date("2026-10-10T00:00:00.000Z"),
      },
    });

    await prisma.loanDisbursement.create({
      data: {
        organizationId: adminUser.organizationId,
        applicationId: application.id,
        loanAccountId: testLoanAccount.id,
        amount: "15000.0000",
        disbursementDate: new Date("2026-10-01T00:00:00.000Z"),
        sourceReference: `PORT-DISB-${Date.now().toString().slice(-8)}`,
        status: "POSTED",
      },
    });

    // Create overdue installment for PAR calculation
    await prisma.repaymentInstallment.create({
      data: {
        organizationId: adminUser.organizationId,
        loanAccountId: testLoanAccount.id,
        installmentNumber: 1,
        dueDate: new Date("2026-09-01T00:00:00.000Z"), // > 30 days overdue relative to 2026-10-22
        principalDue: "1000.0000",
        interestDue: "150.0000",
        feeDue: "50.0000",
        penaltyDue: "25.0000",
        totalDue: "1225.0000",
        principalPaid: "0.0000",
        interestPaid: "0.0000",
        feePaid: "0.0000",
        penaltyPaid: "0.0000",
        totalPaid: "0.0000",
        status: "OVERDUE",
      },
    });

    testCashAccount = await prisma.cashAccount.findFirstOrThrow({
      where: { organizationId: adminUser.organizationId },
    });

    const receipt = await prisma.collectionReceipt.create({
      data: {
        organizationId: adminUser.organizationId,
        loanAccountId: testLoanAccount.id,
        cashAccountId: testCashAccount.id,
        receiptNumber: `PORT-RECEIPT-${Date.now().toString().slice(-8)}`,
        businessDate: "2026-10-22",
        amount: "2000.0000",
        paymentMethod: "CASH",
        reference: "PORT-COLLECTION",
        status: "POSTED",
        recordedById: adminUser.userId,
      },
    });

    await prisma.collectionReceiptAllocation.create({
      data: {
        organizationId: adminUser.organizationId,
        receiptId: receipt.id,
        loanAccountId: testLoanAccount.id,
        amount: "2000.0000",
        allocationType: "REGULAR",
        principalAmount: "1500.0000",
        interestAmount: "350.0000",
        feeAmount: "100.0000",
        penaltyAmount: "50.0000",
        status: "POSTED",
      },
    });

    await prisma.savingsAccount.create({
      data: {
        organizationId: adminUser.organizationId,
        customerId: testCustomer.id,
        accountNumber: `PORT-SAV-${Date.now().toString().slice(-8)}`,
        productName: "Daily Savings",
        balance: "5000.0000",
        status: "ACTIVE",
      },
    });

    const depositCode = `PORT-FD-${Date.now().toString().slice(-6)}`;

    await prisma.depositProduct.create({
      data: {
        organizationId: adminUser.organizationId,
        code: depositCode,
        name: "Portfolio FD",
        productType: "FIXED_DEPOSIT",
        interestRate: "7.5000",
        termMonths: 12,
        minPrincipal: "1000.0000",
        maxPrincipal: "500000.0000",
        status: "ACTIVE",
      },
    });

    const depositProduct = await prisma.depositProduct.findFirstOrThrow({
      where: { organizationId: adminUser.organizationId, code: depositCode },
    });

    await prisma.termDepositAccount.create({
      data: {
        organizationId: adminUser.organizationId,
        customerId: testCustomer.id,
        productId: depositProduct.id,
        accountNumber: `PORT-TD-${Date.now().toString().slice(-8)}`,
        principal: "25000.0000",
        maturityDate: "2026-11-15", // ~24 days from 2026-10-22 (0-30 days bucket)
        projectedMaturityValue: "26875.0000",
        status: "ACTIVE",
      },
    });

    await prisma.expense.create({
      data: {
        organizationId: adminUser.organizationId,
        category: "Travel",
        amount: "800.0000",
        expenseDate: "2026-10-22",
        payee: "Portfolio Vendor",
        paymentMethod: "CASH",
        description: "Travel cost",
        status: "POSTED",
        submittedById: adminUser.userId,
        approvedById: adminUser.userId,
        postedById: adminUser.userId,
      },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("aggregates portfolio dashboard KPIs with pipeline and recent collections", async () => {
    const report = await getPortfolioDashboard(adminUser, {
      organizationId: adminUser.organizationId,
      asOfDate: "2026-10-22",
    });

    expect(report.asOfDate).toBe("2026-10-22");
    expect(report.customers.active).toBeGreaterThanOrEqual(1);
    expect(Number(report.loanPortfolio.disbursed)).toBeGreaterThanOrEqual(15000);
    expect(Number(report.loanPortfolio.outstanding)).toBeGreaterThanOrEqual(12000);
    expect(Number(report.collections.today)).toBeGreaterThanOrEqual(2000);
    expect(Number(report.savings.totalBalance)).toBeGreaterThanOrEqual(5000);
    expect(Number(report.termDeposits.totalPrincipal)).toBeGreaterThanOrEqual(25000);
    expect(Number(report.expenses.totalPosted)).toBeGreaterThanOrEqual(800);
    expect(report.recentCollections).toBeDefined();
    expect(report.recentCollections!.length).toBeGreaterThanOrEqual(1);
    expect(report.applicationsPipeline).toBeDefined();
    expect(report.applicationsPipeline!.approved).toBeGreaterThanOrEqual(1);
  });

  it("calculates portfolio aging and PAR buckets with source reconciliation", async () => {
    const report = await getPortfolioAgingReport(adminUser, {
      organizationId: adminUser.organizationId,
      asOfDate: "2026-10-22",
    });

    expect(report.asOfDate).toBe("2026-10-22");
    expect(report.summary.activeAccountsCount).toBeGreaterThanOrEqual(1);
    expect(Number(report.summary.totalDisbursed)).toBeGreaterThanOrEqual(15000);
    expect(Number(report.summary.totalOutstanding)).toBeGreaterThanOrEqual(12000);
    expect(Number(report.summary.totalArrears)).toBeGreaterThanOrEqual(1225);

    // Overdue loan account should be in overdue list
    const foundOverdue = report.overdueLoans.find(
      (l) => l.loanAccountId === testLoanAccount.id
    );
    expect(foundOverdue).toBeDefined();
    expect(foundOverdue?.agingBucket).toBe("31-60");
    expect(Number(foundOverdue?.totalOverdue)).toBe(1225);

    // PAR 30+ amount should include this loan
    expect(Number(report.summary.par30Amount)).toBeGreaterThanOrEqual(12000);
    expect(Number(report.summary.par30RatioPercent)).toBeGreaterThan(0);
  });

  it("calculates collection performance and allocations for date range", async () => {
    const report = await getCollectionPerformanceReport(adminUser, {
      organizationId: adminUser.organizationId,
      startDate: "2026-10-01",
      endDate: "2026-10-31",
    });

    expect(Number(report.summary.totalCollected)).toBeGreaterThanOrEqual(2000);
    expect(report.summary.receiptsCount).toBeGreaterThanOrEqual(1);
    expect(Number(report.summary.allocation.principal)).toBeGreaterThanOrEqual(1500);
    expect(Number(report.summary.allocation.interest)).toBeGreaterThanOrEqual(350);
    expect(Number(report.summary.allocation.fee)).toBeGreaterThanOrEqual(100);
    expect(Number(report.summary.allocation.penalty)).toBeGreaterThanOrEqual(50);
    expect(report.summary.paymentMethods["CASH"]).toBeDefined();
    expect(report.collectors.length).toBeGreaterThanOrEqual(1);
  });

  it("projects deposit maturities into schedule buckets", async () => {
    const report = await getDepositMaturitiesReport(adminUser, {
      organizationId: adminUser.organizationId,
      asOfDate: "2026-10-22",
    });

    expect(Number(report.liquidSavings.totalBalance)).toBeGreaterThanOrEqual(5000);
    expect(report.liquidSavings.activeAccounts).toBeGreaterThanOrEqual(1);
    expect(Number(report.fixedDeposits.totalPrincipal)).toBeGreaterThanOrEqual(25000);
    expect(report.fixedDeposits.activeAccounts).toBeGreaterThanOrEqual(1);

    // Upcoming maturity in 0-30 days
    expect(report.maturityBuckets.days0to30.count).toBeGreaterThanOrEqual(1);
    expect(Number(report.maturityBuckets.days0to30.principal)).toBeGreaterThanOrEqual(25000);

    const upcoming = report.upcomingMaturities.find((u) => u.customerCode === testCustomer.customerCode);
    expect(upcoming).toBeDefined();
    expect(upcoming?.maturityDate).toBe("2026-11-15");
  });

  it("produces financial statements (P&L and Balance Sheet) reconciling to GL", async () => {
    const report = await getFinancialStatementsReport(adminUser, {
      organizationId: adminUser.organizationId,
      startDate: "2026-10-01",
      endDate: "2026-10-31",
    });

    expect(report.incomeStatement).toBeDefined();
    expect(report.balanceSheet).toBeDefined();
    expect(report.balanceSheet.isBalanced).toBe(true);
    expect(Number(report.balanceSheet.reconciliationDifference)).toBeLessThanOrEqual(0.0001);
    expect(report.expenseBreakdown).toBeDefined();
  });

  it("exports audited CSV for reports and verifies audit event logging", async () => {
    const exportRes = await exportReportCsv(adminUser, {
      organizationId: adminUser.organizationId,
      reportType: "portfolio_aging",
      filters: { asOfDate: "2026-10-22" },
    });

    expect(exportRes.filename).toContain("report_portfolio_aging_");
    expect(exportRes.csvContent).toContain("# RAYHAN MICROFINANCE REPORT EXPORT");
    expect(exportRes.csvContent).toContain('"Loan Account No","Customer Code","Customer Name"');
    expect(exportRes.rowCount).toBeGreaterThanOrEqual(1);

    // Verify audit event in DB
    const audit = await prisma.auditEvent.findFirst({
      where: {
        organizationId: adminUser.organizationId,
        action: "report.exported",
        actorId: adminUser.userId,
      },
      orderBy: { createdAt: "desc" },
    });

    expect(audit).not.toBeNull();
    expect(audit?.entityId).toBe("portfolio_aging");
  });

  it("enforces permission report.export for CSV exports", async () => {
    const restrictedUser = {
      ...adminUser,
      isSuperAdmin: false,
      permissions: new Set(["report.read"]), // Does NOT have report.export
    };

    await expect(
      exportReportCsv(restrictedUser, {
        organizationId: adminUser.organizationId,
        reportType: "portfolio_aging",
        filters: {},
      })
    ).rejects.toThrow(ForbiddenError);
  });

  it("denies cross-organization report access", async () => {
    const nonAdminUser = {
      ...adminUser,
      isSuperAdmin: false,
    };

    await expect(
      getPortfolioDashboard(nonAdminUser, {
        organizationId: "00000000-0000-0000-0000-000000000099",
        asOfDate: "2026-10-22",
      })
    ).rejects.toThrow(ForbiddenError);
  });
});
