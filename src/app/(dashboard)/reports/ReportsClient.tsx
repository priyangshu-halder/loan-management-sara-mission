"use client";

import React, { useState } from "react";
import {
  BarChart3,
  TrendingUp,
  PiggyBank,
  FileSpreadsheet,
  Download,
  Calendar,
  AlertCircle,
  CheckCircle2,
  Filter,
  RefreshCw,
  Clock,
  ShieldCheck,
  ChevronRight,
  Layers,
  ArrowDownRight,
  ArrowUpRight,
  Wallet,
  Users,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableEmptyState,
} from "@/components/ui/Table";
import {
  PortfolioAgingReport,
  CollectionPerformanceReport,
  DepositMaturitiesReport,
  FinancialStatementsReport,
} from "@/modules/reports/report-service";
import { Money } from "@/lib/money/money";

interface ReportsClientProps {
  initialAging: PortfolioAgingReport;
  initialCollections: CollectionPerformanceReport;
  initialDeposits: DepositMaturitiesReport;
  initialFinancials: FinancialStatementsReport;
  defaultDate: string;
  userPermissions: string[];
}

export function ReportsClient({
  initialAging,
  initialCollections,
  initialDeposits,
  initialFinancials,
  defaultDate,
  userPermissions,
}: ReportsClientProps) {
  const [activeTab, setActiveTab] = useState<"portfolio" | "collections" | "deposits" | "financials">("portfolio");

  // Filters
  const [asOfDate, setAsOfDate] = useState(defaultDate);
  const [startDate, setStartDate] = useState(`${defaultDate.slice(0, 7)}-01`);
  const [endDate, setEndDate] = useState(defaultDate);

  // Data states
  const [agingData, setAgingData] = useState<PortfolioAgingReport>(initialAging);
  const [collectionsData, setCollectionsData] = useState<CollectionPerformanceReport>(initialCollections);
  const [depositsData, setDepositsData] = useState<DepositMaturitiesReport>(initialDeposits);
  const [financialsData, setFinancialsData] = useState<FinancialStatementsReport>(initialFinancials);

  // UI state
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exportNotice, setExportNotice] = useState<string | null>(null);

  const canExport = userPermissions.includes("report.export");

  // Refresh active report
  const refreshReport = async () => {
    setLoading(true);
    setError(null);
    setExportNotice(null);

    try {
      if (activeTab === "portfolio") {
        const res = await fetch(`/api/reports/portfolio?asOfDate=${asOfDate}`);
        if (!res.ok) throw new Error((await res.json()).error?.message || "Failed to load portfolio aging");
        setAgingData(await res.json());
      } else if (activeTab === "collections") {
        const res = await fetch(`/api/reports/collections?startDate=${startDate}&endDate=${endDate}`);
        if (!res.ok) throw new Error((await res.json()).error?.message || "Failed to load collections");
        setCollectionsData(await res.json());
      } else if (activeTab === "deposits") {
        const res = await fetch(`/api/reports/deposits?asOfDate=${asOfDate}`);
        if (!res.ok) throw new Error((await res.json()).error?.message || "Failed to load deposit report");
        setDepositsData(await res.json());
      } else if (activeTab === "financials") {
        const res = await fetch(`/api/reports/financials?startDate=${startDate}&endDate=${endDate}`);
        if (!res.ok) throw new Error((await res.json()).error?.message || "Failed to load financial statements");
        setFinancialsData(await res.json());
      }
    } catch (err: any) {
      setError(err.message || "Failed to update report data");
    } finally {
      setLoading(false);
    }
  };

  // CSV Export handler
  const handleExportCsv = async (reportTypeOverride?: string) => {
    setExporting(true);
    setError(null);
    setExportNotice(null);

    let type = reportTypeOverride;
    if (!type) {
      if (activeTab === "portfolio") type = "portfolio_aging";
      else if (activeTab === "collections") type = "collections";
      else if (activeTab === "deposits") type = "deposits";
      else if (activeTab === "financials") type = "financial_pnl";
      else type = "portfolio_aging";
    }

    const filters = activeTab === "portfolio" || activeTab === "deposits"
      ? { asOfDate }
      : { startDate, endDate };

    try {
      const res = await fetch("/api/reports/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportType: type, filters }),
      });

      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.error?.message || "Export request rejected by server");
      }

      const { filename, csvContent, rowCount } = await res.json();

      // Trigger browser file download
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", filename);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      setExportNotice(`Exported ${rowCount} rows as "${filename}". Logged in system audit trail.`);
    } catch (err: any) {
      setError(err.message || "Failed to export report CSV");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Reports & Portfolio Analytics
            </h1>
            <Badge variant="info">
              Phase 9 Verified
            </Badge>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Audited financial statements, portfolio PAR aging, collections performance, and maturities.
          </p>
        </div>

        {/* Global Action / Export */}
        <div className="flex items-center gap-2.5">
          <Button
            variant="outline"
            size="sm"
            onClick={refreshReport}
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? "animate-spin text-blue-600" : "text-slate-600"}`} />
            Refresh
          </Button>

          <Button
            size="sm"
            onClick={() => handleExportCsv()}
            disabled={exporting || !canExport}
            className="bg-slate-900 hover:bg-slate-800 text-white"
          >
            <Download className="h-4 w-4 mr-1.5" />
            {exporting ? "Generating CSV..." : "Export CSV (Audited)"}
          </Button>
        </div>
      </div>

      {/* Export / Audit Notice banner */}
      {exportNotice && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center justify-between text-xs text-emerald-800">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
            <span>{exportNotice}</span>
          </div>
          <button
            onClick={() => setExportNotice(null)}
            className="text-emerald-700 font-semibold hover:underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Error alert */}
      {error && (
        <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-lg flex items-center justify-between text-xs text-rose-800">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            onClick={() => setError(null)}
            className="text-rose-700 font-semibold hover:underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex border-b border-slate-200 gap-1 overflow-x-auto pb-px">
        <button
          onClick={() => setActiveTab("portfolio")}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition-all whitespace-nowrap ${
            activeTab === "portfolio"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-slate-500 hover:text-slate-900 hover:border-slate-300"
          }`}
        >
          <BarChart3 className="h-4 w-4" />
          Portfolio & PAR Aging
        </button>

        <button
          onClick={() => setActiveTab("collections")}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition-all whitespace-nowrap ${
            activeTab === "collections"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-slate-500 hover:text-slate-900 hover:border-slate-300"
          }`}
        >
          <TrendingUp className="h-4 w-4" />
          Collections & Agents
        </button>

        <button
          onClick={() => setActiveTab("deposits")}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition-all whitespace-nowrap ${
            activeTab === "deposits"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-slate-500 hover:text-slate-900 hover:border-slate-300"
          }`}
        >
          <PiggyBank className="h-4 w-4" />
          Savings & Deposit Maturities
        </button>

        <button
          onClick={() => setActiveTab("financials")}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition-all whitespace-nowrap ${
            activeTab === "financials"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-slate-500 hover:text-slate-900 hover:border-slate-300"
          }`}
        >
          <FileSpreadsheet className="h-4 w-4" />
          Financial Statements (P&L / BS)
        </button>
      </div>

      {/* Date Filter Bar */}
      <Card className="bg-slate-50/70">
        <CardContent className="p-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Filter className="h-4 w-4 text-slate-400" />
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-600">Filters:</span>

            {activeTab === "portfolio" || activeTab === "deposits" ? (
              <div className="flex items-center gap-2">
                <label className="text-xs text-slate-600 font-medium">As-of Date:</label>
                <input
                  type="date"
                  value={asOfDate}
                  onChange={(e) => setAsOfDate(e.target.value)}
                  className="px-2.5 py-1 text-xs bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <label className="text-xs text-slate-600 font-medium">From:</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="px-2.5 py-1 text-xs bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <label className="text-xs text-slate-600 font-medium ml-2">To:</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="px-2.5 py-1 text-xs bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 text-xs text-slate-500">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
            <span>Strict Double-Entry Reconciliation Active</span>
          </div>
        </CardContent>
      </Card>

      {/* TAB 1: PORTFOLIO & PAR AGING */}
      {activeTab === "portfolio" && (
        <div className="space-y-6">
          {/* Top KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-5">
                <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
                  Total Disbursed
                </p>
                <p className="text-2xl font-bold text-slate-900 mt-1">
                  {Money.from(agingData.summary.totalDisbursed).toDisplayString(true)}
                </p>
                <p className="text-xs text-slate-500 mt-2">
                  {agingData.summary.activeAccountsCount} Active Loans
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5">
                <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
                  Total Outstanding
                </p>
                <p className="text-2xl font-bold text-blue-600 mt-1">
                  {Money.from(agingData.summary.totalOutstanding).toDisplayString(true)}
                </p>
                <p className="text-xs text-slate-500 mt-2">Current Principal At Risk</p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5">
                <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
                  PAR 30+ Ratio
                </p>
                <p className="text-2xl font-bold text-amber-600 mt-1">
                  {agingData.summary.par30RatioPercent}%
                </p>
                <p className="text-xs text-slate-500 mt-2">
                  {Money.from(agingData.summary.par30Amount).toDisplayString(true)} at Risk (&gt;30d)
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5">
                <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
                  PAR 90+ (NPA / Default)
                </p>
                <p className="text-2xl font-bold text-rose-600 mt-1">
                  {agingData.summary.par90RatioPercent}%
                </p>
                <p className="text-xs text-slate-500 mt-2">
                  {Money.from(agingData.summary.par90Amount).toDisplayString(true)} Substandard
                </p>
              </CardContent>
            </Card>
          </div>

          {/* PAR Aging Buckets Grid */}
          <Card>
            <CardHeader className="pb-3 border-b border-slate-200">
              <CardTitle className="text-base font-semibold">Portfolio at Risk (PAR) Aging Buckets</CardTitle>
              <CardDescription>
                Classification by days past due (DPD) from earliest unpaid installment as of {agingData.asOfDate}.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Aging Classification</TableHead>
                    <TableHead>Accounts</TableHead>
                    <TableHead>Principal Outstanding (INR)</TableHead>
                    <TableHead>Total Arrears (Due - Paid)</TableHead>
                    <TableHead>Status / Quality</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell className="font-semibold text-slate-800">
                      Current (0 DPD)
                    </TableCell>
                    <TableCell>{agingData.summary.currentPortfolio.accountsCount}</TableCell>
                    <TableCell className="font-medium text-emerald-700">
                      {Money.from(agingData.summary.currentPortfolio.principalOutstanding).toDisplayString(true)}
                    </TableCell>
                    <TableCell className="text-slate-400">₹0.00</TableCell>
                    <TableCell>
                      <Badge variant="success">Standard</Badge>
                    </TableCell>
                  </TableRow>

                  <TableRow>
                    <TableCell className="font-semibold text-slate-800">
                      PAR 1-30 Days
                    </TableCell>
                    <TableCell>{agingData.summary.par1to30.accountsCount}</TableCell>
                    <TableCell className="font-medium text-slate-800">
                      {Money.from(agingData.summary.par1to30.principalOutstanding).toDisplayString(true)}
                    </TableCell>
                    <TableCell className="font-semibold text-amber-600">
                      {Money.from(agingData.summary.par1to30.arrears).toDisplayString(true)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="warning">Early Alert</Badge>
                    </TableCell>
                  </TableRow>

                  <TableRow>
                    <TableCell className="font-semibold text-slate-800">
                      PAR 31-60 Days
                    </TableCell>
                    <TableCell>{agingData.summary.par31to60.accountsCount}</TableCell>
                    <TableCell className="font-medium text-slate-800">
                      {Money.from(agingData.summary.par31to60.principalOutstanding).toDisplayString(true)}
                    </TableCell>
                    <TableCell className="font-semibold text-rose-600">
                      {Money.from(agingData.summary.par31to60.arrears).toDisplayString(true)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="warning">Watchlist</Badge>
                    </TableCell>
                  </TableRow>

                  <TableRow>
                    <TableCell className="font-semibold text-slate-800">
                      PAR 61-90 Days
                    </TableCell>
                    <TableCell>{agingData.summary.par61to90.accountsCount}</TableCell>
                    <TableCell className="font-medium text-slate-800">
                      {Money.from(agingData.summary.par61to90.principalOutstanding).toDisplayString(true)}
                    </TableCell>
                    <TableCell className="font-semibold text-rose-700">
                      {Money.from(agingData.summary.par61to90.arrears).toDisplayString(true)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="danger">Doubtful</Badge>
                    </TableCell>
                  </TableRow>

                  <TableRow className="bg-rose-50/30">
                    <TableCell className="font-bold text-rose-900">
                      PAR 90+ Days (NPA)
                    </TableCell>
                    <TableCell className="font-bold text-rose-900">{agingData.summary.par90PlusNPA.accountsCount}</TableCell>
                    <TableCell className="font-bold text-rose-900">
                      {Money.from(agingData.summary.par90PlusNPA.principalOutstanding).toDisplayString(true)}
                    </TableCell>
                    <TableCell className="font-bold text-rose-900">
                      {Money.from(agingData.summary.par90PlusNPA.arrears).toDisplayString(true)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="danger">NPA / Loss</Badge>
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Application Pipeline */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">Loan Application Pipeline</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-center">
                  <p className="text-xs text-slate-500 uppercase">Draft</p>
                  <p className="text-xl font-bold text-slate-700 mt-1">{agingData.pipeline.draft}</p>
                </div>
                <div className="p-3 bg-blue-50 rounded-lg border border-blue-200 text-center">
                  <p className="text-xs text-blue-600 uppercase">Submitted</p>
                  <p className="text-xl font-bold text-blue-700 mt-1">{agingData.pipeline.submitted}</p>
                </div>
                <div className="p-3 bg-emerald-50 rounded-lg border border-emerald-200 text-center">
                  <p className="text-xs text-emerald-600 uppercase">Approved</p>
                  <p className="text-xl font-bold text-emerald-700 mt-1">{agingData.pipeline.approved}</p>
                </div>
                <div className="p-3 bg-rose-50 rounded-lg border border-rose-200 text-center">
                  <p className="text-xs text-rose-600 uppercase">Rejected</p>
                  <p className="text-xl font-bold text-rose-700 mt-1">{agingData.pipeline.rejected}</p>
                </div>
                <div className="p-3 bg-indigo-50 rounded-lg border border-indigo-200 text-center">
                  <p className="text-xs text-indigo-600 uppercase">Active Accounts</p>
                  <p className="text-xl font-bold text-indigo-700 mt-1">{agingData.pipeline.activeLoans}</p>
                </div>
                <div className="p-3 bg-slate-100 rounded-lg border border-slate-200 text-center">
                  <p className="text-xs text-slate-600 uppercase">Settled / Closed</p>
                  <p className="text-xl font-bold text-slate-800 mt-1">{agingData.pipeline.closedLoans}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Overdue Accounts Table */}
          <Card>
            <div className="p-5 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold text-slate-900">Overdue Loan Accounts</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Detailed arrears schedule for accounts with past-due installments.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleExportCsv("portfolio_aging")}
                disabled={exporting || !canExport}
              >
                <Download className="h-3.5 w-3.5 mr-1" />
                Export Overdue CSV
              </Button>
            </div>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Loan Account</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Outstanding (INR)</TableHead>
                    <TableHead>DPD</TableHead>
                    <TableHead>Bucket</TableHead>
                    <TableHead>Arrears (INR)</TableHead>
                    <TableHead>Follow-up</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {agingData.overdueLoans.length === 0 ? (
                    <TableRow>
                      <td colSpan={8}>
                        <TableEmptyState message="No overdue loan accounts! All borrowers are currently in good standing." />
                      </td>
                    </TableRow>
                  ) : (
                    agingData.overdueLoans.map((item) => (
                      <TableRow key={item.loanAccountId}>
                        <TableCell className="font-mono text-xs font-semibold text-blue-600">
                          {item.loanAccountNumber}
                        </TableCell>
                        <TableCell>
                          <div className="text-sm font-medium text-slate-800">{item.customerName}</div>
                          <div className="text-xs text-slate-500 font-mono">{item.customerCode}</div>
                        </TableCell>
                        <TableCell className="text-xs text-slate-600 font-mono">{item.phone}</TableCell>
                        <TableCell className="font-semibold text-slate-900">
                          {Money.from(item.principalOutstanding).toDisplayString(true)}
                        </TableCell>
                        <TableCell className="font-mono font-bold text-rose-600">
                          {item.daysPastDue}d
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              item.agingBucket === "90+"
                                ? "danger"
                                : item.agingBucket === "61-90"
                                ? "danger"
                                : item.agingBucket === "31-60"
                                ? "warning"
                                : "neutral"
                            }
                          >
                            {item.agingBucket}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-bold text-rose-600">
                          {Money.from(item.totalOverdue).toDisplayString(true)}
                        </TableCell>
                        <TableCell>
                          <Badge variant="neutral" className="text-xs">
                            {item.followUpStatus || "Pending"}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      )}

      {/* TAB 2: COLLECTIONS & AGENTS */}
      {activeTab === "collections" && (
        <div className="space-y-6">
          {/* Top KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-5">
                <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
                  Total Collected
                </p>
                <p className="text-2xl font-bold text-emerald-600 mt-1">
                  {Money.from(collectionsData.summary.totalCollected).toDisplayString(true)}
                </p>
                <p className="text-xs text-slate-500 mt-2">
                  {collectionsData.summary.receiptsCount} Total Receipts
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5">
                <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
                  Principal Recovered
                </p>
                <p className="text-2xl font-bold text-slate-900 mt-1">
                  {Money.from(collectionsData.summary.allocation.principal).toDisplayString(true)}
                </p>
                <p className="text-xs text-slate-500 mt-2">Principal Component</p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5">
                <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
                  Interest Collected
                </p>
                <p className="text-2xl font-bold text-blue-600 mt-1">
                  {Money.from(collectionsData.summary.allocation.interest).toDisplayString(true)}
                </p>
                <p className="text-xs text-slate-500 mt-2">Interest Revenue</p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5">
                <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
                  Fees & Penalties
                </p>
                <p className="text-2xl font-bold text-amber-600 mt-1">
                  {Money.from(
                    Number(collectionsData.summary.allocation.fee) +
                    Number(collectionsData.summary.allocation.penalty)
                  ).toDisplayString(true)}
                </p>
                <p className="text-xs text-slate-500 mt-2">Fees & Charges Collected</p>
              </CardContent>
            </Card>
          </div>

          {/* Allocation & Payment Method breakdown */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader className="pb-3 border-b border-slate-200">
                <CardTitle className="text-base font-semibold">Payment Allocation Breakdown</CardTitle>
                <CardDescription>Allocation across priority waterfall components.</CardDescription>
              </CardHeader>
              <CardContent className="p-4 space-y-3">
                <div className="flex justify-between items-center text-sm py-1.5 border-b border-slate-100">
                  <span className="text-slate-600 font-medium">Principal Allocation:</span>
                  <span className="font-semibold text-slate-900">
                    {Money.from(collectionsData.summary.allocation.principal).toDisplayString(true)}
                  </span>
                </div>
                <div className="flex justify-between items-center text-sm py-1.5 border-b border-slate-100">
                  <span className="text-slate-600 font-medium">Interest Income:</span>
                  <span className="font-semibold text-slate-900">
                    {Money.from(collectionsData.summary.allocation.interest).toDisplayString(true)}
                  </span>
                </div>
                <div className="flex justify-between items-center text-sm py-1.5 border-b border-slate-100">
                  <span className="text-slate-600 font-medium">Processing / Admin Fees:</span>
                  <span className="font-semibold text-slate-900">
                    {Money.from(collectionsData.summary.allocation.fee).toDisplayString(true)}
                  </span>
                </div>
                <div className="flex justify-between items-center text-sm py-1.5">
                  <span className="text-slate-600 font-medium">Late Payment Penalties:</span>
                  <span className="font-semibold text-slate-900">
                    {Money.from(collectionsData.summary.allocation.penalty).toDisplayString(true)}
                  </span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3 border-b border-slate-200">
                <CardTitle className="text-base font-semibold">Payment Method Channels</CardTitle>
                <CardDescription>Collection instruments recorded.</CardDescription>
              </CardHeader>
              <CardContent className="p-4 space-y-3">
                {Object.entries(collectionsData.summary.paymentMethods).map(([method, data]) => (
                  <div key={method} className="flex justify-between items-center text-sm py-1.5 border-b border-slate-100 last:border-0">
                    <div className="flex items-center gap-2">
                      <Badge variant="neutral">{method}</Badge>
                      <span className="text-xs text-slate-500">({data.count} receipts)</span>
                    </div>
                    <span className="font-semibold text-slate-900">
                      {Money.from(data.amount).toDisplayString(true)}
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          {/* Collectors & Groups Tables */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <div className="p-4 border-b border-slate-200">
                <h3 className="text-sm font-semibold text-slate-900">Field Staff / Collector Performance</h3>
              </div>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Staff Name</TableHead>
                      <TableHead>Receipts</TableHead>
                      <TableHead>Amount (INR)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {collectionsData.collectors.length === 0 ? (
                      <TableRow>
                        <td colSpan={3}>
                          <TableEmptyState message="No collector activity in this date range." />
                        </td>
                      </TableRow>
                    ) : (
                      collectionsData.collectors.map((c) => (
                        <TableRow key={c.userId}>
                          <TableCell className="font-medium text-slate-800">{c.fullName}</TableCell>
                          <TableCell>{c.receiptsCount}</TableCell>
                          <TableCell className="font-semibold text-emerald-600">
                            {Money.from(c.totalAmount).toDisplayString(true)}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card>
              <div className="p-4 border-b border-slate-200">
                <h3 className="text-sm font-semibold text-slate-900">Group Center Collections</h3>
              </div>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Group Name</TableHead>
                      <TableHead>Members</TableHead>
                      <TableHead>Total Collected</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {collectionsData.groups.length === 0 ? (
                      <TableRow>
                        <td colSpan={3}>
                          <TableEmptyState message="No customer groups configured yet." />
                        </td>
                      </TableRow>
                    ) : (
                      collectionsData.groups.map((g) => (
                        <TableRow key={g.groupId}>
                          <TableCell>
                            <span className="font-medium text-slate-800">{g.name}</span>
                            <span className="text-xs text-slate-500 font-mono ml-2">({g.groupCode})</span>
                          </TableCell>
                          <TableCell>{g.membersCount}</TableCell>
                          <TableCell className="font-semibold text-slate-900">
                            {Money.from(g.totalCollected).toDisplayString(true)}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* TAB 3: SAVINGS & DEPOSIT MATURITIES */}
      {activeTab === "deposits" && (
        <div className="space-y-6">
          {/* Top KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-5">
                <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
                  Voluntary Savings
                </p>
                <p className="text-2xl font-bold text-blue-600 mt-1">
                  {Money.from(depositsData.liquidSavings.totalBalance).toDisplayString(true)}
                </p>
                <p className="text-xs text-slate-500 mt-2">
                  {depositsData.liquidSavings.activeAccounts} Active Accounts
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5">
                <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
                  Recurring Deposits (RD)
                </p>
                <p className="text-2xl font-bold text-indigo-600 mt-1">
                  {Money.from(depositsData.recurringDeposits.totalCurrentBalance).toDisplayString(true)}
                </p>
                <p className="text-xs text-slate-500 mt-2">
                  {depositsData.recurringDeposits.activeAccounts} Active Accounts
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5">
                <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
                  Fixed Deposits (FD) Principal
                </p>
                <p className="text-2xl font-bold text-slate-900 mt-1">
                  {Money.from(depositsData.fixedDeposits.totalPrincipal).toDisplayString(true)}
                </p>
                <p className="text-xs text-slate-500 mt-2">
                  {depositsData.fixedDeposits.activeAccounts} Active Contracts
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5">
                <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
                  Projected FD Maturity Payout
                </p>
                <p className="text-2xl font-bold text-emerald-600 mt-1">
                  {Money.from(depositsData.fixedDeposits.totalProjectedMaturity).toDisplayString(true)}
                </p>
                <p className="text-xs text-slate-500 mt-2">Obligation at Maturity</p>
              </CardContent>
            </Card>
          </div>

          {/* Maturity Schedule Projection Buckets */}
          <Card>
            <CardHeader className="pb-3 border-b border-slate-200">
              <CardTitle className="text-base font-semibold">Deposit Maturity Schedule Projection</CardTitle>
              <CardDescription>
                Upcoming maturity contracts classified by remaining days as of {depositsData.asOfDate}.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Maturity Horizon</TableHead>
                    <TableHead>Contracts</TableHead>
                    <TableHead>Principal (INR)</TableHead>
                    <TableHead>Projected Payout (INR)</TableHead>
                    <TableHead>Action Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow className="bg-amber-50/40">
                    <TableCell className="font-semibold text-amber-900">
                      Matured / Overdue for Payout
                    </TableCell>
                    <TableCell className="font-bold">{depositsData.maturityBuckets.overdueMatured.count}</TableCell>
                    <TableCell className="font-semibold">
                      {Money.from(depositsData.maturityBuckets.overdueMatured.principal).toDisplayString(true)}
                    </TableCell>
                    <TableCell className="font-bold text-amber-700">
                      {Money.from(depositsData.maturityBuckets.overdueMatured.projectedPayout).toDisplayString(true)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="warning">Action Due</Badge>
                    </TableCell>
                  </TableRow>

                  <TableRow>
                    <TableCell className="font-medium text-slate-800">
                      0 - 30 Days (Immediate)
                    </TableCell>
                    <TableCell>{depositsData.maturityBuckets.days0to30.count}</TableCell>
                    <TableCell>
                      {Money.from(depositsData.maturityBuckets.days0to30.principal).toDisplayString(true)}
                    </TableCell>
                    <TableCell className="font-semibold text-slate-900">
                      {Money.from(depositsData.maturityBuckets.days0to30.projectedPayout).toDisplayString(true)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="neutral">Prepare Liquidity</Badge>
                    </TableCell>
                  </TableRow>

                  <TableRow>
                    <TableCell className="font-medium text-slate-800">
                      31 - 60 Days
                    </TableCell>
                    <TableCell>{depositsData.maturityBuckets.days31to60.count}</TableCell>
                    <TableCell>
                      {Money.from(depositsData.maturityBuckets.days31to60.principal).toDisplayString(true)}
                    </TableCell>
                    <TableCell className="font-semibold text-slate-900">
                      {Money.from(depositsData.maturityBuckets.days31to60.projectedPayout).toDisplayString(true)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="neutral">Upcoming</Badge>
                    </TableCell>
                  </TableRow>

                  <TableRow>
                    <TableCell className="font-medium text-slate-800">
                      61 - 90 Days
                    </TableCell>
                    <TableCell>{depositsData.maturityBuckets.days61to90.count}</TableCell>
                    <TableCell>
                      {Money.from(depositsData.maturityBuckets.days61to90.principal).toDisplayString(true)}
                    </TableCell>
                    <TableCell className="font-semibold text-slate-900">
                      {Money.from(depositsData.maturityBuckets.days61to90.projectedPayout).toDisplayString(true)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="neutral">Scheduled</Badge>
                    </TableCell>
                  </TableRow>

                  <TableRow>
                    <TableCell className="font-medium text-slate-800">
                      &gt; 90 Days (Long Term)
                    </TableCell>
                    <TableCell>{depositsData.maturityBuckets.over90Days.count}</TableCell>
                    <TableCell>
                      {Money.from(depositsData.maturityBuckets.over90Days.principal).toDisplayString(true)}
                    </TableCell>
                    <TableCell className="font-semibold text-slate-900">
                      {Money.from(depositsData.maturityBuckets.over90Days.projectedPayout).toDisplayString(true)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="success">Standard Term</Badge>
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Upcoming Maturities Contracts List */}
          <Card>
            <div className="p-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-900">Active Term Deposits Schedule</h3>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleExportCsv("deposits")}
                disabled={exporting || !canExport}
              >
                <Download className="h-3.5 w-3.5 mr-1" />
                Export Deposits CSV
              </Button>
            </div>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Account No</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>Principal (INR)</TableHead>
                    <TableHead>Maturity Date</TableHead>
                    <TableHead>Horizon</TableHead>
                    <TableHead>Projected Payout</TableHead>
                    <TableHead>Payout Instruction</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {depositsData.upcomingMaturities.length === 0 ? (
                    <TableRow>
                      <td colSpan={8}>
                        <TableEmptyState message="No term deposit contracts found." />
                      </td>
                    </TableRow>
                  ) : (
                    depositsData.upcomingMaturities.map((item) => (
                      <TableRow key={item.accountId}>
                        <TableCell className="font-mono text-xs font-semibold text-blue-600">
                          {item.accountNumber}
                        </TableCell>
                        <TableCell>
                          <div className="font-medium text-slate-800">{item.customerName}</div>
                          <div className="text-xs text-slate-500 font-mono">{item.customerCode}</div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="neutral">{item.productType}</Badge>
                        </TableCell>
                        <TableCell className="font-semibold text-slate-900">
                          {Money.from(item.principal).toDisplayString(true)}
                        </TableCell>
                        <TableCell className="text-xs font-mono">{item.maturityDate}</TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              item.daysUntilMaturity < 0
                                ? "danger"
                                : item.daysUntilMaturity <= 30
                                ? "warning"
                                : "neutral"
                            }
                          >
                            {item.daysUntilMaturity < 0
                              ? "Matured"
                              : `${item.daysUntilMaturity}d`}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-bold text-emerald-600">
                          {Money.from(item.projectedMaturityValue).toDisplayString(true)}
                        </TableCell>
                        <TableCell className="text-xs text-slate-600">
                          {item.payoutInstruction}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      )}

      {/* TAB 4: FINANCIAL STATEMENTS (P&L & BALANCE SHEET) */}
      {activeTab === "financials" && (
        <div className="space-y-6">
          {/* Top Verification / Balanced Status Card */}
          <Card className={financialsData.balanceSheet.isBalanced ? "bg-emerald-50/50 border-emerald-200" : "bg-rose-50/50 border-rose-200"}>
            <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex items-center gap-3">
                {financialsData.balanceSheet.isBalanced ? (
                  <CheckCircle2 className="h-6 w-6 text-emerald-600 shrink-0" />
                ) : (
                  <AlertCircle className="h-6 w-6 text-rose-600 shrink-0" />
                )}
                <div>
                  <h4 className="text-sm font-semibold text-slate-900">
                    Ledger Double-Entry Invariant: {financialsData.balanceSheet.isBalanced ? "Verified & Balanced" : "Imbalance Detected"}
                  </h4>
                  <p className="text-xs text-slate-600 mt-0.5">
                    Assets (₹{financialsData.balanceSheet.totalAssets}) = Liabilities (₹{financialsData.balanceSheet.totalLiabilities}) + Equity &amp; Surplus (₹{financialsData.balanceSheet.totalEquity})
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleExportCsv("financial_pnl")}
                  disabled={exporting || !canExport}
                >
                  <Download className="h-3.5 w-3.5 mr-1" />
                  Export P&amp;L
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleExportCsv("financial_bs")}
                  disabled={exporting || !canExport}
                >
                  <Download className="h-3.5 w-3.5 mr-1" />
                  Export BS
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Income Statement (P&L) */}
          <Card>
            <CardHeader className="pb-3 border-b border-slate-200">
              <CardTitle className="text-base font-semibold">Income Statement (Profit &amp; Loss)</CardTitle>
              <CardDescription>
                Operating Revenue &amp; Expenses for period {financialsData.period.startDate} to {financialsData.period.endDate}.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4 space-y-6">
              {/* Income Section */}
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-emerald-700 mb-2">Operating Revenue / Income</h4>
                <div className="space-y-1.5 border rounded-lg p-3 bg-slate-50/50">
                  {financialsData.incomeStatement.income.map((item) => (
                    <div key={item.code} className="flex justify-between items-center text-sm py-1 border-b border-slate-100 last:border-0">
                      <div>
                        <span className="font-mono text-xs text-slate-500 mr-2">{item.code}</span>
                        <span className="text-slate-800">{item.name}</span>
                      </div>
                      <span className="font-semibold text-emerald-600">
                        {Money.from(item.amount).toDisplayString(true)}
                      </span>
                    </div>
                  ))}
                  <div className="flex justify-between items-center text-sm pt-2 font-bold text-slate-900 border-t border-slate-200">
                    <span>Total Operating Income</span>
                    <span className="text-emerald-700">
                      {Money.from(financialsData.incomeStatement.totalIncome).toDisplayString(true)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Expense Section */}
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-rose-700 mb-2">Operating Expenses</h4>
                <div className="space-y-1.5 border rounded-lg p-3 bg-slate-50/50">
                  {financialsData.incomeStatement.expenses.map((item) => (
                    <div key={item.code} className="flex justify-between items-center text-sm py-1 border-b border-slate-100 last:border-0">
                      <div>
                        <span className="font-mono text-xs text-slate-500 mr-2">{item.code}</span>
                        <span className="text-slate-800">{item.name}</span>
                      </div>
                      <span className="font-semibold text-slate-800">
                        {Money.from(item.amount).toDisplayString(true)}
                      </span>
                    </div>
                  ))}
                  <div className="flex justify-between items-center text-sm pt-2 font-bold text-slate-900 border-t border-slate-200">
                    <span>Total Operating Expenses</span>
                    <span className="text-rose-700">
                      {Money.from(financialsData.incomeStatement.totalExpenses).toDisplayString(true)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Net Surplus Callout */}
              <div className="p-4 bg-slate-900 text-white rounded-lg flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase text-slate-400">Net Operating Surplus / (Deficit)</p>
                  <p className="text-xs text-slate-400 mt-0.5">Total Income minus Total Operating Expenses</p>
                </div>
                <p className="text-2xl font-bold font-mono">
                  {Money.from(financialsData.incomeStatement.netOperatingSurplus).toDisplayString(true)}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Balance Sheet Statement */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Assets */}
            <Card>
              <CardHeader className="pb-3 border-b border-slate-200">
                <CardTitle className="text-base font-semibold text-emerald-800">Assets</CardTitle>
                <CardDescription>Cumulative balances as of {financialsData.balanceSheet.asOfDate}.</CardDescription>
              </CardHeader>
              <CardContent className="p-4 space-y-2">
                {financialsData.balanceSheet.assets.map((item) => (
                  <div key={item.code} className="flex justify-between items-center text-sm py-1.5 border-b border-slate-100 last:border-0">
                    <div>
                      <span className="font-mono text-xs text-slate-500 mr-2">{item.code}</span>
                      <span className="text-slate-800">{item.name}</span>
                    </div>
                    <span className="font-semibold text-slate-900">
                      {Money.from(item.amount).toDisplayString(true)}
                    </span>
                  </div>
                ))}
                <div className="flex justify-between items-center text-base pt-3 font-bold text-slate-900 border-t-2 border-slate-300">
                  <span>Total Assets</span>
                  <span className="text-emerald-700">
                    {Money.from(financialsData.balanceSheet.totalAssets).toDisplayString(true)}
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* Liabilities & Equity */}
            <Card>
              <CardHeader className="pb-3 border-b border-slate-200">
                <CardTitle className="text-base font-semibold text-blue-800">Liabilities &amp; Equity</CardTitle>
                <CardDescription>Obligations and capital reserves as of {financialsData.balanceSheet.asOfDate}.</CardDescription>
              </CardHeader>
              <CardContent className="p-4 space-y-4">
                {/* Liabilities */}
                <div>
                  <h5 className="text-xs font-bold uppercase text-slate-500 mb-1.5">Liabilities</h5>
                  <div className="space-y-1">
                    {financialsData.balanceSheet.liabilities.map((item) => (
                      <div key={item.code} className="flex justify-between items-center text-sm py-1 border-b border-slate-100 last:border-0">
                        <div>
                          <span className="font-mono text-xs text-slate-500 mr-2">{item.code}</span>
                          <span className="text-slate-800">{item.name}</span>
                        </div>
                        <span className="font-semibold text-slate-900">
                          {Money.from(item.amount).toDisplayString(true)}
                        </span>
                      </div>
                    ))}
                    <div className="flex justify-between items-center text-xs font-semibold text-slate-600 pt-1">
                      <span>Total Liabilities:</span>
                      <span>{Money.from(financialsData.balanceSheet.totalLiabilities).toDisplayString(true)}</span>
                    </div>
                  </div>
                </div>

                {/* Equity */}
                <div>
                  <h5 className="text-xs font-bold uppercase text-slate-500 mb-1.5">Equity &amp; Surplus</h5>
                  <div className="space-y-1">
                    {financialsData.balanceSheet.equity.map((item) => (
                      <div key={item.code} className="flex justify-between items-center text-sm py-1 border-b border-slate-100 last:border-0">
                        <div>
                          <span className="font-mono text-xs text-slate-500 mr-2">{item.code}</span>
                          <span className="text-slate-800">{item.name}</span>
                        </div>
                        <span className="font-semibold text-slate-900">
                          {Money.from(item.amount).toDisplayString(true)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Total Liabilities + Equity */}
                <div className="flex justify-between items-center text-base pt-3 font-bold text-slate-900 border-t-2 border-slate-300">
                  <span>Total Liabilities &amp; Equity</span>
                  <span className="text-blue-700">
                    {Money.from(
                      Number(financialsData.balanceSheet.totalLiabilities) +
                      Number(financialsData.balanceSheet.totalEquity)
                    ).toDisplayString(true)}
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Operational Expense Breakdown by Category */}
          <Card>
            <div className="p-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-900">Operational Expense Breakdown</h3>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleExportCsv("expenses")}
                disabled={exporting || !canExport}
              >
                <Download className="h-3.5 w-3.5 mr-1" />
                Export Expenses CSV
              </Button>
            </div>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Category</TableHead>
                    <TableHead>Vouchers Count</TableHead>
                    <TableHead>Total Amount (INR)</TableHead>
                    <TableHead>Percentage of Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {financialsData.expenseBreakdown.length === 0 ? (
                    <TableRow>
                      <td colSpan={4}>
                        <TableEmptyState message="No posted operational expenses in this period." />
                      </td>
                    </TableRow>
                  ) : (
                    financialsData.expenseBreakdown.map((item) => (
                      <TableRow key={item.category}>
                        <TableCell className="font-semibold text-slate-800">{item.category}</TableCell>
                        <TableCell>{item.count}</TableCell>
                        <TableCell className="font-semibold text-slate-900">
                          {Money.from(item.amount).toDisplayString(true)}
                        </TableCell>
                        <TableCell className="font-mono font-medium text-slate-600">
                          {item.percentage}%
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
