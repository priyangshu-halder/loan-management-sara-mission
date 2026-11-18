"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Layers,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  Trash2,
  AlertTriangle,
  Archive,
  Info,
  Calculator,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Badge } from "@/components/ui/Badge";
import { LoanSchemeItem } from "../../LoanSchemesClient";

interface Props {
  scheme: LoanSchemeItem;
}

export function EditLoanSchemeClient({ scheme }: Props) {
  const router = useRouter();
  const latestVersion = scheme.versions[0];

  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: scheme.name,
    loanAmount: latestVersion?.principalAmount ?? latestVersion?.minPrincipal ?? "50000",
    repaymentPeriod: String(latestVersion?.termMonths ?? 12),
    totalRepaymentAmount: latestVersion?.totalRepaymentAmount ?? latestVersion?.minPrincipal ?? "54000",
    termsAndConditions: latestVersion?.termsAndConditions ?? "",
    status: (scheme.status as "PUBLISHED" | "DRAFT" | "ARCHIVED") ?? "DRAFT",
  });

  const principalNum = parseFloat(formData.loanAmount || "0");
  const periodNum = parseInt(formData.repaymentPeriod || "0", 10);
  const totalRepayNum = parseFloat(formData.totalRepaymentAmount || "0");

  const hasValidFinancials =
    !isNaN(principalNum) &&
    principalNum > 0 &&
    !isNaN(periodNum) &&
    periodNum >= 1 &&
    !isNaN(totalRepayNum) &&
    totalRepayNum >= principalNum;

  const indicativeMonthlyInstallment =
    hasValidFinancials && periodNum > 0
      ? (totalRepayNum / periodNum).toLocaleString("en-IN", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })
      : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!formData.name.trim()) {
      setError("Scheme name is required");
      return;
    }

    if (isNaN(principalNum) || principalNum <= 0) {
      setError("Loan amount (principal) must be a positive number");
      return;
    }

    if (isNaN(periodNum) || periodNum < 1 || periodNum > 600) {
      setError("Repayment period must be between 1 and 600 months");
      return;
    }

    if (isNaN(totalRepayNum) || totalRepayNum <= 0) {
      setError("Total repayment amount must be a positive number");
      return;
    }

    if (totalRepayNum < principalNum) {
      setError("Total repayment amount must be greater than or equal to loan amount");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch(`/api/loans/schemes/${scheme.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.name.trim(),
          loanAmount: String(principalNum),
          repaymentPeriod: periodNum,
          totalRepaymentAmount: String(totalRepayNum),
          termsAndConditions: formData.termsAndConditions.trim() || undefined,
          status: formData.status,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || "Failed to update loan scheme");
      }

      router.push("/loans/schemes");
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    setError(null);

    try {
      const res = await fetch(`/api/loans/schemes/${scheme.id}`, {
        method: "DELETE",
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || "Failed to delete loan scheme");
      }

      router.push("/loans/schemes");
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to delete loan scheme");
    } finally {
      setDeleting(false);
      setShowDeleteModal(false);
    }
  };

  const handleArchive = async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/loans/schemes/${scheme.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "ARCHIVED",
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || "Failed to archive loan scheme");
      }

      router.push("/loans/schemes");
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to archive loan scheme");
    } finally {
      setLoading(false);
      setShowDeleteModal(false);
    }
  };

  const hasLinkedLoans =
    (scheme._count?.applications ?? 0) > 0 || (scheme._count?.loanAccounts ?? 0) > 0;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/loans/schemes">
            <Button variant="outline" size="sm">
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back to Schemes
            </Button>
          </Link>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">
              Edit Loan Scheme
            </h1>
            <p className="text-xs text-slate-500">
              Modify scheme parameters, repayment duration, or lifecycle status.
            </p>
          </div>
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setShowDeleteModal(true)}
          className="text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200 text-xs"
        >
          <Trash2 className="h-3.5 w-3.5 mr-1" />
          {hasLinkedLoans ? "Archive Scheme" : "Delete Scheme"}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Layers className="h-4 w-4 text-blue-600" />
              Loan Scheme Configuration
            </CardTitle>
            <div className="flex items-center gap-2">
              <Badge variant="neutral" className="text-xs font-mono">
                {scheme.code} (v{latestVersion?.versionNumber || 1})
              </Badge>
              <Badge
                variant={
                  scheme.status === "PUBLISHED"
                    ? "success"
                    : scheme.status === "ARCHIVED"
                    ? "neutral"
                    : "warning"
                }
                className="text-xs"
              >
                {scheme.status}
              </Badge>
            </div>
          </div>
          <CardDescription>
            Financial parameters are version-controlled. Modifying parameters on published schemes generates a new version.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {scheme.status === "PUBLISHED" && (
            <div className="mb-4 p-3 rounded-lg bg-blue-50 border border-blue-200 text-xs text-blue-700 flex items-start gap-2">
              <Info className="h-4 w-4 shrink-0 text-blue-600 mt-0.5" />
              <div>
                <strong className="font-semibold text-blue-900">Versioned Scheme Notice:</strong>{" "}
                Changing loan amount, duration, or total repayment on this published scheme will automatically create version <strong>v{(latestVersion?.versionNumber || 1) + 1}</strong>. Existing active loans continue following their original agreed schedule without retroactive changes.
              </div>
            </div>
          )}

          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700 flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 text-red-500" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700">Scheme Code</label>
              <Input
                disabled
                value={scheme.code}
                className="bg-slate-100 text-slate-500 cursor-not-allowed font-mono"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700">Scheme Name *</label>
              <Input
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g. Standard Loan Scheme"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700">Loan Amount (₹) *</label>
                <Input
                  required
                  type="number"
                  min="1"
                  step="any"
                  value={formData.loanAmount}
                  onChange={(e) => setFormData({ ...formData, loanAmount: e.target.value })}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700">Repayment Period (Months) *</label>
                <Input
                  required
                  type="number"
                  min="1"
                  max="600"
                  value={formData.repaymentPeriod}
                  onChange={(e) => setFormData({ ...formData, repaymentPeriod: e.target.value })}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700">Total Repayment Amount (₹) *</label>
                <Input
                  required
                  type="number"
                  min="1"
                  step="any"
                  value={formData.totalRepaymentAmount}
                  onChange={(e) => setFormData({ ...formData, totalRepaymentAmount: e.target.value })}
                />
              </div>
            </div>

            {/* Informational Preview */}
            {hasValidFinancials && (
              <div className="p-3.5 rounded-lg bg-blue-50/80 border border-blue-200 text-xs space-y-2">
                <div className="flex items-center gap-1.5 font-semibold text-blue-900">
                  <Calculator className="h-4 w-4 text-blue-700" />
                  <span>Scheme Repayment Preview</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
                  <div>
                    <span className="text-slate-500 block text-[11px]">Principal Amount</span>
                    <span className="font-semibold text-slate-900">
                      ₹{principalNum.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[11px]">Total Repayment</span>
                    <span className="font-semibold text-slate-900">
                      ₹{totalRepayNum.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[11px]">Repayment Period</span>
                    <span className="font-semibold text-slate-900">{periodNum} Months</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[11px]">Indicative Monthly Installment</span>
                    <span className="font-bold text-blue-800">₹{indicativeMonthlyInstallment}</span>
                  </div>
                </div>
                <div className="flex items-start gap-1.5 text-[11px] text-blue-800/80 pt-1 border-t border-blue-100">
                  <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  <span>
                    Indicative monthly installment is calculated evenly across the schedule. This is an operational schedule calculation, not an interest formula calculation.
                  </span>
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700">Terms and Conditions</label>
              <Textarea
                rows={3}
                value={formData.termsAndConditions}
                onChange={(e) => setFormData({ ...formData, termsAndConditions: e.target.value })}
                placeholder="Institutional lending covenants, eligibility requirements, or collection guidelines..."
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700">Scheme Lifecycle Status</label>
              <select
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value as "PUBLISHED" | "DRAFT" | "ARCHIVED" })}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="PUBLISHED">Published (Active for new applications)</option>
                <option value="DRAFT">Draft</option>
                <option value="ARCHIVED">Archived (Retired from new lending)</option>
              </select>
            </div>

            <div className="pt-4 flex justify-end gap-2 border-t border-slate-100">
              <Link href="/loans/schemes">
                <Button type="button" variant="outline" size="sm" disabled={loading}>
                  Cancel
                </Button>
              </Link>
              <Button type="submit" size="sm" disabled={loading} className="bg-blue-600 hover:bg-blue-700 text-white">
                <CheckCircle2 className="h-4 w-4 mr-1.5" />
                {loading ? "Saving..." : "Save Scheme Changes"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Delete / Archive Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl space-y-4">
            <div className="flex items-center gap-3 text-red-600">
              <AlertTriangle className="h-6 w-6 shrink-0" />
              <h3 className="font-bold text-slate-900 text-base">
                {hasLinkedLoans ? "Archive Loan Scheme?" : "Delete Loan Scheme?"}
              </h3>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              {hasLinkedLoans ? (
                <>
                  Scheme <strong>{scheme.name}</strong> ({scheme.code}) has{" "}
                  <strong>{scheme._count?.applications ?? 0} application(s)</strong> and{" "}
                  <strong>{scheme._count?.loanAccounts ?? 0} loan account(s)</strong> linked to it.
                  To protect institutional audit trails, active schemes with loan history cannot be permanently deleted. You can archive it instead to prevent new loan applications.
                </>
              ) : (
                <>
                  Are you sure you want to permanently delete loan scheme <strong>{scheme.name}</strong> ({scheme.code})? This action cannot be undone.
                </>
              )}
            </p>

            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button
                variant="outline"
                size="sm"
                disabled={deleting || loading}
                onClick={() => setShowDeleteModal(false)}
              >
                Cancel
              </Button>
              {hasLinkedLoans ? (
                <Button
                  size="sm"
                  disabled={loading}
                  onClick={handleArchive}
                  className="bg-amber-600 hover:bg-amber-700 text-white"
                >
                  <Archive className="h-4 w-4 mr-1" />
                  {loading ? "Archiving..." : "Archive Scheme"}
                </Button>
              ) : (
                <Button
                  size="sm"
                  disabled={deleting}
                  onClick={handleDelete}
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
