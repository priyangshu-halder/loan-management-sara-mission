import React from "react";
import { getCurrentUser, requirePermission } from "@/lib/permissions/auth-guard";
import { prisma } from "@/lib/db/prisma";
import {
  getDepositProducts,
  getTermDepositAccounts,
} from "@/modules/term-deposits/term-deposit-service";
import { getSavingsAccounts } from "@/modules/savings/savings-service";
import { getCustomers } from "@/modules/customers/customer-service";
import { DepositsClient } from "./DepositsClient";
import Decimal from "decimal.js";

export default async function DepositsPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  requirePermission(user, "deposit.product.manage");

  const [products, accountsResult, savingsAccountsResult, customersResult, cashAccounts] =
    await Promise.all([
      getDepositProducts(user),
      getTermDepositAccounts(user, { limit: 100 }),
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
  const totalPrincipal = accountsResult.items.reduce(
    (sum, a) => sum.plus(new Decimal(a.currentBalance)),
    new Decimal(0)
  );

  const activeFdCount = accountsResult.items.filter(
    (a) => a.status === "ACTIVE" && a.product.productType === "FD"
  ).length;

  const activeRdCount = accountsResult.items.filter(
    (a) => a.status === "ACTIVE" && a.product.productType === "RD"
  ).length;

  const maturedCount = accountsResult.items.filter(
    (a) => a.status === "MATURED" || a.status === "PREMATURE_CLOSED"
  ).length;

  const summary = {
    totalTermDepositBalance: totalPrincipal.toFixed(2),
    totalAccounts: accountsResult.total,
    activeFdCount,
    activeRdCount,
    maturedCount,
  };

  const serializedProducts = JSON.parse(JSON.stringify(products));
  const serializedAccounts = JSON.parse(JSON.stringify(accountsResult.items));
  const serializedSavingsAccounts = JSON.parse(JSON.stringify(savingsAccountsResult.items));
  const serializedCustomers = JSON.parse(JSON.stringify(customersResult.items));
  const serializedCashAccounts = JSON.parse(JSON.stringify(cashAccounts));

  return (
    <DepositsClient
      summary={summary}
      products={serializedProducts}
      accounts={serializedAccounts}
      savingsAccounts={serializedSavingsAccounts}
      customers={serializedCustomers}
      cashAccounts={serializedCashAccounts}
      currentUserRole={user.roles[0]}
    />
  );
}

