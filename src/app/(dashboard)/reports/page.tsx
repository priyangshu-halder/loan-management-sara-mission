import React from "react";
import { redirect } from "next/navigation";
import { getCurrentUser, requirePermission } from "@/lib/permissions/auth-guard";
import {
  getPortfolioAgingReport,
  getCollectionPerformanceReport,
  getDepositMaturitiesReport,
  getFinancialStatementsReport,
} from "@/modules/reports/report-service";
import { getTodayBusinessDate } from "@/lib/dates/dates";
import { ReportsClient } from "./ReportsClient";

export default async function ReportsPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  // Enforce server-side reporting permission
  requirePermission(user, "report.read");

  const today = getTodayBusinessDate();
  const startOfMonth = `${today.slice(0, 7)}-01`;

  // Fetch initial reporting datasets in parallel
  const [agingReport, collectionsReport, depositsReport, financialsReport] =
    await Promise.all([
      getPortfolioAgingReport(user, {
        organizationId: user.organizationId,
        asOfDate: today,
      }),
      getCollectionPerformanceReport(user, {
        organizationId: user.organizationId,
        startDate: startOfMonth,
        endDate: today,
      }),
      getDepositMaturitiesReport(user, {
        organizationId: user.organizationId,
        asOfDate: today,
      }),
      getFinancialStatementsReport(user, {
        organizationId: user.organizationId,
        startDate: startOfMonth,
        endDate: today,
      }),
    ]);

  const serializedAging = JSON.parse(JSON.stringify(agingReport));
  const serializedCollections = JSON.parse(JSON.stringify(collectionsReport));
  const serializedDeposits = JSON.parse(JSON.stringify(depositsReport));
  const serializedFinancials = JSON.parse(JSON.stringify(financialsReport));

  return (
    <ReportsClient
      initialAging={serializedAging}
      initialCollections={serializedCollections}
      initialDeposits={serializedDeposits}
      initialFinancials={serializedFinancials}
      defaultDate={today}
      userPermissions={Array.from(user.permissions)}
    />
  );
}

