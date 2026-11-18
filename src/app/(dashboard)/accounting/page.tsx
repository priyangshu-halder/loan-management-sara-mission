import React from "react";
import { BookOpen, Receipt, Wallet, CheckCircle2, Landmark } from "lucide-react";
import { getCurrentUser, requirePermission } from "@/lib/permissions/auth-guard";
import {
  getDaybook,
  getDailySheet,
  getChartOfAccounts,
  getCashbook,
  getEarliestCashbookDate,
} from "@/modules/accounting/ledger-service";
import { DailySheetClient } from "./DailySheetClient";
import CashbookClient from "./CashbookClient";
import DaybookClient from "./DaybookClient";
import { prisma } from "@/lib/db/prisma";
import { getTodayBusinessDate, formatDisplayDate } from "@/lib/dates/dates";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableEmptyState,
} from "@/components/ui/Table";

export default async function AccountingPage({
  searchParams,
}: {
  searchParams?: {
    tab?: string;
    date?: string;
    cashAccountId?: string;
    startDate?: string;
    endDate?: string;
    voucherNumber?: string;
    sourceModule?: string;
    sourceType?: string;
    search?: string;
    customerOrMember?: string;
    accountId?: string;
    status?: string;
    sortOrder?: "asc" | "desc";
  };
}) {
  const user = await getCurrentUser();
  if (!user) return null;

  requirePermission(user, "accounting.ledger.read");

  const rawTab = searchParams?.tab || "daybook";
  const activeTab = rawTab === "daily-sheet" ? "dailysheet" : rawTab;
  const businessDate = searchParams?.date || getTodayBusinessDate();

  const selectedCashAccountId = searchParams?.cashAccountId;

  const [daybookData, dailySheetData, accounts, cashAccounts] = await Promise.all([
    getDaybook(user, {
      organizationId: user.organizationId,
      businessDate: searchParams?.date,
      startDate: searchParams?.startDate,
      endDate: searchParams?.endDate,
      voucherNumber: searchParams?.voucherNumber,
      sourceModule: searchParams?.sourceModule,
      sourceType: searchParams?.sourceType,
      search: searchParams?.search,
      customerOrMember: searchParams?.customerOrMember,
      accountId: searchParams?.accountId,
      status: searchParams?.status,
      sortOrder: searchParams?.sortOrder,
      page: 1,
      pageSize: 500,
    }),
    getDailySheet(user, {
      organizationId: user.organizationId,
      businessDate,
      cashAccountId: selectedCashAccountId,
    }),
    getChartOfAccounts(user),
    prisma.cashAccount.findMany({
      where: { organizationId: user.organizationId },
      orderBy: [{ accountType: "asc" }, { code: "asc" }],
    }),
  ]);

  const effectiveCashAccountId =
    selectedCashAccountId ||
    cashAccounts.find((c) => c.accountType === "CASH")?.id ||
    cashAccounts[0]?.id;

  const earliestDate =
    activeTab === "cashbook" && effectiveCashAccountId
      ? await getEarliestCashbookDate(user, user.organizationId, effectiveCashAccountId)
      : businessDate;

  const cashbookStartDate = searchParams?.startDate || earliestDate;
  const cashbookEndDate = searchParams?.endDate || getTodayBusinessDate();

  const cashbookData =
    activeTab === "cashbook" && effectiveCashAccountId
      ? await getCashbook(user, {
          organizationId: user.organizationId,
          cashAccountId: effectiveCashAccountId,
          startDate: cashbookStartDate,
          endDate: cashbookEndDate,
        })
      : null;

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Accounting & General Ledger
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Double-entry financial source of truth, cashbook, daybook, and daily sheets
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="success" className="px-3 py-1">
            <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
            Double-Entry Verified
          </Badge>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 gap-2">
        <a
          href="/accounting?tab=daybook"
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "daybook"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-slate-600 hover:text-slate-900"
          }`}
        >
          <BookOpen className="h-4 w-4" />
          Daybook
        </a>
        <a
          href="/accounting?tab=cashbook"
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "cashbook"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-slate-600 hover:text-slate-900"
          }`}
        >
          <Landmark className="h-4 w-4" />
          Cashbook
        </a>
        <a
          href="/accounting?tab=daily-sheet"
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "dailysheet"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-slate-600 hover:text-slate-900"
          }`}
        >
          <Receipt className="h-4 w-4" />
          Daily Sheet
        </a>
        <a
          href="/accounting?tab=chartofaccounts"
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "chartofaccounts"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-slate-600 hover:text-slate-900"
          }`}
        >
          <Wallet className="h-4 w-4" />
          Chart of Accounts
        </a>
      </div>

      {/* Daybook Tab */}
      {activeTab === "daybook" && (
        <DaybookClient
          data={daybookData as any}
          accounts={accounts}
          initialFilters={{
            startDate: searchParams?.startDate,
            endDate: searchParams?.endDate,
            voucherNumber: searchParams?.voucherNumber,
            sourceModule: searchParams?.sourceModule,
            sourceType: searchParams?.sourceType,
            search: searchParams?.search,
            accountId: searchParams?.accountId,
            status: searchParams?.status,
            sortOrder: searchParams?.sortOrder,
          }}
        />
      )}

      {/* Cashbook Tab */}
      {activeTab === "cashbook" && cashbookData && (
        <CashbookClient
          data={cashbookData}
          cashAccounts={cashAccounts}
          selectedCashAccountId={effectiveCashAccountId}
          startDate={cashbookStartDate}
          endDate={cashbookEndDate}
          earliestDate={earliestDate}
        />
      )}

      {/* Daily Sheet Tab */}
      {activeTab === "dailysheet" && (
        <DailySheetClient
          data={dailySheetData as any}
          currentUserId={user.userId}
          currentUserName={user.fullName}
        />
      )}

      {/* Chart of Accounts Tab */}
      {activeTab === "chartofaccounts" && (
        <Card>
          <CardHeader>
            <CardTitle>Chart of Accounts</CardTitle>
            <CardDescription>
              Standard double-entry accounts with real-time balance projections
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>GL Code</TableHead>
                  <TableHead>Account Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Current Balance (₹)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {accounts.map((acc) => (
                  <TableRow key={acc.id}>
                    <TableCell className="font-mono text-xs font-bold text-slate-900">
                      {acc.code}
                    </TableCell>
                    <TableCell className="font-medium text-slate-800">
                      {acc.name}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          acc.accountType === "ASSET"
                            ? "info"
                            : acc.accountType === "LIABILITY"
                            ? "warning"
                            : acc.accountType === "EQUITY"
                            ? "neutral"
                            : acc.accountType === "INCOME"
                            ? "success"
                            : "danger"
                        }
                      >
                        {acc.accountType}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-slate-500">
                      {acc.description || "—"}
                    </TableCell>
                    <TableCell className="font-mono text-xs font-semibold text-slate-900">
                      ₹{parseFloat(acc.balance.toString()).toFixed(2)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
