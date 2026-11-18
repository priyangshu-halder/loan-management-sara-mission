"use client";

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Calendar,
  CheckCircle2,
  AlertTriangle,
  Lock,
  RefreshCw,
  Wallet,
  Landmark,
  ArrowRight,
  Coins,
  ChevronLeft,
  ChevronRight,
  Info,
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

interface CashAccountOption {
  id: string;
  code: string;
  name: string;
  accountType: string;
  glCode: string;
}

interface CategoryItem {
  key: string;
  label: string;
  amount: string;
  count?: number;
}

interface TransactionItem {
  journalEntryId: string;
  entryNumber: string;
  businessDate: string;
  sourceModule: string;
  sourceType: string;
  category: string;
  type: "RECEIVED" | "PAYMENT";
  amount: string;
  description: string;
  postedBy: string;
}

interface DailySheetData {
  businessDate: string;
  selectedCashAccount: CashAccountOption | null;
  cashAccounts: CashAccountOption[];
  received: {
    opening: string;
    advance: string;
    repayment: string;
    rd: string;
    fd: string;
    bankTransfer: string;
    loan: string;
    miscellaneous: string;
    totalReceived: string;
    categories: CategoryItem[];
  };
  payment: {
    savingsWithdrawal: string;
    bankTransfer: string;
    loanPayment: string;
    expenses: string;
    miscellaneous: string;
    totalPayment: string;
    categories: CategoryItem[];
  };
  summary: {
    openingCash: string;
    totalReceived: string;
    totalPayment: string;
    closingCash: string;
    formulaText: string;
    isNegative: boolean;
    discrepancyMessage?: string | null;
  };
  status: {
    isFinalized: boolean;
    isInitial: boolean;
    finalizedAt?: string | null;
    finalizedBy?: string | null;
    previousDayStatus: "FINALIZED" | "UNFINALIZED" | "INITIAL_DAY" | "NO_PREVIOUS_RECORD";
    previousDayDate?: string | null;
    hasBackdatedDiscrepancy: boolean;
    discrepancyVariance?: string | null;
  };
  transactions: TransactionItem[];
}

export function DailySheetClient({
  data,
  currentUserId,
  currentUserName,
}: {
  data: DailySheetData;
  currentUserId?: string;
  currentUserName?: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [selectedDate, setSelectedDate] = useState(data.businessDate);
  const [selectedAccountId, setSelectedAccountId] = useState(
    data.selectedCashAccount?.id || data.cashAccounts[0]?.id || ""
  );

  // Initial opening modal state
  const [showInitialModal, setShowInitialModal] = useState(false);
  const [initialOpeningInput, setInitialOpeningInput] = useState("");
  const [initialNotesInput, setInitialNotesInput] = useState("");
  const [isSubmittingInitial, setIsSubmittingInitial] = useState(false);
  const [initialError, setInitialError] = useState<string | null>(null);

  // Finalize confirmation state
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [finalizeError, setFinalizeError] = useState<string | null>(null);

  // Navigate to date
  const handleDateChange = (newDate: string) => {
    setSelectedDate(newDate);
    startTransition(() => {
      router.push(`/accounting?tab=daily-sheet&date=${newDate}&cashAccountId=${selectedAccountId}`);
    });
  };

  // Navigate to previous day
  const handlePrevDay = () => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() - 1);
    const newDate = d.toISOString().split("T")[0];
    handleDateChange(newDate);
  };

  // Navigate to next day
  const handleNextDay = () => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + 1);
    const newDate = d.toISOString().split("T")[0];
    handleDateChange(newDate);
  };

  // Account change
  const handleAccountChange = (accId: string) => {
    setSelectedAccountId(accId);
    startTransition(() => {
      router.push(`/accounting?tab=daily-sheet&date=${selectedDate}&cashAccountId=${accId}`);
    });
  };

  // Finalize Daily Sheet
  const handleFinalize = async () => {
    if (!confirm(`Are you sure you want to finalize and lock the Daily Cash Sheet for ${selectedDate}?`)) {
      return;
    }
    setIsFinalizing(true);
    setFinalizeError(null);
    try {
      const res = await fetch("/api/accounting/daily-sheet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "finalize",
          cashAccountId: selectedAccountId,
          businessDate: selectedDate,
          notes: `Finalized by ${currentUserName || "authorized user"}`,
        }),
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error?.message || "Failed to finalize daily sheet");
      }
      startTransition(() => {
        router.refresh();
      });
    } catch (err: unknown) {
      setFinalizeError(err instanceof Error ? err.message : "Error finalizing daily sheet");
    } finally {
      setIsFinalizing(false);
    }
  };

  // Submit Initial Opening Balance
  const handleSetInitialOpening = async (e: React.FormEvent) => {
    e.preventDefault();
    const amountNum = parseFloat(initialOpeningInput);
    if (isNaN(amountNum) || amountNum < 0) {
      setInitialError("Please enter a valid non-negative opening cash balance.");
      return;
    }

    setIsSubmittingInitial(true);
    setInitialError(null);
    try {
      const res = await fetch("/api/accounting/daily-sheet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "set-initial-opening",
          cashAccountId: selectedAccountId,
          businessDate: selectedDate,
          openingBalance: amountNum.toFixed(4),
          notes: initialNotesInput || "Initial operating opening balance established by maker",
        }),
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error?.message || "Failed to set initial opening balance");
      }
      setShowInitialModal(false);
      setInitialOpeningInput("");
      setInitialNotesInput("");
      startTransition(() => {
        router.refresh();
      });
    } catch (err: unknown) {
      setInitialError(err instanceof Error ? err.message : "Error setting initial opening balance");
    } finally {
      setIsSubmittingInitial(false);
    }
  };

  const { received, payment, summary, status } = data;
  const isCashAccount = data.selectedCashAccount?.accountType === "CASH";

  return (
    <div className="space-y-6">
      {/* Top Controls: Account Selector, Date Navigation & Finalize Status */}
      <Card className="bg-white border border-slate-200 shadow-sm">
        <CardContent className="p-4 sm:p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          {/* Account & Date Selection */}
          <div className="flex flex-wrap items-center gap-3">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                Account Scope
              </label>
              <select
                value={selectedAccountId}
                onChange={(e) => handleAccountChange(e.target.value)}
                className="text-xs font-semibold border border-slate-300 rounded-lg px-3 py-1.5 bg-white text-slate-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              >
                {data.cashAccounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.code} – {acc.name} ({acc.accountType})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                Statement Date
              </label>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={handlePrevDay}
                  className="px-2 py-1 text-slate-600 hover:text-slate-900"
                  title="Previous Day"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <div className="relative">
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={(e) => handleDateChange(e.target.value)}
                    className="text-xs font-mono font-semibold border border-slate-300 rounded-lg pl-3 pr-2 py-1.5 bg-white text-slate-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  />
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={handleNextDay}
                  className="px-2 py-1 text-slate-600 hover:text-slate-900"
                  title="Next Day"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>

          {/* Action / Finalization Controls */}
          <div className="flex items-center gap-2.5">
            {status.isFinalized ? (
              <Badge variant="success" className="px-3 py-1.5 text-xs font-medium flex items-center gap-1.5">
                <Lock className="h-3.5 w-3.5" />
                Finalized {status.finalizedBy ? `by ${status.finalizedBy}` : ""}
              </Badge>
            ) : (
              <Badge variant="neutral" className="px-3 py-1.5 text-xs font-medium flex items-center gap-1.5 bg-slate-100 text-slate-700">
                <RefreshCw className={`h-3 w-3 ${isPending ? "animate-spin" : ""}`} />
                Unfinalized (Draft Live Statement)
              </Badge>
            )}

            {!status.isFinalized && (
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={handleFinalize}
                disabled={isFinalizing || isPending}
                className="text-xs flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                {isFinalizing ? "Finalizing..." : "Finalize Daily Sheet"}
              </Button>
            )}

            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setShowInitialModal(true)}
              className="text-xs text-slate-700 border-slate-300 hover:bg-slate-50"
              title="Establish initial opening cash baseline for first day of operation"
            >
              Set Initial Opening
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Discrepancy & Status Banners */}
      {finalizeError && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0" />
          <span>{finalizeError}</span>
        </div>
      )}

      {status.hasBackdatedDiscrepancy && (
        <div className="p-3.5 bg-amber-50 border border-amber-300 rounded-xl text-xs text-amber-900 flex items-start gap-2.5 shadow-sm">
          <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <span className="font-bold">Backdated entries detected after finalization:</span>
            <p className="mt-0.5 text-amber-800">
              Transactions were posted or reversed on this date after it was locked.
              Live ledger balance differs by ₹{status.discrepancyVariance}.
              Please review the Daybook and re-finalize if authorized.
            </p>
          </div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={handleFinalize}
            className="text-[11px] bg-amber-100 hover:bg-amber-200 text-amber-900 border-amber-300 shrink-0"
          >
            Re-Finalize Day
          </Button>
        </div>
      )}

      {status.previousDayStatus === "UNFINALIZED" && (
        <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-800 flex items-center gap-2">
          <Info className="h-4 w-4 text-blue-600 shrink-0" />
          <span>
            <strong>Carry-Forward Notice:</strong> Previous business day ({status.previousDayDate || "prior day"}) was not finalized.
            Opening cash of ₹{received.opening} is automatically computed from continuous ledger transactions.
          </span>
        </div>
      )}

      {summary.isNegative && (
        <div className="p-4 bg-rose-50 border-2 border-rose-300 rounded-xl text-xs text-rose-900 flex items-start gap-3 shadow-sm">
          <AlertTriangle className="h-5 w-5 text-rose-600 shrink-0 mt-0.5" />
          <div>
            <h4 className="font-bold text-sm text-rose-800">Cash In Hand Discrepancy Warning</h4>
            <p className="mt-1 text-rose-700">
              The closing cash balance is negative ({summary.closingCash}). Physical cash in vault cannot drop below zero.
              This indicates unrecorded cash receipts, duplicate payments, or incorrect disbursement dates.
            </p>
          </div>
        </div>
      )}

      {/* SECTION 1: RECEIVED */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-6 w-1 bg-emerald-600 rounded-full" />
            <h2 className="text-base font-extrabold tracking-tight text-slate-900 uppercase">
              Received
            </h2>
          </div>
          <span className="text-xs text-slate-500">
            Total money received into {data.selectedCashAccount?.name || "cash account"} on {selectedDate}
          </span>
        </div>

        {/* 9 Received Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {/* 1. Opening */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 shadow-sm hover:border-slate-300 transition">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                1. Opening
              </span>
              <Badge variant="neutral" className="text-[9px] px-1.5 py-0.5 bg-slate-200 text-slate-700 font-mono">
                CARRY-FWD
              </Badge>
            </div>
            <div className="text-lg font-mono font-extrabold text-slate-800 mt-2">
              ₹{parseFloat(received.opening).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
            </div>
            <span className="text-[10px] text-slate-400 mt-0.5 block">
              Previous closing cash
            </span>
          </div>

          {/* 2. Advance */}
          <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-sm hover:border-slate-300 transition">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
              2. Advance
            </span>
            <div className="text-lg font-mono font-extrabold text-emerald-700 mt-2">
              ₹{parseFloat(received.advance).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
            </div>
            <span className="text-[10px] text-slate-400 mt-0.5 block">
              Advance collections
            </span>
          </div>

          {/* 3. Repayment */}
          <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-sm hover:border-slate-300 transition">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
              3. Repayment
            </span>
            <div className="text-lg font-mono font-extrabold text-emerald-700 mt-2">
              ₹{parseFloat(received.repayment).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
            </div>
            <span className="text-[10px] text-slate-400 mt-0.5 block">
              Loan installment receipts
            </span>
          </div>

          {/* 4. RD */}
          <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-sm hover:border-slate-300 transition">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
              4. RD
            </span>
            <div className="text-lg font-mono font-extrabold text-emerald-700 mt-2">
              ₹{parseFloat(received.rd).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
            </div>
            <span className="text-[10px] text-slate-400 mt-0.5 block">
              Recurring deposits
            </span>
          </div>

          {/* 5. FD */}
          <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-sm hover:border-slate-300 transition">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
              5. FD
            </span>
            <div className="text-lg font-mono font-extrabold text-emerald-700 mt-2">
              ₹{parseFloat(received.fd).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
            </div>
            <span className="text-[10px] text-slate-400 mt-0.5 block">
              Fixed deposits opening
            </span>
          </div>

          {/* 6. Bank Transfer */}
          <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-sm hover:border-slate-300 transition">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
              6. Bank Transfer
            </span>
            <div className="text-lg font-mono font-extrabold text-blue-700 mt-2">
              ₹{parseFloat(received.bankTransfer).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
            </div>
            <span className="text-[10px] text-slate-400 mt-0.5 block">
              Transferred from bank/cash
            </span>
          </div>

          {/* 7. Loan */}
          <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-sm hover:border-slate-300 transition">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
              7. Loan
            </span>
            <div className="text-lg font-mono font-extrabold text-emerald-700 mt-2">
              ₹{parseFloat(received.loan).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
            </div>
            <span className="text-[10px] text-slate-400 mt-0.5 block">
              Settlements & recoveries
            </span>
          </div>

          {/* 8. Miscellaneous */}
          <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-sm hover:border-slate-300 transition">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
              8. Miscellaneous
            </span>
            <div className="text-lg font-mono font-extrabold text-slate-800 mt-2">
              ₹{parseFloat(received.miscellaneous).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
            </div>
            <span className="text-[10px] text-slate-400 mt-0.5 block">
              Savings, capital & misc
            </span>
          </div>

          {/* 9. Total Received (Summary Block) */}
          <div className="col-span-2 sm:col-span-1 lg:col-span-2 bg-gradient-to-br from-emerald-500 to-teal-700 text-white rounded-xl p-4 shadow-md flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-100">
                9. Total Received
              </span>
              <ArrowDownLeft className="h-4 w-4 text-emerald-200" />
            </div>
            <div className="mt-2">
              <div className="text-2xl font-mono font-black text-white">
                ₹{parseFloat(received.totalReceived).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              </div>
              <span className="text-[11px] text-emerald-100 font-medium">
                Sum of categories (excl. opening)
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* SECTION 2: PAYMENT */}
      <div className="space-y-3 pt-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-6 w-1 bg-rose-600 rounded-full" />
            <h2 className="text-base font-extrabold tracking-tight text-slate-900 uppercase">
              Payment
            </h2>
          </div>
          <span className="text-xs text-slate-500">
            Total money paid out from {data.selectedCashAccount?.name || "cash account"} on {selectedDate}
          </span>
        </div>

        {/* 6 Payment Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {/* 1. Savings Withdrawal */}
          <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-sm hover:border-slate-300 transition">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
              1. Savings Withdrawal
            </span>
            <div className="text-lg font-mono font-extrabold text-rose-700 mt-2">
              ₹{parseFloat(payment.savingsWithdrawal).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
            </div>
            <span className="text-[10px] text-slate-400 mt-0.5 block">
              Member withdrawals
            </span>
          </div>

          {/* 2. Bank Transfer */}
          <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-sm hover:border-slate-300 transition">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
              2. Bank Transfer
            </span>
            <div className="text-lg font-mono font-extrabold text-blue-700 mt-2">
              ₹{parseFloat(payment.bankTransfer).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
            </div>
            <span className="text-[10px] text-slate-400 mt-0.5 block">
              Deposited to bank/cash
            </span>
          </div>

          {/* 3. Loan Payment */}
          <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-sm hover:border-slate-300 transition">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
              3. Loan Payment
            </span>
            <div className="text-lg font-mono font-extrabold text-rose-700 mt-2">
              ₹{parseFloat(payment.loanPayment).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
            </div>
            <span className="text-[10px] text-slate-400 mt-0.5 block">
              Disbursed loan principals
            </span>
          </div>

          {/* 4. Expenses */}
          <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-sm hover:border-slate-300 transition">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
              4. Expenses
            </span>
            <div className="text-lg font-mono font-extrabold text-rose-700 mt-2">
              ₹{parseFloat(payment.expenses).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
            </div>
            <span className="text-[10px] text-slate-400 mt-0.5 block">
              Posted operating expenses
            </span>
          </div>

          {/* 5. Miscellaneous */}
          <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-sm hover:border-slate-300 transition">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
              5. Miscellaneous
            </span>
            <div className="text-lg font-mono font-extrabold text-slate-800 mt-2">
              ₹{parseFloat(payment.miscellaneous).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
            </div>
            <span className="text-[10px] text-slate-400 mt-0.5 block">
              Maturity payouts & adjustments
            </span>
          </div>

          {/* 6. Total Payment (Summary Block) */}
          <div className="bg-gradient-to-br from-rose-500 to-red-700 text-white rounded-xl p-4 shadow-md flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-rose-100">
                6. Total Payment
              </span>
              <ArrowUpRight className="h-4 w-4 text-rose-200" />
            </div>
            <div className="mt-2">
              <div className="text-xl font-mono font-black text-white">
                ₹{parseFloat(payment.totalPayment).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              </div>
              <span className="text-[11px] text-rose-100 font-medium">
                Total daily outflows
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* SECTION 3: DAILY CASH SUMMARY & CASH IN HAND */}
      <div className="space-y-3 pt-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-6 w-1 bg-blue-600 rounded-full" />
            <h2 className="text-base font-extrabold tracking-tight text-slate-900 uppercase">
              Daily Cash Summary
            </h2>
          </div>
          <span className="text-xs text-slate-500">
            Reconciliation calculation and closing cash position
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Breakdown Card */}
          <Card className="lg:col-span-2 bg-white border border-slate-200 shadow-sm">
            <CardContent className="p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                    Opening Cash
                  </span>
                  <div className="text-lg font-mono font-bold text-slate-900 mt-1">
                    ₹{parseFloat(summary.openingCash).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                  </div>
                </div>

                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl">
                  <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider block">
                    (+) Cash Received
                  </span>
                  <div className="text-lg font-mono font-bold text-emerald-700 mt-1">
                    +₹{parseFloat(summary.totalReceived).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                  </div>
                </div>

                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl">
                  <span className="text-[10px] font-bold text-rose-700 uppercase tracking-wider block">
                    (-) Cash Payment
                  </span>
                  <div className="text-lg font-mono font-bold text-rose-700 mt-1">
                    -₹{parseFloat(summary.totalPayment).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                  </div>
                </div>
              </div>

              {/* Readable Calculation Explanation */}
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-700 flex items-center justify-between">
                <div className="space-y-0.5">
                  <span className="text-[10px] font-bold uppercase text-slate-400 block tracking-wider">
                    Reconciliation Formula
                  </span>
                  <div className="font-semibold text-slate-800">
                    {summary.formulaText}
                  </div>
                </div>
                <Badge variant={summary.isNegative ? "danger" : "success"} className="text-xs px-2.5 py-1">
                  {summary.isNegative ? "Discrepancy" : "Balanced"}
                </Badge>
              </div>
            </CardContent>
          </Card>

          {/* Prominent CASH IN HAND Display */}
          <Card
            className={`border-2 shadow-md flex flex-col justify-between ${
              summary.isNegative
                ? "bg-rose-50 border-rose-400 text-rose-900"
                : "bg-gradient-to-br from-slate-900 to-blue-950 text-white border-blue-900"
            }`}
          >
            <CardContent className="p-5 flex flex-col justify-between h-full">
              <div>
                <div className="flex items-center justify-between">
                  <span
                    className={`text-xs font-bold uppercase tracking-widest ${
                      summary.isNegative ? "text-rose-600" : "text-blue-300"
                    }`}
                  >
                    Closing Cash Balance
                  </span>
                  <Coins
                    className={`h-5 w-5 ${
                      summary.isNegative ? "text-rose-500" : "text-blue-400"
                    }`}
                  />
                </div>
                <h3
                  className={`text-lg font-black tracking-tight mt-1 uppercase ${
                    summary.isNegative ? "text-rose-800" : "text-white"
                  }`}
                >
                  CASH IN HAND
                </h3>
              </div>

              <div className="my-4">
                <div
                  className={`text-3xl sm:text-4xl font-mono font-black tracking-tight ${
                    summary.isNegative ? "text-rose-600" : "text-emerald-400"
                  }`}
                >
                  ₹{parseFloat(summary.closingCash).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </div>
                <p
                  className={`text-xs mt-1 font-medium ${
                    summary.isNegative ? "text-rose-700" : "text-slate-300"
                  }`}
                >
                  {isCashAccount ? "Actual physical cash in vault" : "Closing bank account balance"}
                </p>
              </div>

              <div
                className={`pt-3 border-t text-[11px] flex items-center justify-between ${
                  summary.isNegative
                    ? "border-rose-200 text-rose-700 font-bold"
                    : "border-slate-800 text-slate-400"
                }`}
              >
                <span>Status:</span>
                <span>
                  {summary.isNegative
                    ? "⚠️ Discrepancy"
                    : status.isFinalized
                    ? "✓ Finalized & Locked"
                    : "Active Working Balance"}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Detailed Transaction Breakdown Table */}
      <Card className="bg-white border border-slate-200 shadow-sm overflow-hidden">
        <CardHeader className="bg-slate-50 border-b border-slate-200 py-3 px-4">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-sm font-bold text-slate-800">
                Categorized Day Transactions ({data.transactions.length})
              </CardTitle>
              <CardDescription className="text-xs text-slate-500">
                Audited general ledger movements affecting {data.selectedCashAccount?.name || "cash account"} on {selectedDate}
              </CardDescription>
            </div>
            <span className="font-mono text-xs text-slate-500">
              Account: {data.selectedCashAccount?.code}
            </span>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Voucher No</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Narration</TableHead>
                <TableHead className="text-right">Received (+)</TableHead>
                <TableHead className="text-right">Payment (-)</TableHead>
                <TableHead>Staff Officer</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.transactions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7}>
                    <TableEmptyState message="No cash transactions posted for this account on the selected date." />
                  </TableCell>
                </TableRow>
              ) : (
                data.transactions.map((tx, idx) => (
                  <TableRow key={`${tx.journalEntryId}-${idx}`}>
                    <TableCell className="font-mono text-xs font-semibold text-blue-600">
                      {tx.entryNumber}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="neutral"
                        className="text-[11px] font-semibold bg-slate-100 text-slate-800"
                      >
                        {tx.category}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={tx.type === "RECEIVED" ? "success" : "danger"}
                        className="text-[10px]"
                      >
                        {tx.type}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-slate-700 max-w-xs truncate">
                      {tx.description}
                    </TableCell>
                    <TableCell className="font-mono text-xs font-semibold text-emerald-600 text-right">
                      {tx.type === "RECEIVED"
                        ? `+₹${parseFloat(tx.amount).toFixed(2)}`
                        : "—"}
                    </TableCell>
                    <TableCell className="font-mono text-xs font-semibold text-rose-600 text-right">
                      {tx.type === "PAYMENT"
                        ? `-₹${parseFloat(tx.amount).toFixed(2)}`
                        : "—"}
                    </TableCell>
                    <TableCell className="text-xs text-slate-500">
                      {tx.postedBy}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Modal: Set Initial Opening Balance */}
      {showInitialModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <Wallet className="h-5 w-5 text-blue-600" />
                <h3 className="font-bold text-slate-900 text-base">Establish Initial Opening Balance</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowInitialModal(false)}
                className="text-slate-400 hover:text-slate-600 text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSetInitialOpening} className="space-y-4 mt-4">
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-800">
                <p>
                  This establishes the baseline opening cash balance for <strong>{data.selectedCashAccount?.name}</strong> on <strong>{selectedDate}</strong>.
                  Future days will automatically carry forward from this baseline.
                </p>
              </div>

              {initialError && (
                <div className="p-2.5 bg-rose-50 border border-rose-200 text-xs text-rose-700 rounded-lg">
                  {initialError}
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 uppercase">
                  Opening Cash Balance (₹) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={initialOpeningInput}
                  onChange={(e) => setInitialOpeningInput(e.target.value)}
                  placeholder="e.g. 10000.00"
                  className="w-full px-3 py-2 text-sm font-mono font-bold rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 uppercase">
                  Reason / Notes
                </label>
                <textarea
                  rows={2}
                  value={initialNotesInput}
                  onChange={(e) => setInitialNotesInput(e.target.value)}
                  placeholder="e.g. Initial operational vault balance on system go-live"
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setShowInitialModal(false)}
                  disabled={isSubmittingInitial}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  disabled={isSubmittingInitial}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  {isSubmittingInitial ? "Saving..." : "Establish Balance"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
