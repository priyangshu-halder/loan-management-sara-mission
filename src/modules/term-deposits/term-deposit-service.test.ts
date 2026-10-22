import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { login } from "@/modules/identity/auth-service";
import { createDepositProduct, openTermDepositAccount, previewTermDepositMaturity } from "./term-deposit-service";
import { ValidationError } from "@/lib/errors/app-error";

describe("Term deposits", () => {
  let adminUser: Awaited<ReturnType<typeof login>>["user"];
  let customerId: string;

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
        customerCode: `TD-CUST-${Date.now().toString().slice(-6)}`,
        fullName: "Term Deposit Customer",
        phone: `+91-${Date.now().toString().slice(-9)}`,
        email: `termdeposit.${Date.now().toString().slice(-6)}@example.com`,
        status: "ACTIVE",
      },
    });
    customerId = customer.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("creates a deposit product and opens an FD account with a provisional maturity preview", async () => {
    const product = await createDepositProduct(adminUser, {
      organizationId: adminUser.organizationId,
      code: `FD-${Date.now().toString().slice(-6)}`,
      name: "Fixed Deposit Standard",
      productType: "FD",
      interestRate: "7.2500",
      termMonths: 12,
      minPrincipal: "5000.0000",
      maxPrincipal: "500000.0000",
      status: "ACTIVE",
    });

    expect(product.productType).toBe("FD");

    const account = await openTermDepositAccount(adminUser, {
      organizationId: adminUser.organizationId,
      customerId,
      productId: product.id,
      accountNumber: `TD-${Date.now().toString().slice(-8)}`,
      principal: "25000.0000",
      maturityDate: "2027-10-22",
      status: "ACTIVE",
    });

    expect(account.principal).toBe("25000.0000");

    const preview = await previewTermDepositMaturity(adminUser, {
      organizationId: adminUser.organizationId,
      accountId: account.id,
      asOfDate: "2026-10-22",
    });

    expect(preview.principalAmount).toBe("25000.0000");
    expect(preview.maturityDate).toBe("2027-10-22");
    expect(preview.status).toBe("PROVISIONAL");
  });

  it("rejects invalid deposit product configuration", async () => {
    await expect(
      createDepositProduct(adminUser, {
        organizationId: adminUser.organizationId,
        code: "",
        name: "Bad product",
        productType: "FD",
        interestRate: "-5.0000",
        termMonths: 0,
        minPrincipal: "0.0000",
        maxPrincipal: "20000.0000",
        status: "ACTIVE",
      })
    ).rejects.toThrow(ValidationError);
  });
});
