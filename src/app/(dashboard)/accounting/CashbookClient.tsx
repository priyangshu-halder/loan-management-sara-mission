"use client";

import React, { useState } from "react";
import { Download, AlertTriangle, Filter, Calendar } from "lucide-react";

export interface CashbookDailyRecord {
  date: string;
  opening: string;
  advance: string;
  repayment: string;
  rd: string;
  fd: string;
  bankTransferReceived: string;
  loanReceived: string;
  miscellaneousReceived: string;
  totalReceived: string;
  savingsWithdrawal: string;
  bankTransferPayment: string;
  loanPayment: string;
  expenses: string;
  miscellaneousPayment: string;
  totalPayment: string;
  cashInHand: string;
  isNegative: boolean;
  hasTransactions: boolean;
}

export interface CashbookSummaryRow {
  opening: string;
  advance: string;
  repayment: string;
  rd: string;
  fd: string;
  bankTransferReceived: string;
  loanReceived: string;
  miscellaneousReceived: string;
  totalReceived: string;
  savingsWithdrawal: string;
  bankTransferPayment: string;
  loanPayment: string;
  expenses: string;
  miscellaneousPayment: string;
  totalPayment: string;
  cashInHand: string;
  isNegative: boolean;
}

export interface CashbookData {
  cashAccount: {
    id: string;
    code: string;
    name: string;
    accountType: string;
    glCode: string;
  };
  period: {
    startDate: string;
    endDate: string;
  };
  openingBalance: string;
  totalReceipts: string;
  totalPayments: string;
  closingBalance: string;
  dailyRecords: CashbookDailyRecord[];
  summaryRow: CashbookSummaryRow;
}

export interface CashAccountOption {
  id: string;
  code: string;
  name: string;
  accountType: string;
}

interface CashbookClientProps {
  data: CashbookData;
  cashAccounts: CashAccountOption[];
  selectedCashAccountId: string;
  startDate: string;
  endDate: string;
  earliestDate: string;
}

export default function CashbookClient({
  data,
  cashAccounts,
  selectedCashAccountId,
  startDate,
  endDate,
  earliestDate,
}: CashbookClientProps) {
  const [filterStartDate, setFilterStartDate] = useState(startDate);
  const [filterEndDate, setFilterEndDate] = useState(endDate);
  const [filterAccountId, setFilterAccountId] = useState(selectedCashAccountId);

  const formatCurrency = (val: string | number, isBalance = false): string => {
    const num = typeof val === "string" ? parseFloat(val) : val;
    if (isNaN(num)) return "—";
    if (!isBalance && Math.abs(num) < 0.0001) return "—";
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(num);
  };

  const handleExportCSV = () => {
    const headers = [
      "Date",
      "Opening",
      "Advance",
      "Repayment",
      "RD",
      "FD",
      "Bank Transfer (Received)",
      "Loan",
      "Miscellaneous (Received)",
      "Total Received",
      "Savings Withdrawal",
      "Bank Transfer (Payment)",
      "Loan Payment",
      "Expenses",
      "Miscellaneous (Payment)",
      "Total Payment",
      "Cash in Hand",
    ];

    const rows = data.dailyRecords.map((r) => [
      r.date,
      r.opening,
      r.advance,
      r.repayment,
      r.rd,
      r.fd,
      r.bankTransferReceived,
      r.loanReceived,
      r.miscellaneousReceived,
      r.totalReceived,
      r.savingsWithdrawal,
      r.bankTransferPayment,
      r.loanPayment,
      r.expenses,
      r.miscellaneousPayment,
      r.totalPayment,
      r.cashInHand,
    ]);

    // Append Summary Row
    const s = data.summaryRow;
    rows.push([
      "Period Summary",
      s.opening,
      s.advance,
      s.repayment,
      s.rd,
      s.fd,
      s.bankTransferReceived,
      s.loanReceived,
      s.miscellaneousReceived,
      s.totalReceived,
      s.savingsWithdrawal,
      s.bankTransferPayment,
      s.loanPayment,
      s.expenses,
      s.miscellaneousPayment,
      s.totalPayment,
      s.cashInHand,
    ]);

    const csvContent =
      "data:text/csv;charset=utf-8," +
      [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute(
      "download",
      `cashbook_${data.cashAccount.code}_${data.period.startDate}_to_${data.period.endDate}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const hasNegativeDay = data.dailyRecords.some((r) => r.isNegative) || data.summaryRow.isNegative;

  return (
    <div className="space-y-4">
      {/* Controls Bar */}
      <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <form
          method="GET"
          action="/accounting"
          className="flex flex-wrap items-center gap-3 text-xs"
        >
          <input type="hidden" name="tab" value="cashbook" />

          {/* Account Selector */}
          <div className="flex items-center gap-1.5">
            <label htmlFor="cashAccountId" className="font-semibold text-slate-700">
              Account:
            </label>
            <select
              id="cashAccountId"
              name="cashAccountId"
              value={filterAccountId}
              onChange={(e) => setFilterAccountId(e.target.value)}
              className="border border-slate-300 rounded px-2.5 py-1.5 bg-white text-slate-800 font-medium focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
            >
              {cashAccounts.map((ca) => (
                <option key={ca.id} value={ca.id}>
                  {ca.code} - {ca.name} ({ca.accountType})
                </option>
              ))}
            </select>
          </div>

          {/* Starting Date */}
          <div className="flex items-center gap-1.5">
            <label htmlFor="startDate" className="font-semibold text-slate-700">
              Starting Date:
            </label>
            <input
              id="startDate"
              type="date"
              name="startDate"
              value={filterStartDate}
              onChange={(e) => setFilterStartDate(e.target.value)}
              className="border border-slate-300 rounded px-2.5 py-1.5 bg-white text-slate-800 focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          {/* Ending Date */}
          <div className="flex items-center gap-1.5">
            <label htmlFor="endDate" className="font-semibold text-slate-700">
              Ending Date:
            </label>
            <input
              id="endDate"
              type="date"
              name="endDate"
              value={filterEndDate}
              onChange={(e) => setFilterEndDate(e.target.value)}
              className="border border-slate-300 rounded px-2.5 py-1.5 bg-white text-slate-800 focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <button
            type="submit"
            className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white font-semibold rounded hover:bg-blue-700 transition"
          >
            <Filter className="h-3.5 w-3.5" />
            Apply Filter
          </button>
        </form>

        {/* Quick Range & Export */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              window.location.href = `/accounting?tab=cashbook&cashAccountId=${filterAccountId}&startDate=${earliestDate}&endDate=${new Date().toISOString().slice(0, 10)}`;
            }}
            className="px-2.5 py-1 border border-slate-200 rounded text-xs font-medium text-slate-600 hover:bg-slate-50 transition"
          >
            All Time
          </button>
          <button
            type="button"
            onClick={handleExportCSV}
            className="flex items-center gap-1 px-2.5 py-1 bg-slate-100 border border-slate-200 rounded text-xs font-medium text-slate-700 hover:bg-slate-200 transition"
          >
            <Download className="h-3.5 w-3.5" />
            Export CSV
          </button>
        </div>
      </div>

      {/* Discrepancy / Negative Balance Alert */}
      {hasNegativeDay && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg flex items-center gap-2 text-rose-800 text-xs font-semibold">
          <AlertTriangle className="h-4 w-4 text-rose-600 flex-shrink-0" />
          <span>
            Warning: Negative Cash in Hand detected on one or more dates. Physical cash cannot be
            negative; review highlighted rows for missing cash receipts or excessive voucher postings.
          </span>
        </div>
      )}

      {/* Single Table Interface */}
      <div className="overflow-x-auto max-h-[75vh] border border-slate-300 rounded-lg shadow-sm bg-white">
        <table className="w-full border-collapse text-xs text-left">
          {/* Header */}
          <thead className="sticky top-0 z-20 bg-slate-50 text-slate-700 select-none">
            {/* Top Super-Header Grouping */}
            <tr className="border-b border-slate-300">
              <th
                rowSpan={2}
                className="sticky left-0 z-30 bg-slate-100 border-r border-b border-slate-300 px-3 py-2 font-bold text-slate-800 text-center whitespace-nowrap min-w-[105px]"
              >
                Date
              </th>
              <th
                rowSpan={2}
                className="bg-slate-100 border-r border-b border-slate-300 px-3 py-2 font-bold text-slate-800 text-right whitespace-nowrap min-w-[110px]"
              >
                Opening (₹)
              </th>
              <th
                colSpan={8}
                className="bg-emerald-100/90 text-emerald-950 font-bold border-r border-b border-emerald-300 px-3 py-1.5 text-center uppercase tracking-wider text-[11px]"
              >
                RECEIVED
              </th>
              <th
                colSpan={6}
                className="bg-rose-100/90 text-rose-950 font-bold border-r border-b border-rose-300 px-3 py-1.5 text-center uppercase tracking-wider text-[11px]"
              >
                PAYMENT
              </th>
              <th
                rowSpan={2}
                className="bg-blue-100 text-blue-950 font-bold border-b border-blue-300 px-3 py-2 text-right whitespace-nowrap min-w-[120px]"
              >
                Cash in Hand (₹)
              </th>
            </tr>

            {/* Sub-Header Row: 17 Columns */}
            <tr className="border-b border-slate-300 text-[11px] bg-slate-50">
              {/* Received Columns */}
              <th className="px-2.5 py-1.5 text-right font-semibold text-slate-700 border-r border-slate-200 min-w-[90px]">
                Advance
              </th>
              <th className="px-2.5 py-1.5 text-right font-semibold text-slate-700 border-r border-slate-200 min-w-[95px]">
                Repayment
              </th>
              <th className="px-2.5 py-1.5 text-right font-semibold text-slate-700 border-r border-slate-200 min-w-[85px]">
                RD
              </th>
              <th className="px-2.5 py-1.5 text-right font-semibold text-slate-700 border-r border-slate-200 min-w-[85px]">
                FD
              </th>
              <th className="px-2.5 py-1.5 text-right font-semibold text-slate-700 border-r border-slate-200 min-w-[130px]">
                Bank Transfer (Received)
              </th>
              <th className="px-2.5 py-1.5 text-right font-semibold text-slate-700 border-r border-slate-200 min-w-[85px]">
                Loan
              </th>
              <th className="px-2.5 py-1.5 text-right font-semibold text-slate-700 border-r border-slate-200 min-w-[130px]">
                Miscellaneous (Received)
              </th>
              <th className="px-2.5 py-1.5 text-right font-bold text-emerald-900 bg-emerald-50/90 border-r border-emerald-300 min-w-[110px]">
                Total Received
              </th>

              {/* Payment Columns */}
              <th className="px-2.5 py-1.5 text-right font-semibold text-slate-700 border-r border-slate-200 min-w-[115px]">
                Savings Withdrawal
              </th>
              <th className="px-2.5 py-1.5 text-right font-semibold text-slate-700 border-r border-slate-200 min-w-[130px]">
                Bank Transfer (Payment)
              </th>
              <th className="px-2.5 py-1.5 text-right font-semibold text-slate-700 border-r border-slate-200 min-w-[95px]">
                Loan Payment
              </th>
              <th className="px-2.5 py-1.5 text-right font-semibold text-slate-700 border-r border-slate-200 min-w-[90px]">
                Expenses
              </th>
              <th className="px-2.5 py-1.5 text-right font-semibold text-slate-700 border-r border-slate-200 min-w-[130px]">
                Miscellaneous (Payment)
              </th>
              <th className="px-2.5 py-1.5 text-right font-bold text-rose-900 bg-rose-50/90 border-r border-rose-300 min-w-[110px]">
                Total Payment
              </th>
            </tr>
          </thead>

          {/* Table Body */}
          <tbody className="divide-y divide-slate-200">
            {data.dailyRecords.length === 0 ? (
              <tr>
                <td colSpan={17} className="px-4 py-8 text-center text-slate-500">
                  No records found for the selected date range.
                </td>
              </tr>
            ) : (
              data.dailyRecords.map((r) => {
                const rowNegative = r.isNegative;
                return (
                  <tr
                    key={r.date}
                    className={`transition-colors ${
                      rowNegative
                        ? "bg-rose-50/80 hover:bg-rose-100/90"
                        : !r.hasTransactions
                        ? "bg-slate-50/30 text-slate-400 hover:bg-slate-100/50"
                        : "hover:bg-slate-50/80"
                    }`}
                  >
                    {/* 1. Date (Sticky Column) */}
                    <td
                      className={`sticky left-0 z-10 px-3 py-2 font-mono font-medium text-slate-900 border-r border-slate-300 whitespace-nowrap ${
                        rowNegative ? "bg-rose-100" : "bg-white"
                      }`}
                    >
                      {r.date}
                    </td>

                    {/* 2. Opening */}
                    <td className="px-2.5 py-2 text-right font-mono text-slate-800 border-r border-slate-200 font-medium">
                      {formatCurrency(r.opening, true)}
                    </td>

                    {/* 3-9. Received Categories */}
                    <td className="px-2.5 py-2 text-right font-mono text-slate-700 border-r border-slate-200">
                      {formatCurrency(r.advance)}
                    </td>
                    <td className="px-2.5 py-2 text-right font-mono text-slate-700 border-r border-slate-200">
                      {formatCurrency(r.repayment)}
                    </td>
                    <td className="px-2.5 py-2 text-right font-mono text-slate-700 border-r border-slate-200">
                      {formatCurrency(r.rd)}
                    </td>
                    <td className="px-2.5 py-2 text-right font-mono text-slate-700 border-r border-slate-200">
                      {formatCurrency(r.fd)}
                    </td>
                    <td className="px-2.5 py-2 text-right font-mono text-slate-700 border-r border-slate-200">
                      {formatCurrency(r.bankTransferReceived)}
                    </td>
                    <td className="px-2.5 py-2 text-right font-mono text-slate-700 border-r border-slate-200">
                      {formatCurrency(r.loanReceived)}
                    </td>
                    <td className="px-2.5 py-2 text-right font-mono text-slate-700 border-r border-slate-200">
                      {formatCurrency(r.miscellaneousReceived)}
                    </td>

                    {/* 10. Total Received (Highlighted) */}
                    <td className="px-2.5 py-2 text-right font-mono font-bold text-emerald-800 bg-emerald-50/60 border-r border-emerald-200">
                      {formatCurrency(r.totalReceived)}
                    </td>

                    {/* 11-15. Payment Categories */}
                    <td className="px-2.5 py-2 text-right font-mono text-slate-700 border-r border-slate-200">
                      {formatCurrency(r.savingsWithdrawal)}
                    </td>
                    <td className="px-2.5 py-2 text-right font-mono text-slate-700 border-r border-slate-200">
                      {formatCurrency(r.bankTransferPayment)}
                    </td>
                    <td className="px-2.5 py-2 text-right font-mono text-slate-700 border-r border-slate-200">
                      {formatCurrency(r.loanPayment)}
                    </td>
                    <td className="px-2.5 py-2 text-right font-mono text-slate-700 border-r border-slate-200">
                      {formatCurrency(r.expenses)}
                    </td>
                    <td className="px-2.5 py-2 text-right font-mono text-slate-700 border-r border-slate-200">
                      {formatCurrency(r.miscellaneousPayment)}
                    </td>

                    {/* 16. Total Payment (Highlighted) */}
                    <td className="px-2.5 py-2 text-right font-mono font-bold text-rose-800 bg-rose-50/60 border-r border-rose-200">
                      {formatCurrency(r.totalPayment)}
                    </td>

                    {/* 17. Cash in Hand */}
                    <td
                      className={`px-2.5 py-2 text-right font-mono font-bold ${
                        rowNegative
                          ? "bg-rose-200 text-rose-950 border border-rose-400 font-extrabold"
                          : "bg-blue-50/60 text-blue-950"
                      }`}
                    >
                      {formatCurrency(r.cashInHand, true)}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>

          {/* Sticky Summary Row Footer */}
          <tfoot className="sticky bottom-0 z-20 bg-slate-900 text-white font-bold border-t-2 border-slate-700">
            <tr>
              {/* Sticky Left "Period Summary" */}
              <td className="sticky left-0 z-30 bg-slate-900 px-3 py-2.5 text-left font-bold text-slate-200 border-r border-slate-700 whitespace-nowrap">
                Period Summary
              </td>

              {/* Initial Period Opening (NOT SUMMED ACROSS DAYS) */}
              <td className="px-2.5 py-2.5 text-right font-mono text-slate-200 border-r border-slate-700">
                {formatCurrency(data.summaryRow.opening, true)}
              </td>

              {/* Received Categories Sums */}
              <td className="px-2.5 py-2.5 text-right font-mono text-slate-300 border-r border-slate-800">
                {formatCurrency(data.summaryRow.advance)}
              </td>
              <td className="px-2.5 py-2.5 text-right font-mono text-slate-300 border-r border-slate-800">
                {formatCurrency(data.summaryRow.repayment)}
              </td>
              <td className="px-2.5 py-2.5 text-right font-mono text-slate-300 border-r border-slate-800">
                {formatCurrency(data.summaryRow.rd)}
              </td>
              <td className="px-2.5 py-2.5 text-right font-mono text-slate-300 border-r border-slate-800">
                {formatCurrency(data.summaryRow.fd)}
              </td>
              <td className="px-2.5 py-2.5 text-right font-mono text-slate-300 border-r border-slate-800">
                {formatCurrency(data.summaryRow.bankTransferReceived)}
              </td>
              <td className="px-2.5 py-2.5 text-right font-mono text-slate-300 border-r border-slate-800">
                {formatCurrency(data.summaryRow.loanReceived)}
              </td>
              <td className="px-2.5 py-2.5 text-right font-mono text-slate-300 border-r border-slate-800">
                {formatCurrency(data.summaryRow.miscellaneousReceived)}
              </td>

              {/* Total Received Summary (Highlighted Emerald) */}
              <td className="px-2.5 py-2.5 text-right font-mono font-bold text-emerald-400 bg-slate-800 border-r border-slate-700">
                {formatCurrency(data.summaryRow.totalReceived)}
              </td>

              {/* Payment Categories Sums */}
              <td className="px-2.5 py-2.5 text-right font-mono text-slate-300 border-r border-slate-800">
                {formatCurrency(data.summaryRow.savingsWithdrawal)}
              </td>
              <td className="px-2.5 py-2.5 text-right font-mono text-slate-300 border-r border-slate-800">
                {formatCurrency(data.summaryRow.bankTransferPayment)}
              </td>
              <td className="px-2.5 py-2.5 text-right font-mono text-slate-300 border-r border-slate-800">
                {formatCurrency(data.summaryRow.loanPayment)}
              </td>
              <td className="px-2.5 py-2.5 text-right font-mono text-slate-300 border-r border-slate-800">
                {formatCurrency(data.summaryRow.expenses)}
              </td>
              <td className="px-2.5 py-2.5 text-right font-mono text-slate-300 border-r border-slate-800">
                {formatCurrency(data.summaryRow.miscellaneousPayment)}
              </td>

              {/* Total Payment Summary (Highlighted Rose) */}
              <td className="px-2.5 py-2.5 text-right font-mono font-bold text-rose-400 bg-slate-800 border-r border-slate-700">
                {formatCurrency(data.summaryRow.totalPayment)}
              </td>

              {/* Final Cash in Hand of Last Date (NOT SUMMED ACROSS DAYS) */}
              <td
                className={`px-2.5 py-2.5 text-right font-mono font-extrabold ${
                  data.summaryRow.isNegative
                    ? "text-rose-400 bg-rose-950"
                    : "text-blue-300 bg-slate-800"
                }`}
              >
                {formatCurrency(data.summaryRow.cashInHand, true)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
