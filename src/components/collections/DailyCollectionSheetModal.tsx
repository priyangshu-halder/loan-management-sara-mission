"use client";

import React from "react";
import { Printer, X, Download, FileSpreadsheet, Calendar, Users, Phone, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/Button";

export interface SheetClientItem {
  id: string;
  loanAccountNumber: string;
  principalOutstanding: string;
  customer: {
    id: string;
    customerCode: string;
    fullName: string;
    guardianName?: string | null;
    phone: string;
    groupId?: string | null;
    groupName: string;
    groupCode?: string | null;
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
  isCollected?: boolean;
  collectedAmount?: string;
  collectedMode?: string;
}

interface DailyCollectionSheetModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: SheetClientItem[];
  orgInfo: {
    name: string;
    gstin?: string;
    helpline?: string;
  };
  selectedDate: string;
  groupName?: string;
  collectorName?: string;
}

export function DailyCollectionSheetModal({
  isOpen,
  onClose,
  items,
  orgInfo,
  selectedDate,
  groupName = "ALL CENTERS & GROUPS",
  collectorName = "Field Collector",
}: DailyCollectionSheetModalProps) {
  if (!isOpen) return null;

  // Filter clients who have pending dues or were part of today's collection routine
  const sheetItems = items.filter((item) => {
    const due = item.currentInstallment ? parseFloat(item.currentInstallment.remainingDue) : 0;
    return due > 0 || item.isCollected;
  });

  const totalDueAmount = sheetItems.reduce((acc, curr) => {
    return acc + (curr.currentInstallment ? parseFloat(curr.currentInstallment.remainingDue) : 0);
  }, 0);

  const totalCollectedAmount = sheetItems.reduce((acc, curr) => {
    if (curr.isCollected) {
      return acc + parseFloat(curr.collectedAmount || "0");
    }
    return acc;
  }, 0);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-2 sm:p-4 backdrop-blur-xs overflow-y-auto print:p-0 print:bg-white print:static print:overflow-visible">
      <div className="bg-white rounded-2xl max-w-5xl w-full max-h-[92vh] flex flex-col shadow-2xl text-slate-900 border border-slate-200 overflow-hidden print:max-w-none print:max-h-none print:shadow-none print:border-none print:rounded-none">
        
        {/* Modal Controls Header - Hidden on Print */}
        <div className="p-4 bg-slate-900 text-white flex items-center justify-between gap-3 shrink-0 print:hidden">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-emerald-600 text-white">
              <Printer className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold tracking-tight">Collector Daily Field Sheet & Due Roster</h2>
              <p className="text-[11px] text-slate-400">
                Ready to Print or Save as PDF (Tip: Select &quot;Save as PDF&quot; in destination)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={handlePrint}
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm"
            >
              <Printer className="h-3.5 w-3.5" />
              <span>Print / Save as PDF</span>
            </Button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Scrollable Printable Document Body */}
        <div className="overflow-y-auto p-6 space-y-4 print:p-0 print:overflow-visible flex-1">
          <div
            id="printable-collection-sheet"
            className="bg-white p-6 border border-slate-200 rounded-xl shadow-xs space-y-4 text-slate-900 print:border-none print:shadow-none print:p-0 print:space-y-3"
          >
            {/* Document Header */}
            <div className="border-b-2 border-slate-900 pb-3">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                <div>
                  <h1 className="text-xl font-black uppercase tracking-wider text-slate-900">
                    {orgInfo.name}
                  </h1>
                  <p className="text-xs font-semibold text-slate-600">
                    Microfinance & Lending Operations &bull; Central Office
                  </p>
                  {orgInfo.gstin && (
                    <p className="text-[10px] text-slate-500 font-mono">GSTIN: {orgInfo.gstin}</p>
                  )}
                </div>

                <div className="sm:text-right">
                  <div className="inline-block bg-slate-900 text-white px-3 py-1 rounded font-bold text-xs uppercase tracking-widest">
                    DAILY FIELD COLLECTION SHEET
                  </div>
                  <p className="text-xs font-bold text-slate-700 mt-1">
                    Collection Date: <span className="font-mono text-slate-900">{selectedDate}</span>
                  </p>
                  <p className="text-[10px] text-slate-500">
                    Generated: {new Date().toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" })}
                  </p>
                </div>
              </div>

              {/* Roster Metadata Bar */}
              <div className="mt-3 pt-2 border-t border-slate-200 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs bg-slate-50 p-2 rounded-lg font-medium print:bg-slate-50">
                <div>
                  <span className="text-slate-500 block text-[10px] uppercase font-bold">Center / Routine</span>
                  <span className="font-bold text-slate-900">{groupName}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px] uppercase font-bold">Field Collector</span>
                  <span className="font-bold text-slate-900">{collectorName}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px] uppercase font-bold">Scheduled Clients</span>
                  <span className="font-bold text-slate-900">{sheetItems.length} Borrower(s)</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px] uppercase font-bold">Total Due Amount</span>
                  <span className="font-bold text-emerald-700 text-sm">
                    ₹{totalDueAmount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            </div>

            {/* Client Repayment Schedule Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b-2 border-slate-800 bg-slate-100 text-[11px] font-black uppercase tracking-wider text-slate-800">
                    <th className="py-2 px-2 text-center w-8">#</th>
                    <th className="py-2 px-2.5">Client / Borrower Details</th>
                    <th className="py-2 px-2">Center / Group</th>
                    <th className="py-2 px-2">Loan No & Scheme</th>
                    <th className="py-2 px-2 text-center">Inst</th>
                    <th className="py-2 px-2.5 text-right font-black">Due (₹)</th>
                    <th className="py-2 px-3 text-center min-w-[120px]">Collected (₹)</th>
                    <th className="py-2 px-2 text-center min-w-[90px]">Mode</th>
                    <th className="py-2 px-3 text-center min-w-[110px]">Client Signature</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-slate-800 font-medium">
                  {sheetItems.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-8 text-center text-slate-500 italic">
                        No clients with pending dues scheduled for this selection.
                      </td>
                    </tr>
                  ) : (
                    sheetItems.map((item, idx) => {
                      const due = item.currentInstallment
                        ? parseFloat(item.currentInstallment.remainingDue).toFixed(2)
                        : "0.00";
                      const instNo = item.currentInstallment?.installmentNumber || "-";

                      return (
                        <tr
                          key={item.id}
                          className={`hover:bg-slate-50/80 transition-colors ${
                            idx % 2 === 1 ? "bg-slate-50/40" : "bg-white"
                          }`}
                        >
                          <td className="py-2.5 px-2 text-center font-mono font-bold text-slate-500">
                            {idx + 1}
                          </td>
                          <td className="py-2.5 px-2.5">
                            <div className="font-bold text-slate-900 text-xs">{item.customer.fullName}</div>
                            <div className="text-[10px] text-slate-500 font-mono">
                              {item.customer.customerCode} {item.customer.phone ? `• ${item.customer.phone}` : ""}
                            </div>
                            {item.customer.guardianName && (
                              <div className="text-[10px] text-slate-400">
                                S/O, W/O: {item.customer.guardianName}
                              </div>
                            )}
                          </td>
                          <td className="py-2.5 px-2 text-xs">
                            <span className="font-medium text-slate-700">{item.customer.groupName}</span>
                          </td>
                          <td className="py-2.5 px-2">
                            <div className="font-mono font-bold text-xs text-slate-900">
                              {item.loanAccountNumber}
                            </div>
                            <div className="text-[10px] text-slate-500">{item.scheme.name}</div>
                          </td>
                          <td className="py-2.5 px-2 text-center font-mono font-bold text-xs">
                            #{instNo}
                          </td>
                          <td className="py-2.5 px-2.5 text-right font-mono font-black text-xs text-slate-900">
                            ₹{parseFloat(due).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            {item.isCollected ? (
                              <span className="inline-block px-2 py-0.5 rounded font-mono font-bold text-emerald-800 bg-emerald-100 text-[11px]">
                                ₹{item.collectedAmount} [PAID]
                              </span>
                            ) : (
                              <div className="border-b border-dashed border-slate-400 h-5 w-24 mx-auto flex items-end justify-center font-mono text-[10px] text-slate-400">
                                ₹ __________
                              </div>
                            )}
                          </td>
                          <td className="py-2.5 px-2 text-center text-[10px]">
                            {item.isCollected ? (
                              <span className="font-bold text-slate-700">{item.collectedMode || "CASH"}</span>
                            ) : (
                              <div className="inline-flex items-center gap-1.5 text-slate-600">
                                <span>[ ] Cash</span>
                                <span>[ ] UPI</span>
                              </div>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <div className="border-b border-slate-300 h-6 w-24 mx-auto" />
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Summary & Sign-off Footer */}
            <div className="pt-4 border-t-2 border-slate-800 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                {/* Collection Summary Box */}
                <div className="p-3 bg-slate-50 border border-slate-300 rounded-lg space-y-1.5 font-medium">
                  <h4 className="font-bold uppercase tracking-wider text-[11px] text-slate-700">
                    Field Collection Reconciliation
                  </h4>
                  <div className="flex justify-between">
                    <span className="text-slate-600">Total Scheduled Demand:</span>
                    <span className="font-mono font-bold text-slate-900">
                      ₹{totalDueAmount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">Total Actual Collected:</span>
                    <span className="font-mono font-bold text-emerald-700">
                      ₹{totalCollectedAmount > 0 ? totalCollectedAmount.toLocaleString("en-IN", { minimumFractionDigits: 2 }) : "_________________"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">Cash In Hand / Deposited:</span>
                    <span className="font-mono text-slate-700">₹ _________________</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">UPI / Digital Collections:</span>
                    <span className="font-mono text-slate-700">₹ _________________</span>
                  </div>
                </div>

                {/* Signatures Box */}
                <div className="p-3 bg-slate-50 border border-slate-300 rounded-lg flex flex-col justify-between">
                  <h4 className="font-bold uppercase tracking-wider text-[11px] text-slate-700">
                    Verification & Approvals
                  </h4>
                  <div className="grid grid-cols-2 gap-4 pt-6">
                    <div className="text-center">
                      <div className="border-t border-slate-400 pt-1 text-[10px] font-bold text-slate-700 uppercase">
                        Collector Signature
                      </div>
                      <div className="text-[9px] text-slate-500">{collectorName}</div>
                    </div>
                    <div className="text-center">
                      <div className="border-t border-slate-400 pt-1 text-[10px] font-bold text-slate-700 uppercase">
                        Cashier / Supervisor
                      </div>
                      <div className="text-[9px] text-slate-500">Verified & Reconciled</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Bottom legal notice */}
              <div className="text-[10px] text-slate-500 text-center pt-2 border-t border-slate-100 flex flex-wrap justify-between items-center gap-1">
                <span>RPS RAYHAN TECH &bull; Microfinance Loan Management System</span>
                {orgInfo.helpline && <span>Support Helpline: {orgInfo.helpline}</span>}
                <span>Page 1 of 1</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
