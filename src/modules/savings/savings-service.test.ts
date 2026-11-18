import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { login } from "@/modules/identity/auth-service";
import {
  openSavingsAccount,
  depositToSavingsAccount,
  withdrawFromSavingsAccount,
  reverseSavingsTransaction,
  postSavingsInterest,
  getSavingsAccounts,
  getSavingsAccountById,
} from "./savings-service";
import { ValidationError } from "@/lib/errors/app-error";

describe("Savings accounts and transactions", () => {
  let adminUser: Awaited<ReturnType<typeof login>>["user"];
  let customerId: string;
  let savingsAccountId: string;
  let lastWithdrawalId: string;

  beforeAll(async () => {
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
        code: `GRP-SAV-${Date.now().toString().slice(-6)}`,
        name: "Savings Test Group",
        status: "ACTIVE",
      },
    }));

    const customer = await prisma.customer.create({
      data: {
        organizationId: adminUser.organizationId,
        groupId: group.id,
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
      minBalance: "500.0000",
      interestRate: "4.0000",
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
    lastWithdrawalId = withdrawal.id;

    const finalAccount = await prisma.savingsAccount.findUnique({ where: { id: account.id } });
    expect(finalAccount?.balance).toBe("3000.0000");
  });

  it("rejects withdrawals that would breach minimum balance", async () => {
    // Current balance is 3000, minBalance is 500, max withdrawal allowed is 2500.
    await expect(
      withdrawFromSavingsAccount(adminUser, {
        organizationId: adminUser.organizationId,
        accountId: savingsAccountId,
        amount: "2600.0000",
        transactionRef: `WD-MIN-${Date.now().toString().slice(-8)}`,
        note: "Breach min balance attempt",
      })
    ).rejects.toThrow(ValidationError);
  });

  it("reverses a withdrawal and restores savings balance", async () => {
    const reversed = await reverseSavingsTransaction(adminUser, {
      organizationId: adminUser.organizationId,
      transactionId: lastWithdrawalId,
      reversalReason: "Customer requested withdrawal reversal",
    });

    expect(reversed.isReversed).toBe(true);
    expect(reversed.status).toBe("REVERSED");
    expect(reversed.reversalReason).toBe("Customer requested withdrawal reversal");

    const restoredAccount = await prisma.savingsAccount.findUnique({ where: { id: savingsAccountId } });
    expect(restoredAccount?.balance).toBe("5000.0000");

    // Second reversal attempt should fail
    await expect(
      reverseSavingsTransaction(adminUser, {
        organizationId: adminUser.organizationId,
        transactionId: lastWithdrawalId,
        reversalReason: "Duplicate reversal",
      })
    ).rejects.toThrow(ValidationError);
  });

  it("posts periodic interest to savings account and enforces idempotency per period", async () => {
    const period = "2026-10";
    const posting = await postSavingsInterest(adminUser, {
      organizationId: adminUser.organizationId,
      accountId: savingsAccountId,
      accrualPeriod: period,
      calculationDate: "2026-10-31",
      daysCount: 30,
    });

    expect(posting.accountType).toBe("SAVINGS");
    expect(posting.accrualPeriod).toBe(period);
    expect(Number(posting.interestAmount)).toBeGreaterThan(0);

    const postInterestAccount = await prisma.savingsAccount.findUnique({ where: { id: savingsAccountId } });
    expect(Number(postInterestAccount?.balance)).toBeGreaterThan(5000);

    // Duplicate posting for the same period must be rejected
    await expect(
      postSavingsInterest(adminUser, {
        organizationId: adminUser.organizationId,
        accountId: savingsAccountId,
        accrualPeriod: period,
        calculationDate: "2026-10-31",
        daysCount: 30,
      })
    ).rejects.toThrow(ValidationError);
  });

  it("retrieves savings account lists and detailed account history", async () => {
    const list = await getSavingsAccounts(adminUser, { limit: 10 });
    expect(list.total).toBeGreaterThan(0);
    expect(list.items.some((a) => a.id === savingsAccountId)).toBe(true);

    const details = await getSavingsAccountById(adminUser, savingsAccountId);
    expect(details.id).toBe(savingsAccountId);
    expect(details.transactions.length).toBeGreaterThanOrEqual(3); // Deposit, Withdrawal, Interest
    expect(details.interestPostings.length).toBeGreaterThanOrEqual(1);
  });

  it("handles concurrent withdrawals safely without overdrafting account (CONC-01)", async () => {
    // Open a fresh account with exactly ₹1,000 and 0 minBalance
    const concAccount = await openSavingsAccount(adminUser, {
      organizationId: adminUser.organizationId,
      customerId,
      accountNumber: `SV-CONC-${Date.now().toString().slice(-8)}`,
      productName: "Concurrent Savings Test",
      minBalance: "0.0000",
      interestRate: "3.5000",
      status: "ACTIVE",
    });

    await depositToSavingsAccount(adminUser, {
      organizationId: adminUser.organizationId,
      accountId: concAccount.id,
      amount: "1000.0000",
      transactionRef: `DEP-INIT-${Date.now().toString().slice(-8)}`,
      note: "Initial 1000 deposit",
    });

    // Execute two concurrent withdrawals of 600 each in parallel (total 1200 > 1000)
    const [res1, res2] = await Promise.allSettled([
      withdrawFromSavingsAccount(adminUser, {
        organizationId: adminUser.organizationId,
        accountId: concAccount.id,
        amount: "600.0000",
        transactionRef: `WD-CONC1-${Date.now().toString().slice(-8)}`,
        note: "Concurrent withdrawal 1",
      }),
      withdrawFromSavingsAccount(adminUser, {
        organizationId: adminUser.organizationId,
        accountId: concAccount.id,
        amount: "600.0000",
        transactionRef: `WD-CONC2-${Date.now().toString().slice(-8)}`,
        note: "Concurrent withdrawal 2",
      }),
    ]);

    const successes = [res1, res2].filter((r) => r.status === "fulfilled");
    const failures = [res1, res2].filter((r) => r.status === "rejected");

    // Exactly one must succeed, one must fail due to insufficient funds
    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);
    if (failures[0].status === "rejected") {
      expect((failures[0].reason as Error).message).toContain("exceeds available savings balance");
    }

    // Verify balance is exactly 400.0000 and not overdrawn
    const finalAccount = await prisma.savingsAccount.findUnique({ where: { id: concAccount.id } });
    expect(finalAccount?.balance).toBe("400.0000");
  });

  it("handles concurrent deposits safely without lost updates (CONC-01)", async () => {
    // Open an account with 0 balance
    const concAccount = await openSavingsAccount(adminUser, {
      organizationId: adminUser.organizationId,
      customerId,
      accountNumber: `SV-DEP-CONC-${Date.now().toString().slice(-8)}`,
      productName: "Concurrent Deposit Test",
      minBalance: "0.0000",
      interestRate: "3.5000",
      status: "ACTIVE",
    });

    // Execute two concurrent deposits of 500 each in parallel
    const [res1, res2] = await Promise.allSettled([
      depositToSavingsAccount(adminUser, {
        organizationId: adminUser.organizationId,
        accountId: concAccount.id,
        amount: "500.0000",
        transactionRef: `DEP-CONC1-${Date.now().toString().slice(-8)}`,
        note: "Concurrent deposit 1",
      }),
      depositToSavingsAccount(adminUser, {
        organizationId: adminUser.organizationId,
        accountId: concAccount.id,
        amount: "500.0000",
        transactionRef: `DEP-CONC2-${Date.now().toString().slice(-8)}`,
        note: "Concurrent deposit 2",
      }),
    ]);

    expect(res1.status).toBe("fulfilled");
    expect(res2.status).toBe("fulfilled");

    // Verify balance is exactly 1000.0000
    const finalAccount = await prisma.savingsAccount.findUnique({ where: { id: concAccount.id } });
    expect(finalAccount?.balance).toBe("1000.0000");
  });
});
