import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { login } from "@/modules/identity/auth-service";
import { approveLoanApplication } from "@/modules/loans/loan-application-service";
import { approveExpense } from "@/modules/expenses/expense-service";
import { createCollectionReceipt } from "@/modules/collections/collection-receipt-service";
import { closeFiscalPeriod } from "@/modules/accounting/ledger-service";
import { exportReportCsv } from "@/modules/reports/report-service";
import { postJournalEntry } from "@/modules/accounting/posting-service";
import {
  ForbiddenError,
  ValidationError,
  InvariantViolationError,
  TooManyRequestsError,
} from "@/lib/errors/app-error";
import { enforceRateLimit, clearRateLimit, resetRateLimitStore } from "@/lib/security/rate-limiter";
import { AuthenticatedUser } from "@/lib/permissions/types";
import bcrypt from "bcryptjs";

describe("Phase 10: Security Hardening & Penetration Test Suite", () => {
  let adminUser: AuthenticatedUser;
  let testCustomer: any;
  let testScheme: any;
  let testApplication: any;
  let testLoanAccount: any;
  let testCashAccount: any;
  let foreignOrg: any;
  let makerOfficerUser: AuthenticatedUser;
  let expenseMakerUser: AuthenticatedUser;

  beforeAll(async () => {
    resetRateLimitStore();

    const loginRes = await login({
      organizationCode: "RAYHAN-MFI",
      username: "admin",
      password: "Admin@12345",
    });
    adminUser = loginRes.user;

    const dummyHash = await bcrypt.hash("Test@12345", 8);

    // Create real user records in DB for maker-checker tests to satisfy foreign keys
    const officerDbUser = await prisma.user.create({
      data: {
        organizationId: adminUser.organizationId,
        username: `officer_${Date.now().toString().slice(-6)}`,
        email: `officer_${Date.now().toString().slice(-6)}@example.com`,
        fullName: "Test Loan Officer",
        passwordHash: dummyHash,
        status: "ACTIVE",
      },
    });

    makerOfficerUser = {
      ...adminUser,
      userId: officerDbUser.id,
      username: officerDbUser.username,
      fullName: officerDbUser.fullName,
      isOrgAdmin: false,
      isSuperAdmin: false,
      permissions: new Set(["loan.application.create", "loan.application.approve"]),
    };

    const expenseDbUser = await prisma.user.create({
      data: {
        organizationId: adminUser.organizationId,
        username: `expense_user_${Date.now().toString().slice(-6)}`,
        email: `expense_user_${Date.now().toString().slice(-6)}@example.com`,
        fullName: "Test Expense Submitter",
        passwordHash: dummyHash,
        status: "ACTIVE",
      },
    });

    expenseMakerUser = {
      ...adminUser,
      userId: expenseDbUser.id,
      username: expenseDbUser.username,
      fullName: expenseDbUser.fullName,
      isOrgAdmin: false,
      isSuperAdmin: false,
      permissions: new Set(["expense.submit", "expense.approve"]),
    };

    // Create a secondary tenant organization to verify strict cross-tenant boundary isolation
    foreignOrg = await prisma.organization.create({
      data: {
        code: `FOREIGN-MFI-${Date.now().toString().slice(-6)}`,
        name: "Foreign Competitor MFI",
        currency: "INR",
        timezone: "Asia/Kolkata",
        status: "ACTIVE",
      },
    });

    const group = (await prisma.group.findFirst({
      where: { organizationId: adminUser.organizationId },
    })) ?? (await prisma.group.create({
      data: {
        organizationId: adminUser.organizationId,
        code: `GRP-HRD-${Date.now().toString().slice(-6)}`,
        name: "Hardening Test Group",
        status: "ACTIVE",
      },
    }));

    // Seed customer in primary organization
    testCustomer = await prisma.customer.create({
      data: {
        organizationId: adminUser.organizationId,
        groupId: group.id,
        customerCode: `HARDEN-${Date.now().toString().slice(-6)}`,
        fullName: "Hardening Test Customer",
        phone: `+91-${Date.now().toString().slice(-9)}`,
        status: "ACTIVE",
      },
    });

    testScheme = await prisma.loanScheme.create({
      data: {
        organizationId: adminUser.organizationId,
        code: `HARDEN-SCHEME-${Date.now().toString().slice(-6)}`,
        name: "Hardening Scheme",
        status: "PUBLISHED",
        versions: {
          create: [
            {
              versionNumber: 1,
              minPrincipal: "1000.0000",
              maxPrincipal: "100000.0000",
              termMonths: 6,
              interestRate: "12.0000",
              interestMethod: "FLAT",
              repaymentFrequency: "MONTHLY",
              status: "PUBLISHED",
              isPublished: true,
            },
          ],
        },
      },
      include: { versions: true },
    });

    testApplication = await prisma.loanApplication.create({
      data: {
        organizationId: adminUser.organizationId,
        customerId: testCustomer.id,
        schemeId: testScheme.id,
        requestedPrincipal: "10000.0000",
        requestedTermMonths: 6,
        purpose: "Penetration test fixture",
        status: "SUBMITTED",
        createdById: adminUser.userId,
      },
    });

    testLoanAccount = await prisma.loanAccount.create({
      data: {
        organizationId: adminUser.organizationId,
        customerId: testCustomer.id,
        schemeId: testScheme.id,
        loanAccountNumber: `HARDEN-LA-${Date.now().toString().slice(-8)}`,
        principalDisbursed: "10000.0000",
        principalOutstanding: "10000.0000",
        status: "ACTIVE",
      },
    });

    testCashAccount = await prisma.cashAccount.findFirstOrThrow({
      where: { organizationId: adminUser.organizationId },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // --------------------------------------------------------------------------
  // 1. Cross-Tenant Isolation (IDOR Defense)
  // --------------------------------------------------------------------------
  describe("Cross-Tenant Isolation (IDOR Defense)", () => {
    it("strictly blocks an authenticated user from accessing foreign tenant data", async () => {
      const foreignOrgUser: AuthenticatedUser = {
        ...adminUser,
        organizationId: foreignOrg.id,
        organizationCode: foreignOrg.code,
        isSuperAdmin: false,
      };

      // Attacker from Foreign Org attempts to export Primary Org reports
      await expect(
        exportReportCsv(foreignOrgUser, {
          organizationId: adminUser.organizationId, // Targeted victim org
          reportType: "portfolio_aging",
          filters: {},
        })
      ).rejects.toThrow(ForbiddenError);
    });

    it("strictly blocks loan collection attempts across organizations", async () => {
      const foreignOrgUser: AuthenticatedUser = {
        ...adminUser,
        organizationId: foreignOrg.id,
        organizationCode: foreignOrg.code,
        isSuperAdmin: false,
      };

      // Attacker attempts to post collection on a victim organization loan
      await expect(
        createCollectionReceipt(foreignOrgUser, {
          organizationId: adminUser.organizationId,
          loanAccountId: testLoanAccount.id,
          cashAccountId: testCashAccount.id,
          receiptNumber: `REC-TAMPER-${Date.now()}`,
          businessDate: "2026-10-23",
          amount: "1000.0000",
          paymentMethod: "CASH",
        })
      ).rejects.toThrow(ForbiddenError);
    });
  });

  // --------------------------------------------------------------------------
  // 2. Vertical Privilege Escalation Defense
  // --------------------------------------------------------------------------
  describe("Vertical Privilege Escalation Defense", () => {
    it("denies unprivileged collector from approving loan applications", async () => {
      const collectorUser: AuthenticatedUser = {
        ...adminUser,
        isSuperAdmin: false,
        permissions: new Set(["collection.receipt.create"]), // Missing loan.application.approve
      };

      await expect(
        approveLoanApplication(collectorUser, {
          organizationId: adminUser.organizationId,
          applicationId: testApplication.id,
          approvalReason: "Illicit approval by collector",
        })
      ).rejects.toThrow(ForbiddenError);
    });

    it("denies unprivileged staff from closing fiscal periods", async () => {
      const officerUser: AuthenticatedUser = {
        ...adminUser,
        isSuperAdmin: false,
        permissions: new Set(["loan.application.create", "report.read"]), // Missing accounting.period.close
      };

      await expect(
        closeFiscalPeriod(officerUser, "00000000-0000-0000-0000-000000000001")
      ).rejects.toThrow(ForbiddenError);
    });

    it("denies unprivileged staff from exporting sensitive reports", async () => {
      const readerOnlyUser: AuthenticatedUser = {
        ...adminUser,
        isSuperAdmin: false,
        permissions: new Set(["report.read"]), // Missing report.export
      };

      await expect(
        exportReportCsv(readerOnlyUser, {
          organizationId: adminUser.organizationId,
          reportType: "financial_pnl",
          filters: {},
        })
      ).rejects.toThrow(ForbiddenError);
    });
  });

  // --------------------------------------------------------------------------
  // 3. Maker-Checker Separation Enforcement
  // --------------------------------------------------------------------------
  describe("Maker-Checker Separation", () => {
    it("prevents applicant / maker from approving their own loan application", async () => {
      // Officer creates an application
      const ownApp = await prisma.loanApplication.create({
        data: {
          organizationId: adminUser.organizationId,
          customerId: testCustomer.id,
          schemeId: testScheme.id,
          requestedPrincipal: "5000.0000",
          requestedTermMonths: 6,
          purpose: "Self-approval test",
          status: "SUBMITTED",
          createdById: makerOfficerUser.userId,
        },
      });

      // Officer attempts to self-approve their own application
      await expect(
        approveLoanApplication(makerOfficerUser, {
          organizationId: adminUser.organizationId,
          applicationId: ownApp.id,
          approvalReason: "Self approval attempt",
          enforceMakerChecker: true,
        })
      ).rejects.toThrow(ForbiddenError);
    });

    it("prevents expense submitter from approving their own expense claim", async () => {
      const expense = await prisma.expense.create({
        data: {
          organizationId: adminUser.organizationId,
          category: "Travel",
          amount: "500.0000",
          expenseDate: "2026-10-23",
          payee: "Self Payee",
          paymentMethod: "CASH",
          description: "Self expense claim",
          status: "SUBMITTED",
          submittedById: expenseMakerUser.userId,
        },
      });

      // Submitter attempts to self-approve
      await expect(
        approveExpense(expenseMakerUser, {
          organizationId: adminUser.organizationId,
          expenseId: expense.id,
          reason: "Self approval attempt",
        })
      ).rejects.toThrow(ForbiddenError);
    });
  });

  // --------------------------------------------------------------------------
  // 4. Parameter Tampering & Malformed Payloads
  // --------------------------------------------------------------------------
  describe("Parameter Tampering & Validation Defense", () => {
    it("rejects non-positive and zero collection repayment amounts", async () => {
      await expect(
        createCollectionReceipt(adminUser, {
          organizationId: adminUser.organizationId,
          loanAccountId: testLoanAccount.id,
          cashAccountId: testCashAccount.id,
          receiptNumber: `TAMPER-ZERO-${Date.now()}`,
          businessDate: "2026-10-23",
          amount: "0.0000",
          paymentMethod: "CASH",
        })
      ).rejects.toThrow(ValidationError);

      await expect(
        createCollectionReceipt(adminUser, {
          organizationId: adminUser.organizationId,
          loanAccountId: testLoanAccount.id,
          cashAccountId: testCashAccount.id,
          receiptNumber: `TAMPER-NEG-${Date.now()}`,
          businessDate: "2026-10-23",
          amount: "-500.0000",
          paymentMethod: "CASH",
        })
      ).rejects.toThrow(ValidationError);
    });
  });

  // --------------------------------------------------------------------------
  // 5. Accounting Invariant & Double-Entry Integrity
  // --------------------------------------------------------------------------
  describe("Ledger Double-Entry Invariants & Atomicity", () => {
    it("strictly rejects unbalanced journal entries (Debits != Credits)", async () => {
      const cashCoa = await prisma.chartOfAccount.findFirstOrThrow({
        where: { organizationId: adminUser.organizationId, code: "1001" },
      });
      const loanCoa = await prisma.chartOfAccount.findFirstOrThrow({
        where: { organizationId: adminUser.organizationId, code: "1201" },
      });

      // Attempt unbalanced posting: Debit 1000 vs Credit 800
      await expect(
        postJournalEntry(adminUser, {
          organizationId: adminUser.organizationId,
          businessDate: "2026-10-23",
          sourceModule: "MANUAL",
          sourceType: "ADJUSTMENT",
          description: "Unbalanced tampering attempt",
          lines: [
            { accountId: cashCoa.id, debit: "1000.0000", credit: "0.0000" },
            { accountId: loanCoa.id, debit: "0.0000", credit: "800.0000" }, // Deficit of 200
          ],
        })
      ).rejects.toThrow(InvariantViolationError);
    });
  });

  // --------------------------------------------------------------------------
  // 6. Brute-Force Rate Limiting Defense
  // --------------------------------------------------------------------------
  describe("Authentication Rate Limiting", () => {
    it("enforces rate limit lockout after consecutive failed attempts", () => {
      const testKey = `auth_test_ip:${Date.now()}`;
      const options = { windowMs: 60_000, maxRequests: 5 };

      // 5 allowed attempts
      for (let i = 0; i < 5; i++) {
        expect(() => enforceRateLimit(testKey, options)).not.toThrow();
      }

      // 6th attempt must be rejected with TooManyRequestsError (HTTP 429)
      expect(() => enforceRateLimit(testKey, options)).toThrow(TooManyRequestsError);

      // Clean up
      clearRateLimit(testKey);
    });
  });
});
