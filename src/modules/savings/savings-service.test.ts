import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { login } from "@/modules/identity/auth-service";
import { openSavingsAccount, depositToSavingsAccount, withdrawFromSavingsAccount } from "./savings-service";
import { ValidationError } from "@/lib/errors/app-error";

describe("Savings accounts and transactions", () => {
  let adminUser: Awaited<ReturnType<typeof login>>["user"];
  let customerId: string;
  let savingsAccountId: string;

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
        customerCode: `SAV-CUST-${Date.now().toString().slice(-6)}`,
        fullName: "Savings Customer",
        phone: `+91-${Date.now().toString().slice(-9)}`,
        email: `savings.${Date.now().toString().slice(-6)}@example.com`,
        status: "ACTIVE",
      },
    });
    customerId = customer.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("opens a savings account, accepts a deposit, and allows a valid withdrawal", async () => {
    const account = await openSavingsAccount(adminUser, {
      organizationId: adminUser.organizationId,
      customerId,
      accountNumber: `SV-${Date.now().toString().slice(-8)}`,
      productName: "General Savings",
      status: "ACTIVE",
    });
    savingsAccountId = account.id;

    expect(account.status).toBe("ACTIVE");
    expect(account.balance).toBe("0.0000");

    const deposit = await depositToSavingsAccount(adminUser, {
      organizationId: adminUser.organizationId,
      accountId: account.id,
      amount: "5000.0000",
      transactionRef: `DEP-${Date.now().toString().slice(-8)}`,
      note: "Initial deposit",
    });

    expect(deposit.amount).toBe("5000.0000");
    expect(deposit.type).toBe("DEPOSIT");

    const updatedAccount = await prisma.savingsAccount.findUnique({ where: { id: account.id } });
    expect(updatedAccount?.balance).toBe("5000.0000");

    const withdrawal = await withdrawFromSavingsAccount(adminUser, {
      organizationId: adminUser.organizationId,
      accountId: account.id,
      amount: "2000.0000",
      transactionRef: `WD-${Date.now().toString().slice(-8)}`,
      note: "Partial withdrawal",
    });

    expect(withdrawal.amount).toBe("2000.0000");
    expect(withdrawal.type).toBe("WITHDRAWAL");

    const finalAccount = await prisma.savingsAccount.findUnique({ where: { id: account.id } });
    expect(finalAccount?.balance).toBe("3000.0000");
  });

  it("rejects withdrawals above the available balance", async () => {
    await expect(
      withdrawFromSavingsAccount(adminUser, {
        organizationId: adminUser.organizationId,
        accountId: savingsAccountId,
        amount: "5000.0000",
        transactionRef: `WD-${Date.now().toString().slice(-8)}`,
        note: "Overdraw attempt",
      })
    ).rejects.toThrow(ValidationError);
  });
});
