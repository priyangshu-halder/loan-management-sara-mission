"use client";

import React, { useState, useMemo } from "react";
import {
  FileSpreadsheet,
  Download,
  Calendar,
  Search,
  Filter,
  CheckCircle2,
  Clock,
  Building,
  User,
  ArrowRight,
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

interface GroupItem {
  id: string;
  name: string;
  code: string;
}

export interface SheetRecordItem {
  id: string;
  type: "PAID" | "DUE";
  date: string;
  receiptNumber: string;
  customerCode: string;
  customerName: string;
  phone: string;
  groupName: string;
  groupId: string | null;
  loanAccountNumber: string;
  schemeName: string;
  dueAmount: string;
  collectedAmount: string;
  paymentMode: string;
  status: string;
  collectorName?: string;
}

interface CollectionSheetClientProps {
  initialRecords: SheetRecordItem[];
  groups: GroupItem[];
}

export function CollectionSheetClient({
  initialRecords,
  groups,
}: CollectionSheetClientProps) {
  const todayStr = new Date().toISOString().slice(0, 10);

  // Period state
  const [startDate, setStartDate] = useState(todayStr);
  const [endDate, setEndDate] = useState(todayStr);
  const [statusFilter, setStatusFilter] = useState<"ALL" | "PAID" | "DUE">("ALL");
  const [selectedGroupId, setSelectedGroupId] = useState("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [isDownloading, setIsDownloading] = useState(false);

  // Quick preset helper
  function applyPreset(preset: "TODAY" | "YESTERDAY" | "THIS_WEEK" | "THIS_MONTH" | "PAST_30") {
    const d = new Date();
    if (preset === "TODAY") {
      const s = d.toISOString().slice(0, 10);
      setStartDate(s);
      setEndDate(s);
    } else if (preset === "YESTERDAY") {
      d.setDate(d.getDate() - 1);
      const s = d.toISOString().slice(0, 10);
      setStartDate(s);
      setEndDate(s);
    } else if (preset === "THIS_WEEK") {
      const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday
      const monday = new Date(d.setDate(diff));
      setStartDate(monday.toISOString().slice(0, 10));
      setEndDate(new Date().toISOString().slice(0, 10));
    } else if (preset === "THIS_MONTH") {
      const firstDay = new Date(d.getFullYear(), d.getMonth(), 1);
      setStartDate(firstDay.toISOString().slice(0, 10));
      setEndDate(new Date().toISOString().slice(0, 10));
    } else if (preset === "PAST_30") {
      d.setDate(d.getDate() - 30);
      setStartDate(d.toISOString().slice(0, 10));
      setEndDate(new Date().toISOString().slice(0, 10));
    }
  }

  // Filter records based on selected period and filters
  const filteredRecords = useMemo(() => {
    return initialRecords.filter((r) => {
      // Date range check
      const inDateRange = r.date >= startDate && r.date <= endDate;
      // Status check
      const matchesStatus = statusFilter === "ALL" || r.type === statusFilter;
      // Group check
      const matchesGroup = selectedGroupId === "ALL" || r.groupId === selectedGroupId;
      // Search check
      const term = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !term ||
        r.customerName.toLowerCase().includes(term) ||
        r.customerCode.toLowerCase().includes(term) ||
        r.receiptNumber.toLowerCase().includes(term) ||
        r.loanAccountNumber.toLowerCase().includes(term);

      return inDateRange && matchesStatus && matchesGroup && matchesSearch;
    });
  }, [initialRecords, startDate, endDate, statusFilter, selectedGroupId, searchQuery]);

  // Summary Metrics
  const summary = useMemo(() => {
    let totalScheduled = 0;
    let totalCollected = 0;
    let paidCount = 0;
    let dueCount = 0;

    for (const r of filteredRecords) {
      totalScheduled += parseFloat(r.dueAmount || "0");
      totalCollected += parseFloat(r.collectedAmount || "0");
      if (r.type === "PAID") paidCount++;
      if (r.type === "DUE") dueCount++;
    }

    const pending = Math.max(0, totalScheduled - totalCollected);
    const efficiency =
      totalScheduled > 0 ? ((totalCollected / totalScheduled) * 100).toFixed(1) : "100.0";

    return {
      totalScheduled,
      totalCollected,
      pending,
      efficiency,
      paidCount,
      dueCount,
    };
  }, [filteredRecords]);

  function handleDownloadCsv() {
    setIsDownloading(true);
    const params = new URLSearchParams({
      startDate,
      endDate,
      type: statusFilter,
    });
    if (selectedGroupId !== "ALL") {
      params.set("groupId", selectedGroupId);
    }
    window.location.href = `/api/collections/reports/export?${params.toString()}`;
    setTimeout(() => setIsDownloading(false), 2000);
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Banner */}
      <div className="bg-slate-900 text-white rounded-xl p-6 shadow-sm flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-900/60 text-[11px] font-semibold tracking-wider uppercase mb-2 text-emerald-200">
            <FileSpreadsheet className="h-3 w-3" />
            Periodic Field Audit Roster
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Collection Sheet</h1>
          <p className="text-xs text-slate-300 mt-1 max-w-2xl">
            Inspect scheduled installments and collections for customized time periods and download official CSV collection statements.
          </p>
        </div>

        <Button
          onClick={handleDownloadCsv}
          disabled={isDownloading}
          className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-md shrink-0"
        >
          <Download className="h-4 w-4" />
          <span>{isDownloading ? "Generating CSV..." : "Download Collection Sheet (CSV)"}</span>
        </Button>
      </div>

      {/* Period Selection Controls */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Presets */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-slate-500 mr-1">Period:</span>
            <button
              onClick={() => applyPreset("TODAY")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                startDate === todayStr && endDate === todayStr
                  ? "bg-blue-600 text-white shadow-xs"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              Today
            </button>
            <button
              onClick={() => applyPreset("YESTERDAY")}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200 transition-all"
            >
              Yesterday
            </button>
            <button
              onClick={() => applyPreset("THIS_WEEK")}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200 transition-all"
            >
              This Week
            </button>
            <button
              onClick={() => applyPreset("THIS_MONTH")}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200 transition-all"
            >
              This Month
            </button>
            <button
              onClick={() => applyPreset("PAST_30")}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200 transition-all"
            >
              Past 30 Days
            </button>
          </div>

          {/* Date Pickers */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-slate-500 font-semibold">From:</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="text-xs px-2.5 py-1.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-slate-500 font-semibold">To:</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="text-xs px-2.5 py-1.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>

        {/* Filters Row: Status, Group, Search */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pt-2 border-t border-slate-100">
          <div className="flex flex-wrap items-center gap-3">
            {/* Status */}
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-slate-500 font-semibold">Status:</span>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as "ALL" | "PAID" | "DUE")}
                className="text-xs px-2.5 py-1.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
              >
                <option value="ALL">All Records</option>
                <option value="PAID">Collected (Paid)</option>
                <option value="DUE">Pending Due</option>
              </select>
            </div>

            {/* Group */}
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-slate-500 font-semibold">Group:</span>
              <select
                value={selectedGroupId}
                onChange={(e) => setSelectedGroupId(e.target.value)}
                className="text-xs px-2.5 py-1.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white min-w-[160px]"
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

          {/* Search */}
          <div className="relative min-w-[240px]">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search member, loan #, receipt #..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full text-xs pl-8 pr-3 py-1.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>
      </div>

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-4 bg-white border border-slate-200 shadow-sm">
          <span className="text-xs font-semibold uppercase text-slate-500">Scheduled Due</span>
          <div className="mt-1 text-xl font-bold text-slate-900">
            ₹{summary.totalScheduled.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">{filteredRecords.length} Total Installments</div>
        </Card>

        <Card className="p-4 bg-white border border-slate-200 shadow-sm">
          <span className="text-xs font-semibold uppercase text-slate-500">Collected Amount</span>
          <div className="mt-1 text-xl font-bold text-emerald-700">
            ₹{summary.totalCollected.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
          </div>
          <div className="text-[11px] text-emerald-600 mt-0.5">{summary.paidCount} Receipts Completed</div>
        </Card>

        <Card className="p-4 bg-white border border-slate-200 shadow-sm">
          <span className="text-xs font-semibold uppercase text-slate-500">Pending Arrears</span>
          <div className="mt-1 text-xl font-bold text-rose-700">
            ₹{summary.pending.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
          </div>
          <div className="text-[11px] text-rose-600 mt-0.5">{summary.dueCount} Pending Dues</div>
        </Card>

        <Card className="p-4 bg-white border border-slate-200 shadow-sm">
          <span className="text-xs font-semibold uppercase text-slate-500">Collection Efficiency</span>
          <div className="mt-1 text-xl font-bold text-blue-700">
            {summary.efficiency}%
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">Period Recovery Rate</div>
        </Card>
      </div>

      {/* Collection Sheet Table */}
      <Card className="bg-white border border-slate-200 shadow-sm overflow-hidden">
        <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200 flex items-center justify-between text-xs text-slate-600">
          <span className="font-semibold flex items-center gap-1.5">
            <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
            Showing Collection Sheet for {startDate} to {endDate} ({filteredRecords.length} records)
          </span>
          <Button
            size="sm"
            variant="ghost"
            onClick={handleDownloadCsv}
            disabled={isDownloading}
            className="text-xs text-emerald-700 hover:text-emerald-900 font-semibold"
          >
            Export as CSV →
          </Button>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Receipt / Ref</TableHead>
              <TableHead>Borrower</TableHead>
              <TableHead>Center / Group</TableHead>
              <TableHead>Loan Account</TableHead>
              <TableHead>Scheduled Due</TableHead>
              <TableHead>Collected</TableHead>
              <TableHead>Mode</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredRecords.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="p-0">
                  <TableEmptyState message="No collection records found for the selected period and filters. Adjust your dates or filter options." />
                </TableCell>
              </TableRow>
            ) : (
              filteredRecords.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="text-xs font-medium text-slate-700">
                    {r.date}
                  </TableCell>
                  <TableCell className="font-mono text-xs font-semibold text-slate-900">
                    {r.receiptNumber || "—"}
                  </TableCell>
                  <TableCell>
                    <div className="font-semibold text-slate-900 text-xs">{r.customerName}</div>
                    <div className="text-[11px] text-slate-500 font-mono">{r.customerCode}</div>
                  </TableCell>
                  <TableCell className="text-xs text-slate-700">
                    {r.groupName}
                  </TableCell>
                  <TableCell>
                    <div className="font-mono text-xs font-bold text-slate-900">
                      {r.loanAccountNumber}
                    </div>
                    <div className="text-[10px] text-slate-400">{r.schemeName}</div>
                  </TableCell>
                  <TableCell className="text-xs font-semibold text-slate-800">
                    ₹{parseFloat(r.dueAmount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                  </TableCell>
                  <TableCell className="text-xs font-bold text-emerald-700">
                    {parseFloat(r.collectedAmount) > 0
                      ? `₹${parseFloat(r.collectedAmount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`
                      : "—"}
                  </TableCell>
                  <TableCell className="text-xs text-slate-600 font-medium">
                    {r.paymentMode || "—"}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={r.type === "PAID" ? "success" : "danger"}
                      className="text-[10px]"
                    >
                      {r.status}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
