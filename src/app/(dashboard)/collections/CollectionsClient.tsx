"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Receipt,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Search,
  DollarSign,
  FileText,
  X,
  CreditCard,
  Building,
  User,
  Users,
  Eye,
  Check,
  Calendar,
  Phone,
  Printer,
  Download,
  FileSpreadsheet,
  CheckSquare,
  Square,
  ArrowRight,
  Filter,
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
import { DailyCollectionSheetModal } from "@/components/collections/DailyCollectionSheetModal";

interface CashAccountItem {
  id: string;
  code: string;
  name: string;
  accountType: string;
}

interface DailyLoanItem {
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
    groupCode: string | null;
  };
  scheme: {
    id: string;
    name: string;
    code: string;
  };
  currentInstallment: {
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

interface ReceiptItem {
  id: string;
  receiptNumber: string;
  businessDate: string;
  amount: string;
  paymentMethod: string;
  reference: string | null;
  status: string;
  isReversed: boolean;
  createdAt: string;
  loanAccount: {
    id: string;
    loanAccountNumber: string;
    customer: {
      id: string;
      fullName: string;
      customerCode: string;
      phone: string;
      guardianName?: string | null;
    };
    scheme: {
      name: string;
      code: string;
    };
  };
  cashAccount: {
    id: string;
    name: string;
    code: string;
  };
  allocations: Array<{
    allocationType: string;
    principalAmount: string;
    interestAmount: string;
    feeAmount: string;
    penaltyAmount: string;
  }>;
}

interface OverdueItem {
  loanAccountId: string;
  loanAccountNumber: string;
  customer: {
    id: string;
    customerCode: string;
    fullName: string;
    phone: string;
    email: string | null;
  };
  scheme: {
    name: string;
    code: string;
  };
  principalDisbursed: string;
  principalOutstanding: string;
  earliestDueDate: string;
  daysPastDue: number;
  agingBucket: "1-30" | "31-60" | "61-90" | "90+";
  principalOverdue: string;
  interestOverdue: string;
  totalOverdue: string;
  latestFollowUp?: {
    status: string;
    promiseDate: string | null;
    promiseAmount: string | null;
    notes: string;
  } | null;
}

interface GroupItem {
  id: string;
  name: string;
  code: string;
}

interface OrgInfo {
  name: string;
  branchName: string;
  gstin: string;
  helpline: string;
}

interface CollectionsClientProps {
  currentUserId: string;
  receipts: ReceiptItem[];
  overdueData: {
    summary: {
      totalOverdueAmount: string;
      totalDelinquentLoans: number;
      bucket1to30: string;
      bucket31to60: string;
      bucket61to90: string;
      bucket90Plus: string;
      par30Percentage: string;
    };
    items: OverdueItem[];
  };
  dailyLoans: DailyLoanItem[];
  cashAccounts: CashAccountItem[];
  groups: GroupItem[];
  orgInfo: OrgInfo;
}

interface PrintableReceiptData {
  receiptNumber: string;
  dateTime: string;
  memberName: string;
  memberId: string;
  loanNo: string;
  loanId: string;
  paymentMode: string;
  amountReceived: string;
  principalRepaid: string;
  interestRepaid: string;
  feesRepaid?: string;
  penaltyRepaid?: string;
  orgName: string;
  branchName: string;
  gstin: string;
  helpline: string;
}

export function CollectionsClient({
  receipts: initialReceipts,
  overdueData,
  dailyLoans,
  cashAccounts,
  groups,
  orgInfo,
}: CollectionsClientProps) {
  const router = useRouter();

  // Primary Tab: "collection" (Simplified Daily Field Collection) vs "overdue" (Due & Overdue Queue)
  const [activeTab, setActiveTab] = useState<"collection" | "overdue">("collection");

  // Daily Collection Filters
  const todayStr = new Date().toISOString().slice(0, 10);
  const [selectedDate, setSelectedDate] = useState<string>(todayStr);
  const [selectedGroupId, setSelectedGroupId] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [defaultCashAccountId, setDefaultCashAccountId] = useState<string>(
    cashAccounts[0]?.id || ""
  );

  // Row-level collected amount and payment mode states (keyed by loan.id)
  const [rowAmounts, setRowAmounts] = useState<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    for (const l of dailyLoans) {
      if (l.currentInstallment) {
        map[l.id] = l.currentInstallment.remainingDue;
      }
    }
    return map;
  });

  const [rowModes, setRowModes] = useState<Record<string, "CASH" | "UPI" | "NETBANKING">>(
    () => {
      const map: Record<string, "CASH" | "UPI" | "NETBANKING"> = {};
      for (const l of dailyLoans) {
        map[l.id] = "CASH";
      }
      return map;
    }
  );

  // Set of collected loan account IDs for this session
  const [collectedLoanIds, setCollectedLoanIds] = useState<Set<string>>(() => {
    const s = new Set<string>();
    // Pre-populate with loans collected today
    for (const r of initialReceipts) {
      if (r.businessDate === todayStr && !r.isReversed) {
        s.add(r.loanAccount.id);
      }
    }
    return s;
  });

  // Receipts map by loan account id to display / reprint
  const [loanReceipts, setLoanReceipts] = useState<Record<string, ReceiptItem>>(() => {
    const map: Record<string, ReceiptItem> = {};
    for (const r of initialReceipts) {
      if (!r.isReversed) {
        map[r.loanAccount.id] = r;
      }
    }
    return map;
  });

  // Selection state for Bulk Collection
  const [selectedLoanIds, setSelectedLoanIds] = useState<Set<string>>(new Set());

  // Receipt Modal State
  const [activeReceipt, setActiveReceipt] = useState<PrintableReceiptData | null>(null);

  // Bulk Progress State
  const [isBulkCollecting, setIsBulkCollecting] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{ current: number; total: number } | null>(
    null
  );
  const [bulkSuccessMessage, setBulkSuccessMessage] = useState<string | null>(null);

  // Custom Report Export Modal State
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isPrintSheetModalOpen, setIsPrintSheetModalOpen] = useState(false);
  const [exportStartDate, setExportStartDate] = useState(todayStr);
  const [exportEndDate, setExportEndDate] = useState(todayStr);
  const [exportType, setExportType] = useState<"ALL" | "PAID" | "DUE">("ALL");
  const [exportGroupId, setExportGroupId] = useState<string>("ALL");

  // Overdue Queue State
  const [selectedAgingBucket, setSelectedAgingBucket] = useState<string>("ALL");
  const [selectedOverdue, setSelectedOverdue] = useState<OverdueItem | null>(null);
  const [isFollowUpModalOpen, setIsFollowUpModalOpen] = useState(false);
  const [isSubmittingFollowUp, setIsSubmittingFollowUp] = useState(false);
  const [followUpForm, setFollowUpForm] = useState({
    status: "PROMISE_TO_PAY",
    promiseDate: "",
    promiseAmount: "",
    notes: "",
  });

  // Action status feedback
  const [collectingLoanId, setCollectingLoanId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>("");

  // Filter daily loans
  const filteredDailyLoans = dailyLoans.filter((item) => {
    if (selectedGroupId !== "ALL" && item.customer.groupId !== selectedGroupId) {
      return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const matchName = item.customer.fullName.toLowerCase().includes(q);
      const matchCode = item.customer.customerCode.toLowerCase().includes(q);
      const matchPhone = item.customer.phone.toLowerCase().includes(q);
      const matchLoan = item.loanAccountNumber.toLowerCase().includes(q);
      const matchGroup = item.customer.groupName.toLowerCase().includes(q);
      if (!matchName && !matchCode && !matchPhone && !matchLoan && !matchGroup) {
        return false;
      }
    }
    return true;
  });

  // Calculate stats for Daily Collection view
  const totalDueToday = filteredDailyLoans.reduce(
    (acc, curr) => acc + (curr.currentInstallment ? parseFloat(curr.currentInstallment.remainingDue) : 0),
    0
  );
  const totalCollectedToday = filteredDailyLoans.reduce((acc, curr) => {
    if (collectedLoanIds.has(curr.id)) {
      const r = loanReceipts[curr.id];
      return acc + (r ? parseFloat(r.amount) : parseFloat(rowAmounts[curr.id] || "0"));
    }
    return acc;
  }, 0);

  // Select / Deselect All
  const uncollectedFilteredIds = filteredDailyLoans
    .filter((l) => !collectedLoanIds.has(l.id))
    .map((l) => l.id);

  const isAllSelected =
    uncollectedFilteredIds.length > 0 &&
    uncollectedFilteredIds.every((id) => selectedLoanIds.has(id));

  const toggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedLoanIds(new Set());
    } else {
      setSelectedLoanIds(new Set(uncollectedFilteredIds));
    }
  };

  const toggleSelectRow = (id: string) => {
    setSelectedLoanIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Single Collection Handler
  const handleCollectSingle = async (item: DailyLoanItem) => {
    setErrorMessage("");
    const amountVal = rowAmounts[item.id] || item.currentInstallment?.remainingDue || "0";
    const amountNum = parseFloat(amountVal);

    if (isNaN(amountNum) || amountNum <= 0) {
      setErrorMessage(`Please enter a valid collection amount for ${item.customer.fullName}.`);
      return;
    }

    if (!defaultCashAccountId) {
      setErrorMessage("Please select a receiving Cash or Bank account.");
      return;
    }

    setCollectingLoanId(item.id);
    const mode = rowModes[item.id] || "CASH";
    const apiPaymentMethod = mode === "NETBANKING" ? "BANK_TRANSFER" : mode;
    const receiptNum = `RCP-${Date.now().toString().slice(-8)}`;

    try {
      const res = await fetch("/api/collections/receipts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          loanAccountId: item.id,
          cashAccountId: defaultCashAccountId,
          receiptNumber: receiptNum,
          businessDate: selectedDate,
          amount: amountNum.toFixed(4),
          paymentMethod: apiPaymentMethod,
          reference: `DAILY-${selectedDate}-${item.customer.customerCode}`,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || "Failed to record collection receipt.");
      }

      const receiptRecord = data.result;
      const alloc = receiptRecord?.allocations?.[0];
      const pRepaid = alloc ? parseFloat(alloc.principalAmount).toFixed(2) : amountNum.toFixed(2);
      const iRepaid = alloc ? parseFloat(alloc.interestAmount).toFixed(2) : "0.00";

      // Mark collected in local state
      setCollectedLoanIds((prev) => new Set(prev).add(item.id));
      setSelectedLoanIds((prev) => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });

      if (receiptRecord) {
        setLoanReceipts((prev) => ({ ...prev, [item.id]: receiptRecord }));
      }

      // Show the printable receipt modal matching user's screenshot
      setActiveReceipt({
        receiptNumber: receiptNum,
        dateTime: new Date().toLocaleString("en-IN", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
        }),
        memberName: item.customer.fullName.toUpperCase(),
        memberId: item.customer.customerCode,
        loanNo: item.loanAccountNumber,
        loanId: item.id.slice(-6).toUpperCase(),
        paymentMode: mode,
        amountReceived: amountNum.toFixed(2),
        principalRepaid: pRepaid,
        interestRepaid: iRepaid,
        orgName: orgInfo.name.toUpperCase(),
        branchName: orgInfo.branchName.toUpperCase(),
        gstin: orgInfo.gstin,
        helpline: orgInfo.helpline,
      });

      router.refresh();
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : "Error recording collection.");
    } finally {
      setCollectingLoanId(null);
    }
  };

  // Bulk Collect Handler
  const handleBulkCollect = async () => {
    if (selectedLoanIds.size === 0) return;
    setErrorMessage("");
    setBulkSuccessMessage(null);
    setIsBulkCollecting(true);

    const idsToCollect = Array.from(selectedLoanIds);
    setBulkProgress({ current: 0, total: idsToCollect.length });

    let successCount = 0;
    let failedCount = 0;

    for (let i = 0; i < idsToCollect.length; i++) {
      const loanId = idsToCollect[i];
      const item = dailyLoans.find((l) => l.id === loanId);
      if (!item) continue;

      setBulkProgress({ current: i + 1, total: idsToCollect.length });

      const amountVal = rowAmounts[loanId] || item.currentInstallment?.remainingDue || "0";
      const amountNum = parseFloat(amountVal);
      if (isNaN(amountNum) || amountNum <= 0) {
        failedCount++;
        continue;
      }

      const mode = rowModes[loanId] || "CASH";
      const apiPaymentMethod = mode === "NETBANKING" ? "BANK_TRANSFER" : mode;
      const receiptNum = `RCP-BLK-${Date.now().toString().slice(-6)}-${i + 1}`;

      try {
        const res = await fetch("/api/collections/receipts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            loanAccountId: item.id,
            cashAccountId: defaultCashAccountId,
            receiptNumber: receiptNum,
            businessDate: selectedDate,
            amount: amountNum.toFixed(4),
            paymentMethod: apiPaymentMethod,
            reference: `BULK-${selectedDate}-${item.customer.customerCode}`,
          }),
        });

        if (res.ok) {
          const data = await res.json();
          successCount++;
          setCollectedLoanIds((prev) => new Set(prev).add(item.id));
          if (data.result) {
            setLoanReceipts((prev) => ({ ...prev, [item.id]: data.result }));
          }
        } else {
          failedCount++;
        }
      } catch (e) {
        failedCount++;
      }
    }

    setIsBulkCollecting(false);
    setBulkProgress(null);
    setSelectedLoanIds(new Set());

    if (successCount > 0) {
      setBulkSuccessMessage(
        `Successfully collected ${successCount} loans in bulk.${
          failedCount > 0 ? ` (${failedCount} failed)` : ""
        }`
      );
      router.refresh();
    } else {
      setErrorMessage("Bulk collection failed. Please check loan states.");
    }
  };

  // Open existing receipt for a loan
  const openExistingReceipt = (item: DailyLoanItem) => {
    const r = loanReceipts[item.id];
    if (!r) return;
    const alloc = r.allocations?.[0];
    const mode = r.paymentMethod === "BANK_TRANSFER" ? "NETBANKING" : r.paymentMethod;

    setActiveReceipt({
      receiptNumber: r.receiptNumber,
      dateTime: new Date(r.createdAt).toLocaleString("en-IN", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      }),
      memberName: item.customer.fullName.toUpperCase(),
      memberId: item.customer.customerCode,
      loanNo: item.loanAccountNumber,
      loanId: item.id.slice(-6).toUpperCase(),
      paymentMode: mode,
      amountReceived: parseFloat(r.amount).toFixed(2),
      principalRepaid: alloc ? parseFloat(alloc.principalAmount).toFixed(2) : parseFloat(r.amount).toFixed(2),
      interestRepaid: alloc ? parseFloat(alloc.interestAmount).toFixed(2) : "0.00",
      orgName: orgInfo.name.toUpperCase(),
      branchName: orgInfo.branchName.toUpperCase(),
      gstin: orgInfo.gstin,
      helpline: orgInfo.helpline,
    });
  };

  // Instant Today's Collection Report CSV Download
  const downloadTodayCsv = () => {
    window.location.href = `/api/collections/reports/export?startDate=${selectedDate}&endDate=${selectedDate}&type=ALL`;
  };

  // Custom Period CSV Download
  const handleCustomExport = () => {
    const params = new URLSearchParams({
      startDate: exportStartDate,
      endDate: exportEndDate,
      type: exportType,
      ...(exportGroupId !== "ALL" ? { groupId: exportGroupId } : {}),
    });
    window.location.href = `/api/collections/reports/export?${params.toString()}`;
    setIsExportModalOpen(false);
  };

  // Overdue Queue Filter & Handlers
  const filteredOverdue = overdueData.items.filter((item) => {
    if (selectedAgingBucket === "ALL") return true;
    return item.agingBucket === selectedAgingBucket;
  });

  const handleCreateFollowUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOverdue) return;
    setIsSubmittingFollowUp(true);

    try {
      const res = await fetch("/api/collections/follow-ups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          loanAccountId: selectedOverdue.loanAccountId,
          status: followUpForm.status,
          promiseDate: followUpForm.status === "PROMISE_TO_PAY" ? followUpForm.promiseDate : undefined,
          promiseAmount:
            followUpForm.status === "PROMISE_TO_PAY"
              ? parseFloat(followUpForm.promiseAmount).toFixed(4)
              : undefined,
          notes: followUpForm.notes,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error?.message || "Failed to log follow-up");
      }

      setIsFollowUpModalOpen(false);
      router.refresh();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Error saving follow up");
    } finally {
      setIsSubmittingFollowUp(false);
    }
  };

  return (
    <div className="space-y-5 max-w-[1400px] mx-auto pb-16">
      {/* Header Banner */}
      <div className="bg-[#0B2240] text-white rounded-xl p-5 shadow-sm flex flex-col md:flex-row md:items-center md:justify-between gap-4 border border-slate-800">
        <div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-blue-950/70 text-[11px] font-semibold tracking-wider uppercase mb-1.5 text-blue-300">
            <Receipt className="h-3.5 w-3.5 text-emerald-400" />
            Field Collection & Repayment Desk
          </div>
          <h1 className="text-xl font-bold tracking-tight text-white">
            Daily Field Collection & Arrears Command
          </h1>
          <p className="text-xs text-slate-300 mt-1 max-w-2xl">
            Streamlined daily field collections with autofilled installment amounts, instant thermal receipt generation, bulk batch collection, and tabular arrears tracking.
          </p>
        </div>

        {/* Quick Report Download Actions */}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            onClick={() => setIsPrintSheetModalOpen(true)}
            className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs px-3 py-1.5 rounded-lg flex items-center gap-1.5 shadow-sm uppercase tracking-wider"
          >
            <Printer className="h-3.5 w-3.5" />
            Download / Print PDF Sheet
          </Button>

          <Button
            size="sm"
            onClick={downloadTodayCsv}
            className="bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs px-3 py-1.5 rounded-lg flex items-center gap-1.5 shadow-sm uppercase tracking-wider"
          >
            <Download className="h-3.5 w-3.5" />
            Today&apos;s Collection (CSV)
          </Button>

          <Button
            size="sm"
            onClick={() => setIsExportModalOpen(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs px-3 py-1.5 rounded-lg flex items-center gap-1.5 shadow-sm uppercase tracking-wider"
          >
            <FileSpreadsheet className="h-3.5 w-3.5" />
            Custom Period Report
          </Button>
        </div>
      </div>

      {/* Primary Navigation Tabs: Daily Collection vs Due & Overdue Queue */}
      <div className="flex items-center gap-2 border-b border-slate-200">
        <button
          onClick={() => setActiveTab("collection")}
          className={`flex items-center gap-2 px-5 py-3 text-xs font-bold uppercase tracking-wider border-b-2 transition-colors ${
            activeTab === "collection"
              ? "border-b-blue-600 text-blue-700 bg-blue-50/50"
              : "border-b-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <CreditCard className="h-4 w-4" />
          Daily Field Collection ({filteredDailyLoans.length})
        </button>

        <button
          onClick={() => setActiveTab("overdue")}
          className={`flex items-center gap-2 px-5 py-3 text-xs font-bold uppercase tracking-wider border-b-2 transition-colors ${
            activeTab === "overdue"
              ? "border-b-rose-600 text-rose-700 bg-rose-50/50"
              : "border-b-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <AlertTriangle className="h-4 w-4 text-rose-600" />
          Due & Overdue Queue ({overdueData.items.length})
        </button>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: SIMPLIFIED DAILY FIELD COLLECTION                                  */}
      {/* ========================================================================= */}
      {activeTab === "collection" && (
        <div className="space-y-4">
          {/* Summary KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm border-l-4 border-l-blue-600">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Total Borrowers in Routine
              </span>
              <p className="text-2xl font-black text-slate-900 mt-0.5">
                {filteredDailyLoans.length}
              </p>
            </div>

            <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm border-l-4 border-l-amber-500">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Scheduled Due Amount
              </span>
              <p className="text-2xl font-black text-amber-600 mt-0.5">
                ₹{totalDueToday.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              </p>
            </div>

            <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm border-l-4 border-l-emerald-600">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Collected Today
              </span>
              <p className="text-2xl font-black text-emerald-600 mt-0.5">
                ₹{totalCollectedToday.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              </p>
            </div>

            <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm border-l-4 border-l-purple-600">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Collection Realization
              </span>
              <p className="text-2xl font-black text-purple-700 mt-0.5">
                {totalDueToday > 0 ? Math.round((totalCollectedToday / totalDueToday) * 100) : 0}%
              </p>
            </div>
          </div>

          {/* Error & Bulk Status Notifications */}
          {errorMessage && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0 text-red-500" />
                <span>{errorMessage}</span>
              </div>
              <button onClick={() => setErrorMessage("")} className="text-red-400 hover:text-red-600">
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {bulkSuccessMessage && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                <span>{bulkSuccessMessage}</span>
              </div>
              <button
                onClick={() => setBulkSuccessMessage(null)}
                className="text-emerald-500 hover:text-emerald-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {/* Section: Collector Field Due Sheet (Download / Print PDF) */}
          <div className="bg-gradient-to-r from-emerald-50 via-teal-50/50 to-white p-4 rounded-xl border border-emerald-200/90 shadow-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-lg bg-emerald-600 text-white shrink-0 shadow-xs">
                <Printer className="h-5 w-5" />
              </div>
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-slate-900">
                    Collector Daily Field Due Sheet (Print / Save as PDF)
                  </h3>
                  <Badge variant="success" className="text-[10px] font-bold tracking-wide uppercase">
                    Field Ready
                  </Badge>
                </div>
                <p className="text-xs text-slate-600">
                  Generate a printable sheet or PDF for field collectors showing today&apos;s clients, routine centers, contact phones, scheduled due amounts, and collection signature slips.
                </p>
                <div className="flex flex-wrap items-center gap-3 pt-1 text-[11px] font-medium text-slate-600">
                  <span className="flex items-center gap-1 font-semibold text-slate-800">
                    <Calendar className="h-3.5 w-3.5 text-emerald-600" />
                    Date: <span className="font-mono text-slate-900">{selectedDate}</span>
                  </span>
                  <span className="text-slate-300">•</span>
                  <span className="flex items-center gap-1 font-semibold text-slate-800">
                    <Users className="h-3.5 w-3.5 text-emerald-600" />
                    Scheduled Clients: <span className="text-slate-900 font-bold">{filteredDailyLoans.length}</span>
                  </span>
                  <span className="text-slate-300">•</span>
                  <span className="flex items-center gap-1 font-semibold text-slate-800">
                    <CreditCard className="h-3.5 w-3.5 text-emerald-600" />
                    Total Due Demand: <span className="text-emerald-700 font-bold">₹{totalDueToday.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
              <Button
                size="sm"
                onClick={() => setIsPrintSheetModalOpen(true)}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-3.5 py-2 rounded-lg flex items-center gap-1.5 shadow-sm uppercase tracking-wider"
              >
                <Printer className="h-3.5 w-3.5" />
                <span>Download / Print PDF</span>
              </Button>
            </div>
          </div>

          {/* Daily Collection Filter Bar */}
          <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3 flex-1">
              {/* Date Picker */}
              <div className="flex items-center gap-1.5">
                <Calendar className="h-4 w-4 text-slate-500 shrink-0" />
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs font-bold text-slate-800 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              {/* Group / Center Dropdown */}
              <div className="flex items-center gap-1.5">
                <Users className="h-4 w-4 text-slate-500 shrink-0" />
                <select
                  value={selectedGroupId}
                  onChange={(e) => setSelectedGroupId(e.target.value)}
                  className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-bold text-slate-800 bg-white uppercase focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="ALL">ALL CENTERS & GROUPS</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name.toUpperCase()}
                    </option>
                  ))}
                </select>
              </div>

              {/* Receiving Cash Account */}
              <div className="flex items-center gap-1.5">
                <DollarSign className="h-4 w-4 text-slate-500 shrink-0" />
                <select
                  value={defaultCashAccountId}
                  onChange={(e) => setDefaultCashAccountId(e.target.value)}
                  className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold text-slate-800 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  {cashAccounts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.accountType})
                    </option>
                  ))}
                </select>
              </div>

              {/* Search */}
              <div className="relative flex-1 min-w-[200px] max-w-xs">
                <Search className="h-3.5 w-3.5 absolute left-2.5 top-2.5 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search name, phone, loan #..."
                  className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-slate-300 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* Bulk Action Controls */}
            {selectedLoanIds.size > 0 && (
              <div className="flex items-center gap-2 bg-blue-50 px-3 py-1.5 rounded-lg border border-blue-200">
                <span className="text-xs font-bold text-blue-900">
                  {selectedLoanIds.size} loans selected
                </span>

                {/* Bulk Payment Mode */}
                <select
                  onChange={(e) => {
                    const mode = e.target.value as "CASH" | "UPI";
                    setRowModes((prev) => {
                      const next = { ...prev };
                      for (const id of Array.from(selectedLoanIds)) {
                        next[id] = mode;
                      }
                      return next;
                    });
                  }}
                  className="text-xs font-semibold px-2 py-1 bg-white border border-blue-300 rounded"
                >
                  <option value="CASH">Set Mode: CASH</option>
                  <option value="UPI">Set Mode: UPI</option>
                </select>

                <Button
                  size="sm"
                  disabled={isBulkCollecting}
                  onClick={handleBulkCollect}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs px-3 py-1"
                >
                  {isBulkCollecting
                    ? `Collecting (${bulkProgress?.current}/${bulkProgress?.total})...`
                    : `Collect Selected (${selectedLoanIds.size})`}
                </Button>
              </div>
            )}
          </div>

          {/* Tabular Collection Table */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                {/* Header matching image styling */}
                <thead>
                  <tr className="bg-[#0B2240] text-white">
                    <th className="py-3 px-3 w-10 text-center">
                      <input
                        type="checkbox"
                        checked={isAllSelected}
                        onChange={toggleSelectAll}
                        className="rounded border-slate-400 text-blue-600 focus:ring-0 cursor-pointer"
                        title="Select all uncollected loans for bulk collection"
                      />
                    </th>
                    <th className="py-3 px-3 text-[11px] font-black uppercase tracking-wider text-white">
                      MEMBER & GUARDIAN
                    </th>
                    <th className="py-3 px-3 text-[11px] font-black uppercase tracking-wider text-white">
                      GROUP / CENTER
                    </th>
                    <th className="py-3 px-3 text-[11px] font-black uppercase tracking-wider text-white">
                      LOAN & SCHEME
                    </th>
                    <th className="py-3 px-3 text-[11px] font-black uppercase tracking-wider text-white">
                      DUE DATE
                    </th>
                    <th className="py-3 px-3 text-[11px] font-black uppercase tracking-wider text-white text-right">
                      DUE (₹)
                    </th>
                    <th className="py-3 px-3 text-[11px] font-black uppercase tracking-wider text-white">
                      COLLECTED AMOUNT (AUTOFILLED)
                    </th>
                    <th className="py-3 px-3 text-[11px] font-black uppercase tracking-wider text-white">
                      PAYMENT MODE
                    </th>
                    <th className="py-3 px-3 text-[11px] font-black uppercase tracking-wider text-white">
                      STATUS
                    </th>
                    <th className="py-3 px-3 text-[11px] font-black uppercase tracking-wider text-white text-center">
                      ACTION
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100">
                  {filteredDailyLoans.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="py-12 text-center text-slate-500">
                        <p className="font-bold text-sm text-slate-700">No active loans found</p>
                        <p className="text-xs text-slate-400 mt-1">
                          No loans match the selected date or group filter.
                        </p>
                      </td>
                    </tr>
                  ) : (
                    filteredDailyLoans.map((item) => {
                      const isCollected = collectedLoanIds.has(item.id);
                      const isSelected = selectedLoanIds.has(item.id);
                      const remainingDue = item.currentInstallment?.remainingDue || "0.00";
                      const currentVal = rowAmounts[item.id] !== undefined ? rowAmounts[item.id] : remainingDue;
                      const currentMode = rowModes[item.id] || "CASH";

                      return (
                        <tr
                          key={item.id}
                          className={`transition-colors ${
                            isCollected
                              ? "bg-emerald-50/40"
                              : isSelected
                              ? "bg-blue-50/60"
                              : "hover:bg-slate-50/80"
                          }`}
                        >
                          {/* Checkbox for bulk edit */}
                          <td className="py-3 px-3 text-center">
                            {!isCollected ? (
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleSelectRow(item.id)}
                                className="rounded border-slate-300 text-blue-600 focus:ring-0 cursor-pointer"
                              />
                            ) : (
                              <Check className="h-4 w-4 text-emerald-600 mx-auto" />
                            )}
                          </td>

                          {/* MEMBER & GUARDIAN */}
                          <td className="py-3 px-3 whitespace-nowrap">
                            <div className="font-extrabold text-slate-900 text-xs uppercase">
                              {item.customer.fullName}
                            </div>
                            <div className="text-[10.5px] text-slate-500 font-semibold uppercase">
                              {item.customer.guardianName ? `SPOUSE: ${item.customer.guardianName}` : "GUARDIAN: N/A"}
                            </div>
                            <div className="text-[10px] text-slate-400 font-mono">
                              ID: {item.customer.customerCode} • {item.customer.phone}
                            </div>
                          </td>

                          {/* GROUP / CENTER */}
                          <td className="py-3 px-3">
                            <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-sky-50 text-sky-800 border border-sky-200 uppercase truncate max-w-[160px]">
                              {item.customer.groupName}
                            </span>
                          </td>

                          {/* LOAN & SCHEME */}
                          <td className="py-3 px-3 whitespace-nowrap">
                            <div className="font-mono font-bold text-blue-700 text-xs">
                              {item.loanAccountNumber}
                            </div>
                            <div className="text-[10px] text-slate-500 uppercase">
                              {item.scheme.name}
                            </div>
                            <div className="text-[10px] text-slate-400">
                              Bal: ₹{parseFloat(item.principalOutstanding).toLocaleString("en-IN")}
                            </div>
                          </td>

                          {/* DUE DATE */}
                          <td className="py-3 px-3 whitespace-nowrap">
                            {item.currentInstallment ? (
                              <div>
                                <span className="font-semibold text-slate-800">
                                  {new Date(item.currentInstallment.dueDate).toLocaleDateString("en-IN")}
                                </span>
                                <div className="text-[10px] text-slate-400">
                                  Inst #{item.currentInstallment.installmentNumber}
                                </div>
                              </div>
                            ) : (
                              <span className="text-slate-400 italic">No pending due</span>
                            )}
                          </td>

                          {/* DUE (₹) */}
                          <td className="py-3 px-3 text-right whitespace-nowrap">
                            <div className="font-extrabold text-slate-900 text-xs">
                              ₹{parseFloat(remainingDue).toFixed(2)}
                            </div>
                            {item.currentInstallment && (
                              <div className="text-[9.5px] text-slate-400">
                                P: ₹{item.currentInstallment.principalDue} + I: ₹{item.currentInstallment.interestDue}
                              </div>
                            )}
                          </td>

                          {/* COLLECTED AMOUNT (AUTOFILLED) */}
                          <td className="py-3 px-3 whitespace-nowrap">
                            {!isCollected ? (
                              <div className="relative w-28">
                                <span className="absolute left-2 top-2 text-slate-400 text-xs">₹</span>
                                <input
                                  type="number"
                                  step="0.01"
                                  value={currentVal}
                                  onChange={(e) =>
                                    setRowAmounts((prev) => ({
                                      ...prev,
                                      [item.id]: e.target.value,
                                    }))
                                  }
                                  className="w-full pl-5 pr-2 py-1 text-xs font-bold font-mono rounded border border-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
                                />
                              </div>
                            ) : (
                              <span className="font-mono font-bold text-emerald-700 text-xs">
                                ₹{parseFloat(currentVal).toFixed(2)}
                              </span>
                            )}
                          </td>

                          {/* PAYMENT MODE (Optional CASH/UPI) */}
                          <td className="py-3 px-3 whitespace-nowrap">
                            {!isCollected ? (
                              <select
                                value={currentMode}
                                onChange={(e) =>
                                  setRowModes((prev) => ({
                                    ...prev,
                                    [item.id]: e.target.value as any,
                                  }))
                                }
                                className="px-2 py-1 text-xs font-bold rounded border border-slate-300 bg-white text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 uppercase"
                              >
                                <option value="CASH">CASH</option>
                                <option value="UPI">UPI</option>
                              </select>
                            ) : (
                              <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 uppercase">
                                {currentMode}
                              </span>
                            )}
                          </td>

                          {/* STATUS */}
                          <td className="py-3 px-3 whitespace-nowrap">
                            {isCollected ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10.5px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-300 uppercase">
                                <Check className="h-3 w-3 stroke-[3]" />
                                COLLECTED
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10.5px] font-bold bg-amber-50 text-amber-700 border border-amber-300 uppercase">
                                <Clock className="h-3 w-3" />
                                DUE
                              </span>
                            )}
                          </td>

                          {/* ACTION: Collect / Print Receipt */}
                          <td className="py-3 px-3 text-center whitespace-nowrap">
                            {!isCollected ? (
                              <Button
                                size="sm"
                                disabled={collectingLoanId === item.id}
                                onClick={() => handleCollectSingle(item)}
                                className="bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-[11px] px-3 py-1 rounded shadow-sm"
                              >
                                {collectingLoanId === item.id ? "Collecting..." : "Collect"}
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => openExistingReceipt(item)}
                                className="text-[11px] font-bold text-slate-700 hover:text-slate-900 border-slate-300 flex items-center gap-1 px-2.5 py-1"
                              >
                                <Printer className="h-3 w-3 text-slate-500" />
                                Receipt
                              </Button>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Bottom Status Bar */}
            <div className="p-3 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-600 gap-2">
              <div>
                Showing <strong>{filteredDailyLoans.length}</strong> active borrower schedules for date{" "}
                <strong>{selectedDate}</strong>
              </div>
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1 text-emerald-700 font-bold">
                  <span className="h-2 w-2 rounded-full bg-emerald-600 inline-block" />
                  {collectedLoanIds.size} Collected
                </span>
                <span className="flex items-center gap-1 text-amber-600 font-bold">
                  <span className="h-2 w-2 rounded-full bg-amber-500 inline-block" />
                  {Math.max(0, filteredDailyLoans.length - collectedLoanIds.size)} Due
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: DUE & OVERDUE QUEUE TABLE (PRESENT AS IT IS)                       */}
      {/* ========================================================================= */}
      {activeTab === "overdue" && (
        <div className="space-y-4">
          {/* Overdue Aging Summary Metrics */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm border-l-4 border-l-rose-600">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Total Overdue (Arrears)
              </span>
              <p className="text-xl font-black text-rose-700 mt-0.5">
                ₹{parseFloat(overdueData.summary.totalOverdueAmount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              </p>
              <span className="text-[10px] text-slate-400">
                {overdueData.summary.totalDelinquentLoans} Delinquent Loans
              </span>
            </div>

            <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm border-l-4 border-l-amber-500">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                1 - 30 Days Bucket
              </span>
              <p className="text-lg font-black text-amber-600 mt-0.5">
                ₹{parseFloat(overdueData.summary.bucket1to30).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              </p>
              <span className="text-[10px] text-slate-400">Early Arrears</span>
            </div>

            <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm border-l-4 border-l-orange-500">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                31 - 60 Days Bucket
              </span>
              <p className="text-lg font-black text-orange-600 mt-0.5">
                ₹{parseFloat(overdueData.summary.bucket31to60).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              </p>
              <span className="text-[10px] text-slate-400">PAR 30 Active</span>
            </div>

            <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm border-l-4 border-l-red-600">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                61 - 90 Days Bucket
              </span>
              <p className="text-lg font-black text-red-600 mt-0.5">
                ₹{parseFloat(overdueData.summary.bucket61to90).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              </p>
              <span className="text-[10px] text-slate-400">High Risk</span>
            </div>

            <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm border-l-4 border-l-purple-800 col-span-2 md:col-span-1">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                90+ Days (NPA)
              </span>
              <p className="text-lg font-black text-purple-900 mt-0.5">
                ₹{parseFloat(overdueData.summary.bucket90Plus).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              </p>
              <span className="text-[10px] font-bold text-rose-600">
                PAR 30: {overdueData.summary.par30Percentage}%
              </span>
            </div>
          </div>

          {/* Aging Filter Pills */}
          <div className="flex flex-wrap items-center gap-2">
            {["ALL", "1-30", "31-60", "61-90", "90+"].map((bucket) => (
              <button
                key={bucket}
                onClick={() => setSelectedAgingBucket(bucket)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-colors ${
                  selectedAgingBucket === bucket
                    ? "bg-slate-900 text-white shadow-sm"
                    : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
                }`}
              >
                {bucket === "ALL" ? "All Aging Categories" : `${bucket} Days DPD`}
              </button>
            ))}
          </div>

          {/* Overdue Queue Table as it is */}
          <Card className="bg-white border border-slate-200 shadow-sm overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Borrower</TableHead>
                  <TableHead>Account #</TableHead>
                  <TableHead>Earliest Due Date</TableHead>
                  <TableHead>DPD</TableHead>
                  <TableHead>Aging Bucket</TableHead>
                  <TableHead>Principal Due</TableHead>
                  <TableHead>Total Arrears</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredOverdue.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="p-0">
                      <TableEmptyState message="No delinquent accounts found in this aging category." />
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredOverdue.map((item) => (
                    <TableRow key={item.loanAccountId}>
                      <TableCell>
                        <div className="font-semibold text-slate-900">{item.customer.fullName}</div>
                        <div className="text-[11px] text-slate-500 font-mono">
                          {item.customer.customerCode} • {item.customer.phone}
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-xs text-blue-700 font-bold">
                        {item.loanAccountNumber}
                      </TableCell>
                      <TableCell className="text-xs text-slate-600">
                        {new Date(item.earliestDueDate).toLocaleDateString("en-IN")}
                      </TableCell>
                      <TableCell className="text-xs font-bold text-rose-700">
                        {item.daysPastDue} Days
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            item.agingBucket === "90+"
                              ? "danger"
                              : item.agingBucket === "61-90"
                              ? "danger"
                              : item.agingBucket === "31-60"
                              ? "warning"
                              : "neutral"
                          }
                          className="text-[10px]"
                        >
                          {item.agingBucket} DPD
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs font-medium text-slate-900">
                        ₹{parseFloat(item.principalOverdue).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell className="font-bold text-rose-700">
                        ₹{parseFloat(item.totalOverdue).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            setSelectedOverdue(item);
                            setFollowUpForm({
                              status: "PROMISE_TO_PAY",
                              promiseDate: "",
                              promiseAmount: parseFloat(item.totalOverdue).toFixed(2),
                              notes: "",
                            });
                            setIsFollowUpModalOpen(true);
                          }}
                          className="text-xs"
                        >
                          <Phone className="h-3.5 w-3.5 mr-1" />
                          Follow-Up
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Card>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. MODAL: PRINTABLE RECEIPT (EXACT MATCH TO USER SCREENSHOT)              */}
      {/* ========================================================================= */}
      {activeReceipt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl overflow-hidden border border-slate-200 space-y-4 p-6">
            {/* Modal Title & Close Button */}
            <div className="flex items-center justify-between border-b pb-3 print:hidden">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                Official Collection Receipt
              </span>
              <button
                onClick={() => setActiveReceipt(null)}
                className="text-slate-400 hover:text-slate-700 p-1 rounded-lg hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* --- Thermal Receipt Card Matching User Screenshot --- */}
            <div
              id="printable-thermal-receipt"
              className="bg-white p-5 border border-slate-200 rounded-xl font-mono text-slate-900 shadow-inner"
            >
              {/* Receipt Header */}
              <div className="text-center space-y-1">
                <h3 className="font-extrabold text-lg tracking-wider text-slate-950">
                  {activeReceipt.orgName}
                </h3>
                <p className="text-[11px] font-bold text-slate-600 tracking-wider">
                  ENTERPRISE MICROFINANCE ERP
                </p>
                <p className="text-xs font-black uppercase text-slate-900 tracking-wider">
                  {activeReceipt.branchName}
                </p>
                <p className="text-[10px] text-slate-500 font-medium tracking-wide">
                  {activeReceipt.gstin}
                </p>
              </div>

              {/* Dashed Line */}
              <div className="border-b-2 border-dashed border-slate-300 my-3.5" />

              {/* Receipt Metadata Grid */}
              <div className="text-xs space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 font-bold">RECEIPT NO:</span>
                  <span className="font-black text-slate-900">{activeReceipt.receiptNumber}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 font-bold">DATE & TIME:</span>
                  <span className="font-semibold text-slate-800">{activeReceipt.dateTime}</span>
                </div>
                <div className="flex justify-between items-center">
                  <div>
                    <span className="text-slate-500 font-bold">MEMBER: </span>
                    <span className="font-bold text-slate-900">{activeReceipt.memberName}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 font-bold">MEMBER ID: </span>
                    <span className="font-bold text-slate-900">{activeReceipt.memberId}</span>
                  </div>
                </div>
                <div className="flex justify-between items-center">
                  <div>
                    <span className="text-slate-500 font-bold">LOAN NO: </span>
                    <span className="font-bold text-slate-900">{activeReceipt.loanNo}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 font-bold">LOAN ID: </span>
                    <span className="font-bold text-slate-900">{activeReceipt.loanId}</span>
                  </div>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 font-bold">PAYMENT MODE:</span>
                  <span className="font-black text-slate-900">{activeReceipt.paymentMode}</span>
                </div>
              </div>

              {/* Dashed Line */}
              <div className="border-b-2 border-dashed border-slate-300 my-3.5" />

              {/* Financial Breakdown */}
              <div className="space-y-2">
                <div className="flex justify-between items-center text-sm">
                  <span className="font-black text-slate-900 text-sm tracking-wider">
                    AMOUNT RECEIVED:
                  </span>
                  <span className="text-xl font-black text-emerald-600">
                    ₹{activeReceipt.amountReceived}
                  </span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-600 font-bold">PRINCIPAL REPAID:</span>
                  <span className="font-bold text-slate-900">₹{activeReceipt.principalRepaid}</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-600 font-bold">INTEREST:</span>
                  <span className="font-bold text-slate-900">₹{activeReceipt.interestRepaid}</span>
                </div>
              </div>

              {/* Dashed Line */}
              <div className="border-b-2 border-dashed border-slate-300 my-3.5" />

              {/* Receipt Footer */}
              <div className="text-center space-y-1 pt-1">
                <p className="text-[11px] font-bold text-slate-700 tracking-wider">
                  THANK YOU FOR TIMELY REPAYMENT!
                </p>
                <p className="text-[10px] text-slate-500 font-medium">
                  CUSTOMER HELPLINE: {activeReceipt.helpline}
                </p>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t print:hidden">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setActiveReceipt(null)}
                className="text-xs"
              >
                Close
              </Button>
              <Button
                size="sm"
                onClick={() => window.print()}
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center gap-1.5"
              >
                <Printer className="h-4 w-4" />
                Print Receipt
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 4. MODAL: CUSTOM PERIOD REPORT CSV EXPORT                                 */}
      {/* ========================================================================= */}
      {isExportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-extrabold text-slate-900 text-base uppercase flex items-center gap-1.5">
                <FileSpreadsheet className="h-5 w-5 text-emerald-600" />
                Download Collection & Due Report (CSV)
              </h3>
              <button
                onClick={() => setIsExportModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="text-xs text-slate-500">
              Download historical collections and dues as a tabular CSV report to analyze which payments have been completed and which are currently pending.
            </p>

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 uppercase mb-1">
                    From Date *
                  </label>
                  <input
                    type="date"
                    value={exportStartDate}
                    onChange={(e) => setExportStartDate(e.target.value)}
                    className="w-full px-2.5 py-1.5 border rounded-lg font-semibold"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 uppercase mb-1">
                    To Date *
                  </label>
                  <input
                    type="date"
                    value={exportEndDate}
                    onChange={(e) => setExportEndDate(e.target.value)}
                    className="w-full px-2.5 py-1.5 border rounded-lg font-semibold"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 uppercase mb-1">
                  Report Content Type
                </label>
                <select
                  value={exportType}
                  onChange={(e) => setExportType(e.target.value as any)}
                  className="w-full px-2.5 py-1.5 border rounded-lg font-semibold bg-white"
                >
                  <option value="ALL">All Records (Payments Done & Dues)</option>
                  <option value="PAID">Payments Done Only (Collected Receipts)</option>
                  <option value="DUE">Payments Due & Overdue Only</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 uppercase mb-1">
                  Center / Group Filter
                </label>
                <select
                  value={exportGroupId}
                  onChange={(e) => setExportGroupId(e.target.value)}
                  className="w-full px-2.5 py-1.5 border rounded-lg font-semibold bg-white"
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

            <div className="flex items-center justify-end gap-2 pt-3 border-t">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsExportModalOpen(false)}
                className="text-xs"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleCustomExport}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1.5"
              >
                <Download className="h-4 w-4" />
                Download CSV
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 5. MODAL: LOG OVERDUE FOLLOW-UP                                           */}
      {/* ========================================================================= */}
      {isFollowUpModalOpen && selectedOverdue && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-bold text-slate-900">Log Overdue Follow-Up</h3>
              <button onClick={() => setIsFollowUpModalOpen(false)} className="text-slate-400">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="bg-slate-50 p-3 rounded-lg text-xs space-y-1">
              <div className="flex justify-between">
                <span>Borrower:</span>
                <span className="font-bold">
                  {selectedOverdue.customer.fullName} ({selectedOverdue.customer.phone})
                </span>
              </div>
              <div className="flex justify-between">
                <span>Days Past Due:</span>
                <span className="font-bold text-rose-700">{selectedOverdue.daysPastDue} Days</span>
              </div>
              <div className="flex justify-between">
                <span>Total Arrears Due:</span>
                <span className="font-bold text-slate-900">
                  ₹{parseFloat(selectedOverdue.totalOverdue).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>

            <form onSubmit={handleCreateFollowUp} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Follow-Up Outcome
                </label>
                <select
                  value={followUpForm.status}
                  onChange={(e) => setFollowUpForm({ ...followUpForm, status: e.target.value })}
                  className="w-full text-sm border rounded-lg p-2"
                >
                  <option value="PROMISE_TO_PAY">Promise to Pay</option>
                  <option value="CONTACTED">Contacted (No Commitment)</option>
                  <option value="BROKEN_PROMISE">Broken Promise</option>
                  <option value="RESOLVED">Resolved / Paid</option>
                </select>
              </div>

              {followUpForm.status === "PROMISE_TO_PAY" && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Promise Date
                    </label>
                    <input
                      type="date"
                      required
                      value={followUpForm.promiseDate}
                      onChange={(e) => setFollowUpForm({ ...followUpForm, promiseDate: e.target.value })}
                      className="w-full text-sm border rounded-lg p-2"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Promised Amount (₹)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      required
                      value={followUpForm.promiseAmount}
                      onChange={(e) => setFollowUpForm({ ...followUpForm, promiseAmount: e.target.value })}
                      className="w-full text-sm border rounded-lg p-2"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Officer Visit / Call Notes
                </label>
                <textarea
                  rows={3}
                  required
                  placeholder="Detail conversation, reasons for delay, and borrower commitments..."
                  value={followUpForm.notes}
                  onChange={(e) => setFollowUpForm({ ...followUpForm, notes: e.target.value })}
                  className="w-full text-sm border rounded-lg p-2"
                />
              </div>

              <div className="flex justify-end gap-2 border-t pt-3">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setIsFollowUpModalOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={isSubmittingFollowUp}
                  className="bg-blue-600 text-white"
                >
                  {isSubmittingFollowUp ? "Saving..." : "Save Follow-Up"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Daily Collector Field Sheet Modal (Print & PDF) */}
      <DailyCollectionSheetModal
        isOpen={isPrintSheetModalOpen}
        onClose={() => setIsPrintSheetModalOpen(false)}
        items={filteredDailyLoans.map((loan) => ({
          ...loan,
          isCollected: collectedLoanIds.has(loan.id),
          collectedAmount: loanReceipts[loan.id]?.amount || rowAmounts[loan.id] || "0.00",
          collectedMode: rowModes[loan.id] || "CASH",
        }))}
        orgInfo={orgInfo}
        selectedDate={selectedDate}
        groupName={
          selectedGroupId === "ALL"
            ? "ALL CENTERS & GROUPS"
            : groups.find((g) => g.id === selectedGroupId)?.name || "Selected Center"
        }
      />
    </div>
  );
}
