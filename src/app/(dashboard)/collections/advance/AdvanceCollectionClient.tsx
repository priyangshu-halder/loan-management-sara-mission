"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import {
  FastForward,
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

export interface AdvanceLoanItem {
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
  nextInstallment: {
    id: string;
    installmentNumber: number;
    dueDate: string;
    principalDue: string;
    interestDue: string;
    totalDue: string;
    remainingDue: string;
    status: string;
  } | null;
}

interface OrgInfo {
  name: string;
  branchName: string;
  gstin: string;
  helpline: string;
}

interface AdvanceCollectionClientProps {
  currentUserId: string;
  loans: AdvanceLoanItem[];
  cashAccounts: CashAccountItem[];
  groups: GroupItem[];
  orgInfo: OrgInfo;
}

export function AdvanceCollectionClient({
  loans: initialLoans,
  cashAccounts,
  groups,
  orgInfo,
}: AdvanceCollectionClientProps) {
  const router = useRouter();
  const todayStr = new Date().toISOString().slice(0, 10);

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedGroupId, setSelectedGroupId] = useState("ALL");
  const [defaultCashAccountId, setDefaultCashAccountId] = useState(
    cashAccounts[0]?.id || ""
  );

  // Row-level advance amount to collect (keyed by loan.id)
  const [rowAmounts, setRowAmounts] = useState<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    for (const l of initialLoans) {
      if (l.nextInstallment) {
        map[l.id] = l.nextInstallment.remainingDue;
      } else {
        map[l.id] = "1000";
      }
    }
    return map;
  });

  // Row-level payment mode (CASH, UPI, NETBANKING)
  const [rowModes, setRowModes] = useState<Record<string, "CASH" | "UPI" | "NETBANKING">>(() => {
    const map: Record<string, "CASH" | "UPI" | "NETBANKING"> = {};
    for (const l of initialLoans) {
      map[l.id] = "CASH";
    }
    return map;
  });

  // Tracking collected loans and receipts
  const [collectedMap, setCollectedMap] = useState<Record<string, { amount: string; receiptNo: string }>>({});
  const [activeReceipt, setActiveReceipt] = useState<PrintableReceiptData | null>(null);
  const [submittingLoanId, setSubmittingLoanId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  // Filter loans
  const filteredLoans = initialLoans.filter((l) => {
    const matchesGroup = selectedGroupId === "ALL" || l.customer.groupId === selectedGroupId;
    const term = searchQuery.toLowerCase().trim();
    const matchesSearch =
      !term ||
      l.customer.fullName.toLowerCase().includes(term) ||
      l.customer.customerCode.toLowerCase().includes(term) ||
      l.customer.phone.toLowerCase().includes(term) ||
      l.loanAccountNumber.toLowerCase().includes(term);
    return matchesGroup && matchesSearch;
  });

  async function handleCollectAdvance(loan: AdvanceLoanItem) {
    const amountStr = rowAmounts[loan.id] || "0";
    const amountNum = parseFloat(amountStr);

    if (isNaN(amountNum) || amountNum <= 0) {
      setErrorMessage(`Please enter a valid advance collection amount for ${loan.customer.fullName}`);
      return;
    }

    if (!defaultCashAccountId) {
      setErrorMessage("Please select a valid cash/bank receiving account.");
      return;
    }

    setSubmittingLoanId(loan.id);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      const mode = rowModes[loan.id] || "CASH";
      const receiptNo = `REC-ADV-${Date.now().toString().slice(-6)}`;

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
          reference: `ADVANCE_PAYMENT_${todayStr}`,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || "Failed to record advance collection");
      }

      // Mark as collected in local state
      setCollectedMap((prev) => ({
        ...prev,
        [loan.id]: { amount: amountNum.toFixed(2), receiptNo },
      }));

      // Generate receipt slip data
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

      setSuccessMessage(`Advance payment of ₹${amountNum.toLocaleString("en-IN")} recorded for ${loan.customer.fullName} (${receiptNo})`);
      router.refresh();
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : "Error posting advance collection");
    } finally {
      setSubmittingLoanId(null);
    }
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header Banner */}
      <div className="bg-slate-900 text-white rounded-xl p-6 shadow-sm flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-900/60 text-[11px] font-semibold tracking-wider uppercase mb-2 text-emerald-200">
            <FastForward className="h-3 w-3" />
            Field Pre-Payment Operations
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Advance Collection</h1>
          <p className="text-xs text-slate-300 mt-1 max-w-2xl">
            Accept and record advance payments before scheduled installment due dates with atomic GL posting and instant receipt slip generation.
          </p>
        </div>
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

      {/* Filters Toolbar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3 flex-1">
          {/* Search */}
          <div className="relative min-w-[260px] flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search borrower name, code, phone, or loan #..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full text-xs pl-9 pr-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* Group Filter */}
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

        {/* Receiving Cash Account */}
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

      {/* Advance Loans Table */}
      <Card className="bg-white border border-slate-200 shadow-sm overflow-hidden">
        <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200 flex items-center justify-between text-xs text-slate-600">
          <span className="font-semibold flex items-center gap-1.5">
            <FastForward className="h-4 w-4 text-emerald-600" />
            Active Loans Eligible for Advance Collection ({filteredLoans.length})
          </span>
          <span className="text-[11px] text-slate-500">
            Total Advance Collected This Session: ₹
            {Object.values(collectedMap)
              .reduce((sum, item) => sum + parseFloat(item.amount), 0)
              .toLocaleString("en-IN", { minimumFractionDigits: 2 })}
          </span>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Borrower & Contact</TableHead>
              <TableHead>Center / Group</TableHead>
              <TableHead>Loan Account</TableHead>
              <TableHead>Next Scheduled Due</TableHead>
              <TableHead>Regular Installment</TableHead>
              <TableHead>Outstanding Balance</TableHead>
              <TableHead className="w-36">Advance Amount (₹)</TableHead>
              <TableHead className="w-28">Mode</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredLoans.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="p-0">
                  <TableEmptyState message="No active loans found matching your search and filter criteria." />
                </TableCell>
              </TableRow>
            ) : (
              filteredLoans.map((loan) => {
                const collected = collectedMap[loan.id];
                const inst = loan.nextInstallment;
                const dueDate = inst?.dueDate ? new Date(inst.dueDate) : null;
                const today = new Date(todayStr);
                const diffDays = dueDate
                  ? Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
                  : null;

                return (
                  <TableRow key={loan.id} className={collected ? "bg-emerald-50/50" : undefined}>
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
                      {dueDate ? (
                        <div>
                          <div className="text-xs font-medium text-slate-800">
                            {dueDate.toLocaleDateString("en-IN")}
                          </div>
                          {diffDays !== null && diffDays > 0 ? (
                            <span className="inline-flex items-center text-[10px] font-semibold text-emerald-700 bg-emerald-100/70 px-1.5 py-0.2 rounded">
                              Due in {diffDays} days
                            </span>
                          ) : (
                            <span className="text-[10px] text-slate-400">Regular Cycle</span>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400">No Pending Installment</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs font-semibold text-slate-800">
                      ₹{parseFloat(inst?.totalDue || "0").toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell className="text-xs font-bold text-indigo-700">
                      ₹{parseFloat(loan.principalOutstanding).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
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
                          <span>Advance Recorded</span>
                        </div>
                      ) : (
                        <Button
                          size="sm"
                          disabled={submittingLoanId === loan.id}
                          onClick={() => handleCollectAdvance(loan)}
                          className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs shadow-xs"
                        >
                          {submittingLoanId === loan.id ? "Posting..." : "Collect Advance"}
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
