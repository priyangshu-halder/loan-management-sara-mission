import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { login } from "@/modules/identity/auth-service";
import { generateSettlementQuote, postLoanClosure } from "./loan-closure-service";
import { ValidationError } from "@/lib/errors/app-error";

describe("Loan closure", () => {
  let adminUser: Awaited<ReturnType<typeof login>>["user"];
  let loanAccountId: string;

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
});
