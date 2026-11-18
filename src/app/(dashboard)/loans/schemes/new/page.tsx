"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Layers, ArrowLeft, CheckCircle2, AlertCircle, Calculator, Info } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";

export default function NewLoanSchemePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    code: `SCH-${Date.now().toString().slice(-4)}`,
    name: "",
    loanAmount: "50000",
    repaymentPeriod: "12",
    totalRepaymentAmount: "54000",
    termsAndConditions: "",
  });

  // Indicative calculation for informational preview
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

    const trimmedCode = formData.code.trim().toUpperCase();
    if (!/^[A-Z0-9-]+$/.test(trimmedCode)) {
      setError("Scheme code must contain only uppercase letters, numbers, and hyphens (e.g. LN001, AGRI-CROP-01)");
      return;
    }

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
      const res = await fetch("/api/loans/schemes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: trimmedCode,
          name: formData.name.trim(),
          loanAmount: String(principalNum),
          repaymentPeriod: periodNum,
          totalRepaymentAmount: String(totalRepayNum),
          termsAndConditions: formData.termsAndConditions.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || "Failed to create loan scheme");
      }

      router.push("/loans/schemes");
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/loans/schemes">
          <Button variant="outline" size="sm">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back to Schemes
          </Button>
        </Link>
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">
            Create Loan Scheme
          </h1>
          <p className="text-xs text-slate-500">
            Define institutional lending parameters, repayment duration, and contractual repayment obligation.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Layers className="h-4 w-4 text-blue-600" />
            Loan Scheme Parameters
          </CardTitle>
          <CardDescription>
            The maker specifies the principal, duration, and total repayment amount directly without formulaic interest calculations.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700 flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 text-red-500" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Field 1: Scheme Code */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700">Scheme Code *</label>
              <Input
                required
                value={formData.code}
                onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                placeholder="e.g. LN001"
              />
              <p className="text-[11px] text-slate-500">Unique uppercase identifier for this lending scheme.</p>
            </div>

            {/* Field 2: Scheme Name */}
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
              {/* Field 3: Loan Amount (Principal) */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700">Loan Amount (₹) *</label>
                <Input
                  required
                  type="number"
                  min="1"
                  step="any"
                  value={formData.loanAmount}
                  onChange={(e) => setFormData({ ...formData, loanAmount: e.target.value })}
                  placeholder="e.g. 50000"
                />
                <p className="text-[11px] text-slate-500">Amount disbursed to customer</p>
              </div>

              {/* Field 4: Repayment Period (Months) */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700">Repayment Period (Months) *</label>
                <Input
                  required
                  type="number"
                  min="1"
                  max="600"
                  value={formData.repaymentPeriod}
                  onChange={(e) => setFormData({ ...formData, repaymentPeriod: e.target.value })}
                  placeholder="e.g. 12"
                />
                <p className="text-[11px] text-slate-500">Duration in months</p>
              </div>

              {/* Field 5: Total Repayment Amount */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700">Total Repayment Amount (₹) *</label>
                <Input
                  required
                  type="number"
                  min="1"
                  step="any"
                  value={formData.totalRepaymentAmount}
                  onChange={(e) => setFormData({ ...formData, totalRepaymentAmount: e.target.value })}
                  placeholder="e.g. 54000"
                />
                <p className="text-[11px] text-slate-500">Final contractual obligation</p>
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

            {/* Field 6: Terms and Conditions */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700">Terms and Conditions</label>
              <Textarea
                rows={3}
                value={formData.termsAndConditions}
                onChange={(e) => setFormData({ ...formData, termsAndConditions: e.target.value })}
                placeholder="Institutional lending covenants, eligibility requirements, or collection guidelines..."
              />
            </div>

            <div className="pt-4 flex justify-end gap-2 border-t border-slate-100">
              <Link href="/loans/schemes">
                <Button type="button" variant="outline" size="sm" disabled={loading}>
                  Cancel
                </Button>
              </Link>
              <Button type="submit" size="sm" disabled={loading} className="bg-blue-600 hover:bg-blue-700 text-white">
                <CheckCircle2 className="h-4 w-4 mr-1.5" />
                {loading ? "Creating..." : "Save Loan Scheme"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
