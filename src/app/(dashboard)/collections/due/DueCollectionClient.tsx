"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Clock,
  Search,
  CheckCircle2,
  AlertTriangle,
  Receipt,
  User,
  CreditCard,
  Building,
  Phone,
  Calendar,
  Check,
  CheckSquare,
  Square,
  AlertCircle,
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

interface CashAccountItem {
  id: string;
  code: string;
  name: string;
  accountType: string;
}

interface GroupItem {
  id: string;
  name: string;
  code: string;
}

export interface DueLoanItem {
  id: string;
  loanAccountNumber: string;
  principalOutstanding: string;
  customer: {
    id: string;
    customerCode: string;
    fullName: string;
    guardianName: string | null;
    phone: string;
    groupId: string | null;
    groupName: string;
  };
  scheme: {
    id: string;
    name: string;
    code: string;
  };
  installment: {
    id: string;
    installmentNumber: number;
    dueDate: string;
    principalDue: string;
    interestDue: string;
    totalDue: string;
    remainingDue: string;
    status: string;
    daysPastDue: number;
  };
}

interface OrgInfo {
  name: string;
  branchName: string;
  gstin: string;
  helpline: string;
}

interface DueCollectionClientProps {
  currentUserId: string;
  loans: DueLoanItem[];
  cashAccounts: CashAccountItem[];
  groups: GroupItem[];
  orgInfo: OrgInfo;
}

export function DueCollectionClient({
  loans: initialLoans,
  cashAccounts,
  groups,
  orgInfo,
}: DueCollectionClientProps) {
  const router = useRouter();
  const todayStr = new Date().toISOString().slice(0, 10);

  const [agingFilter, setAgingFilter] = useState<"ALL" | "TODAY" | "1_30" | "31_60" | "61_PLUS">("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedGroupId, setSelectedGroupId] = useState("ALL");
  const [defaultCashAccountId, setDefaultCashAccountId] = useState(
    cashAccounts[0]?.id || ""
  );

  // Row amounts and modes
  const [rowAmounts, setRowAmounts] = useState<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    for (const l of initialLoans) {
      map[l.id] = l.installment.remainingDue;
    }
    return map;
  });

  const [rowModes, setRowModes] = useState<Record<string, "CASH" | "UPI" | "NETBANKING">>(() => {
    const map: Record<string, "CASH" | "UPI" | "NETBANKING"> = {};
    for (const l of initialLoans) {
      map[l.id] = "CASH";
    }
    return map;
  });

  // Checkbox selections for bulk collection
  const [selectedLoanIds, setSelectedLoanIds] = useState<Set<string>>(new Set());

  // Tracking collected loans
  const [collectedMap, setCollectedMap] = useState<Record<string, { amount: string; receiptNo: string }>>({});
  const [activeReceipt, setActiveReceipt] = useState<PrintableReceiptData | null>(null);
  const [submittingLoanId, setSubmittingLoanId] = useState<string | null>(null);
  const [isBulkCollecting, setIsBulkCollecting] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{ current: number; total: number } | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  // Filtering loans
  const filteredLoans = initialLoans.filter((l) => {
    // Aging filter
    const dpd = l.installment.daysPastDue;
    let matchesAging = true;
    if (agingFilter === "TODAY") {
      matchesAging = dpd === 0 || l.installment.dueDate === todayStr;
    } else if (agingFilter === "1_30") {
      matchesAging = dpd >= 1 && dpd <= 30;
    } else if (agingFilter === "31_60") {
      matchesAging = dpd >= 31 && dpd <= 60;
    } else if (agingFilter === "61_PLUS") {
      matchesAging = dpd > 60;
    }

    const matchesGroup = selectedGroupId === "ALL" || l.customer.groupId === selectedGroupId;
    const term = searchQuery.toLowerCase().trim();
    const matchesSearch =
      !term ||
      l.customer.fullName.toLowerCase().includes(term) ||
      l.customer.customerCode.toLowerCase().includes(term) ||
      l.customer.phone.toLowerCase().includes(term) ||
      l.loanAccountNumber.toLowerCase().includes(term);

    return matchesAging && matchesGroup && matchesSearch;
  });

  // Toggle selection
  function toggleSelectLoan(id: string) {
    const next = new Set(selectedLoanIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedLoanIds(next);
  }

  function toggleSelectAll() {
    if (selectedLoanIds.size === filteredLoans.length) {
      setSelectedLoanIds(new Set());
    } else {
      setSelectedLoanIds(new Set(filteredLoans.map((l) => l.id)));
    }
  }

  async function handleCollectSingle(loan: DueLoanItem) {
    const amountStr = rowAmounts[loan.id] || loan.installment.remainingDue;
    const amountNum = parseFloat(amountStr);

    if (isNaN(amountNum) || amountNum <= 0) {
      setErrorMessage(`Please enter a valid collection amount for ${loan.customer.fullName}`);
      return;
    }

    if (!defaultCashAccountId) {
      setErrorMessage("Please select a receiving cash account.");
      return;
    }

    setSubmittingLoanId(loan.id);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      const mode = rowModes[loan.id] || "CASH";
      const receiptNo = `REC-DUE-${Date.now().toString().slice(-6)}`;

      const res = await fetch("/api/collections/receipts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          loanAccountId: loan.id,
          cashAccountId: defaultCashAccountId,
          receiptNumber: receiptNo,
          businessDate: todayStr,
          amount: amountNum.toFixed(4),
          paymentMethod: mode === "NETBANKING" ? "BANK_TRANSFER" : mode,
          reference: `DUE_COLLECTION_${todayStr}`,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || "Failed to record due collection");
      }

      setCollectedMap((prev) => ({
        ...prev,
        [loan.id]: { amount: amountNum.toFixed(2), receiptNo },
      }));

      // Deselect if in selection
      setSelectedLoanIds((prev) => {
        const next = new Set(prev);
        next.delete(loan.id);
        return next;
      });

      const now = new Date();
      const timeStr = now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
      const alloc = data.result?.allocations?.[0];
      const principalRepaid = alloc?.principalAmount
        ? parseFloat(alloc.principalAmount).toFixed(2)
        : amountNum.toFixed(2);
      const interestRepaid = alloc?.interestAmount
        ? parseFloat(alloc.interestAmount).toFixed(2)
        : "0.00";

      setActiveReceipt({
        receiptNo,
        dateTime: `${todayStr} ${timeStr}`,
        orgName: orgInfo.name,
        branchName: orgInfo.branchName,
        gstin: orgInfo.gstin,
        helpline: orgInfo.helpline,
        memberName: loan.customer.fullName,
        memberId: loan.customer.customerCode,
        loanNo: loan.loanAccountNumber,
        loanId: loan.id.slice(0, 8).toUpperCase(),
        paymentMode: mode,
        amountReceived: amountNum.toFixed(2),
        principalRepaid,
        interestRepaid,
      });

      setSuccessMessage(`Due collection of ₹${amountNum.toLocaleString("en-IN")} recorded for ${loan.customer.fullName}`);
      router.refresh();
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : "Error collecting due");
    } finally {
      setSubmittingLoanId(null);
    }
  }

  async function handleBulkCollect() {
    if (selectedLoanIds.size === 0) return;
    if (!defaultCashAccountId) {
      setErrorMessage("Please select a receiving cash account.");
      return;
    }

    const loansToCollect = initialLoans.filter((l) => selectedLoanIds.has(l.id));
    setIsBulkCollecting(true);
    setBulkProgress({ current: 0, total: loansToCollect.length });
    setErrorMessage("");
    setSuccessMessage("");

    let successCount = 0;
    let totalCollectedNum = 0;

    for (let i = 0; i < loansToCollect.length; i++) {
      const loan = loansToCollect[i];
      const amountNum = parseFloat(rowAmounts[loan.id] || loan.installment.remainingDue);
      const mode = rowModes[loan.id] || "CASH";
      const receiptNo = `REC-BULK-${Date.now().toString().slice(-6)}-${i + 1}`;

      setBulkProgress({ current: i + 1, total: loansToCollect.length });

      try {
        const res = await fetch("/api/collections/receipts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            loanAccountId: loan.id,
            cashAccountId: defaultCashAccountId,
            receiptNumber: receiptNo,
            businessDate: todayStr,
            amount: amountNum.toFixed(4),
            paymentMethod: mode === "NETBANKING" ? "BANK_TRANSFER" : mode,
            reference: `BULK_DUE_COLLECTION_${todayStr}`,
          }),
        });

        if (res.ok) {
          successCount++;
          totalCollectedNum += amountNum;
          setCollectedMap((prev) => ({
            ...prev,
            [loan.id]: { amount: amountNum.toFixed(2), receiptNo },
          }));
        }
      } catch (err) {
        console.error("Bulk collect error on loan", loan.id, err);
      }
    }

    setIsBulkCollecting(false);
    setBulkProgress(null);
    setSelectedLoanIds(new Set());
    setSuccessMessage(
      `Successfully processed ${successCount} of ${loansToCollect.length} collections (Total: ₹${totalCollectedNum.toLocaleString("en-IN", { minimumFractionDigits: 2 })})`
    );
    router.refresh();
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Top Banner */}
      <div className="bg-slate-900 text-white rounded-xl p-6 shadow-sm flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-900/60 text-[11px] font-semibold tracking-wider uppercase mb-2 text-amber-200">
            <Clock className="h-3 w-3" />
            Arrears & Installment Recovery
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Due Collection</h1>
          <p className="text-xs text-slate-300 mt-1 max-w-2xl">
            Collect scheduled installments and overdue arrears directly. Support for bulk selection and instantaneous receipt generation.
          </p>
        </div>

        {selectedLoanIds.size > 0 && (
          <Button
            size="sm"
            disabled={isBulkCollecting}
            onClick={handleBulkCollect}
            className="bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs shadow-md"
          >
            {isBulkCollecting
              ? `Processing (${bulkProgress?.current}/${bulkProgress?.total})...`
              : `Collect Selected (${selectedLoanIds.size})`}
          </Button>
        )}
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

      {/* Aging Category Tabs */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => setAgingFilter("ALL")}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
            agingFilter === "ALL" ? "bg-slate-900 text-white shadow-xs" : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
          }`}
        >
          All Dues ({initialLoans.length})
        </button>
        <button
          onClick={() => setAgingFilter("TODAY")}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
            agingFilter === "TODAY" ? "bg-amber-600 text-white shadow-xs" : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
          }`}
        >
          Due Today ({initialLoans.filter((l) => l.installment.daysPastDue === 0 || l.installment.dueDate === todayStr).length})
        </button>
        <button
          onClick={() => setAgingFilter("1_30")}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
            agingFilter === "1_30" ? "bg-rose-600 text-white shadow-xs" : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
          }`}
        >
          Overdue 1-30 Days ({initialLoans.filter((l) => l.installment.daysPastDue >= 1 && l.installment.daysPastDue <= 30).length})
        </button>
        <button
          onClick={() => setAgingFilter("31_60")}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
            agingFilter === "31_60" ? "bg-rose-700 text-white shadow-xs" : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
          }`}
        >
          Overdue 31-60 Days ({initialLoans.filter((l) => l.installment.daysPastDue >= 31 && l.installment.daysPastDue <= 60).length})
        </button>
        <button
          onClick={() => setAgingFilter("61_PLUS")}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
            agingFilter === "61_PLUS" ? "bg-red-800 text-white shadow-xs" : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
          }`}
        >
          Overdue 61+ Days ({initialLoans.filter((l) => l.installment.daysPastDue > 60).length})
        </button>
      </div>

      {/* Toolbar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3 flex-1">
          <div className="relative min-w-[260px] flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search borrower name, customer code, phone, or loan #..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full text-xs pl-9 pr-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div className="w-48">
            <select
              value={selectedGroupId}
              onChange={(e) => setSelectedGroupId(e.target.value)}
              className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
            >
              <option value="ALL">All Centers & Groups</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500 font-semibold shrink-0">Deposit To:</span>
          <select
            value={defaultCashAccountId}
            onChange={(e) => setDefaultCashAccountId(e.target.value)}
            className="text-xs px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
          >
            {cashAccounts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.accountType})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Due Collection Table */}
      <Card className="bg-white border border-slate-200 shadow-sm overflow-hidden">
        <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200 flex items-center justify-between text-xs text-slate-600">
          <div className="flex items-center gap-3">
            <button
              onClick={toggleSelectAll}
              className="flex items-center gap-1.5 text-slate-700 hover:text-slate-900 font-semibold"
            >
              {selectedLoanIds.size === filteredLoans.length && filteredLoans.length > 0 ? (
                <CheckSquare className="h-4 w-4 text-blue-600" />
              ) : (
                <Square className="h-4 w-4 text-slate-400" />
              )}
              <span>Select All ({filteredLoans.length})</span>
            </button>
            <span className="text-slate-300">|</span>
            <span>{selectedLoanIds.size} Selected</span>
          </div>

          <span className="text-[11px] text-slate-500">
            Total Dues: ₹
            {filteredLoans
              .reduce((sum, l) => sum + parseFloat(l.installment.remainingDue), 0)
              .toLocaleString("en-IN", { minimumFractionDigits: 2 })}
          </span>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">Select</TableHead>
              <TableHead>Borrower & Code</TableHead>
              <TableHead>Center / Group</TableHead>
              <TableHead>Loan Account</TableHead>
              <TableHead>Due Date</TableHead>
              <TableHead>Arrears Status</TableHead>
              <TableHead>Total Due (₹)</TableHead>
              <TableHead className="w-32">Collect (₹)</TableHead>
              <TableHead className="w-28">Mode</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredLoans.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="p-0">
                  <TableEmptyState message="No pending dues or overdue installments found matching the selected filters." />
                </TableCell>
              </TableRow>
            ) : (
              filteredLoans.map((loan) => {
                const isSelected = selectedLoanIds.has(loan.id);
                const collected = collectedMap[loan.id];
                const dpd = loan.installment.daysPastDue;

                return (
                  <TableRow
                    key={loan.id}
                    className={
                      collected
                        ? "bg-emerald-50/50"
                        : isSelected
                        ? "bg-blue-50/40"
                        : undefined
                    }
                  >
                    <TableCell>
                      {collected ? (
                        <Check className="h-4 w-4 text-emerald-600" />
                      ) : (
                        <button
                          type="button"
                          onClick={() => toggleSelectLoan(loan.id)}
                          className="text-slate-400 hover:text-slate-700"
                        >
                          {isSelected ? (
                            <CheckSquare className="h-4 w-4 text-blue-600" />
                          ) : (
                            <Square className="h-4 w-4" />
                          )}
                        </button>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="font-semibold text-slate-900">{loan.customer.fullName}</div>
                      <div className="text-[11px] text-slate-500 font-mono">
                        {loan.customer.customerCode} • {loan.customer.phone}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs text-slate-700 font-medium">
                        {loan.customer.groupName || "Independent"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="font-mono text-xs font-bold text-slate-900">
                        {loan.loanAccountNumber}
                      </div>
                      <div className="text-[10px] text-slate-400">{loan.scheme.name}</div>
                    </TableCell>
                    <TableCell>
                      <div className="text-xs font-medium text-slate-800">
                        {new Date(loan.installment.dueDate).toLocaleDateString("en-IN")}
                      </div>
                      <div className="text-[10px] text-slate-400">
                        Installment #{loan.installment.installmentNumber}
                      </div>
                    </TableCell>
                    <TableCell>
                      {dpd === 0 || loan.installment.dueDate === todayStr ? (
                        <Badge variant="warning" className="text-[10px]">
                          Due Today
                        </Badge>
                      ) : (
                        <Badge variant="danger" className="text-[10px]">
                          {dpd} Days Overdue
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-xs font-bold text-slate-900">
                      ₹{parseFloat(loan.installment.remainingDue).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell>
                      {collected ? (
                        <span className="font-bold text-emerald-700 text-xs">
                          ₹{parseFloat(collected.amount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                        </span>
                      ) : (
                        <input
                          type="number"
                          step="0.01"
                          min="1"
                          value={rowAmounts[loan.id] || ""}
                          onChange={(e) =>
                            setRowAmounts({ ...rowAmounts, [loan.id]: e.target.value })
                          }
                          className="w-full text-xs font-semibold px-2 py-1.5 border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                      )}
                    </TableCell>
                    <TableCell>
                      {collected ? (
                        <span className="text-xs text-slate-600 font-semibold">
                          {rowModes[loan.id] || "CASH"}
                        </span>
                      ) : (
                        <select
                          value={rowModes[loan.id] || "CASH"}
                          onChange={(e) =>
                            setRowModes({
                              ...rowModes,
                              [loan.id]: e.target.value as "CASH" | "UPI" | "NETBANKING",
                            })
                          }
                          className="w-full text-xs px-2 py-1.5 border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
                        >
                          <option value="CASH">Cash</option>
                          <option value="UPI">UPI</option>
                          <option value="NETBANKING">Netbanking</option>
                        </select>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {collected ? (
                        <div className="inline-flex items-center gap-1.5 text-xs text-emerald-700 font-bold bg-emerald-100/60 px-2.5 py-1 rounded-lg">
                          <Check className="h-3.5 w-3.5" />
                          <span>Collected</span>
                        </div>
                      ) : (
                        <Button
                          size="sm"
                          disabled={submittingLoanId === loan.id || isBulkCollecting}
                          onClick={() => handleCollectSingle(loan)}
                          className="bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs shadow-xs"
                        >
                          {submittingLoanId === loan.id ? "Posting..." : "Collect"}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Printable Receipt Modal */}
      <PrintableReceiptModal
        receipt={activeReceipt}
        onClose={() => setActiveReceipt(null)}
      />
    </div>
  );
}
