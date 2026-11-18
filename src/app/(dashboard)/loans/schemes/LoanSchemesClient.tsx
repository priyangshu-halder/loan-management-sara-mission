"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Layers,
  PlusCircle,
  Pencil,
  Trash2,
  AlertCircle,
  CheckCircle2,
  AlertTriangle,
  Archive,
  X,
  Search,
  ExternalLink,
  Info,
  Calculator,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableEmptyState,
} from "@/components/ui/Table";

export interface LoanSchemeItem {
  id: string;
  code: string;
  name: string;
  status: string;
  createdAt: Date | string;
  currentVersionId: string | null;
  versions: Array<{
    id: string;
    versionNumber: number;
    principalAmount?: string | null;
    totalRepaymentAmount?: string | null;
    termMonths: number;
    termsAndConditions?: string | null;
    minPrincipal?: string | null;
    maxPrincipal?: string | null;
    interestRate?: string | null;
    interestMethod?: string | null;
    repaymentFrequency: string;
    status: string;
  }>;
  _count?: {
    applications: number;
    loanAccounts: number;
  };
}

interface Props {
  initialSchemes: LoanSchemeItem[];
}

export function LoanSchemesClient({ initialSchemes }: Props) {
  const router = useRouter();
  const [schemes, setSchemes] = useState<LoanSchemeItem[]>(initialSchemes);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "PUBLISHED" | "DRAFT" | "ARCHIVED">("ALL");

  // Quick Edit Modal State
  const [editTarget, setEditTarget] = useState<LoanSchemeItem | null>(null);
  const [editForm, setEditForm] = useState({
    name: "",
    loanAmount: "50000",
    repaymentPeriod: "12",
    totalRepaymentAmount: "54000",
    termsAndConditions: "",
    status: "PUBLISHED" as "PUBLISHED" | "DRAFT" | "ARCHIVED",
  });
  const [editError, setEditError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Delete / Archive Modal State
  const [deleteTarget, setDeleteTarget] = useState<LoanSchemeItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Global banners
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Filter schemes
  const filteredSchemes = useMemo(() => {
    return schemes.filter((s) => {
      const matchesStatus =
        statusFilter === "ALL" || s.status === statusFilter;
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        s.code.toLowerCase().includes(q) ||
        s.name.toLowerCase().includes(q);
      return matchesStatus && matchesSearch;
    });
  }, [schemes, searchQuery, statusFilter]);

  // Open Quick Edit
  const handleOpenEdit = (scheme: LoanSchemeItem) => {
    const latestVersion = scheme.versions[0];
    setEditTarget(scheme);
    setEditError(null);
    setEditForm({
      name: scheme.name,
      loanAmount: latestVersion?.principalAmount ?? latestVersion?.minPrincipal ?? "50000",
      repaymentPeriod: String(latestVersion?.termMonths ?? 12),
      totalRepaymentAmount: latestVersion?.totalRepaymentAmount ?? latestVersion?.minPrincipal ?? "54000",
      termsAndConditions: latestVersion?.termsAndConditions ?? "",
      status: (scheme.status as "PUBLISHED" | "DRAFT" | "ARCHIVED") ?? "PUBLISHED",
    });
  };

  // Indicative calculation for Quick Edit modal preview
  const editPrincipalNum = parseFloat(editForm.loanAmount || "0");
  const editPeriodNum = parseInt(editForm.repaymentPeriod || "0", 10);
  const editTotalNum = parseFloat(editForm.totalRepaymentAmount || "0");

  const editIndicativeEmi =
    !isNaN(editTotalNum) && !isNaN(editPeriodNum) && editPeriodNum > 0
      ? (editTotalNum / editPeriodNum).toLocaleString("en-IN", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })
      : null;

  // Submit Quick Edit
  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTarget) return;
    setEditError(null);

    if (!editForm.name.trim()) {
      setEditError("Scheme name is required");
      return;
    }

    if (isNaN(editPrincipalNum) || editPrincipalNum <= 0) {
      setEditError("Loan amount (principal) must be a positive number");
      return;
    }

    if (isNaN(editPeriodNum) || editPeriodNum < 1 || editPeriodNum > 600) {
      setEditError("Repayment period must be between 1 and 600 months");
      return;
    }

    if (isNaN(editTotalNum) || editTotalNum <= 0) {
      setEditError("Total repayment amount must be a positive number");
      return;
    }

    if (editTotalNum < editPrincipalNum) {
      setEditError("Total repayment amount must be greater than or equal to loan amount");
      return;
    }

    setSaving(true);

    try {
      const res = await fetch(`/api/loans/schemes/${editTarget.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editForm.name.trim(),
          loanAmount: String(editPrincipalNum),
          repaymentPeriod: editPeriodNum,
          totalRepaymentAmount: String(editTotalNum),
          termsAndConditions: editForm.termsAndConditions.trim() || undefined,
          status: editForm.status,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || "Failed to update loan scheme");
      }

      const updatedScheme = data.scheme;
      setSchemes((prev) =>
        prev.map((s) => (s.id === editTarget.id ? { ...s, ...updatedScheme } : s))
      );
      setSuccessMsg(`Loan scheme "${editTarget.code}" was updated successfully.`);
      setEditTarget(null);
      router.refresh();
    } catch (err: unknown) {
      setEditError(err instanceof Error ? err.message : "Failed to update scheme");
    } finally {
      setSaving(false);
    }
  };

  // Submit Delete
  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setErrorMsg(null);

    try {
      const res = await fetch(`/api/loans/schemes/${deleteTarget.id}`, {
        method: "DELETE",
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || "Failed to delete loan scheme");
      }

      setSchemes((prev) => prev.filter((s) => s.id !== deleteTarget.id));
      setSuccessMsg(`Loan scheme "${deleteTarget.code}" was successfully deleted.`);
      setDeleteTarget(null);
      router.refresh();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to delete scheme");
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  };

  // Submit Archive
  const handleArchiveConfirm = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setErrorMsg(null);

    try {
      const res = await fetch(`/api/loans/schemes/${deleteTarget.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "ARCHIVED" }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || "Failed to archive loan scheme");
      }

      const updated = data.scheme;
      setSchemes((prev) =>
        prev.map((s) => (s.id === deleteTarget.id ? { ...s, status: "ARCHIVED", ...updated } : s))
      );
      setSuccessMsg(`Loan scheme "${deleteTarget.code}" was archived successfully.`);
      setDeleteTarget(null);
      router.refresh();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to archive scheme");
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner Notifications */}
      {successMsg && (
        <div className="p-3.5 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-center justify-between shadow-sm animate-in fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
            <span>{successMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setSuccessMsg(null)}
            className="text-emerald-500 hover:text-emerald-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {errorMsg && (
        <div className="p-3.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800 flex items-center justify-between shadow-sm animate-in fade-in">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-red-600 shrink-0" />
            <span>{errorMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setErrorMsg(null)}
            className="text-red-500 hover:text-red-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Loan Schemes
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Manage institutional loan schemes with manually configured principal, duration, and contractual total repayment.
          </p>
        </div>

        <Link href="/loans/schemes/new">
          <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white shadow-sm">
            <PlusCircle className="h-4 w-4 mr-1.5" />
            New Loan Scheme
          </Button>
        </Link>
      </div>

      {/* Search and Filter Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
        <div className="relative flex-1 max-w-sm">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search by scheme code or scheme name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3.5 py-1.5 text-xs rounded-lg border border-slate-300 bg-slate-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 transition-colors"
          />
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto">
          {(["ALL", "PUBLISHED", "DRAFT", "ARCHIVED"] as const).map((st) => {
            const active = statusFilter === st;
            const count =
              st === "ALL"
                ? schemes.length
                : schemes.filter((s) => s.status === st).length;

            return (
              <button
                key={st}
                type="button"
                onClick={() => setStatusFilter(st)}
                className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all ${
                  active
                    ? "bg-slate-900 text-white shadow-sm"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {st === "ALL" ? "All Schemes" : st.charAt(0) + st.slice(1).toLowerCase()} ({count})
              </button>
            );
          })}
        </div>
      </div>

      {/* Schemes Card & Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Layers className="h-4 w-4 text-blue-600" />
                Configured Loan Schemes
              </CardTitle>
              <CardDescription>
                All published schemes are version-controlled and snapshot into loan records on disbursement.
              </CardDescription>
            </div>
            <Badge variant="info">
              {filteredSchemes.length} of {schemes.length} Schemes
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Scheme Code & Name</TableHead>
                <TableHead>Loan Amount (Principal)</TableHead>
                <TableHead>Repayment Period</TableHead>
                <TableHead>Total Repayment</TableHead>
                <TableHead>Indicative Monthly EMI</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Quick Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredSchemes.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7}>
                    <TableEmptyState
                      message={
                        searchQuery || statusFilter !== "ALL"
                          ? "No loan schemes match your search/filter criteria."
                          : "No loan schemes created yet. Click 'New Loan Scheme' to create one."
                      }
                    />
                  </TableCell>
                </TableRow>
              ) : (
                filteredSchemes.map((scheme) => {
                  const currentVer = scheme.versions[0];
                  const linkedLoans =
                    (scheme._count?.applications ?? 0) + (scheme._count?.loanAccounts ?? 0);

                  const principalVal =
                    currentVer?.principalAmount ?? currentVer?.minPrincipal ?? "0";
                  const totalRepayVal =
                    currentVer?.totalRepaymentAmount ?? currentVer?.minPrincipal ?? principalVal;
                  const termMonthsVal = currentVer?.termMonths ?? 12;

                  const pNum = parseFloat(String(principalVal));
                  const tNum = parseFloat(String(totalRepayVal));
                  const emi =
                    termMonthsVal > 0 && !isNaN(tNum)
                      ? (tNum / termMonthsVal).toLocaleString("en-IN", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })
                      : "—";

                  return (
                    <TableRow key={scheme.id}>
                      <TableCell>
                        <div className="font-semibold text-slate-900">{scheme.name}</div>
                        <div className="font-mono text-xs text-blue-600">
                          {scheme.code} (v{currentVer?.versionNumber || 1})
                        </div>
                        {linkedLoans > 0 && (
                          <div className="text-[11px] text-slate-400 mt-0.5">
                            {linkedLoans} active loan record{linkedLoans > 1 ? "s" : ""}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-xs font-semibold text-slate-900">
                        ₹{pNum.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell className="text-xs text-slate-700 font-semibold">
                        {termMonthsVal} Months
                      </TableCell>
                      <TableCell className="text-xs font-bold text-slate-900">
                        ₹{tNum.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell className="text-xs font-semibold text-blue-700">
                        ₹{emi} / mo
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            scheme.status === "PUBLISHED"
                              ? "success"
                              : scheme.status === "ARCHIVED"
                              ? "neutral"
                              : "warning"
                          }
                          className="text-[11px]"
                        >
                          {scheme.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => handleOpenEdit(scheme)}
                            className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-slate-100 rounded-lg transition-colors"
                            title="Quick edit scheme"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <Link
                            href={`/loans/schemes/${scheme.id}/edit`}
                            className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-slate-100 rounded-lg transition-colors"
                            title="Open full editor"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </Link>
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(scheme)}
                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title={linkedLoans > 0 ? "Archive scheme" : "Delete scheme"}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* QUICK EDIT MODAL */}
      {editTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full border border-slate-200 p-6 space-y-4 my-8 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-blue-100 text-blue-600 rounded-lg">
                  <Pencil className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Edit Loan Scheme
                  </h3>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="font-mono text-xs font-semibold text-blue-600">
                      {editTarget.code}
                    </span>
                    <span className="text-xs text-slate-400">•</span>
                    <span className="text-xs text-slate-500">
                      Current Version: v{editTarget.versions[0]?.versionNumber || 1}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Link
                  href={`/loans/schemes/${editTarget.id}/edit`}
                  className="text-xs text-slate-500 hover:text-blue-600 flex items-center gap-1 p-1"
                  title="Open full-page editor"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Full Page</span>
                </Link>
                <button
                  type="button"
                  onClick={() => setEditTarget(null)}
                  className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {editTarget.status === "PUBLISHED" && (
              <div className="p-3 rounded-lg bg-blue-50 border border-blue-200 text-xs text-blue-700 flex items-start gap-2">
                <Info className="h-4 w-4 shrink-0 text-blue-600 mt-0.5" />
                <div>
                  <strong className="font-semibold text-blue-900">Versioned Scheme Notice:</strong>{" "}
                  Modifying loan amount, duration, or total repayment will automatically create version <strong>v{(editTarget.versions[0]?.versionNumber || 1) + 1}</strong>. Historical loans remain bound to their agreed terms.
                </div>
              </div>
            )}

            {editError && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700 flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 text-red-500" />
                <span>{editError}</span>
              </div>
            )}

            <form onSubmit={handleSaveEdit} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">Scheme Name *</label>
                <Input
                  required
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  placeholder="e.g. Standard Loan Scheme"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700">Loan Amount (₹) *</label>
                  <Input
                    required
                    type="number"
                    min="1"
                    step="any"
                    value={editForm.loanAmount}
                    onChange={(e) => setEditForm({ ...editForm, loanAmount: e.target.value })}
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700">Duration (Mo) *</label>
                  <Input
                    required
                    type="number"
                    min="1"
                    max="600"
                    value={editForm.repaymentPeriod}
                    onChange={(e) => setEditForm({ ...editForm, repaymentPeriod: e.target.value })}
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700">Total Repay (₹) *</label>
                  <Input
                    required
                    type="number"
                    min="1"
                    step="any"
                    value={editForm.totalRepaymentAmount}
                    onChange={(e) => setEditForm({ ...editForm, totalRepaymentAmount: e.target.value })}
                  />
                </div>
              </div>

              {editIndicativeEmi && (
                <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs flex items-center justify-between">
                  <span className="text-slate-600 flex items-center gap-1.5">
                    <Calculator className="h-3.5 w-3.5 text-blue-600" />
                    Indicative Monthly Installment:
                  </span>
                  <span className="font-bold text-slate-900">₹{editIndicativeEmi} / mo</span>
                </div>
              )}

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">Terms and Conditions</label>
                <Textarea
                  rows={2}
                  value={editForm.termsAndConditions}
                  onChange={(e) => setEditForm({ ...editForm, termsAndConditions: e.target.value })}
                  placeholder="Institutional covenants..."
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">Status</label>
                <select
                  value={editForm.status}
                  onChange={(e) => setEditForm({ ...editForm, status: e.target.value as "PUBLISHED" | "DRAFT" | "ARCHIVED" })}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="PUBLISHED">Published</option>
                  <option value="DRAFT">Draft</option>
                  <option value="ARCHIVED">Archived</option>
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={saving}
                  onClick={() => setEditTarget(null)}
                >
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={saving} className="bg-blue-600 text-white">
                  <CheckCircle2 className="h-4 w-4 mr-1.5" />
                  {saving ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE / ARCHIVE CONFIRMATION MODAL */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full border border-slate-200 p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3 text-red-600">
              <AlertTriangle className="h-6 w-6 shrink-0" />
              <h3 className="font-bold text-slate-900 text-base">
                {(deleteTarget._count?.applications ?? 0) > 0 ||
                (deleteTarget._count?.loanAccounts ?? 0) > 0
                  ? "Archive Loan Scheme?"
                  : "Delete Loan Scheme?"}
              </h3>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              {(deleteTarget._count?.applications ?? 0) > 0 ||
              (deleteTarget._count?.loanAccounts ?? 0) > 0 ? (
                <>
                  Scheme <strong>{deleteTarget.name}</strong> ({deleteTarget.code}) is linked to{" "}
                  <strong>{deleteTarget._count?.applications ?? 0} application(s)</strong> and{" "}
                  <strong>{deleteTarget._count?.loanAccounts ?? 0} active loan account(s)</strong>.
                  It cannot be deleted to preserve financial auditability, but can be safely archived to prevent new applications.
                </>
              ) : (
                <>
                  Are you sure you want to permanently delete scheme{" "}
                  <strong>{deleteTarget.name}</strong> ({deleteTarget.code})? This action cannot be undone.
                </>
              )}
            </p>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <Button
                variant="outline"
                size="sm"
                disabled={deleting}
                onClick={() => setDeleteTarget(null)}
              >
                Cancel
              </Button>
              {(deleteTarget._count?.applications ?? 0) > 0 ||
              (deleteTarget._count?.loanAccounts ?? 0) > 0 ? (
                <Button
                  size="sm"
                  disabled={deleting}
                  onClick={handleArchiveConfirm}
                  className="bg-amber-600 hover:bg-amber-700 text-white"
                >
                  <Archive className="h-4 w-4 mr-1" />
                  {deleting ? "Archiving..." : "Archive Scheme"}
                </Button>
              ) : (
                <Button
                  size="sm"
                  disabled={deleting}
                  onClick={handleDeleteConfirm}
                  className="bg-red-600 hover:bg-red-700 text-white"
                >
                  <Trash2 className="h-4 w-4 mr-1" />
                  {deleting ? "Deleting..." : "Delete Permanently"}
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
