"use client";

import React, { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  History,
  Search,
  Printer,
  RotateCcw,
  AlertTriangle,
  CheckCircle2,
  Calendar,
  CreditCard,
  Building,
  User,
  Download,
  X,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
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
  PrintableReceiptModal,
  PrintableReceiptData,
} from "@/components/collections/PrintableReceiptModal";

export interface HistoryReceiptItem {
  id: string;
  receiptNumber: string;
  businessDate: string;
  amount: string;
  paymentMethod: string;
  reference: string | null;
  status: string;
  isReversed: boolean;
  createdAt: string;
  customer: {
    id: string;
    customerCode: string;
    fullName: string;
    phone: string;
    groupName: string;
  };
  loanAccount: {
    id: string;
    loanAccountNumber: string;
    schemeName: string;
  };
  allocations: {
    principalAmount: string;
    interestAmount: string;
  } | null;
}

interface OrgInfo {
  name: string;
  branchName: string;
  gstin: string;
  helpline: string;
}

interface CollectionHistoryClientProps {
  receipts: HistoryReceiptItem[];
  orgInfo: OrgInfo;
}

export function CollectionHistoryClient({
  receipts: initialReceipts,
  orgInfo,
}: CollectionHistoryClientProps) {
  const router = useRouter();

  const [searchQuery, setSearchQuery] = useState("");
  const [paymentModeFilter, setPaymentModeFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL"); // ALL, VALID, REVERSED
  const [dateFilter, setDateFilter] = useState("ALL"); // ALL, TODAY, 7_DAYS, 30_DAYS

  // Receipt modal state
  const [activeReceipt, setActiveReceipt] = useState<PrintableReceiptData | null>(null);

  // Reversal modal state
  const [reversingReceipt, setReversingReceipt] = useState<HistoryReceiptItem | null>(null);
  const [reversalReason, setReversalReason] = useState("");
  const [isSubmittingReversal, setIsSubmittingReversal] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const todayStr = new Date().toISOString().slice(0, 10);

  // Filtered Receipts
  const filteredReceipts = useMemo(() => {
    return initialReceipts.filter((r) => {
      // Mode filter
      const mode = r.paymentMethod === "BANK_TRANSFER" ? "NETBANKING" : r.paymentMethod;
      const matchesMode = paymentModeFilter === "ALL" || mode === paymentModeFilter;

      // Status filter
      const matchesStatus =
        statusFilter === "ALL" ||
        (statusFilter === "VALID" && !r.isReversed) ||
        (statusFilter === "REVERSED" && r.isReversed);

      // Date filter
      let matchesDate = true;
      if (dateFilter === "TODAY") {
        matchesDate = r.businessDate === todayStr;
      } else if (dateFilter === "7_DAYS") {
        const d = new Date();
        d.setDate(d.getDate() - 7);
        matchesDate = r.businessDate >= d.toISOString().slice(0, 10);
      } else if (dateFilter === "30_DAYS") {
        const d = new Date();
        d.setDate(d.getDate() - 30);
        matchesDate = r.businessDate >= d.toISOString().slice(0, 10);
      }

      // Search filter
      const term = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !term ||
        r.receiptNumber.toLowerCase().includes(term) ||
        r.customer.fullName.toLowerCase().includes(term) ||
        r.customer.customerCode.toLowerCase().includes(term) ||
        r.loanAccount.loanAccountNumber.toLowerCase().includes(term) ||
        (r.reference && r.reference.toLowerCase().includes(term));

      return matchesMode && matchesStatus && matchesDate && matchesSearch;
    });
  }, [initialReceipts, paymentModeFilter, statusFilter, dateFilter, searchQuery, todayStr]);

  // Summary Metrics
  const summary = useMemo(() => {
    let totalVolume = 0;
    let cashVolume = 0;
    let digitalVolume = 0;
    let validCount = 0;

    for (const r of filteredReceipts) {
      if (!r.isReversed) {
        const amt = parseFloat(r.amount);
        totalVolume += amt;
        validCount++;
        const mode = r.paymentMethod;
        if (mode === "CASH") cashVolume += amt;
        else digitalVolume += amt;
      }
    }

    return {
      totalVolume,
      cashVolume,
      digitalVolume,
      validCount,
      totalCount: filteredReceipts.length,
    };
  }, [filteredReceipts]);

  function openPrintModal(r: HistoryReceiptItem) {
    const timeStr = new Date(r.createdAt).toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
    });
    const principalRepaid = r.allocations?.principalAmount
      ? parseFloat(r.allocations.principalAmount).toFixed(2)
      : parseFloat(r.amount).toFixed(2);
    const interestRepaid = r.allocations?.interestAmount
      ? parseFloat(r.allocations.interestAmount).toFixed(2)
      : "0.00";
    const mode = r.paymentMethod === "BANK_TRANSFER" ? "NETBANKING" : r.paymentMethod;

    setActiveReceipt({
      receiptNo: r.receiptNumber,
      dateTime: `${r.businessDate} ${timeStr}`,
      orgName: orgInfo.name,
      branchName: orgInfo.branchName,
      gstin: orgInfo.gstin,
      helpline: orgInfo.helpline,
      memberName: r.customer.fullName,
      memberId: r.customer.customerCode,
      loanNo: r.loanAccount.loanAccountNumber,
      loanId: r.loanAccount.id.slice(0, 8).toUpperCase(),
      paymentMode: mode,
      amountReceived: parseFloat(r.amount).toFixed(2),
      principalRepaid,
      interestRepaid,
    });
  }

  async function handleReverseReceipt() {
    if (!reversingReceipt) return;

    if (!reversalReason.trim() || reversalReason.trim().length < 5) {
      setErrorMessage("Please enter a valid reason for reversal (minimum 5 characters).");
      return;
    }

    setIsSubmittingReversal(true);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      const res = await fetch(`/api/collections/receipts/${reversingReceipt.id}/reverse`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reversalReason,
          businessDate: todayStr,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || "Failed to reverse collection receipt");
      }

      setSuccessMessage(
        `Receipt ${reversingReceipt.receiptNumber} successfully reversed with balanced correction journal entry.`
      );
      setReversingReceipt(null);
      setReversalReason("");
      router.refresh();
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : "Error reversing receipt");
    } finally {
      setIsSubmittingReversal(false);
    }
  }

  function handleExportCsv() {
    window.location.href = `/api/collections/reports/export?startDate=2000-01-01&endDate=2099-12-31&type=PAID`;
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Banner */}
      <div className="bg-slate-900 text-white rounded-xl p-6 shadow-sm flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-blue-900/60 text-[11px] font-semibold tracking-wider uppercase mb-2 text-blue-200">
            <History className="h-3 w-3" />
            Audit Trail & Transaction Ledger
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Collection History</h1>
          <p className="text-xs text-slate-300 mt-1 max-w-2xl">
            Complete transaction register of all issued collection receipts, thermal print vouchers, and reversal history.
          </p>
        </div>

        <Button
          onClick={handleExportCsv}
          className="bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-md shrink-0"
        >
          <Download className="h-4 w-4" />
          <span>Export History (CSV)</span>
        </Button>
      </div>

      {/* Notifications */}
      {successMessage && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-3 rounded-lg text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
            <span>{successMessage}</span>
          </div>
          <button onClick={() => setSuccessMessage("")} className="text-emerald-500 hover:text-emerald-700 font-bold">×</button>
        </div>
      )}

      {errorMessage && (
        <div className="bg-rose-50 border border-rose-200 text-rose-800 px-4 py-3 rounded-lg text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0" />
            <span>{errorMessage}</span>
          </div>
          <button onClick={() => setErrorMessage("")} className="text-rose-500 hover:text-rose-700 font-bold">×</button>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-4 bg-white border border-slate-200 shadow-sm">
          <span className="text-xs font-semibold uppercase text-slate-500">Total Receipts</span>
          <div className="mt-1 text-xl font-bold text-slate-900">{summary.totalCount} Receipts</div>
          <div className="text-[11px] text-slate-500 mt-0.5">{summary.validCount} Active Valid</div>
        </Card>

        <Card className="p-4 bg-white border border-slate-200 shadow-sm">
          <span className="text-xs font-semibold uppercase text-slate-500">Collected Volume</span>
          <div className="mt-1 text-xl font-bold text-emerald-700">
            ₹{summary.totalVolume.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
          </div>
          <div className="text-[11px] text-emerald-600 mt-0.5">Cumulative Recorded</div>
        </Card>

        <Card className="p-4 bg-white border border-slate-200 shadow-sm">
          <span className="text-xs font-semibold uppercase text-slate-500">Cash Collections</span>
          <div className="mt-1 text-xl font-bold text-slate-800">
            ₹{summary.cashVolume.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">Physical Counter / Field</div>
        </Card>

        <Card className="p-4 bg-white border border-slate-200 shadow-sm">
          <span className="text-xs font-semibold uppercase text-slate-500">Digital / UPI</span>
          <div className="mt-1 text-xl font-bold text-indigo-700">
            ₹{summary.digitalVolume.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
          </div>
          <div className="text-[11px] text-indigo-600 mt-0.5">Electronic Bank Inflow</div>
        </Card>
      </div>

      {/* Toolbar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3 flex-1">
          {/* Search */}
          <div className="relative min-w-[260px] flex-1">
            <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search receipt #, member name, code, loan #, UTR..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full text-xs pl-8 pr-3 py-1.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* Mode */}
          <select
            value={paymentModeFilter}
            onChange={(e) => setPaymentModeFilter(e.target.value)}
            className="text-xs px-3 py-1.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
          >
            <option value="ALL">All Payment Modes</option>
            <option value="CASH">Cash</option>
            <option value="UPI">UPI</option>
            <option value="NETBANKING">Netbanking</option>
          </select>

          {/* Status */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="text-xs px-3 py-1.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
          >
            <option value="ALL">All Statuses</option>
            <option value="VALID">Valid Only</option>
            <option value="REVERSED">Reversed Only</option>
          </select>

          {/* Date */}
          <select
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="text-xs px-3 py-1.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
          >
            <option value="ALL">All Dates</option>
            <option value="TODAY">Today</option>
            <option value="7_DAYS">Past 7 Days</option>
            <option value="30_DAYS">Past 30 Days</option>
          </select>
        </div>
      </div>

      {/* History Table */}
      <Card className="bg-white border border-slate-200 shadow-sm overflow-hidden">
        <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200 flex items-center justify-between text-xs text-slate-600">
          <span className="font-semibold flex items-center gap-1.5">
            <History className="h-4 w-4 text-blue-600" />
            Collection Receipts History ({filteredReceipts.length} records)
          </span>
          <span className="text-[11px] text-slate-500">
            Total Displayed: ₹
            {filteredReceipts
              .reduce((sum, r) => sum + (r.isReversed ? 0 : parseFloat(r.amount)), 0)
              .toLocaleString("en-IN", { minimumFractionDigits: 2 })}
          </span>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Receipt No</TableHead>
              <TableHead>Date & Time</TableHead>
              <TableHead>Borrower & Code</TableHead>
              <TableHead>Center / Group</TableHead>
              <TableHead>Loan Account</TableHead>
              <TableHead>Amount (₹)</TableHead>
              <TableHead>Mode</TableHead>
              <TableHead>Reference / UTR</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredReceipts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="p-0">
                  <TableEmptyState message="No collection receipts found matching your search and filter criteria." />
                </TableCell>
              </TableRow>
            ) : (
              filteredReceipts.map((r) => {
                const mode = r.paymentMethod === "BANK_TRANSFER" ? "NETBANKING" : r.paymentMethod;

                return (
                  <TableRow
                    key={r.id}
                    className={r.isReversed ? "bg-rose-50/40 opacity-75" : undefined}
                  >
                    <TableCell className="font-mono text-xs font-bold text-slate-900">
                      {r.receiptNumber}
                    </TableCell>
                    <TableCell>
                      <div className="text-xs font-medium text-slate-800">{r.businessDate}</div>
                      <div className="text-[10px] text-slate-400">
                        {new Date(r.createdAt).toLocaleTimeString("en-IN", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="font-semibold text-slate-900 text-xs">{r.customer.fullName}</div>
                      <div className="text-[11px] text-slate-500 font-mono">
                        {r.customer.customerCode} • {r.customer.phone}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-slate-700">
                      {r.customer.groupName}
                    </TableCell>
                    <TableCell>
                      <div className="font-mono text-xs font-bold text-slate-900">
                        {r.loanAccount.loanAccountNumber}
                      </div>
                      <div className="text-[10px] text-slate-400">{r.loanAccount.schemeName}</div>
                    </TableCell>
                    <TableCell className="text-xs font-bold text-emerald-700">
                      ₹{parseFloat(r.amount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                        {mode}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs text-slate-500 font-mono">
                      {r.reference || "—"}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={r.isReversed ? "danger" : "success"}
                        className="text-[10px]"
                      >
                        {r.isReversed ? "REVERSED" : "VALID"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => openPrintModal(r)}
                          className="text-[11px] h-7 px-2"
                          title="Print Receipt Slip"
                        >
                          <Printer className="h-3 w-3 mr-1" />
                          Slip
                        </Button>

                        {!r.isReversed && (
                          <Button
                            size="sm"
                            variant="danger"
                            onClick={() => {
                              setReversingReceipt(r);
                              setReversalReason("");
                            }}
                            className="text-[11px] h-7 px-2"
                            title="Reverse Receipt"
                          >
                            <RotateCcw className="h-3 w-3 mr-1" />
                            Reverse
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Reversal Confirmation Modal */}
      {reversingReceipt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <div className="flex items-center gap-2">
                <RotateCcw className="h-5 w-5 text-rose-600" />
                <h3 className="font-bold text-slate-900">Reverse Collection Receipt</h3>
              </div>
              <button onClick={() => setReversingReceipt(null)} className="text-slate-400">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-900 space-y-1">
              <div>
                Receipt: <strong>{reversingReceipt.receiptNumber}</strong> (₹
                {parseFloat(reversingReceipt.amount).toLocaleString("en-IN", {
                  minimumFractionDigits: 2,
                })}
                )
              </div>
              <div>
                Borrower: <strong>{reversingReceipt.customer.fullName}</strong> (
                {reversingReceipt.customer.customerCode})
              </div>
              <div className="text-[11px] text-rose-700 mt-1">
                Reversing this receipt will reinstate the loan balance and post an atomic GL reversal voucher.
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Reversal Reason (Mandatory) *
              </label>
              <textarea
                rows={2}
                required
                placeholder="State reason for payment reversal (e.g., Wrong amount entered, customer check dishonored)..."
                value={reversalReason}
                onChange={(e) => setReversalReason(e.target.value)}
                className="w-full text-xs border border-slate-300 rounded-lg p-2.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setReversingReceipt(null)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="danger"
                size="sm"
                disabled={isSubmittingReversal}
                onClick={handleReverseReceipt}
              >
                {isSubmittingReversal ? "Reversing..." : "Confirm Reversal"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Printable Receipt Modal */}
      <PrintableReceiptModal
        receipt={activeReceipt}
        onClose={() => setActiveReceipt(null)}
      />
    </div>
  );
}
