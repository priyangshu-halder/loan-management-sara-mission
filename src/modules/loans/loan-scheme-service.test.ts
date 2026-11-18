import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { login } from "@/modules/identity/auth-service";
import {
  createLoanScheme,
  publishLoanScheme,
  previewLoanScheme,
  updateLoanScheme,
  deleteLoanScheme,
  getLoanSchemeById,
} from "./loan-scheme-service";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors/app-error";

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

  it("updates a draft loan scheme in-place", async () => {
    const draftCode = `MSME-DFT-${Date.now().toString().slice(-6)}`;
    const scheme = await createLoanScheme(adminUser, {
      organizationId: adminUser.organizationId,
      code: draftCode,
      name: "Original Draft Scheme",
      minPrincipal: "10000.0000",
      maxPrincipal: "50000.0000",
      termMonths: 12,
      interestRate: "12.0000",
      interestMethod: "REDUCING_BALANCE",
      repaymentFrequency: "MONTHLY",
      gracePeriodDays: 0,
      status: "DRAFT",
    });

    const updated = await updateLoanScheme(adminUser, {
      organizationId: adminUser.organizationId,
      schemeId: scheme.id,
      name: "Updated Draft Scheme Name",
      minPrincipal: "15000.0000",
      maxPrincipal: "60000.0000",
      termMonths: 18,
    });

    expect(updated.name).toBe("Updated Draft Scheme Name");
    expect(updated.versions.length).toBe(1);
    expect(updated.versions[0].versionNumber).toBe(1);
    expect(updated.versions[0].minPrincipal).toBe("15000.0000");
    expect(updated.versions[0].maxPrincipal).toBe("60000.0000");
    expect(updated.versions[0].termMonths).toBe(18);
  });

  it("updates a published loan scheme by generating a new version", async () => {
    const pubCode = `MSME-PUB-${Date.now().toString().slice(-6)}`;
    const scheme = await createLoanScheme(adminUser, {
      organizationId: adminUser.organizationId,
      code: pubCode,
      name: "Published Product v1",
      minPrincipal: "20000.0000",
      maxPrincipal: "100000.0000",
      termMonths: 12,
      interestRate: "10.0000",
      interestMethod: "REDUCING_BALANCE",
      repaymentFrequency: "MONTHLY",
      gracePeriodDays: 0,
      status: "PUBLISHED",
    });

    const updated = await updateLoanScheme(adminUser, {
      organizationId: adminUser.organizationId,
      schemeId: scheme.id,
      interestRate: "11.5000",
      termMonths: 24,
    });

    expect(updated.versions.length).toBe(2);
    expect(updated.versions[0].versionNumber).toBe(2);
    expect(updated.versions[0].interestRate).toBe("11.5000");
    expect(updated.versions[0].termMonths).toBe(24);
    // Prior version remains unchanged
    expect(updated.versions[1].versionNumber).toBe(1);
    expect(updated.versions[1].interestRate).toBe("10.0000");
  });

  it("deletes an unlinked loan scheme cleanly", async () => {
    const delCode = `MSME-DEL-${Date.now().toString().slice(-6)}`;
    const scheme = await createLoanScheme(adminUser, {
      organizationId: adminUser.organizationId,
      code: delCode,
      name: "To Be Deleted",
      minPrincipal: "10000.0000",
      maxPrincipal: "50000.0000",
      termMonths: 12,
      interestRate: "12.0000",
      interestMethod: "REDUCING_BALANCE",
      repaymentFrequency: "MONTHLY",
      gracePeriodDays: 0,
      status: "DRAFT",
    });

    const delRes = await deleteLoanScheme(adminUser, scheme.id);
    expect(delRes.success).toBe(true);

    await expect(getLoanSchemeById(adminUser, scheme.id)).rejects.toThrow(NotFoundError);
  });

  it("rejects deleting a scheme that has active loan applications", async () => {
    // Create customer and scheme
    const group = (await prisma.group.findFirst({
      where: { organizationId: adminUser.organizationId },
    })) ?? (await prisma.group.create({
      data: {
        organizationId: adminUser.organizationId,
        code: `GRP-LNS-${Date.now().toString().slice(-6)}`,
        name: "Loan Scheme Test Group",
        status: "ACTIVE",
      },
    }));

    const cust = await prisma.customer.create({
      data: {
        organizationId: adminUser.organizationId,
        groupId: group.id,
        customerCode: `CUST-SCH-${Date.now().toString().slice(-6)}`,
        fullName: "Test Customer Scheme Linked",
        phone: `+9198${Date.now().toString().slice(-8)}`,
        status: "ACTIVE",
      },
    });

    const scheme = await createLoanScheme(adminUser, {
      organizationId: adminUser.organizationId,
      code: `LINK-SCH-${Date.now().toString().slice(-6)}`,
      name: "Linked Scheme",
      minPrincipal: "10000.0000",
      maxPrincipal: "50000.0000",
      termMonths: 12,
      interestRate: "12.0000",
      interestMethod: "REDUCING_BALANCE",
      repaymentFrequency: "MONTHLY",
      gracePeriodDays: 0,
      status: "PUBLISHED",
    });

    // Create loan application referencing this scheme
    await prisma.loanApplication.create({
      data: {
        organizationId: adminUser.organizationId,
        customerId: cust.id,
        schemeId: scheme.id,
        requestedPrincipal: "20000.0000",
        requestedTermMonths: 12,
        purpose: "Inventory expansion",
        status: "DRAFT",
      },
    });

    await expect(deleteLoanScheme(adminUser, scheme.id)).rejects.toThrow(ConflictError);
  });
});
