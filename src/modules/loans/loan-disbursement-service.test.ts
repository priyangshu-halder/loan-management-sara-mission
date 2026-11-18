import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { login } from "@/modules/identity/auth-service";
import { createLoanDisbursement } from "./loan-disbursement-service";
import { ForbiddenError, ValidationError } from "@/lib/errors/app-error";

describe("Loan disbursement and loan account creation", () => {
  let adminUser: Awaited<ReturnType<typeof login>>["user"];
  let customerId: string;
  let schemeId: string;
  let applicationId: string;
  let cashAccountId: string;

  beforeAll(async () => {
    const loginRes = await login({
      organizationCode: "RAYHAN-MFI",
      username: "admin",
      password: "Admin@12345",
    });
    adminUser = loginRes.user;

    const suffix = Date.now().toString().slice(-6);

    const group = (await prisma.group.findFirst({
      where: { organizationId: adminUser.organizationId },
    })) ?? (await prisma.group.create({
      data: {
        organizationId: adminUser.organizationId,
        code: `GRP-DISB-${suffix}`,
        name: `Disbursement Group ${suffix}`,
        status: "ACTIVE",
      },
    }));

    const customer = await prisma.customer.create({
      data: {
        organizationId: adminUser.organizationId,
        groupId: group.id,
        customerCode: `DISB-CUST-${suffix}`,
        fullName: "Disbursement Customer",
        phone: `+91-900000${suffix}`,
        email: `disbursement.${suffix}@example.com`,
        status: "ACTIVE",
      },
    });
    customerId = customer.id;

    const scheme = await prisma.loanScheme.create({
      data: {
        organizationId: adminUser.organizationId,
        code: `DISB-SCHEME-${suffix}`,
        name: "Disbursement Scheme",
        status: "PUBLISHED",
        versions: {
          create: [
            {
              versionNumber: 1,
              minPrincipal: "30000.0000",
              maxPrincipal: "300000.0000",
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
    schemeId = scheme.id;

    const application = await prisma.loanApplication.create({
      data: {
        organizationId: adminUser.organizationId,
        customerId,
        schemeId,
        requestedPrincipal: "100000.0000",
        requestedTermMonths: 12,
        purpose: "Equipment financing",
        status: "APPROVED",
        approvalReason: "Approved for equipment financing",
        approvedAt: new Date(),
        approvedById: adminUser.userId,
      },
    });
    applicationId = application.id;

    const cashAccount = await prisma.cashAccount.findFirstOrThrow({
      where: { organizationId: adminUser.organizationId, code: "CASH-VAULT-01" },
    });
    cashAccountId = cashAccount.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("creates a loan account and disbursement when the application is approved", async () => {
    const disbursement = await createLoanDisbursement(adminUser, {
      organizationId: adminUser.organizationId,
      applicationId,
      cashAccountId,
      disbursementDate: "2026-10-22",
      amount: "100000.0000",
      sourceReference: "APP-001-DISB",
    });

    expect(disbursement.status).toBe("POSTED");
    expect(disbursement.amount).toBe("100000.0000");
    expect(disbursement.loanAccount).toBeDefined();
    expect(disbursement.loanAccount?.customerId).toBe(customerId);

    const loanAccount = await prisma.loanAccount.findFirst({
      where: { organizationId: adminUser.organizationId, customerId },
    });

    expect(loanAccount).not.toBeNull();
    expect(loanAccount?.principalOutstanding.toString()).toBe("100000.0000");

    const updatedApp = await prisma.loanApplication.findUnique({
      where: { id: applicationId },
    });
    expect(updatedApp?.status).toBe("DISBURSED");
  });

  it("rejects disbursements for non-approved applications and duplicates", async () => {
    const draftApplication = await prisma.loanApplication.create({
      data: {
        organizationId: adminUser.organizationId,
        customerId,
        schemeId,
        requestedPrincipal: "50000.0000",
        requestedTermMonths: 6,
        purpose: "Short-term bridge finance",
        status: "DRAFT",
      },
    });

    await expect(
      createLoanDisbursement(adminUser, {
        organizationId: adminUser.organizationId,
        applicationId: draftApplication.id,
        cashAccountId,
        disbursementDate: "2026-10-23",
        amount: "50000.0000",
        sourceReference: "APP-002-DISB",
      })
    ).rejects.toThrow(ForbiddenError);

    const approved = await prisma.loanApplication.create({
      data: {
        organizationId: adminUser.organizationId,
        customerId,
        schemeId,
        requestedPrincipal: "40000.0000",
        requestedTermMonths: 6,
        purpose: "Bridge finance",
        status: "APPROVED",
        approvalReason: "Approved",
        approvedAt: new Date(),
        approvedById: adminUser.userId,
      },
    });

    await createLoanDisbursement(adminUser, {
      organizationId: adminUser.organizationId,
      applicationId: approved.id,
      cashAccountId,
      disbursementDate: "2026-10-24",
      amount: "40000.0000",
      sourceReference: "APP-003-DISB",
    });

    await expect(
      createLoanDisbursement(adminUser, {
        organizationId: adminUser.organizationId,
        applicationId: approved.id,
        cashAccountId,
        disbursementDate: "2026-10-24",
        amount: "40000.0000",
        sourceReference: "APP-003-DISB",
      })
    ).rejects.toThrow(ValidationError);
  });
});
