import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { login } from "@/modules/identity/auth-service";
import {
  createLoanApplication,
  submitLoanApplication,
  approveLoanApplication,
  rejectLoanApplication,
} from "./loan-application-service";
import { ValidationError, ForbiddenError } from "@/lib/errors/app-error";

describe("Loan application workflow", () => {
  let adminUser: Awaited<ReturnType<typeof login>>["user"];
  let customerId: string;
  let schemeId: string;
  let suffix: string;

  beforeAll(async () => {
    suffix = Date.now().toString().slice(-6);
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
        code: `GRP-APP-${suffix}`,
        name: `Application Test Group ${suffix}`,
        status: "ACTIVE",
      },
    }));

    const customer = await prisma.customer.create({
      data: {
        organizationId: adminUser.organizationId,
        groupId: group.id,
        customerCode: `APP-CUST-${suffix}`,
        fullName: "Loan Applicant One",
        phone: `+91-900000${suffix}`,
        email: `loan.applicant.${suffix}@example.com`,
        status: "ACTIVE",
      },
    });
    customerId = customer.id;

    const scheme = await prisma.loanScheme.create({
      data: {
        organizationId: adminUser.organizationId,
        code: `APP-SCHEME-${suffix}`,
        name: `Application Scheme ${suffix}`,
        status: "PUBLISHED",
        versions: {
          create: [
            {
              versionNumber: 1,
              minPrincipal: "5000.0000",
              maxPrincipal: "250000.0000",
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
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("creates a draft application and validates required fields before submission", async () => {
    const draft = await createLoanApplication(adminUser, {
      organizationId: adminUser.organizationId,
      customerId,
      schemeId,
      requestedPrincipal: "120000.0000",
      requestedTermMonths: 12,
      purpose: "Business expansion",
      status: "DRAFT",
    });

    expect(draft.status).toBe("DRAFT");
    expect(draft.requestedPrincipal).toBe("120000.0000");

    await expect(
      submitLoanApplication(adminUser, {
        organizationId: adminUser.organizationId,
        applicationId: draft.id,
        businessPurpose: "",
      })
    ).rejects.toThrow(ValidationError);
  });

  it("submits and approves an application, and rejects invalid transitions", async () => {
    const draft = await createLoanApplication(adminUser, {
      organizationId: adminUser.organizationId,
      customerId,
      schemeId,
      requestedPrincipal: "90000.0000",
      requestedTermMonths: 12,
      purpose: "Working capital",
      status: "DRAFT",
    });

    const submitted = await submitLoanApplication(adminUser, {
      organizationId: adminUser.organizationId,
      applicationId: draft.id,
      businessPurpose: "Working capital for trading inventory",
    });

    expect(submitted.status).toBe("SUBMITTED");

    const approved = await approveLoanApplication(adminUser, {
      organizationId: adminUser.organizationId,
      applicationId: submitted.id,
      approvalReason: "Meets policy",
    });

    expect(approved.status).toBe("APPROVED");

    await expect(
      rejectLoanApplication(adminUser, {
        organizationId: adminUser.organizationId,
        applicationId: approved.id,
        rejectionReason: "Not needed",
      })
    ).rejects.toThrow(ForbiddenError);
  });

  it("rejects an application with a reason and keeps the audit trail on the record", async () => {
    const draft = await createLoanApplication(adminUser, {
      organizationId: adminUser.organizationId,
      customerId,
      schemeId,
      requestedPrincipal: "60000.0000",
      requestedTermMonths: 6,
      purpose: "Seasonal cash flow",
      status: "DRAFT",
    });

    const submitted = await submitLoanApplication(adminUser, {
      organizationId: adminUser.organizationId,
      applicationId: draft.id,
      businessPurpose: "Seasonal cash flow support",
    });

    const rejected = await rejectLoanApplication(adminUser, {
      organizationId: adminUser.organizationId,
      applicationId: submitted.id,
      rejectionReason: "Insufficient supporting documents",
    });

    expect(rejected.status).toBe("REJECTED");
    expect(rejected.rejectionReason).toBe("Insufficient supporting documents");
  });
});
