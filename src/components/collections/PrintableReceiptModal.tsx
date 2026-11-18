"use client";

import React from "react";
import { Printer, X } from "lucide-react";
import { Button } from "@/components/ui/Button";

export interface PrintableReceiptData {
  receiptNo: string;
  dateTime: string;
  orgName: string;
  branchName: string;
  gstin: string;
  helpline: string;
  memberName: string;
  memberId: string;
  loanNo: string;
  loanId: string;
  paymentMode: string;
  amountReceived: string;
  principalRepaid: string;
  interestRepaid: string;
}

interface PrintableReceiptModalProps {
  receipt: PrintableReceiptData | null;
  onClose: () => void;
}

export function PrintableReceiptModal({ receipt, onClose }: PrintableReceiptModalProps) {
  if (!receipt) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-in fade-in-50 duration-200">
      <div className="bg-white rounded-2xl max-w-sm w-full p-5 shadow-2xl space-y-4 text-slate-900 border border-slate-200">
        {/* Printable Thermal Receipt Box */}
        <div
          id="printable-receipt"
          className="bg-white p-4 border border-slate-300 rounded-xl font-mono text-xs shadow-inner"
        >
          {/* Header */}
          <div className="text-center space-y-0.5 border-b pb-2.5">
            <h2 className="font-extrabold text-sm text-slate-900 tracking-wide uppercase">
              {receipt.orgName}
            </h2>
            <p className="text-[11px] font-bold text-slate-600">{receipt.branchName}</p>
            <p className="text-[10px] text-slate-500 font-medium">GSTIN: {receipt.gstin}</p>
            <p className="text-[11px] font-bold text-emerald-700 uppercase tracking-widest pt-1">
              ** COLLECTION RECEIPT **
            </p>
          </div>

          {/* Key-Value Details */}
          <div className="pt-2.5 space-y-1.5 text-[11px]">
            <div className="flex justify-between items-center">
              <span className="text-slate-500 font-bold">RECEIPT NO:</span>
              <span className="font-bold text-slate-900">{receipt.receiptNo}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-500 font-bold">DATE & TIME:</span>
              <span className="font-semibold text-slate-800">{receipt.dateTime}</span>
            </div>
            <div className="flex justify-between items-center">
              <div>
                <span className="text-slate-500 font-bold">MEMBER: </span>
                <span className="font-bold text-slate-900">{receipt.memberName}</span>
              </div>
              <div>
                <span className="text-slate-500 font-bold">ID: </span>
                <span className="font-bold text-slate-900">{receipt.memberId}</span>
              </div>
            </div>
            <div className="flex justify-between items-center">
              <div>
                <span className="text-slate-500 font-bold">LOAN NO: </span>
                <span className="font-bold text-slate-900">{receipt.loanNo}</span>
              </div>
              <div>
                <span className="text-slate-500 font-bold">LOAN ID: </span>
                <span className="font-bold text-slate-900">{receipt.loanId}</span>
              </div>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-500 font-bold">PAYMENT MODE:</span>
              <span className="font-black text-slate-900">{receipt.paymentMode}</span>
            </div>
          </div>

          {/* Dashed Line */}
          <div className="border-b-2 border-dashed border-slate-300 my-3" />

          {/* Financial Breakdown */}
          <div className="space-y-1.5">
            <div className="flex justify-between items-center text-xs">
              <span className="font-black text-slate-900 tracking-wider">
                AMOUNT RECEIVED:
              </span>
              <span className="text-base font-black text-emerald-600">
                ₹{receipt.amountReceived}
              </span>
            </div>
            <div className="flex justify-between items-center text-[11px]">
              <span className="text-slate-600 font-bold">PRINCIPAL REPAID:</span>
              <span className="font-bold text-slate-900">₹{receipt.principalRepaid}</span>
            </div>
            <div className="flex justify-between items-center text-[11px]">
              <span className="text-slate-600 font-bold">INTEREST:</span>
              <span className="font-bold text-slate-900">₹{receipt.interestRepaid}</span>
            </div>
          </div>

          {/* Dashed Line */}
          <div className="border-b-2 border-dashed border-slate-300 my-3" />

          {/* Receipt Footer */}
          <div className="text-center space-y-0.5 pt-0.5">
            <p className="text-[10px] font-bold text-slate-700 tracking-wider">
              THANK YOU FOR TIMELY REPAYMENT!
            </p>
            <p className="text-[9px] text-slate-500 font-medium">
              CUSTOMER HELPLINE: {receipt.helpline}
            </p>
          </div>
        </div>

        {/* Modal Actions */}
        <div className="flex items-center justify-end gap-2 pt-2 border-t print:hidden">
          <Button variant="secondary" size="sm" onClick={onClose} className="text-xs">
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
  );
}
