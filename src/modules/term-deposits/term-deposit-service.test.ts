import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { login } from "@/modules/identity/auth-service";
import {
  createDepositProduct,
  openTermDepositAccount,
  previewTermDepositMaturity,
  payRdInstallment,
  postTermDepositInterest,
  payoutTermDepositMaturity,
  prematureCloseTermDeposit,
  getDepositProducts,
  getTermDepositAccounts,
  getTermDepositAccountById,
} from "./term-deposit-service";
import { openSavingsAccount } from "@/modules/savings/savings-service";
import { ValidationError } from "@/lib/errors/app-error";

describe("Term deposits", () => {
  let adminUser: Awaited<ReturnType<typeof login>>["user"];
  let customerId: string;
  let fdAccountId: string;
  let fdProductId: string;
  let savingsAccountId: string;

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
        code: `GRP-TD-${Date.now().toString().slice(-6)}`,
        name: "Term Deposit Group",
        status: "ACTIVE",
      },
    }));

    const customer = await prisma.customer.create({
      data: {
        organizationId: adminUser.organizationId,
        groupId: group.id,
        customerCode: `TD-CUST-${Date.now().toString().slice(-6)}`,
        fullName: "Term Deposit Customer",
        phone: `+91-${Date.now().toString().slice(-9)}`,
        email: `termdeposit.${Date.now().toString().slice(-6)}@example.com`,
        status: "ACTIVE",
      },
    });
    customerId = customer.id;

    const savings = await openSavingsAccount(adminUser, {
      organizationId: adminUser.organizationId,
      customerId,
      accountNumber: `SV-TD-${Date.now().toString().slice(-6)}`,
      productName: "Member Savings",
    });
    savingsAccountId = savings.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("creates an FD product and opens an FD account with provisional maturity preview", async () => {
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
    fdProductId = product.id;

    expect(product.productType).toBe("FD");

    const account = await openTermDepositAccount(adminUser, {
      organizationId: adminUser.organizationId,
      customerId,
      productId: product.id,
      accountNumber: `FD-ACC-${Date.now().toString().slice(-8)}`,
      principal: "25000.0000",
      maturityDate: "2027-10-22",
      status: "ACTIVE",
    });
    fdAccountId = account.id;

    expect(account.principal).toBe("25000.0000");
    expect(account.currentBalance).toBe("25000.0000");

    const preview = await previewTermDepositMaturity(adminUser, {
      organizationId: adminUser.organizationId,
      accountId: account.id,
      asOfDate: "2026-10-22",
    });

    expect(preview.principalAmount).toBe("25000.0000");
    expect(preview.maturityDate).toBe("2027-10-22");
    expect(preview.status).toBe("PROVISIONAL");
    expect(Number(preview.projectedMaturityValue)).toBeGreaterThan(25000);
  });

  it("creates an RD product, generates installment schedule, and accepts installment payments", async () => {
    const rdProduct = await createDepositProduct(adminUser, {
      organizationId: adminUser.organizationId,
      code: `RD-${Date.now().toString().slice(-6)}`,
      name: "Recurring Deposit Monthly",
      productType: "RD",
      interestRate: "6.5000",
      termMonths: 6,
      minPrincipal: "1000.0000",
      maxPrincipal: "50000.0000",
      installmentFrequency: "MONTHLY",
      status: "ACTIVE",
    });

    const rdAccount = await openTermDepositAccount(adminUser, {
      organizationId: adminUser.organizationId,
      customerId,
      productId: rdProduct.id,
      accountNumber: `RD-ACC-${Date.now().toString().slice(-8)}`,
      principal: "2000.0000",
      status: "ACTIVE",
    });

    // Check that 6 installments were generated
    const installments = await prisma.rdInstallment.findMany({
      where: { accountId: rdAccount.id },
      orderBy: { installmentNumber: "asc" },
    });

    expect(installments.length).toBe(6);
    expect(installments[0].installmentNumber).toBe(1);
    expect(installments[0].status).toBe("PAID"); // First installment is paid on account opening
    expect(installments[1].status).toBe("PENDING");

    // Pay installment #2
    const paidInst = await payRdInstallment(adminUser, {
      organizationId: adminUser.organizationId,
      accountId: rdAccount.id,
      installmentNumber: 2,
      amount: "2000.0000",
      transactionRef: `RD-PAY-2-${Date.now().toString().slice(-6)}`,
    });

    expect(paidInst.status).toBe("PAID");
    expect(paidInst.installmentNumber).toBe(2);

    const updatedRd = await prisma.termDepositAccount.findUnique({ where: { id: rdAccount.id } });
    expect(updatedRd?.currentBalance).toBe("4000.0000");
  });

  it("posts periodic interest to FD account and enforces idempotency", async () => {
    const period = "2026-10";
    const posting = await postTermDepositInterest(adminUser, {
      organizationId: adminUser.organizationId,
      accountId: fdAccountId,
      accrualPeriod: period,
      calculationDate: "2026-10-31",
    });

    expect(posting.accountType).toBe("FD");
    expect(posting.accrualPeriod).toBe(period);
    expect(Number(posting.interestAmount)).toBeGreaterThan(0);

    // Duplicate posting for the same period should throw
    await expect(
      postTermDepositInterest(adminUser, {
        organizationId: adminUser.organizationId,
        accountId: fdAccountId,
        accrualPeriod: period,
        calculationDate: "2026-10-31",
      })
    ).rejects.toThrow(ValidationError);
  });

  it("settles maturity payout directly into customer savings account", async () => {
    const savingsBefore = await prisma.savingsAccount.findUnique({ where: { id: savingsAccountId } });
    const balanceBefore = Number(savingsBefore?.balance || 0);

    const settled = await payoutTermDepositMaturity(adminUser, {
      organizationId: adminUser.organizationId,
      accountId: fdAccountId,
      payoutDate: "2027-10-22",
      savingsAccountId,
    });

    expect(settled.status).toBe("MATURED");
    expect(settled.closureDate).toBe("2027-10-22");
    expect(Number(settled.closureAmount)).toBeGreaterThan(25000);

    const savingsAfter = await prisma.savingsAccount.findUnique({ where: { id: savingsAccountId } });
    expect(Number(savingsAfter?.balance)).toBe(balanceBefore + Number(settled.closureAmount));
  });

  it("prematurely closes a deposit account with penal interest rate", async () => {
    const prematureAccount = await openTermDepositAccount(adminUser, {
      organizationId: adminUser.organizationId,
      customerId,
      productId: fdProductId,
      accountNumber: `FD-PRE-${Date.now().toString().slice(-8)}`,
      principal: "10000.0000",
      depositDate: "2026-01-15",
      maturityDate: "2027-01-15",
      status: "ACTIVE",
    });

    const closed = await prematureCloseTermDeposit(adminUser, {
      organizationId: adminUser.organizationId,
      accountId: prematureAccount.id,
      closureDate: "2026-06-15",
      reason: "Emergency medical expense premature closure",
    });

    expect(closed.status).toBe("PREMATURE_CLOSED");
    expect(closed.closureReason).toBe("Emergency medical expense premature closure");
    expect(Number(closed.closureAmount)).toBeGreaterThanOrEqual(10000);
    expect(closed.currentBalance).toBe("0.0000");
  });

  it("prematurely closes an FD with prior accrued periodic interest, clearing liability cleanly (FIN-04)", async () => {
    // Open a fresh FD
    const fd = await openTermDepositAccount(adminUser, {
      organizationId: adminUser.organizationId,
      customerId,
      productId: fdProductId,
      accountNumber: `FD-ACCR-${Date.now().toString().slice(-8)}`,
      principal: "20000.0000",
      depositDate: "2026-01-01",
      maturityDate: "2027-01-01",
      status: "ACTIVE",
    });

    // Post periodic interest for period 2026-01
    await postTermDepositInterest(adminUser, {
      organizationId: adminUser.organizationId,
      accountId: fd.id,
      accrualPeriod: "2026-01",
      calculationDate: "2026-01-31",
    });

    // Now prematurely close in month 3
    const closed = await prematureCloseTermDeposit(adminUser, {
      organizationId: adminUser.organizationId,
      accountId: fd.id,
      closureDate: "2026-03-15",
      reason: "Early withdrawal with accrued interest",
    });

    expect(closed.status).toBe("PREMATURE_CLOSED");
    expect(closed.currentBalance).toBe("0.0000");
    expect(closed.closureJournalEntryId).toBeDefined();

    // Verify closure journal entry is balanced and reconciled
    const journal = await prisma.journalEntry.findUniqueOrThrow({
      where: { id: closed.closureJournalEntryId! },
      include: { lines: true },
    });

    const totalDebit = journal.lines.reduce((s, l) => s + parseFloat(String(l.debit)), 0);
    const totalCredit = journal.lines.reduce((s, l) => s + parseFloat(String(l.credit)), 0);
    expect(Math.abs(totalDebit - totalCredit)).toBeLessThan(0.0001);
  });

  it("lists products and accounts, and gets detailed account view", async () => {
    const products = await getDepositProducts(adminUser);
    expect(products.length).toBeGreaterThan(0);

    const accounts = await getTermDepositAccounts(adminUser, { limit: 10 });
    expect(accounts.total).toBeGreaterThan(0);

    const details = await getTermDepositAccountById(adminUser, fdAccountId);
    expect(details.id).toBe(fdAccountId);
    expect(details.interestPostings.length).toBeGreaterThanOrEqual(1);
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
