import React from "react";
import { getCurrentUser, requirePermission } from "@/lib/permissions/auth-guard";
import { prisma } from "@/lib/db/prisma";
import { getSavingsAccounts } from "@/modules/savings/savings-service";
import { getCustomers } from "@/modules/customers/customer-service";
import { SavingsClient } from "./SavingsClient";
import Decimal from "decimal.js";

export default async function SavingsPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  requirePermission(user, "savings.account.manage");

  const [accountsResult, customersResult, cashAccounts] = await Promise.all([
    getSavingsAccounts(user, { limit: 100 }),
    getCustomers(user, { pageSize: 100 }),
    prisma.cashAccount.findMany({
      where: { organizationId: user.organizationId, isActive: true },
      select: {
        id: true,
        code: true,
        name: true,
        accountType: true,
        balance: true,
      },
    }),
  ]);

  // Aggregate metrics
  const totalBalance = accountsResult.items.reduce(
    (sum, a) => sum.plus(new Decimal(a.balance)),
    new Decimal(0)
  );
  const activeCount = accountsResult.items.filter((a) => a.status === "ACTIVE").length;

  const interestPostings = await prisma.depositInterestPosting.findMany({
    where: { organizationId: user.organizationId, accountType: "SAVINGS" },
    select: { interestAmount: true },
  });

  const totalInterestSum = interestPostings.reduce(
    (sum, p) => sum.plus(new Decimal(p.interestAmount || "0")),
    new Decimal(0)
  );

  const summary = {
    totalSavingsBalance: totalBalance.toFixed(2),
    totalAccounts: accountsResult.total,
    activeAccounts: activeCount,
    totalInterestPaid: totalInterestSum.toFixed(2),
    interestRunsCount: interestPostings.length,
  };

  const serializedAccounts = JSON.parse(JSON.stringify(accountsResult.items));
  const serializedCustomers = JSON.parse(JSON.stringify(customersResult.items));
  const serializedCashAccounts = JSON.parse(JSON.stringify(cashAccounts));

  return (
    <SavingsClient
      summary={summary}
      accounts={serializedAccounts}
      customers={serializedCustomers}
      cashAccounts={serializedCashAccounts}
      currentUserRole={user.roles[0]}
    />
  );
}
