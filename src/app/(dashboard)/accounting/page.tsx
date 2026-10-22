import React from "react";
import { BookOpen, Receipt, Wallet, FileText, CheckCircle2 } from "lucide-react";
import { getCurrentUser, requirePermission } from "@/lib/permissions/auth-guard";
import { getDaybook, getDailySheet, getChartOfAccounts } from "@/modules/accounting/ledger-service";
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
  searchParams?: { tab?: string; date?: string };
}) {
  const user = await getCurrentUser();
  if (!user) return null;

  requirePermission(user, "accounting.ledger.read");

  const activeTab = searchParams?.tab || "daybook";
  const businessDate = searchParams?.date || getTodayBusinessDate();

  const [daybookData, dailySheetData, accounts] = await Promise.all([
    getDaybook(user, {
      organizationId: user.organizationId,
      businessDate,
      page: 1,
      pageSize: 50,
    }),
    getDailySheet(user, {
      organizationId: user.organizationId,
      businessDate,
    }),
    getChartOfAccounts(user),
  ]);

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
          href="/accounting?tab=dailysheet"
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
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Daybook ({formatDisplayDate(businessDate)})</CardTitle>
                <CardDescription>
                  Chronological record of all vouchers posted on {businessDate}
                </CardDescription>
              </div>
              <div className="flex items-center gap-4 text-xs font-semibold">
                <span className="text-slate-700">
                  Total Debit: ₹{parseFloat(daybookData.totals.totalDebit).toFixed(2)}
                </span>
                <span className="text-slate-700">
                  Total Credit: ₹{parseFloat(daybookData.totals.totalCredit).toFixed(2)}
                </span>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Voucher No</TableHead>
                  <TableHead>Source Module</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Debits (₹)</TableHead>
                  <TableHead>Credits (₹)</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {daybookData.entries.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6}>
                      <TableEmptyState message={`No vouchers posted on ${businessDate}.`} />
                    </TableCell>
                  </TableRow>
                ) : (
                  daybookData.entries.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell className="font-mono text-xs font-semibold text-blue-600">
                        {entry.entryNumber}
                      </TableCell>
                      <TableCell>
                        <Badge variant="neutral" className="text-[11px]">
                          {entry.sourceModule}:{entry.sourceType}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-slate-700">
                        {entry.description}
                        <div className="mt-1 space-y-0.5">
                          {entry.lines.map((l) => (
                            <div key={l.id} className="text-[11px] text-slate-500 font-mono">
                              {l.account.code} {l.account.name}: {parseFloat(l.debit.toString()) > 0 ? `Dr ₹${parseFloat(l.debit.toString()).toFixed(2)}` : `Cr ₹${parseFloat(l.credit.toString()).toFixed(2)}`}
                            </div>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-xs font-semibold text-slate-900">
                        ₹{parseFloat(entry.totalDebit.toString()).toFixed(2)}
                      </TableCell>
                      <TableCell className="font-mono text-xs font-semibold text-slate-900">
                        ₹{parseFloat(entry.totalCredit.toString()).toFixed(2)}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={entry.status === "POSTED" ? "success" : "danger"}
                          className="text-[11px]"
                        >
                          {entry.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Daily Sheet Tab */}
      {activeTab === "dailysheet" && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Daily Cash & Bank Reconciliation Sheet</CardTitle>
                  <CardDescription>
                    Opening, receipts, payments, and closing balances for {formatDisplayDate(businessDate)}
                  </CardDescription>
                </div>
                <Badge variant={dailySheetData.reconciliation.isReconciled ? "success" : "danger"}>
                  {dailySheetData.reconciliation.isReconciled ? "Reconciled" : "Discrepancy"}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Account Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Opening (₹)</TableHead>
                    <TableHead>Receipts (₹)</TableHead>
                    <TableHead>Payments (₹)</TableHead>
                    <TableHead>Closing (₹)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dailySheetData.accountSummaries.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6}>
                        <TableEmptyState message="No cash or bank accounts configured." />
                      </TableCell>
                    </TableRow>
                  ) : (
                    dailySheetData.accountSummaries.map((acc) => (
                      <TableRow key={acc.accountId}>
                        <TableCell>
                          <div className="font-semibold text-slate-900">{acc.name}</div>
                          <div className="font-mono text-xs text-slate-400">{acc.code}</div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="neutral">{acc.accountType}</Badge>
                        </TableCell>
                        <TableCell className="font-mono text-xs">₹{parseFloat(acc.openingBalance).toFixed(2)}</TableCell>
                        <TableCell className="font-mono text-xs text-emerald-600 font-semibold">+₹{parseFloat(acc.receipts).toFixed(2)}</TableCell>
                        <TableCell className="font-mono text-xs text-rose-600 font-semibold">-₹{parseFloat(acc.payments).toFixed(2)}</TableCell>
                        <TableCell className="font-mono text-xs font-bold text-slate-900">₹{parseFloat(acc.closingBalance).toFixed(2)}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
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

