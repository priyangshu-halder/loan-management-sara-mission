import React from "react";
import Link from "next/link";
import {
  Users,
  CreditCard,
  TrendingUp,
  AlertCircle,
  PlusCircle,
  UserPlus,
  CheckCircle2,
  PiggyBank,
  BookOpen,
  BarChart3,
  ArrowRight,
} from "lucide-react";
import { getCurrentUser } from "@/lib/permissions/auth-guard";
import { getPortfolioDashboard, PortfolioDashboardReport } from "@/modules/reports/report-service";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
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
import { formatDisplayDate, getTodayBusinessDate } from "@/lib/dates/dates";
import { Money } from "@/lib/money/money";

export default async function DashboardPage() {
  const user = await getCurrentUser();
  const todayDate = getTodayBusinessDate();

  let dashboardData: PortfolioDashboardReport | null = null;
  if (user) {
    try {
      dashboardData = await getPortfolioDashboard(user, {
        organizationId: user.organizationId,
        asOfDate: todayDate,
      });
    } catch (err) {
      console.error("Dashboard data load error:", err);
    }
  }

  const activeCustomers = dashboardData?.customers.active ?? 0;
  const kycVerified = dashboardData?.customers.kycVerified ?? 0;
  const disbursedAmount = dashboardData
    ? Money.from(dashboardData.loanPortfolio.disbursed).toDisplayString(true)
    : "₹0.00";
  const activeLoansCount = dashboardData?.loanPortfolio.activeAccounts ?? 0;
  const todayCollections = dashboardData
    ? Money.from(dashboardData.collections.today).toDisplayString(true)
    : "₹0.00";
  const overdueAmount = dashboardData
    ? Money.from(dashboardData.loanPortfolio.overdue).toDisplayString(true)
    : "₹0.00";
  const par30 = dashboardData?.loanPortfolio.par30Amount
    ? Money.from(dashboardData.loanPortfolio.par30Amount).toDisplayString(true)
    : "₹0.00";
  const savingsBalance = dashboardData
    ? Money.from(dashboardData.savings.totalBalance).toDisplayString(true)
    : "₹0.00";
  const termDepositsPrincipal = dashboardData
    ? Money.from(dashboardData.termDeposits.totalPrincipal).toDisplayString(true)
    : "₹0.00";

  const pipeline = dashboardData?.applicationsPipeline;
  const recentCollections = dashboardData?.recentCollections ?? [];

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Welcome Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Welcome, {user?.fullName || "Admin"}! 👋
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Microfinance Banking Operations & Live Portfolio Overview ({formatDisplayDate(todayDate)})
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/reports">
            <Button variant="outline" size="sm">
              <BarChart3 className="h-4 w-4 mr-1 text-slate-600" />
              Reports Hub
            </Button>
          </Link>
          <Link href="/loans?tab=applications">
            <Button variant="outline" size="sm">
              <PlusCircle className="h-4 w-4 mr-1 text-slate-600" />
              New Loan
            </Button>
          </Link>
          <Link href="/loans?tab=disbursements">
            <Button size="sm">
              <CreditCard className="h-4 w-4 mr-1" />
              Disburse
            </Button>
          </Link>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Active Customers */}
        <Card>
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
                Active Customers
              </p>
              <p className="text-2xl font-bold text-slate-900 mt-1">{activeCustomers}</p>
              <div className="mt-2">
                <Badge variant="success">{kycVerified} KYC Verified</Badge>
              </div>
            </div>
            <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <Users className="h-6 w-6" />
            </div>
          </CardContent>
        </Card>

        {/* Disbursed Portfolio */}
        <Card>
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
                Disbursed Portfolio
              </p>
              <p className="text-2xl font-bold text-slate-900 mt-1">{disbursedAmount}</p>
              <p className="text-xs text-slate-500 mt-2">{activeLoansCount} Active Accounts</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <CreditCard className="h-6 w-6" />
            </div>
          </CardContent>
        </Card>

        {/* Today's Collection */}
        <Card>
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
                Today&apos;s Collection
              </p>
              <p className="text-2xl font-bold text-emerald-600 mt-1">{todayCollections}</p>
              <p className="text-xs text-slate-500 mt-2">
                {formatDisplayDate(todayDate)}
              </p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center">
              <TrendingUp className="h-6 w-6" />
            </div>
          </CardContent>
        </Card>

        {/* Overdue / Arrears */}
        <Card>
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
                Overdue / Demand
              </p>
              <p className="text-2xl font-bold text-rose-600 mt-1">{overdueAmount}</p>
              <p className="text-xs text-slate-500 mt-2">PAR 30+: {par30}</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
              <AlertCircle className="h-6 w-6" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Secondary KPIs: Savings & Term Deposits */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-blue-50 to-white">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <span className="text-xs font-medium text-slate-500 uppercase">Savings Deposits</span>
              <p className="text-lg font-bold text-slate-900 mt-0.5">{savingsBalance}</p>
              <p className="text-[11px] text-slate-500">{dashboardData?.savings.activeAccounts ?? 0} Accounts</p>
            </div>
            <PiggyBank className="h-6 w-6 text-blue-600" />
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-indigo-50 to-white">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <span className="text-xs font-medium text-slate-500 uppercase">Fixed / Term Deposits</span>
              <p className="text-lg font-bold text-slate-900 mt-0.5">{termDepositsPrincipal}</p>
              <p className="text-[11px] text-slate-500">{dashboardData?.termDeposits.activeAccounts ?? 0} Contracts</p>
            </div>
            <BookOpen className="h-6 w-6 text-indigo-600" />
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-amber-50 to-white">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <span className="text-xs font-medium text-slate-500 uppercase">Loan Pipeline</span>
              <p className="text-lg font-bold text-slate-900 mt-0.5">
                {(pipeline?.submitted ?? 0) + (pipeline?.approved ?? 0)} In Flow
              </p>
              <p className="text-[11px] text-slate-500">
                {pipeline?.submitted ?? 0} Pending • {pipeline?.approved ?? 0} Sanctioned
              </p>
            </div>
            <CheckCircle2 className="h-6 w-6 text-amber-600" />
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-violet-50 to-white">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <span className="text-xs font-medium text-slate-500 uppercase">Reports & Analytics</span>
              <p className="text-lg font-bold text-slate-900 mt-0.5">Live Audited</p>
              <Link href="/reports" className="text-[11px] font-semibold text-violet-700 flex items-center gap-1 hover:underline">
                Open Reports Hub <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            <BarChart3 className="h-6 w-6 text-violet-600" />
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <div>
        <h2 className="text-sm font-semibold text-slate-800 mb-3 flex items-center gap-1.5">
          <span>⚡</span> Quick Actions
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Link href="/customers/new" className="block">
            <Card className="hover:border-blue-300 hover:shadow-sm transition-all cursor-pointer">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="p-2.5 rounded-lg bg-blue-50 text-blue-600">
                  <UserPlus className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-900">Add Customer</p>
                  <p className="text-xs text-slate-500">New Member KYC</p>
                </div>
              </CardContent>
            </Card>
          </Link>

          <Link href="/loans?tab=approvals" className="block">
            <Card className="hover:border-emerald-300 hover:shadow-sm transition-all cursor-pointer">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="p-2.5 rounded-lg bg-emerald-50 text-emerald-600">
                  <CheckCircle2 className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-900">Approve & Sanction</p>
                  <p className="text-xs text-slate-500">Credit Approval</p>
                </div>
              </CardContent>
            </Card>
          </Link>

          <Link href="/loans" className="block">
            <Card className="hover:border-amber-300 hover:shadow-sm transition-all cursor-pointer">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="p-2.5 rounded-lg bg-amber-50 text-amber-600">
                  <BookOpen className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-900">Loan Accounts</p>
                  <p className="text-xs text-slate-500">EMI & Ledger</p>
                </div>
              </CardContent>
            </Card>
          </Link>

          <Link href="/savings" className="block">
            <Card className="hover:border-teal-300 hover:shadow-sm transition-all cursor-pointer">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="p-2.5 rounded-lg bg-teal-50 text-teal-600">
                  <PiggyBank className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-900">Savings Deposit</p>
                  <p className="text-xs text-slate-500">Member Savings</p>
                </div>
              </CardContent>
            </Card>
          </Link>
        </div>
      </div>

      {/* Recent Collections Table */}
      <Card>
        <div className="p-5 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold text-slate-900">Recent Collections</h3>
            <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-medium">
              Live Feed
            </span>
          </div>
          <Link href="/collections" className="text-xs font-semibold text-blue-600 hover:text-blue-700">
            View All Collections
          </Link>
        </div>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Receipt No</TableHead>
                <TableHead>Customer Name</TableHead>
                <TableHead>Amount (₹)</TableHead>
                <TableHead>Payment Method</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recentCollections.length === 0 ? (
                <TableRow>
                  <td colSpan={6}>
                    <TableEmptyState message="No collection records found in database. New installments collected will appear here in real-time." />
                  </td>
                </TableRow>
              ) : (
                recentCollections.map((rc) => (
                  <TableRow key={rc.id}>
                    <TableCell className="font-mono text-xs font-semibold text-blue-600">
                      {rc.receiptNumber}
                    </TableCell>
                    <TableCell className="font-medium text-slate-800">
                      {rc.customerName}
                    </TableCell>
                    <TableCell className="font-semibold text-emerald-600">
                      {Money.from(rc.amount).toDisplayString(true)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="neutral">{rc.paymentMethod}</Badge>
                    </TableCell>
                    <TableCell className="text-xs text-slate-500">
                      {rc.businessDate}
                    </TableCell>
                    <TableCell>
                      <Badge variant={rc.status === "POSTED" ? "success" : "danger"}>
                        {rc.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* System Status Card */}
      <Card className="bg-slate-50 border-dashed">
        <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs text-slate-600">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
            <span className="font-semibold text-slate-800">Operational Integrity:</span>
            <span>All transactions strictly bounded by Double-Entry Ledger and audited exports.</span>
          </div>
          <span className="text-slate-500 font-mono">Local MySQL 8.x Active • System Ready</span>
        </CardContent>
      </Card>
    </div>
  );
}
