import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { login } from "@/modules/identity/auth-service";
import {
  createLoanApplication,
  submitLoanApplication,
  approveLoanApplication,
  rejectLoanApplication,
  getLoanApplications,
  getLoanApplicationById,
} from "./loan-application-service";
import { createLoanDisbursement } from "./loan-disbursement-service";
import {
  getLoanAccounts,
  getLoanAccountById,
  getLoanPortfolioSummary,
} from "./loan-account-service";
import { ForbiddenError, ValidationError } from "@/lib/errors/app-error";
import bcrypt from "bcryptjs";

describe("Phase 4: Loan Application, Approval Desk & Disbursement Workflow", () => {
  let adminUser: Awaited<ReturnType<typeof login>>["user"];
  let checkerUser: Awaited<ReturnType<typeof login>>["user"];
  let customerId: string;
  let schemeId: string;
  let cashAccountId: string;
  const suffix = Date.now().toString().slice(-6);

  beforeAll(async () => {
    // Login admin user
    const loginRes = await login({
      organizationCode: "RAYHAN-MFI",
      username: "admin",
      password: "Admin@12345",
    });
    adminUser = loginRes.user;

    // Create a dedicated checker officer to test maker-checker separation
    const checkerPasswordHash = await bcrypt.hash("Checker@12345", 10);
    const checkerDbUser = await prisma.user.create({
      data: {
        organizationId: adminUser.organizationId,
        username: `checker_${suffix}`,
        email: `checker_${suffix}@rayhan-mfi.local`,
        fullName: "Credit Review Checker",
        passwordHash: checkerPasswordHash,
        status: "ACTIVE",
      },
    });

    // Assign admin role to checker so they have approval permissions
    const adminRole = await prisma.role.findFirstOrThrow({
      where: { organizationId: adminUser.organizationId, code: "ORG_ADMIN" },
    });

    await prisma.userRole.create({
      data: {
        userId: checkerDbUser.id,
        roleId: adminRole.id,
      },
    });

    await prisma.userScope.create({
      data: {
        userId: checkerDbUser.id,
        scopeType: "ORGANIZATION",
      },
    });

    const checkerLogin = await login({
      organizationCode: "RAYHAN-MFI",
      username: `checker_${suffix}`,
      password: "Checker@12345",
    });
    checkerUser = checkerLogin.user;

    // Create group and customer
    const group = (await prisma.group.findFirst({
      where: { organizationId: adminUser.organizationId },
    })) ?? (await prisma.group.create({
      data: {
        organizationId: adminUser.organizationId,
        code: `GRP-PH4-${suffix}`,
        name: `Workflow Phase 4 Group ${suffix}`,
        status: "ACTIVE",
      },
    }));

    const customer = await prisma.customer.create({
      data: {
        organizationId: adminUser.organizationId,
        groupId: group.id,
        customerCode: `CUST-PH4-${suffix}`,
        fullName: "Priya Sharma",
        phone: `+91-98888${suffix}`,
        email: `priya.${suffix}@example.com`,
        status: "ACTIVE",
      },
    });
    customerId = customer.id;

    // Create loan scheme
    const scheme = await prisma.loanScheme.create({
      data: {
        organizationId: adminUser.organizationId,
        code: `SCHEME-PH4-${suffix}`,
        name: "Micro Enterprise Growth Loan",
        status: "PUBLISHED",
        versions: {
          create: [
            {
              versionNumber: 1,
              minPrincipal: "10000.0000",
              maxPrincipal: "500000.0000",
              termMonths: 12,
              interestRate: "14.0000",
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
    schemeId = scheme.id;

    // Find cash vault account
    const cashAccount = await prisma.cashAccount.findFirstOrThrow({
      where: { organizationId: adminUser.organizationId, code: "CASH-VAULT-01" },
    });
    cashAccountId = cashAccount.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("completes full application lifecycle: draft -> submit -> maker-checker rejection -> approved by checker", async () => {
    // 1. Create draft application as adminUser (Maker)
    const draft = await createLoanApplication(adminUser, {
      organizationId: adminUser.organizationId,
      customerId,
      schemeId,
      requestedPrincipal: "60000.0000",
      requestedTermMonths: 12,
      purpose: "Purchase of tailoring inventory and commercial sewing machines",
      status: "DRAFT",
    });

    expect(draft.status).toBe("DRAFT");
    expect(draft.createdById).toBe(adminUser.userId);

    // 2. Submit application
    const submitted = await submitLoanApplication(adminUser, {
      organizationId: adminUser.organizationId,
      applicationId: draft.id,
      businessPurpose: "Expansion of existing tailoring business into readymade garments",
    });

    expect(submitted.status).toBe("SUBMITTED");
    expect(submitted.submittedById).toBe(adminUser.userId);

    // 3. Maker attempts to approve own application with maker-checker enabled -> MUST FAIL
    await expect(
      approveLoanApplication(adminUser, {
        organizationId: adminUser.organizationId,
        applicationId: submitted.id,
        approvalReason: "Self approval attempt",
        enforceMakerChecker: true,
      })
    ).rejects.toThrow(ForbiddenError);

    // 4. Maker attempts to reject own application with maker-checker enabled -> MUST FAIL
    await expect(
      rejectLoanApplication(adminUser, {
        organizationId: adminUser.organizationId,
        applicationId: submitted.id,
        rejectionReason: "Self rejection attempt",
        enforceMakerChecker: true,
      })
    ).rejects.toThrow(ForbiddenError);

    // 5. Separate checker officer approves application
    const approved = await approveLoanApplication(checkerUser, {
      organizationId: adminUser.organizationId,
      applicationId: submitted.id,
      approvalReason: "Credit assessment completed; business cash flows verified",
      enforceMakerChecker: true,
    });

    expect(approved.status).toBe("APPROVED");
    expect(approved.approvedById).toBe(checkerUser.userId);

    // 6. Query applications
    const appsList = await getLoanApplications(adminUser, { status: "APPROVED" });
    expect(appsList.total).toBeGreaterThan(0);
    const foundApp = appsList.items.find((a) => a.id === draft.id);
    expect(foundApp).toBeDefined();
    expect(foundApp?.customer.fullName).toBe("Priya Sharma");
  });

  it("disburses approved loan, creates repayment schedule, and atomically posts balanced GL voucher", async () => {
    // Create and approve an application for disbursement
    const draft = await createLoanApplication(adminUser, {
      organizationId: adminUser.organizationId,
      customerId,
      schemeId,
      requestedPrincipal: "75000.0000",
      requestedTermMonths: 6,
      purpose: "Working capital bridge",
      status: "DRAFT",
    });

    await submitLoanApplication(adminUser, {
      organizationId: adminUser.organizationId,
      applicationId: draft.id,
      businessPurpose: "Working capital bridge loan for inventory purchase",
    });

    const approved = await approveLoanApplication(checkerUser, {
      organizationId: adminUser.organizationId,
      applicationId: draft.id,
      approvalReason: "Approved for fast-track disbursement",
      enforceMakerChecker: true,
    });

    // Capture cash account balance prior to disbursement
    const cashBefore = await prisma.cashAccount.findUniqueOrThrow({
      where: { id: cashAccountId },
    });

    // Execute loan disbursement
    const disbursementResult = await createLoanDisbursement(adminUser, {
      organizationId: adminUser.organizationId,
      applicationId: approved.id,
      cashAccountId,
      disbursementDate: "2026-10-23",
      amount: "75000.0000",
      sourceReference: `DISB-VOUCH-${suffix}`,
    });

    expect(disbursementResult.status).toBe("POSTED");
    expect(disbursementResult.amount).toBe("75000.0000");
    expect(disbursementResult.installmentsCount).toBe(6);

    // Verify loan account was created
    const loanAccount = await prisma.loanAccount.findUniqueOrThrow({
      where: { id: disbursementResult.loanAccountId },
      include: { installments: true },
    });

    expect(loanAccount.status).toBe("ACTIVE");
    expect(loanAccount.principalDisbursed).toBe("75000.0000");
    expect(loanAccount.principalOutstanding).toBe("75000.0000");
    expect(loanAccount.installments.length).toBe(6);

    // Verify that the sum of principal installments exactly equals 75,000.0000
    const sumPrincipal = loanAccount.installments.reduce(
      (acc, inst) => acc + Number(inst.principalDue),
      0
    );
    expect(sumPrincipal.toFixed(4)).toBe("75000.0000");

    // Verify Cash Account was decremented
    const cashAfter = await prisma.cashAccount.findUniqueOrThrow({
      where: { id: cashAccountId },
    });
    const cashDifference = Number(cashBefore.balance) - Number(cashAfter.balance);
    expect(cashDifference.toFixed(4)).toBe("75000.0000");

    // Verify General Ledger Journal Entry was posted and balances!
    const journalEntry = await prisma.journalEntry.findUniqueOrThrow({
      where: { id: disbursementResult.journalEntry.id },
      include: { lines: true },
    });

    expect(journalEntry.status).toBe("POSTED");
    expect(Number(journalEntry.totalDebit).toFixed(4)).toBe("75000.0000");
    expect(Number(journalEntry.totalCredit).toFixed(4)).toBe("75000.0000");
    expect(journalEntry.lines.length).toBe(2);

    // Verify Debited account is 1201 (Loan Principal Receivable)
    const debitLine = journalEntry.lines.find((l) => Number(l.debit) > 0);
    const creditLine = journalEntry.lines.find((l) => Number(l.credit) > 0);
    expect(debitLine).toBeDefined();
    expect(creditLine).toBeDefined();

    const loanCoa = await prisma.chartOfAccount.findUniqueOrThrow({
      where: { id: debitLine!.accountId },
    });
    expect(loanCoa.code).toBe("1201"); // Loan Principal Receivable

    // Verify duplicate disbursement is rejected
    await expect(
      createLoanDisbursement(adminUser, {
        organizationId: adminUser.organizationId,
        applicationId: approved.id,
        cashAccountId,
        disbursementDate: "2026-10-23",
        amount: "75000.0000",
        sourceReference: `DISB-DUP-${suffix}`,
      })
    ).rejects.toThrow(ValidationError);
  });

  it("retrieves loan portfolio roster, account detail with installments, and portfolio summary", async () => {
    // 1. Get portfolio summary
    const summary = await getLoanPortfolioSummary(adminUser);
    expect(Number(summary.totalDisbursed)).toBeGreaterThan(0);
    expect(Number(summary.totalOutstanding)).toBeGreaterThan(0);
    expect(summary.activeCount).toBeGreaterThan(0);

    // 2. Get accounts roster
    const accountsRoster = await getLoanAccounts(adminUser, { status: "ACTIVE" });
    expect(accountsRoster.total).toBeGreaterThan(0);
    expect(accountsRoster.items[0]?.customer).toBeDefined();
    expect(accountsRoster.items[0]?.scheme).toBeDefined();

    // 3. Get detailed account by ID
    const sampleId = accountsRoster.items[0]!.id;
    const detail = await getLoanAccountById(adminUser, sampleId);
    expect(detail.id).toBe(sampleId);
    expect(detail.installments.length).toBeGreaterThan(0);
    expect(detail.installments[0]?.status).toBe("PENDING");
  });

  it("allows a checker (without loan.application.create) to view loan applications, accounts, and summary", async () => {
    // Construct a pure checker user context without loan.application.create
    const pureCheckerUser = {
      ...checkerUser,
      permissions: new Set([
        "loan.application.view",
        "loan.application.verify",
        "loan.application.approve",
        "loan.disbursement.approve",
        "loan.disbursement.post",
        "loan.account.read",
        "loan.account.close",
        "loan.scheme.read",
      ]),
      isSuperAdmin: false,
      isOrgAdmin: false,
    };

    // 1. Checker can view loan applications list
    const apps = await getLoanApplications(pureCheckerUser);
    expect(apps.items.length).toBeGreaterThanOrEqual(0);

    // 2. Checker can view portfolio summary
    const summary = await getLoanPortfolioSummary(pureCheckerUser);
    expect(summary).toBeDefined();

    // 3. Checker can view loan accounts
    const accounts = await getLoanAccounts(pureCheckerUser);
    expect(accounts).toBeDefined();

    // 4. Checker is blocked from creating draft loan applications (least privilege)
    await expect(
      createLoanApplication(pureCheckerUser, {
        organizationId: pureCheckerUser.organizationId,
        customerId,
        schemeId,
        requestedPrincipal: "50000.0000",
        requestedTermMonths: 12,
        purpose: "Attempted creation by checker",
        status: "DRAFT",
      })
    ).rejects.toThrow(ForbiddenError);
  });
});
