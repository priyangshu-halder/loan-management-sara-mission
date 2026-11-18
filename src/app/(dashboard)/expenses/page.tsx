import React from "react";
import { getCurrentUser, requirePermission } from "@/lib/permissions/auth-guard";
import { prisma } from "@/lib/db/prisma";
import {
  getExpenses,
  getExpenseCategories,
  getExpenseSummary,
} from "@/modules/expenses/expense-service";
import { ExpensesClient } from "./ExpensesClient";

export default async function ExpensesPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  requirePermission(user, "expense.submit");

  const [expensesResult, categories, summary, cashAccounts, expenseCoas] = await Promise.all([
    getExpenses(user, { limit: 100 }),
    getExpenseCategories(user),
    getExpenseSummary(user),
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
    prisma.chartOfAccount.findMany({
      where: { organizationId: user.organizationId, accountType: "EXPENSE", isActive: true },
      select: {
        id: true,
        code: true,
        name: true,
      },
      orderBy: { code: "asc" },
    }),
  ]);

  const serializedExpenses = JSON.parse(JSON.stringify(expensesResult.items));
  const serializedCategories = JSON.parse(JSON.stringify(categories));
  const serializedCashAccounts = JSON.parse(JSON.stringify(cashAccounts));
  const serializedExpenseCoas = JSON.parse(JSON.stringify(expenseCoas));

  return (
    <ExpensesClient
      summary={summary}
      expenses={serializedExpenses}
      categories={serializedCategories}
      cashAccounts={serializedCashAccounts}
      expenseCoas={serializedExpenseCoas}
      currentUserId={user.userId}
      currentUserRole={user.roles[0]}
      isOrgAdmin={user.isOrgAdmin || user.isSuperAdmin}
    />
  );
}

