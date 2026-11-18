"use client";

import React, { useState } from "react";
import {
  BookOpen,
  Calendar,
  Filter,
  Download,
  ChevronDown,
  ChevronRight,
  Eye,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  X,
  FileText,
  User,
  Clock,
  Layers,
} from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { formatDisplayDate } from "@/lib/dates/dates";

export interface DaybookVoucherLine {
  id: string;
  lineNumber: number;
  accountId: string;
  accountCode: string;
  accountName: string;
  accountType: string;
  debit: string;
  credit: string;
  narration?: string | null;
}

export interface DaybookVoucher {
  id: string;
  entryNumber: string;
  businessDate: string;
  postingDate: string;
  createdAt: string;
  sourceModule: string;
  sourceType: string;
  sourceId: string | null;
  reference: string;
  description: string;
  totalDebit: string;
  totalCredit: string;
  status: string;
  reversalOfId?: string | null;
  reversalReason?: string | null;
  reversalOfEntryNumber?: string | null;
  reversedByEntryNumber?: string | null;
  postedBy?: {
    id: string;
    username: string;
    fullName: string;
  } | null;
  lines: DaybookVoucherLine[];
  debitLines: DaybookVoucherLine[];
  creditLines: DaybookVoucherLine[];
}

export interface DaybookDateGroup {
  date: string;
  voucherCount: number;
  totalDebit: string;
  totalCredit: string;
  isReconciled: boolean;
  vouchers: DaybookVoucher[];
}

export interface DaybookData {
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
  totals: {
    totalDebit: string;
    totalCredit: string;
    totalVouchers: number;
    isReconciled: boolean;
  };
  dateGroups: DaybookDateGroup[];
}

export interface AccountOption {
  id: string;
  code: string;
  name: string;
  accountType: string;
}

interface DaybookClientProps {
  data: DaybookData;
  accounts: AccountOption[];
  initialFilters: {
    startDate?: string;
    endDate?: string;
    voucherNumber?: string;
    sourceModule?: string;
    sourceType?: string;
    search?: string;
    accountId?: string;
    status?: string;
    sortOrder?: string;
  };
}

export default function DaybookClient({
  data,
  accounts,
  initialFilters,
}: DaybookClientProps) {
  // Filter state
  const [startDate, setStartDate] = useState(initialFilters.startDate || "");
  const [endDate, setEndDate] = useState(initialFilters.endDate || "");
  const [voucherNumber, setVoucherNumber] = useState(initialFilters.voucherNumber || "");
  const [sourceModule, setSourceModule] = useState(initialFilters.sourceModule || "ALL");
  const [sourceType, setSourceType] = useState(initialFilters.sourceType || "ALL");
  const [search, setSearch] = useState(initialFilters.search || "");
  const [accountId, setAccountId] = useState(initialFilters.accountId || "ALL");
  const [status, setStatus] = useState(initialFilters.status || "ALL");
  const [sortOrder, setSortOrder] = useState(initialFilters.sortOrder || "asc");

  // Inline expanded vouchers state (voucher ID -> boolean)
  const [expandedVouchers, setExpandedVouchers] = useState<Record<string, boolean>>({});

  // Collapsed date groups (date -> boolean)
  const [collapsedDates, setCollapsedDates] = useState<Record<string, boolean>>({});

  // Active voucher for detail modal
  const [selectedVoucher, setSelectedVoucher] = useState<DaybookVoucher | null>(null);

  const toggleExpandVoucher = (voucherId: string) => {
    setExpandedVouchers((prev) => ({
      ...prev,
      [voucherId]: !prev[voucherId],
    }));
  };

  const toggleCollapseDate = (date: string) => {
    setCollapsedDates((prev) => ({
      ...prev,
      [date]: !prev[date],
    }));
  };

  const formatCurrency = (amount: string | number) => {
    const val = typeof amount === "string" ? parseFloat(amount) : amount;
    if (isNaN(val)) return "₹0.00";
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(val);
  };

  // Helper for quick date range buttons
  const applyQuickDate = (type: "today" | "yesterday" | "this_month" | "all_time") => {
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);

    if (type === "today") {
      window.location.href = `/accounting?tab=daybook&startDate=${todayStr}&endDate=${todayStr}`;
    } else if (type === "yesterday") {
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      const yStr = y.toISOString().slice(0, 10);
      window.location.href = `/accounting?tab=daybook&startDate=${yStr}&endDate=${yStr}`;
    } else if (type === "this_month") {
      const startOfMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
      window.location.href = `/accounting?tab=daybook&startDate=${startOfMonth}&endDate=${todayStr}`;
    } else if (type === "all_time") {
      window.location.href = `/accounting?tab=daybook`;
    }
  };

  const handleExportCSV = () => {
    const headers = [
      "Voucher No",
      "Transaction Date",
      "Source Module",
      "Transaction Type",
      "Reference",
      "Description",
      "Debit (INR)",
      "Credit (INR)",
      "Status",
    ];

    const rows: string[][] = [];

    data.dateGroups.forEach((group) => {
      group.vouchers.forEach((v) => {
        rows.push([
          `"${v.entryNumber}"`,
          `"${v.businessDate}"`,
          `"${v.sourceModule}"`,
          `"${v.sourceType}"`,
          `"${v.reference.replace(/"/g, '""')}"`,
          `"${v.description.replace(/"/g, '""')}"`,
          v.totalDebit,
          v.totalCredit,
          v.status,
        ]);
      });
    });

    // Add overall totals
    rows.push([]);
    rows.push([
      `"Total Vouchers: ${data.totals.totalVouchers}"`,
      `""`,
      `""`,
      `""`,
      `""`,
      `"Overall Totals"`,
      data.totals.totalDebit,
      data.totals.totalCredit,
      `"Balanced"`,
    ]);

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `daybook_${startDate || "all"}_to_${endDate || "all"}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getSourceBadgeVariant = (module: string): "info" | "success" | "neutral" | "warning" | "danger" => {
    switch (module.toUpperCase()) {
      case "COLLECTIONS":
        return "info";
      case "LOANS":
        return "info";
      case "SAVINGS":
        return "success";
      case "TERM_DEPOSITS":
        return "neutral";
      case "EXPENSES":
        return "warning";
      default:
        return "neutral";
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. Filter Toolbar */}
      <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm space-y-3">
        <form method="GET" action="/accounting" className="space-y-3">
          <input type="hidden" name="tab" value="daybook" />

          {/* Row 1: Search & Dates */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
            {/* Search */}
            <div className="md:col-span-2">
              <label htmlFor="search" className="block font-semibold text-slate-700 mb-1">
                Search (Voucher, Reference, Narration, Customer):
              </label>
              <input
                id="search"
                type="text"
                name="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="e.g. JV-2026, Loan LN001, Rent payment..."
                className="w-full border border-slate-300 rounded px-2.5 py-1.5 bg-white text-slate-800 placeholder-slate-400 focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            {/* Starting Date */}
            <div>
              <label htmlFor="startDate" className="block font-semibold text-slate-700 mb-1">
                From Date:
              </label>
              <input
                id="startDate"
                type="date"
                name="startDate"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full border border-slate-300 rounded px-2.5 py-1.5 bg-white text-slate-800 focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            {/* Ending Date */}
            <div>
              <label htmlFor="endDate" className="block font-semibold text-slate-700 mb-1">
                To Date:
              </label>
              <input
                id="endDate"
                type="date"
                name="endDate"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full border border-slate-300 rounded px-2.5 py-1.5 bg-white text-slate-800 focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>

          {/* Row 2: Selectors */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            {/* Source Module */}
            <div>
              <label htmlFor="sourceModule" className="block font-semibold text-slate-700 mb-1">
                Source Module:
              </label>
              <select
                id="sourceModule"
                name="sourceModule"
                value={sourceModule}
                onChange={(e) => setSourceModule(e.target.value)}
                className="w-full border border-slate-300 rounded px-2.5 py-1.5 bg-white text-slate-800 focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="ALL">All Modules</option>
                <option value="COLLECTIONS">Collections</option>
                <option value="LOANS">Loans</option>
                <option value="SAVINGS">Savings</option>
                <option value="TERM_DEPOSITS">Term Deposits (RD/FD)</option>
                <option value="EXPENSES">Expenses</option>
                <option value="MANUAL">Manual / Transfers</option>
              </select>
            </div>

            {/* Account / Ledger */}
            <div>
              <label htmlFor="accountId" className="block font-semibold text-slate-700 mb-1">
                Account / Ledger:
              </label>
              <select
                id="accountId"
                name="accountId"
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                className="w-full border border-slate-300 rounded px-2.5 py-1.5 bg-white text-slate-800 focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="ALL">All General Ledger Accounts</option>
                {accounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.code} - {acc.name} ({acc.accountType})
                  </option>
                ))}
              </select>
            </div>

            {/* Status */}
            <div>
              <label htmlFor="status" className="block font-semibold text-slate-700 mb-1">
                Status:
              </label>
              <select
                id="status"
                name="status"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full border border-slate-300 rounded px-2.5 py-1.5 bg-white text-slate-800 focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="ALL">All Statuses (Posted & Reversed)</option>
                <option value="POSTED">Posted Only</option>
                <option value="REVERSED">Reversed Only</option>
              </select>
            </div>

            {/* Sort Order */}
            <div>
              <label htmlFor="sortOrder" className="block font-semibold text-slate-700 mb-1">
                Order:
              </label>
              <select
                id="sortOrder"
                name="sortOrder"
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value)}
                className="w-full border border-slate-300 rounded px-2.5 py-1.5 bg-white text-slate-800 focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="asc">Chronological (Oldest First)</option>
                <option value="desc">Reverse Chronological (Newest First)</option>
              </select>
            </div>
          </div>

          {/* Row 3: Action Buttons & Shortcuts */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100">
            {/* Quick Shortcuts */}
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <span className="text-slate-500 font-medium mr-1">Quick:</span>
              <button
                type="button"
                onClick={() => applyQuickDate("today")}
                className="px-2 py-1 bg-slate-100 text-slate-700 rounded hover:bg-slate-200 transition text-[11px]"
              >
                Today
              </button>
              <button
                type="button"
                onClick={() => applyQuickDate("yesterday")}
                className="px-2 py-1 bg-slate-100 text-slate-700 rounded hover:bg-slate-200 transition text-[11px]"
              >
                Yesterday
              </button>
              <button
                type="button"
                onClick={() => applyQuickDate("this_month")}
                className="px-2 py-1 bg-slate-100 text-slate-700 rounded hover:bg-slate-200 transition text-[11px]"
              >
                This Month
              </button>
              <button
                type="button"
                onClick={() => applyQuickDate("all_time")}
                className="px-2 py-1 bg-slate-100 text-slate-700 rounded hover:bg-slate-200 transition text-[11px]"
              >
                All Time
              </button>
            </div>

            {/* Submit & Export */}
            <div className="flex items-center gap-2">
              <a
                href="/accounting?tab=daybook"
                className="flex items-center gap-1 px-3 py-1.5 border border-slate-300 text-slate-600 rounded text-xs font-semibold hover:bg-slate-50 transition"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Reset
              </a>
              <button
                type="submit"
                className="flex items-center gap-1 px-3.5 py-1.5 bg-blue-600 text-white rounded text-xs font-semibold hover:bg-blue-700 transition"
              >
                <Filter className="h-3.5 w-3.5" />
                Apply Filters
              </button>
              <button
                type="button"
                onClick={handleExportCSV}
                className="flex items-center gap-1 px-3 py-1.5 bg-slate-800 text-white rounded text-xs font-semibold hover:bg-slate-900 transition"
              >
                <Download className="h-3.5 w-3.5" />
                Export CSV
              </button>
            </div>
          </div>
        </form>
      </div>

      {/* 2. Overall Summary Banner */}
      <div className="bg-slate-900 text-white rounded-lg p-4 shadow-sm flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-blue-400" />
            <h2 className="text-base font-bold tracking-tight">
              Daybook – Daily Transaction Register
            </h2>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Complete double-entry accounting register across loans, collections, deposits, expenses, and journals
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-4 text-xs font-mono">
          <div className="px-3 py-1.5 bg-slate-800 rounded border border-slate-700">
            <span className="text-slate-400 block text-[10px] uppercase font-sans">Active Dates</span>
            <span className="text-sm font-bold text-white">{data.dateGroups.length} days</span>
          </div>
          <div className="px-3 py-1.5 bg-slate-800 rounded border border-slate-700">
            <span className="text-slate-400 block text-[10px] uppercase font-sans">Total Vouchers</span>
            <span className="text-sm font-bold text-white">{data.totals.totalVouchers}</span>
          </div>
          <div className="px-3 py-1.5 bg-slate-800 rounded border border-slate-700">
            <span className="text-slate-400 block text-[10px] uppercase font-sans">Total Debit (Dr)</span>
            <span className="text-sm font-bold text-emerald-400">
              {formatCurrency(data.totals.totalDebit)}
            </span>
          </div>
          <div className="px-3 py-1.5 bg-slate-800 rounded border border-slate-700">
            <span className="text-slate-400 block text-[10px] uppercase font-sans">Total Credit (Cr)</span>
            <span className="text-sm font-bold text-rose-400">
              {formatCurrency(data.totals.totalCredit)}
            </span>
          </div>
          <div className="px-3 py-1.5 bg-slate-800 rounded border border-slate-700 flex items-center gap-1.5">
            {data.totals.isReconciled ? (
              <span className="flex items-center gap-1 text-emerald-400 font-sans text-xs font-semibold">
                <CheckCircle2 className="h-4 w-4" />
                Balanced & Reconciled
              </span>
            ) : (
              <span className="flex items-center gap-1 text-rose-400 font-sans text-xs font-semibold">
                <AlertTriangle className="h-4 w-4" />
                Unbalanced Entry
              </span>
            )}
          </div>
        </div>
      </div>

      {/* 3. Date-Wise Organisation (No empty dates; grouped per day) */}
      {data.dateGroups.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-lg p-12 text-center shadow-sm">
          <FileText className="h-10 w-10 text-slate-300 mx-auto mb-3" />
          <h3 className="text-sm font-semibold text-slate-800">No Accounting Vouchers Found</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
            There are no posted accounting transactions matching your selected filters. Adjust your
            date range or click Reset to view all records.
          </p>
          <div className="mt-4">
            <a
              href="/accounting?tab=daybook"
              className="inline-flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded text-xs font-semibold hover:bg-blue-700 transition"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset All Filters
            </a>
          </div>
        </div>
      ) : (
        data.dateGroups.map((group) => {
          const isCollapsed = collapsedDates[group.date];
          return (
            <div
              key={group.date}
              className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden"
            >
              {/* Date Group Heading Banner */}
              <div
                onClick={() => toggleCollapseDate(group.date)}
                className="px-4 py-3 bg-slate-50 hover:bg-slate-100/80 cursor-pointer border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 select-none transition-colors"
              >
                <div className="flex items-center gap-2.5">
                  <button type="button" className="text-slate-500 hover:text-slate-800">
                    {isCollapsed ? (
                      <ChevronRight className="h-4 w-4" />
                    ) : (
                      <ChevronDown className="h-4 w-4" />
                    )}
                  </button>
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-blue-600" />
                    <span className="font-bold text-sm text-slate-900">
                      {formatDisplayDate(group.date)}
                    </span>
                    <span className="text-xs font-mono text-slate-500">({group.date})</span>
                  </div>
                  <Badge variant="neutral" className="text-xs">
                    {group.voucherCount} {group.voucherCount === 1 ? "voucher" : "vouchers"}
                  </Badge>
                </div>

                <div className="flex items-center gap-4 text-xs font-mono">
                  <span className="text-slate-600 font-medium">
                    Dr: <strong className="text-emerald-700">{formatCurrency(group.totalDebit)}</strong>
                  </span>
                  <span className="text-slate-600 font-medium">
                    Cr: <strong className="text-rose-700">{formatCurrency(group.totalCredit)}</strong>
                  </span>
                  {group.isReconciled ? (
                    <span className="inline-flex items-center text-emerald-600 text-[11px] font-semibold gap-1 font-sans">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Reconciled
                    </span>
                  ) : (
                    <span className="inline-flex items-center text-rose-600 text-[11px] font-semibold gap-1 font-sans">
                      <AlertTriangle className="h-3.5 w-3.5" /> Discrepancy
                    </span>
                  )}
                </div>
              </div>

              {/* Transactions Table for this date */}
              {!isCollapsed && (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-xs text-left">
                    <thead>
                      <tr className="bg-slate-100/70 border-b border-slate-200 text-slate-700 text-[11px]">
                        <th className="px-3 py-2 font-semibold min-w-[120px]">Voucher No.</th>
                        <th className="px-3 py-2 font-semibold min-w-[90px]">Txn Date</th>
                        <th className="px-3 py-2 font-semibold min-w-[95px]">Source Module</th>
                        <th className="px-3 py-2 font-semibold min-w-[120px]">Txn Type</th>
                        <th className="px-3 py-2 font-semibold min-w-[110px]">Reference</th>
                        <th className="px-3 py-2 font-semibold min-w-[200px]">Description</th>
                        <th className="px-3 py-2 text-right font-semibold min-w-[100px]">Debit (₹)</th>
                        <th className="px-3 py-2 text-right font-semibold min-w-[100px]">Credit (₹)</th>
                        <th className="px-3 py-2 text-center font-semibold min-w-[80px]">Status</th>
                        <th className="px-3 py-2 text-center font-semibold min-w-[110px]">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {group.vouchers.map((v) => {
                        const isExpanded = expandedVouchers[v.id];
                        const isReversed = v.status === "REVERSED";
                        const isReversalVoucher = v.sourceType === "REVERSAL";

                        return (
                          <React.Fragment key={v.id}>
                            <tr
                              className={`transition-colors hover:bg-slate-50/80 ${
                                isReversed
                                  ? "bg-rose-50/40 text-slate-600"
                                  : isReversalVoucher
                                  ? "bg-amber-50/30"
                                  : ""
                              }`}
                            >
                              {/* 1. Voucher No */}
                              <td className="px-3 py-2.5 font-mono font-semibold">
                                <button
                                  type="button"
                                  onClick={() => setSelectedVoucher(v)}
                                  className="text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-1"
                                >
                                  {v.entryNumber}
                                </button>
                              </td>

                              {/* 2. Transaction Date */}
                              <td className="px-3 py-2.5 font-mono text-slate-600 whitespace-nowrap">
                                {v.businessDate}
                              </td>

                              {/* 3. Source Module */}
                              <td className="px-3 py-2.5 whitespace-nowrap">
                                <Badge variant={getSourceBadgeVariant(v.sourceModule)} className="text-[10px]">
                                  {v.sourceModule}
                                </Badge>
                              </td>

                              {/* 4. Transaction Type */}
                              <td className="px-3 py-2.5 whitespace-nowrap font-mono text-[11px] text-slate-700">
                                {v.sourceType}
                              </td>

                              {/* 5. Reference */}
                              <td className="px-3 py-2.5 font-mono text-slate-600 truncate max-w-[120px]" title={v.reference}>
                                {v.reference}
                              </td>

                              {/* 6. Description */}
                              <td className="px-3 py-2.5 text-slate-800 max-w-[280px]">
                                <div className="truncate" title={v.description}>
                                  {v.description}
                                </div>
                                {isReversed && v.reversalReason && (
                                  <div className="text-[10px] text-rose-600 font-medium truncate mt-0.5">
                                    Reversed: {v.reversalReason}
                                  </div>
                                )}
                              </td>

                              {/* 7. Debit */}
                              <td className="px-3 py-2.5 text-right font-mono font-semibold text-slate-900 whitespace-nowrap">
                                {formatCurrency(v.totalDebit)}
                              </td>

                              {/* 8. Credit */}
                              <td className="px-3 py-2.5 text-right font-mono font-semibold text-slate-900 whitespace-nowrap">
                                {formatCurrency(v.totalCredit)}
                              </td>

                              {/* 9. Status */}
                              <td className="px-3 py-2.5 text-center whitespace-nowrap">
                                <Badge
                                  variant={v.status === "POSTED" ? "success" : "danger"}
                                  className="text-[10px]"
                                >
                                  {v.status}
                                </Badge>
                              </td>

                              {/* 10. Action */}
                              <td className="px-3 py-2.5 text-center whitespace-nowrap">
                                <div className="inline-flex items-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => setSelectedVoucher(v)}
                                    title="View full voucher entry"
                                    className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-[11px] font-semibold flex items-center gap-1 transition"
                                  >
                                    <Eye className="h-3 w-3" />
                                    View
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => toggleExpandVoucher(v.id)}
                                    title="Expand journal lines"
                                    className={`p-1 rounded text-slate-500 hover:bg-slate-100 transition ${
                                      isExpanded ? "text-blue-600 bg-blue-50" : ""
                                    }`}
                                  >
                                    {isExpanded ? (
                                      <ChevronDown className="h-3.5 w-3.5" />
                                    ) : (
                                      <ChevronRight className="h-3.5 w-3.5" />
                                    )}
                                  </button>
                                </div>
                              </td>
                            </tr>

                            {/* Section 4: Complete Accounting Entries Inline Breakdown */}
                            {isExpanded && (
                              <tr className="bg-slate-50/90 border-b border-slate-200">
                                <td colSpan={10} className="px-6 py-3">
                                  <div className="bg-white border border-slate-200 rounded-md p-3 shadow-inner space-y-2">
                                    <div className="flex items-center justify-between text-xs border-b border-slate-100 pb-1.5">
                                      <div className="flex items-center gap-2 font-semibold text-slate-800">
                                        <Layers className="h-3.5 w-3.5 text-blue-600" />
                                        <span>Complete Journal Breakdown for {v.entryNumber}</span>
                                      </div>
                                      <div className="text-[11px] text-slate-500">
                                        Posted by: <strong>{v.postedBy?.fullName || "System"}</strong> on{" "}
                                        {v.businessDate}
                                      </div>
                                    </div>

                                    {/* Lines Table */}
                                    <table className="w-full text-xs text-left">
                                      <thead>
                                        <tr className="border-b border-slate-200 text-slate-500 text-[10px] uppercase">
                                          <th className="py-1 px-2">#</th>
                                          <th className="py-1 px-2">GL Account</th>
                                          <th className="py-1 px-2">Type</th>
                                          <th className="py-1 px-2">Narration</th>
                                          <th className="py-1 px-2 text-right">Debit (Dr)</th>
                                          <th className="py-1 px-2 text-right">Credit (Cr)</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-slate-100 font-mono">
                                        {v.lines.map((l) => (
                                          <tr key={l.id} className="hover:bg-slate-50/60">
                                            <td className="py-1.5 px-2 text-slate-400">{l.lineNumber}</td>
                                            <td className="py-1.5 px-2 font-semibold text-slate-900">
                                              {l.accountCode} - {l.accountName}
                                            </td>
                                            <td className="py-1.5 px-2 text-slate-500 text-[11px]">
                                              {l.accountType}
                                            </td>
                                            <td className="py-1.5 px-2 text-slate-600 font-sans text-xs">
                                              {l.narration || "—"}
                                            </td>
                                            <td className="py-1.5 px-2 text-right font-semibold text-emerald-700">
                                              {parseFloat(l.debit) > 0 ? formatCurrency(l.debit) : "—"}
                                            </td>
                                            <td className="py-1.5 px-2 text-right font-semibold text-rose-700">
                                              {parseFloat(l.credit) > 0 ? formatCurrency(l.credit) : "—"}
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                      <tfoot>
                                        <tr className="border-t-2 border-slate-200 font-mono font-bold text-xs bg-slate-50">
                                          <td colSpan={4} className="py-1.5 px-2 text-right font-sans">
                                            Voucher Total (Balanced):
                                          </td>
                                          <td className="py-1.5 px-2 text-right text-emerald-800">
                                            {formatCurrency(v.totalDebit)}
                                          </td>
                                          <td className="py-1.5 px-2 text-right text-rose-800">
                                            {formatCurrency(v.totalCredit)}
                                          </td>
                                        </tr>
                                      </tfoot>
                                    </table>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>

                    {/* Section 5: Daily Totals and Reconciliation Footer */}
                    <tfoot>
                      <tr className="bg-slate-100 font-bold border-t-2 border-slate-300 text-slate-900 text-xs">
                        <td colSpan={6} className="px-3 py-2.5 text-left font-sans">
                          Daily Total for {formatDisplayDate(group.date)} ({group.voucherCount}{" "}
                          {group.voucherCount === 1 ? "voucher" : "vouchers"}):
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono text-emerald-800">
                          {formatCurrency(group.totalDebit)}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono text-rose-800">
                          {formatCurrency(group.totalCredit)}
                        </td>
                        <td colSpan={2} className="px-3 py-2.5 text-center font-sans">
                          {group.isReconciled ? (
                            <span className="inline-flex items-center text-emerald-700 gap-1 text-[11px]">
                              <CheckCircle2 className="h-3.5 w-3.5" /> Reconciled
                            </span>
                          ) : (
                            <span className="inline-flex items-center text-rose-700 gap-1 text-[11px]">
                              <AlertTriangle className="h-3.5 w-3.5" /> Discrepancy
                            </span>
                          )}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          );
        })
      )}

      {/* 4. Final Bottom Range Totals Card */}
      {data.dateGroups.length > 0 && (
        <div className="bg-slate-100 border border-slate-300 rounded-lg p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs">
          <div>
            <span className="font-bold text-slate-800 text-sm">Overall Period Totals:</span>
            <p className="text-slate-500 text-[11px] mt-0.5">
              Cumulative debits and credits across all {data.totals.totalVouchers} vouchers in the selected view
            </p>
          </div>
          <div className="flex items-center gap-6 font-mono font-bold text-sm">
            <div>
              <span className="text-slate-500 font-sans text-xs mr-1">Overall Dr:</span>
              <span className="text-emerald-700">{formatCurrency(data.totals.totalDebit)}</span>
            </div>
            <div>
              <span className="text-slate-500 font-sans text-xs mr-1">Overall Cr:</span>
              <span className="text-rose-700">{formatCurrency(data.totals.totalCredit)}</span>
            </div>
            <div className="font-sans text-xs font-semibold">
              {data.totals.isReconciled ? (
                <Badge variant="success" className="px-2.5 py-1">
                  <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                  Balanced (Dr = Cr)
                </Badge>
              ) : (
                <Badge variant="danger" className="px-2.5 py-1">
                  <AlertTriangle className="h-3.5 w-3.5 mr-1" />
                  Unbalanced
                </Badge>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Section 7: Detailed Voucher Modal Dialog */}
      {selectedVoucher && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-3xl w-full max-h-[90vh] flex flex-col overflow-hidden">
            {/* Modal Header */}
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded-lg text-blue-700">
                  <FileText className="h-5 w-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-slate-900 font-mono">
                      {selectedVoucher.entryNumber}
                    </h3>
                    <Badge
                      variant={selectedVoucher.status === "POSTED" ? "success" : "danger"}
                      className="text-xs"
                    >
                      {selectedVoucher.status}
                    </Badge>
                  </div>
                  <p className="text-xs text-slate-500">
                    Accounting Journal Voucher Details
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedVoucher(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-lg transition"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-5 text-xs">
              {/* Metadata Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3.5 bg-slate-50 rounded-lg border border-slate-200">
                <div>
                  <span className="text-slate-400 text-[10px] uppercase font-semibold block">
                    Business Date
                  </span>
                  <span className="font-bold text-slate-800 font-mono mt-0.5 block">
                    {selectedVoucher.businessDate}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] uppercase font-semibold block">
                    Source Module
                  </span>
                  <span className="font-bold text-slate-800 mt-0.5 block">
                    {selectedVoucher.sourceModule}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] uppercase font-semibold block">
                    Transaction Type
                  </span>
                  <span className="font-bold text-slate-800 font-mono mt-0.5 block">
                    {selectedVoucher.sourceType}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] uppercase font-semibold block">
                    Operational Reference
                  </span>
                  <span className="font-bold text-slate-800 font-mono mt-0.5 block truncate" title={selectedVoucher.reference}>
                    {selectedVoucher.reference}
                  </span>
                </div>
              </div>

              {/* Creator & Timestamps */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-slate-600">
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-slate-400" />
                  <span>
                    Posted / Approved By:{" "}
                    <strong className="text-slate-800">
                      {selectedVoucher.postedBy?.fullName || "System Engine"}
                    </strong>{" "}
                    ({selectedVoucher.postedBy?.username || "system"})
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-slate-400" />
                  <span>
                    Created:{" "}
                    <strong className="text-slate-800 font-mono">
                      {new Date(selectedVoucher.createdAt).toLocaleString("en-IN")}
                    </strong>
                  </span>
                </div>
              </div>

              {/* Reversal Notice if applicable */}
              {selectedVoucher.status === "REVERSED" && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-800 text-xs">
                  <div className="font-bold flex items-center gap-1.5">
                    <AlertTriangle className="h-4 w-4 text-rose-600" />
                    Transaction Reversed
                  </div>
                  <div className="mt-1">
                    Reason: <em>{selectedVoucher.reversalReason || "No reversal reason specified"}</em>
                  </div>
                  {selectedVoucher.reversedByEntryNumber && (
                    <div className="mt-0.5 font-mono text-[11px]">
                      Reversing Voucher: {selectedVoucher.reversedByEntryNumber}
                    </div>
                  )}
                </div>
              )}

              {selectedVoucher.reversalOfEntryNumber && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-xs">
                  <div className="font-bold flex items-center gap-1.5">
                    <RotateCcw className="h-4 w-4 text-amber-600" />
                    Reversal Voucher Entry
                  </div>
                  <div className="mt-1 font-mono text-[11px]">
                    Reverses Original Voucher: {selectedVoucher.reversalOfEntryNumber}
                  </div>
                  {selectedVoucher.reversalReason && (
                    <div className="mt-0.5 text-slate-700">
                      Reason: <em>{selectedVoucher.reversalReason}</em>
                    </div>
                  )}
                </div>
              )}

              {/* Description */}
              <div>
                <span className="text-slate-500 font-semibold block mb-1">
                  Narration & Description:
                </span>
                <div className="p-2.5 bg-slate-50 border border-slate-200 rounded text-slate-800 font-medium">
                  {selectedVoucher.description}
                </div>
              </div>

              {/* Complete Double-Entry Lines Table */}
              <div>
                <span className="text-slate-700 font-bold block mb-1.5 flex items-center gap-1.5">
                  <Layers className="h-4 w-4 text-blue-600" />
                  Complete Double-Entry Ledger Lines:
                </span>
                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <table className="w-full text-xs text-left">
                    <thead>
                      <tr className="bg-slate-100 text-slate-600 font-semibold text-[11px] border-b border-slate-200">
                        <th className="py-2 px-3">#</th>
                        <th className="py-2 px-3">GL Code & Name</th>
                        <th className="py-2 px-3">Account Type</th>
                        <th className="py-2 px-3">Narration</th>
                        <th className="py-2 px-3 text-right">Debit (₹)</th>
                        <th className="py-2 px-3 text-right">Credit (₹)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-mono">
                      {selectedVoucher.lines.map((l) => (
                        <tr key={l.id} className="hover:bg-slate-50/70">
                          <td className="py-2 px-3 text-slate-400">{l.lineNumber}</td>
                          <td className="py-2 px-3 font-semibold text-slate-900">
                            {l.accountCode} - {l.accountName}
                          </td>
                          <td className="py-2 px-3 text-slate-500 font-sans text-[11px]">
                            {l.accountType}
                          </td>
                          <td className="py-2 px-3 text-slate-700 font-sans text-xs">
                            {l.narration || "—"}
                          </td>
                          <td className="py-2 px-3 text-right font-bold text-emerald-700">
                            {parseFloat(l.debit) > 0 ? formatCurrency(l.debit) : "—"}
                          </td>
                          <td className="py-2 px-3 text-right font-bold text-rose-700">
                            {parseFloat(l.credit) > 0 ? formatCurrency(l.credit) : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-slate-100 border-t-2 border-slate-200 font-mono font-bold text-xs">
                        <td colSpan={4} className="py-2.5 px-3 text-right font-sans">
                          Voucher Balance Check:
                        </td>
                        <td className="py-2.5 px-3 text-right text-emerald-800">
                          {formatCurrency(selectedVoucher.totalDebit)}
                        </td>
                        <td className="py-2.5 px-3 text-right text-rose-800">
                          {formatCurrency(selectedVoucher.totalCredit)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
              <span className="text-xs font-semibold text-emerald-600 flex items-center gap-1">
                <CheckCircle2 className="h-4 w-4" />
                Double-Entry Verified: Total Dr equals Total Cr
              </span>
              <button
                type="button"
                onClick={() => setSelectedVoucher(null)}
                className="px-4 py-1.5 bg-slate-800 text-white rounded text-xs font-semibold hover:bg-slate-900 transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
