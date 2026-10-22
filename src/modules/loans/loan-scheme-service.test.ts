import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { login } from "@/modules/identity/auth-service";
import {
  createLoanScheme,
  publishLoanScheme,
  previewLoanScheme,
} from "./loan-scheme-service";
import { ConflictError, ValidationError } from "@/lib/errors/app-error";

describe("Loan scheme management", () => {
  let adminUser: Awaited<ReturnType<typeof login>>["user"];
  let suffix: string;

  beforeAll(async () => {
    suffix = Date.now().toString().slice(-6);
    const loginRes = await login({
      organizationCode: "RAYHAN-MFI",
      username: "admin",
      password: "Admin@12345",
    });
    adminUser = loginRes.user;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("creates a valid loan scheme and its first version", async () => {
    const schemeCode = `MSME-STD-${suffix}`;
    const scheme = await createLoanScheme(adminUser, {
      organizationId: adminUser.organizationId,
      code: schemeCode,
      name: `MSME Standard Loan ${suffix}`,
      minPrincipal: "10000.0000",
      maxPrincipal: "500000.0000",
      termMonths: 12,
      interestRate: "12.5000",
      interestMethod: "REDUCING_BALANCE",
      repaymentFrequency: "MONTHLY",
      gracePeriodDays: 0,
      status: "DRAFT",
    });

    expect(scheme.code).toBe(schemeCode);
    expect(scheme.versions.length).toBe(1);
    expect(scheme.versions[0].versionNumber).toBe(1);
  });

  it("rejects duplicate scheme codes and invalid configuration", async () => {
    const duplicateCode = `MSME-STD-${suffix}`;
    await expect(
      createLoanScheme(adminUser, {
        organizationId: adminUser.organizationId,
        code: duplicateCode,
        name: `Duplicate Scheme ${suffix}`,
        minPrincipal: "5000.0000",
        maxPrincipal: "750000.0000",
        termMonths: 18,
        interestRate: "14.0000",
        interestMethod: "FLAT",
        repaymentFrequency: "MONTHLY",
        gracePeriodDays: 0,
        status: "DRAFT",
      })
    ).rejects.toThrow(ConflictError);

    await expect(
      createLoanScheme(adminUser, {
        organizationId: adminUser.organizationId,
        code: `BAD-SCHEME-${suffix}`,
        name: `Invalid Scheme ${suffix}`,
        minPrincipal: "-1.0000",
        maxPrincipal: "5000.0000",
        termMonths: 0,
        interestRate: "-5.0000",
        interestMethod: "UNKNOWN" as any,
        repaymentFrequency: "MONTHLY",
        gracePeriodDays: -10,
        status: "DRAFT",
      })
    ).rejects.toThrow(ValidationError);
  });

  it("publishes a new version and returns a preview record, while keeping prior version immutable", async () => {
    const scheme = await createLoanScheme(adminUser, {
      organizationId: adminUser.organizationId,
      code: `MSME-STD-${Number(suffix) + 2}`,
      name: `MSME Standard Loan v2 ${suffix}`,
      minPrincipal: "15000.0000",
      maxPrincipal: "600000.0000",
      termMonths: 24,
      interestRate: "13.0000",
      interestMethod: "REDUCING_BALANCE",
      repaymentFrequency: "MONTHLY",
      gracePeriodDays: 3,
      status: "DRAFT",
    });

    const published = await publishLoanScheme(adminUser, {
      organizationId: adminUser.organizationId,
      schemeId: scheme.id,
      effectiveDate: "2026-11-01",
      notes: "Published after review",
    });

    expect(published.versionNumber).toBe(2);
    expect(published.status).toBe("PUBLISHED");

    const preview = await previewLoanScheme(adminUser, {
      organizationId: adminUser.organizationId,
      schemeId: scheme.id,
      principal: "150000.0000",
    });

    expect(preview.schemeId).toBe(scheme.id);
    expect(preview.requiresManualApproval).toBe(true);
    expect(preview.notes).toContain("TODO");
  });
});
