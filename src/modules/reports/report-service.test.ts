import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { login } from "@/modules/identity/auth-service";
import { getPortfolioDashboard } from "./report-service";

describe("Portfolio dashboard report", () => {
  let adminUser: Awaited<ReturnType<typeof login>>["user"];

  beforeAll(async () => {
    const loginRes = await login({
      organizationCode: "RAYHAN-MFI",
      username: "admin",
      password: "Admin@12345",
    });

    adminUser = loginRes.user;

    const customer = await prisma.customer.create({
      data: {
        organizationId: adminUser.organizationId,
        customerCode: `PORT-${Date.now().toString().slice(-6)}`,
        fullName: "Portfolio Customer",
        phone: `+91-${Date.now().toString().slice(-9)}`,
        email: `portfolio.${Date.now().toString().slice(-6)}@example.com`,
        status: "ACTIVE",
      },
    });

    const scheme = await prisma.loanScheme.create({
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
        customerId: customer.id,
        schemeId: scheme.id,
        requestedPrincipal: "15000.0000",
        requestedTermMonths: 12,
        purpose: "Portfolio dashboard KPI seed",
        status: "APPROVED",
        approvalReason: "Approved for reporting fixture",
        approvedAt: new Date(),
        approvedById: adminUser.userId,
      },
    });

    const loanAccount = await prisma.loanAccount.create({
      data: {
        organizationId: adminUser.organizationId,
        customerId: customer.id,
        schemeId: scheme.id,
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
        loanAccountId: loanAccount.id,
        amount: "15000.0000",
        disbursementDate: new Date("2026-10-01T00:00:00.000Z"),
        sourceReference: `PORT-DISB-${Date.now().toString().slice(-8)}`,
        status: "POSTED",
      },
    });

    await prisma.collectionReceipt.create({
      data: {
        organizationId: adminUser.organizationId,
        loanAccountId: loanAccount.id,
        cashAccountId: (await prisma.cashAccount.findFirstOrThrow({ where: { organizationId: adminUser.organizationId } })).id,
        receiptNumber: `PORT-RECEIPT-${Date.now().toString().slice(-8)}`,
        businessDate: "2026-10-22",
        amount: "2000.0000",
        paymentMethod: "CASH",
        reference: "PORT-COLLECTION",
        status: "POSTED",
      },
    });

    await prisma.savingsAccount.create({
      data: {
        organizationId: adminUser.organizationId,
        customerId: customer.id,
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
        customerId: customer.id,
        productId: depositProduct.id,
        accountNumber: `PORT-TD-${Date.now().toString().slice(-8)}`,
        principal: "25000.0000",
        maturityDate: "2027-10-22",
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

  it("aggregates portfolio, collections, savings, deposits, and expense KPIs for the selected date", async () => {
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
  });
});
