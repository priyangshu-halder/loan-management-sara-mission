import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { ValidationError } from "@/lib/errors/app-error";
import { requireOrganizationScope, requirePermission } from "@/lib/permissions/auth-guard";
import { AuthenticatedUser } from "@/lib/permissions/types";
import { Money, toDecimal } from "@/lib/money/money";

const portfolioDashboardSchema = z.object({
  organizationId: z.string().uuid(),
  asOfDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export interface PortfolioDashboardReport {
  asOfDate: string;
  customers: {
    active: number;
    total: number;
  };
  loanPortfolio: {
    disbursed: string;
    outstanding: string;
    activeAccounts: number;
    overdue: string;
  };
  collections: {
    today: string;
    total: string;
  };
  savings: {
    totalBalance: string;
    activeAccounts: number;
  };
  termDeposits: {
    totalPrincipal: string;
    activeAccounts: number;
  };
  expenses: {
    totalPosted: string;
    count: number;
  };
}

export async function getPortfolioDashboard(
  caller: AuthenticatedUser,
  input: z.infer<typeof portfolioDashboardSchema>
): Promise<PortfolioDashboardReport> {
  requireOrganizationScope(caller, input.organizationId);
  requirePermission(caller, "report.read");

  const parsed = portfolioDashboardSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message ?? "Invalid portfolio dashboard request");
  }

  const payload = parsed.data;

  const [customerSummary, loanRecords, collectionRecords, savingsRecords, depositRecords, expenseRecords] = await Promise.all([
    prisma.customer.groupBy({
      by: ["status"],
      _count: { id: true },
      where: { organizationId: payload.organizationId },
    }),
    prisma.loanAccount.findMany({
      where: { organizationId: payload.organizationId },
      select: { id: true, principalDisbursed: true, principalOutstanding: true },
    }),
    prisma.collectionReceipt.findMany({
      where: {
        organizationId: payload.organizationId,
        businessDate: payload.asOfDate,
        status: "POSTED",
      },
      select: { amount: true },
    }),
    prisma.savingsAccount.findMany({
      where: { organizationId: payload.organizationId, status: "ACTIVE" },
      select: { balance: true },
    }),
    prisma.termDepositAccount.findMany({
      where: { organizationId: payload.organizationId, status: "ACTIVE" },
      select: { principal: true },
    }),
    prisma.expense.findMany({
      where: {
        organizationId: payload.organizationId,
        status: "POSTED",
        expenseDate: payload.asOfDate,
      },
      select: { amount: true },
    }),
  ]);

  const activeCustomers = customerSummary.find((entry) => entry.status === "ACTIVE")?._count.id ?? 0;
  const totalCustomers = customerSummary.reduce((sum, entry) => sum + (entry._count.id ?? 0), 0);

  const loanSummary = loanRecords.reduce(
    (acc, record) => {
      acc.disbursed = acc.disbursed.plus(toDecimal(record.principalDisbursed));
      acc.outstanding = acc.outstanding.plus(toDecimal(record.principalOutstanding));
      acc.count += 1;
      return acc;
    },
    { disbursed: toDecimal("0"), outstanding: toDecimal("0"), count: 0 }
  );

  const totalCollections = collectionRecords.reduce(
    (sum, record) => sum.plus(toDecimal(record.amount)),
    toDecimal("0")
  );
  const totalSavings = savingsRecords.reduce(
    (sum, record) => sum.plus(toDecimal(record.balance)),
    toDecimal("0")
  );
  const totalTermDeposits = depositRecords.reduce(
    (sum, record) => sum.plus(toDecimal(record.principal)),
    toDecimal("0")
  );
  const totalExpenseAmount = expenseRecords.reduce(
    (sum, record) => sum.plus(toDecimal(record.amount)),
    toDecimal("0")
  );

  return {
    asOfDate: payload.asOfDate,
    customers: {
      active: activeCustomers,
      total: totalCustomers,
    },
    loanPortfolio: {
      disbursed: loanSummary.disbursed.toFixed(4),
      outstanding: loanSummary.outstanding.toFixed(4),
      activeAccounts: loanSummary.count,
      overdue: Money.zero().toStorageString(),
    },
    collections: {
      today: totalCollections.toFixed(4),
      total: totalCollections.toFixed(4),
    },
    savings: {
      totalBalance: totalSavings.toFixed(4),
      activeAccounts: savingsRecords.length,
    },
    termDeposits: {
      totalPrincipal: totalTermDeposits.toFixed(4),
      activeAccounts: depositRecords.length,
    },
    expenses: {
      totalPosted: totalExpenseAmount.toFixed(4),
      count: expenseRecords.length,
    },
  };
}
