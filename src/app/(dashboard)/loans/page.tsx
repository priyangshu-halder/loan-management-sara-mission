import React from "react";
import { getCurrentUser, requirePermission, requireAnyPermission } from "@/lib/permissions/auth-guard";
import { prisma } from "@/lib/db/prisma";
import {
  getLoanAccounts,
  getLoanPortfolioSummary,
} from "@/modules/loans/loan-account-service";
import { getLoanApplications } from "@/modules/loans/loan-application-service";
import { getLoanSchemes } from "@/modules/loans/loan-scheme-service";
import { getCustomers } from "@/modules/customers/customer-service";
import { getLoanClosures } from "@/modules/loans/loan-closure-service";
import { LoansClient } from "./LoansClient";

export default async function LoansPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  requireAnyPermission(
    user,
    "loan.account.read",
    "loan.application.view",
    "loan.application.approve"
  );

  const [summary, accountsResult, appsResult, customersResult, schemes, cashAccounts, closuresResult] =
    await Promise.all([
      getLoanPortfolioSummary(user),
      getLoanAccounts(user, { limit: 100 }),
      getLoanApplications(user, { limit: 100 }),
      getCustomers(user, { pageSize: 100 }),
      getLoanSchemes(user),
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
      getLoanClosures(user, { limit: 100 }),
    ]);

  const serializedSummary = JSON.parse(JSON.stringify(summary));
  const serializedAccounts = JSON.parse(JSON.stringify(accountsResult.items));
  const serializedApps = JSON.parse(JSON.stringify(appsResult.items));
  const serializedCustomers = JSON.parse(JSON.stringify(customersResult.items));
  const serializedSchemes = JSON.parse(JSON.stringify(schemes));
  const serializedCashAccounts = JSON.parse(JSON.stringify(cashAccounts));
  const serializedClosures = JSON.parse(JSON.stringify(closuresResult.items));

  return (
    <LoansClient
      currentUserId={user.userId}
      userRole={user.roles[0]}
      userPermissions={Array.from(user.permissions)}
      summary={serializedSummary}
      accounts={serializedAccounts}
      applications={serializedApps}
      customers={serializedCustomers}
      schemes={serializedSchemes}
      cashAccounts={serializedCashAccounts}
      closures={serializedClosures}
    />
  );
}
