import React from "react";
import Link from "next/link";
import { BadgePercent, PlusCircle, CheckCircle, Calculator, FileText } from "lucide-react";
import { getCurrentUser, requirePermission } from "@/lib/permissions/auth-guard";
import { getLoanSchemes } from "@/modules/loans/loan-scheme-service";
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

export default async function LoanSchemesPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  requirePermission(user, "loan.scheme.read");
  const schemes = await getLoanSchemes(user);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Loan Schemes & Product Catalog
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Configure version-controlled interest methods, repayment frequencies, and schedules
          </p>
        </div>
        <Link href="/loans/schemes/new">
          <Button size="sm">
            <PlusCircle className="h-4 w-4 mr-1.5" />
            New Loan Scheme
          </Button>
        </Link>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <BadgePercent className="h-4 w-4 text-blue-600" />
                Configured Loan Products
              </CardTitle>
              <CardDescription>
                All published schemes are immutable and version-controlled
              </CardDescription>
            </div>
            <Badge variant="info">{schemes.length} Active Schemes</Badge>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Scheme Code & Name</TableHead>
                <TableHead>Interest Method</TableHead>
                <TableHead>Annual Rate</TableHead>
                <TableHead>Principal Limits</TableHead>
                <TableHead>Term (Months)</TableHead>
                <TableHead>Frequency</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {schemes.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7}>
                    <TableEmptyState message="No loan schemes created yet. Click 'New Loan Scheme' to create one." />
                  </TableCell>
                </TableRow>
              ) : (
                schemes.map((scheme) => {
                  const currentVer = scheme.versions[0];
                  return (
                    <TableRow key={scheme.id}>
                      <TableCell>
                        <div className="font-semibold text-slate-900">{scheme.name}</div>
                        <div className="font-mono text-xs text-blue-600">
                          {scheme.code} (v{currentVer?.versionNumber || 1})
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="neutral" className="text-[11px]">
                          {currentVer?.interestMethod || "REDUCING_BALANCE"}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-semibold text-slate-900 text-xs">
                        {currentVer?.interestRate ? `${parseFloat(currentVer.interestRate.toString())}% p.a.` : "—"}
                      </TableCell>
                      <TableCell className="text-xs font-mono text-slate-700">
                        {currentVer ? `₹${parseFloat(currentVer.minPrincipal.toString())} - ₹${parseFloat(currentVer.maxPrincipal.toString())}` : "—"}
                      </TableCell>
                      <TableCell className="text-xs text-slate-700 font-semibold">
                        {currentVer?.termMonths ? `${currentVer.termMonths} mo` : "—"}
                      </TableCell>
                      <TableCell className="text-xs text-slate-600">
                        {currentVer?.repaymentFrequency || "MONTHLY"}
                      </TableCell>
                      <TableCell>
                        <Badge variant={scheme.status === "PUBLISHED" ? "success" : "warning"} className="text-[11px]">
                          {scheme.status}
                        </Badge>
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
