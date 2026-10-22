import React from "react";
import Link from "next/link";
import {
  Users,
  UserCheck,
  Building,
  UserPlus,
  Clock,
  ShieldCheck,
  Search,
  ExternalLink,
} from "lucide-react";
import { getCurrentUser } from "@/lib/permissions/auth-guard";
import {
  getCustomers,
  getGroups,
  getCustomerSummaryKPIs,
} from "@/modules/customers/customer-service";
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

export default async function CustomersPage({
  searchParams,
}: {
  searchParams?: { search?: string; branchId?: string };
}) {
  const user = await getCurrentUser();
  if (!user) return null;

  const [kpis, customersResult, groups] = await Promise.all([
    getCustomerSummaryKPIs(user),
    getCustomers(user, {
      search: searchParams?.search,
      branchId: searchParams?.branchId,
      page: 1,
      pageSize: 50,
    }),
    getGroups(user, searchParams?.branchId),
  ]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Top Banner Matching Design */}
      <div className="bg-emerald-800 text-white rounded-xl p-5 shadow-sm flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-950/40 text-[11px] font-semibold tracking-wider uppercase mb-1.5 text-emerald-200">
            <Users className="h-3 w-3" />
            Borrower Intelligence
          </div>
          <h1 className="text-xl font-bold tracking-tight">
            Customer Management Command Center
          </h1>
          <p className="text-xs text-emerald-100 mt-1">
            Unified borrower records, Aadhaar/Voter KYC compliance, nominee & guarantor profiles, and center mapping.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link href="/customers/kyc">
            <Button size="sm" variant="secondary" className="bg-white/10 hover:bg-white/20 text-white border-0 text-xs">
              <ShieldCheck className="h-3.5 w-3.5 mr-1 text-emerald-300" />
              KYC Desk ({kpis.pendingKyc})
            </Button>
          </Link>
          <Link href="/customers/new">
            <Button size="sm" className="bg-white text-emerald-900 hover:bg-emerald-50 text-xs font-semibold shadow-sm">
              <UserPlus className="h-3.5 w-3.5 mr-1 text-emerald-700" />
              New Customer (KYC)
            </Button>
          </Link>
        </div>
      </div>

      {/* KPI Metrics Row */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card className="p-4 border-l-4 border-l-blue-500">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Total Customers
          </p>
          <p className="text-2xl font-bold text-slate-900 mt-1">{kpis.totalCustomers}</p>
        </Card>

        <Card className="p-4 border-l-4 border-l-emerald-500">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Active Borrowers
          </p>
          <p className="text-2xl font-bold text-slate-900 mt-1">{kpis.activeBorrowers}</p>
        </Card>

        <Card className="p-4 border-l-4 border-l-teal-500">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            KYC Verified
          </p>
          <p className="text-2xl font-bold text-emerald-600 mt-1">{kpis.kycVerifiedPercent}%</p>
        </Card>

        <Card className="p-4 border-l-4 border-l-indigo-500">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            JLG Mapped
          </p>
          <p className="text-2xl font-bold text-slate-900 mt-1">{kpis.jlgMapped}</p>
        </Card>

        <Card className="p-4 border-l-4 border-l-amber-500 col-span-2 md:col-span-1">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Pending KYC
          </p>
          <p className="text-2xl font-bold text-amber-600 mt-1">{kpis.pendingKyc}</p>
        </Card>
      </div>

      {/* Centers & Groups Table */}
      <Card>
        <CardHeader className="py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Building className="h-4 w-4 text-emerald-600" />
              <CardTitle className="text-base">Center Customer Operations Explorer</CardTitle>
              <Badge variant="info" className="ml-2 text-[11px]">{groups.length} Centers</Badge>
            </div>
            <Link href="/customers/groups/new">
              <Button size="sm" variant="outline" className="text-xs">
                + Add Center / Group
              </Button>
            </Link>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Center Code & Name</TableHead>
                <TableHead>Meeting Routine</TableHead>
                <TableHead>Branch</TableHead>
                <TableHead>Total Borrowers</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {groups.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5}>
                    <TableEmptyState message="No centers or JLG groups configured yet." />
                  </TableCell>
                </TableRow>
              ) : (
                groups.map((group) => (
                  <TableRow key={group.id}>
                    <TableCell>
                      <span className="font-mono text-xs text-slate-500 mr-2">{group.code}</span>
                      <strong className="text-slate-800">{group.name}</strong>
                    </TableCell>
                    <TableCell>
                      <div className="inline-flex items-center gap-1 text-xs text-blue-700 bg-blue-50 px-2 py-0.5 rounded">
                        <Clock className="h-3 w-3" />
                        <span>{group.meetingDay || "Flexible"}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-slate-600">
                      {group.branch?.name || "Main Branch"}
                    </TableCell>
                    <TableCell className="font-semibold text-slate-900 text-xs">
                      {group.customerGroups.length}
                    </TableCell>
                    <TableCell>
                      <Badge variant={group.status === "ACTIVE" ? "success" : "neutral"} className="text-[11px]">
                        {group.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Borrowers Roster */}
      <Card>
        <CardHeader className="py-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <UserCheck className="h-4 w-4 text-emerald-600" />
                Active Borrowers Directory
              </CardTitle>
              <CardDescription>
                Comprehensive 360° customer ledger and profile records
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="h-3.5 w-3.5 absolute left-2.5 top-3 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search by name or code..."
                  className="pl-8 pr-3 py-1.5 rounded-lg border border-slate-300 text-xs w-56 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer & Code</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Center & Group</TableHead>
                <TableHead>KYC Status</TableHead>
                <TableHead>Active Loans</TableHead>
                <TableHead>Savings Balance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {customersResult.items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6}>
                    <TableEmptyState message="No customers registered yet. Click 'New Customer (KYC)' to register." />
                  </TableCell>
                </TableRow>
              ) : (
                customersResult.items.map((cust) => {
                  const assignedGroup = cust.customerGroups[0]?.group?.name || "Unassigned";
                  const activeLoanCount = cust.loanAccounts.filter((l) => l.status === "ACTIVE").length;

                  return (
                    <TableRow key={cust.id}>
                      <TableCell>
                        <div className="font-semibold text-slate-900">{cust.fullName}</div>
                        <div className="font-mono text-xs text-blue-600">{cust.customerCode}</div>
                      </TableCell>
                      <TableCell className="text-xs text-slate-600 font-mono">
                        {cust.phone}
                      </TableCell>
                      <TableCell className="text-xs text-slate-700">
                        {assignedGroup}
                      </TableCell>
                      <TableCell>
                        <Badge variant="success" className="text-[11px]">
                          <ShieldCheck className="h-3 w-3 mr-1" />
                          Verified
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={activeLoanCount > 0 ? "info" : "neutral"} className="text-[11px]">
                          {activeLoanCount} Active
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs font-semibold text-slate-900">
                        ₹0.00
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
