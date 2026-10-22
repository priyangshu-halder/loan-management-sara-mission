import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export const STANDARD_CHART_OF_ACCOUNTS = [
  // Assets (1000 - 1999)
  { code: "1001", name: "Cash in Vault (Main)", accountType: "ASSET", description: "Main branch physical cash vault" },
  { code: "1002", name: "Bank Current Account (HDFC)", accountType: "ASSET", description: "Primary operating commercial bank account" },
  { code: "1201", name: "Loan Principal Receivable", accountType: "ASSET", description: "Outstanding loan principal due from borrowers" },
  { code: "1202", name: "Interest Receivable on Loans", accountType: "ASSET", description: "Accrued interest due from borrowers" },
  { code: "1203", name: "Fee & Charges Receivable", accountType: "ASSET", description: "Processing and administrative fees due" },
  { code: "1204", name: "Penalty Receivable", accountType: "ASSET", description: "Late payment penalty due" },

  // Liabilities (2000 - 2999)
  { code: "2001", name: "Member Savings Deposit Liability", accountType: "LIABILITY", description: "Voluntary member savings balances" },
  { code: "2002", name: "Recurring Deposit (RD) Liability", accountType: "LIABILITY", description: "Member recurring deposit holdings" },
  { code: "2003", name: "Fixed Deposit (FD) Liability", accountType: "LIABILITY", description: "Member term fixed deposit contracts" },
  { code: "2004", name: "Advance Collections (Unapplied Credit)", accountType: "LIABILITY", description: "Borrower advance payments awaiting installment allocation" },

  // Equity (3000 - 3999)
  { code: "3001", name: "Paid-in Capital", accountType: "EQUITY", description: "Initial capital contributions" },
  { code: "3002", name: "Retained Earnings", accountType: "EQUITY", description: "Accumulated surplus profits and reserves" },

  // Income (4000 - 4999)
  { code: "4001", name: "Interest Income on Microloans", accountType: "INCOME", description: "Earned interest from active loan portfolio" },
  { code: "4002", name: "Loan Processing Fee Income", accountType: "INCOME", description: "Upfront documentation and loan processing fees" },
  { code: "4003", name: "Penalty and Late Fee Income", accountType: "INCOME", description: "Penalties collected on overdue installments" },

  // Expenses (5000 - 5999)
  { code: "5001", name: "Branch Rent & Office Expense", accountType: "EXPENSE", description: "Monthly premises rent and office supplies" },
  { code: "5002", name: "Bank Charges & Transaction Fees", accountType: "EXPENSE", description: "Commercial bank transaction fees" },
  { code: "5003", name: "Provision for Loan Impairment", accountType: "EXPENSE", description: "Expected credit loss and bad debt provisions" },
];

export async function seedAccountingData() {
  const org = await prisma.organization.findUnique({
    where: { code: "RAYHAN-MFI" },
  });

  if (!org) {
    throw new Error("Organization RAYHAN-MFI must exist before seeding accounting foundation.");
  }

  const branch = await prisma.branch.findFirst({
    where: { organizationId: org.id },
  });

  console.log("Seeding standard Chart of Accounts...");
  for (const acc of STANDARD_CHART_OF_ACCOUNTS) {
    await prisma.chartOfAccount.upsert({
      where: {
        organizationId_code: {
          organizationId: org.id,
          code: acc.code,
        },
      },
      update: {
        name: acc.name,
        accountType: acc.accountType,
        description: acc.description,
      },
      create: {
        organizationId: org.id,
        code: acc.code,
        name: acc.name,
        accountType: acc.accountType,
        description: acc.description,
        isSystem: true,
      },
    });
  }
  console.log(`Seeded ${STANDARD_CHART_OF_ACCOUNTS.length} ledger accounts.`);

  // Seed open Fiscal Period for October 2026
  const fiscalPeriod = await prisma.fiscalPeriod.upsert({
    where: {
      organizationId_name: {
        organizationId: org.id,
        name: "FY2026-OCT",
      },
    },
    update: {},
    create: {
      organizationId: org.id,
      name: "FY2026-OCT",
      startDate: new Date("2026-10-01T00:00:00.000Z"),
      endDate: new Date("2026-10-31T23:59:59.999Z"),
      isClosed: false,
    },
  });
  console.log(`Seeded active fiscal period: ${fiscalPeriod.name}`);

  // Seed Cash Accounts mapped to Chart of Accounts
  const cashCoa = await prisma.chartOfAccount.findUnique({
    where: { organizationId_code: { organizationId: org.id, code: "1001" } },
  });

  const bankCoa = await prisma.chartOfAccount.findUnique({
    where: { organizationId_code: { organizationId: org.id, code: "1002" } },
  });

  if (cashCoa) {
    await prisma.cashAccount.upsert({
      where: {
        organizationId_code: {
          organizationId: org.id,
          code: "CASH-VAULT-01",
        },
      },
      update: {},
      create: {
        organizationId: org.id,
        branchId: branch?.id || null,
        chartOfAccountId: cashCoa.id,
        code: "CASH-VAULT-01",
        name: "Head Office Cash Vault",
        accountType: "CASH",
      },
    });
    console.log("Seeded cash vault account CASH-VAULT-01");
  }

  if (bankCoa) {
    await prisma.cashAccount.upsert({
      where: {
        organizationId_code: {
          organizationId: org.id,
          code: "BANK-HDFC-01",
        },
      },
      update: {},
      create: {
        organizationId: org.id,
        branchId: branch?.id || null,
        chartOfAccountId: bankCoa.id,
        code: "BANK-HDFC-01",
        name: "HDFC Operations Account",
        accountType: "BANK",
      },
    });
    console.log("Seeded bank account BANK-HDFC-01");
  }
}

if (require.main === module) {
  seedAccountingData()
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}

