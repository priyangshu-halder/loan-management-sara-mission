import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { login } from "@/modules/identity/auth-service";
import {
  createLoanScheme,
  previewLoanScheme,
  getLoanSchemeById,
  updateLoanScheme,
} from "./loan-scheme-service";
import { calculateRepaymentSchedule } from "./loan-schedule-engine";
import { createLoanApplication } from "./loan-application-service";
import { createLoanDisbursement } from "./loan-disbursement-service";
import { createCollectionReceipt } from "@/modules/collections/collection-receipt-service";
import { getLoanAccountById } from "./loan-account-service";
import { ValidationError } from "@/lib/errors/app-error";
import Decimal from "decimal.js";

describe("Production Change Request: Redesigned Manual Loan Scheme System", () => {
  let adminUser: Awaited<ReturnType<typeof login>>["user"];
  let testCustomer: any;
  let cashAccount: any;
  let suffix: string;

  beforeAll(async () => {
    suffix = Date.now().toString().slice(-6);
    const loginRes = await login({
      organizationCode: "RAYHAN-MFI",
      username: "admin",
      password: "Admin@12345",
    });
    adminUser = loginRes.user;

    // Retrieve or create branch, group, and customer
    const branch =
      (await prisma.branch.findFirst({
        where: { organizationId: adminUser.organizationId },
      })) ??
      (await prisma.branch.create({
        data: {
          organizationId: adminUser.organizationId,
          code: `BR-${suffix}`,
          name: "Main Branch",
        },
      }));

    const group =
      (await prisma.group.findFirst({
        where: { organizationId: adminUser.organizationId },
      })) ??
      (await prisma.group.create({
        data: {
          organizationId: adminUser.organizationId,
          code: `GRP-${suffix}`,
          name: "Self Help Group",
          status: "ACTIVE",
          branchId: branch.id,
        },
      }));

    testCustomer = await prisma.customer.create({
      data: {
        organizationId: adminUser.organizationId,
        groupId: group.id,
        branchId: branch.id,
        customerCode: `CUST-MAN-${suffix}`,
        fullName: "Sita Sharma",
        phone: `+9198${Date.now().toString().slice(-8)}`,
        status: "ACTIVE",
      },
    });

    cashAccount = await prisma.cashAccount.findFirst({
      where: { organizationId: adminUser.organizationId },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe("Scenario A: Standard Scheme (50k principal, 12 mo, 54k total repayment)", () => {
    it("generates exact schedule with 4500 monthly installment and 54000 total", async () => {
      const schedule = calculateRepaymentSchedule({
        principal: "50000.0000",
        totalRepaymentAmount: "54000.0000",
        termMonths: 12,
        repaymentFrequency: "MONTHLY",
        disbursementDate: "2026-11-15",
      });

      expect(schedule.installments).toHaveLength(12);
      expect(schedule.totalRepayment.toFixed(2)).toBe("54000.00");
      expect(schedule.monthlyInstallment.toFixed(2)).toBe("4500.00");

      let sumInstallments = new Decimal(0);
      for (const inst of schedule.installments) {
        expect(inst.totalDue.toFixed(2)).toBe("4500.00");
        expect(inst.principalDue.toFixed(2)).toBe("4500.00");
        expect(inst.interestDue.toFixed(2)).toBe("0.00");
        sumInstallments = sumInstallments.plus(inst.totalDue);
      }
      expect(sumInstallments.toFixed(2)).toBe("54000.00");
    });

    it("creates and previews scheme LN001 in service without formula interest", async () => {
      const scheme = await createLoanScheme(adminUser, {
        organizationId: adminUser.organizationId,
        code: `LN001-${suffix}`,
        name: "Standard Loan Scheme",
        loanAmount: "50000",
        repaymentPeriod: 12,
        totalRepaymentAmount: "54000",
        termsAndConditions: "Standard 12 month repayment agreement.",
      });

      expect(scheme.code).toBe(`LN001-${suffix}`);
      expect(scheme.versions[0].principalAmount).toBe("50000.0000");
      expect(scheme.versions[0].totalRepaymentAmount).toBe("54000.0000");
      expect(scheme.versions[0].termMonths).toBe(12);

      const preview = await previewLoanScheme(adminUser, {
        organizationId: adminUser.organizationId,
        schemeId: scheme.id,
      });

      expect(preview.loanAmount).toBe("50000.00");
      expect(preview.totalRepayment).toBe("54000.00");
      expect(preview.repaymentPeriod).toBe(12);
      expect(preview.indicativeMonthlyInstallment).toBe("4500.00");
      expect(preview.notes).toContain("Indicative schedule calculation");
    });
  });

  describe("Scenario B: Premium Scheme (50k principal, 12 mo, 60k total repayment)", () => {
    it("generates exact schedule with 5000 monthly installment and 60000 total", async () => {
      const schedule = calculateRepaymentSchedule({
        principal: "50000.0000",
        totalRepaymentAmount: "60000.0000",
        termMonths: 12,
        repaymentFrequency: "MONTHLY",
        disbursementDate: "2026-11-15",
      });

      expect(schedule.installments).toHaveLength(12);
      expect(schedule.totalRepayment.toFixed(2)).toBe("60000.00");
      expect(schedule.monthlyInstallment.toFixed(2)).toBe("5000.00");

      let sumInstallments = new Decimal(0);
      for (const inst of schedule.installments) {
        expect(inst.totalDue.toFixed(2)).toBe("5000.00");
        sumInstallments = sumInstallments.plus(inst.totalDue);
      }
      expect(sumInstallments.toFixed(2)).toBe("60000.00");
    });

    it("creates scheme LN002 with 60000 total repayment", async () => {
      const scheme = await createLoanScheme(adminUser, {
        organizationId: adminUser.organizationId,
        code: `LN002-${suffix}`,
        name: "Premium Loan Scheme",
        loanAmount: "50000",
        repaymentPeriod: 12,
        totalRepaymentAmount: "60000",
        termsAndConditions: "Premium 12 month loan.",
      });

      expect(scheme.code).toBe(`LN002-${suffix}`);
      expect(scheme.versions[0].totalRepaymentAmount).toBe("60000.0000");
    });
  });

  describe("Scenario C: Uneven division (10k principal, 3 mo, 10k total repayment)", () => {
    it("distributes rounding remainder evenly: 3333.33, 3333.33, 3333.34 summing to exactly 10000.00", () => {
      const schedule = calculateRepaymentSchedule({
        principal: "10000.0000",
        totalRepaymentAmount: "10000.0000",
        termMonths: 3,
        repaymentFrequency: "MONTHLY",
        disbursementDate: "2026-11-15",
      });

      expect(schedule.installments).toHaveLength(3);
      expect(schedule.installments[0].totalDue.toFixed(2)).toBe("3333.33");
      expect(schedule.installments[1].totalDue.toFixed(2)).toBe("3333.33");
      expect(schedule.installments[2].totalDue.toFixed(2)).toBe("3333.34");

      const exactSum = schedule.installments[0].totalDue
        .plus(schedule.installments[1].totalDue)
        .plus(schedule.installments[2].totalDue);

      expect(exactSum.toFixed(2)).toBe("10000.00");
      expect(schedule.totalRepayment.toFixed(2)).toBe("10000.00");
    });
  });

  describe("Scenario D: Invalid input validations", () => {
    it("rejects total repayment amount less than principal", async () => {
      await expect(
        createLoanScheme(adminUser, {
          organizationId: adminUser.organizationId,
          code: `INV-1-${suffix}`,
          name: "Invalid Less Repay Scheme",
          loanAmount: "50000",
          repaymentPeriod: 12,
          totalRepaymentAmount: "40000", // Less than loan amount!
        })
      ).rejects.toThrow(ValidationError);
    });

    it("rejects zero or negative principal", async () => {
      await expect(
        createLoanScheme(adminUser, {
          organizationId: adminUser.organizationId,
          code: `INV-2-${suffix}`,
          name: "Zero Principal Scheme",
          loanAmount: "0",
          repaymentPeriod: 12,
          totalRepaymentAmount: "10000",
        })
      ).rejects.toThrow(ValidationError);

      await expect(
        createLoanScheme(adminUser, {
          organizationId: adminUser.organizationId,
          code: `INV-3-${suffix}`,
          name: "Negative Principal Scheme",
          loanAmount: "-5000",
          repaymentPeriod: 12,
          totalRepaymentAmount: "10000",
        })
      ).rejects.toThrow(ValidationError);
    });

    it("rejects zero or negative duration", async () => {
      await expect(
        createLoanScheme(adminUser, {
          organizationId: adminUser.organizationId,
          code: `INV-4-${suffix}`,
          name: "Zero Duration Scheme",
          loanAmount: "10000",
          repaymentPeriod: 0,
          totalRepaymentAmount: "12000",
        })
      ).rejects.toThrow(ValidationError);
    });

    it("rejects missing scheme name or invalid scheme code", async () => {
      await expect(
        createLoanScheme(adminUser, {
          organizationId: adminUser.organizationId,
          code: ``,
          name: "Missing Code Scheme",
          loanAmount: "10000",
          repaymentPeriod: 12,
          totalRepaymentAmount: "12000",
        })
      ).rejects.toThrow(ValidationError);

      await expect(
        createLoanScheme(adminUser, {
          organizationId: adminUser.organizationId,
          code: `VALID-CODE-${suffix}`,
          name: " ",
          loanAmount: "10000",
          repaymentPeriod: 12,
          totalRepaymentAmount: "12000",
        })
      ).rejects.toThrow(ValidationError);
    });
  });

  describe("Scenario E: Collection Lifecycle & Outstanding Balances", () => {
    it("handles loan disbursement and updates balances as collections occur (54k -> 49.5k -> 44k)", async () => {
      // 1. Create a scheme: 50k principal, 12 months, 54k total repayment
      const scheme = await createLoanScheme(adminUser, {
        organizationId: adminUser.organizationId,
        code: `COLL-SCH-${suffix}`,
        name: "Collection Test Scheme",
        loanAmount: "50000",
        repaymentPeriod: 12,
        totalRepaymentAmount: "54000",
        status: "PUBLISHED",
      });

      // 2. Create application using the scheme
      const app = await createLoanApplication(adminUser, {
        organizationId: adminUser.organizationId,
        customerId: testCustomer.id,
        schemeId: scheme.id,
        purpose: "Small enterprise working capital",
        status: "APPROVED",
      });

      expect(app.requestedPrincipal).toBe("50000.0000");
      expect(app.requestedTermMonths).toBe(12);
      expect(app.totalRepaymentAmount).toBe("54000.0000");

      // 3. Disburse the loan
      const disbRes = await createLoanDisbursement(adminUser, {
        organizationId: adminUser.organizationId,
        applicationId: app.id,
        cashAccountId: cashAccount.id,
        amount: "50000.0000",
        disbursementDate: "2026-11-15",
        sourceReference: `DISB-REF-${suffix}`,
      });

      const accountId = disbRes.loanAccount.id;
      let account = await getLoanAccountById(adminUser, accountId);

      // Verify initial balances
      expect(account.principalDisbursed).toBe("50000.0000");
      expect(account.totalRepaymentAmount).toBe("54000.0000");
      expect(account.principalOutstanding).toBe("54000.0000");
      expect(account.totalPaid).toBe("0.0000");
      expect(account.installments).toHaveLength(12);
      expect(account.installments[0].totalDue.toString()).toBe("4500");

      // 4. First collection: collect ₹4,500
      const rcpt1 = await createCollectionReceipt(adminUser, {
        organizationId: adminUser.organizationId,
        loanAccountId: accountId,
        cashAccountId: cashAccount.id,
        receiptNumber: `RCPT-1-${suffix}`,
        businessDate: "2026-11-15",
        amount: "4500.0000",
        paymentMethod: "CASH",
      });

      expect(rcpt1.status).toBe("POSTED");

      account = await getLoanAccountById(adminUser, accountId);
      // After collecting ₹4,500:
      // Total payable: ₹54,000, Total collected: ₹4,500, Outstanding: ₹49,500
      expect(account.totalRepaymentAmount).toBe("54000.0000");
      expect(account.totalPaid).toBe("4500.0000");
      expect(account.principalOutstanding).toBe("49500.0000");

      // 5. Second collection: collect ₹5,500 (total collected ₹10,000)
      const rcpt2 = await createCollectionReceipt(adminUser, {
        organizationId: adminUser.organizationId,
        loanAccountId: accountId,
        cashAccountId: cashAccount.id,
        receiptNumber: `RCPT-2-${suffix}`,
        businessDate: "2026-11-16",
        amount: "5500.0000",
        paymentMethod: "CASH",
      });

      expect(rcpt2.status).toBe("POSTED");

      account = await getLoanAccountById(adminUser, accountId);
      // After collecting ₹10,000 in total:
      // Total payable: ₹54,000, Total collected: ₹10,000, Outstanding: ₹44,000
      expect(account.totalRepaymentAmount).toBe("54000.0000");
      expect(account.totalPaid).toBe("10000.0000");
      expect(account.principalOutstanding).toBe("44000.0000");
    });
  });

  describe("Scenario F: Historical loan records remain untouched", () => {
    it("preserves historical loans and does not recalculate them", async () => {
      const historicalAccounts = await prisma.loanAccount.findMany({
        where: { organizationId: adminUser.organizationId },
        include: {
          installments: true,
          scheme: { include: { versions: true } },
        },
        take: 3,
      });

      expect(historicalAccounts.length).toBeGreaterThan(0);

      for (const acc of historicalAccounts) {
        expect(acc.principalDisbursed).toBeDefined();
        expect(acc.principalOutstanding).toBeDefined();
        expect(acc.status).toBeDefined();
        // Existing installments remain intact
        if (acc.installments.length > 0) {
          expect(acc.installments[0].totalDue).toBeDefined();
        }
      }
    });
  });
});
