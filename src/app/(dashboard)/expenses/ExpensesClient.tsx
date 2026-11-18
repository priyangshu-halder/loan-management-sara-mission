"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import {
  FileText,
  PlusCircle,
  Search,
  Filter,
  CheckCircle2,
  AlertTriangle,
  X,
  CreditCard,
  Building,
  RotateCcw,
  Eye,
  Clock,
  ShieldCheck,
  Check,
  XCircle,
  Calendar,
  Layers,
  ArrowUpRight,
  Paperclip,
  Upload,
  Download,
  ExternalLink,
  Image as ImageIcon,
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

interface CashAccountItem {
  id: string;
  code: string;
  name: string;
  accountType: string;
  balance: string;
}

interface ExpenseCoaItem {
  id: string;
  code: string;
  name: string;
}

interface ExpenseCategoryItem {
  id: string;
  code: string;
  name: string;
  description: string | null;
  chartOfAccountId: string | null;
  chartOfAccount?: { code: string; name: string } | null;
}

interface ExpenseItem {
  id: string;
  voucherNumber: string;
  category: string;
  categoryId: string | null;
  amount: string;
  expenseDate: string;
  payee: string;
  paymentMethod: string;
  description: string | null;
  supportingRef: string | null;
  status: string;
  submittedById: string | null;
  submittedAt: string | null;
  approvedById: string | null;
  approvedAt: string | null;
  approvalReason: string | null;
  rejectedById: string | null;
  rejectedAt: string | null;
  rejectionReason: string | null;
  cashAccountId: string | null;
  paymentReference: string | null;
  paidAt: string | null;
  postedById: string | null;
  journalEntryId: string | null;
  isReversed: boolean;
  reversalReason: string | null;
  createdAt: string;
  attachmentFileName?: string | null;
  attachmentStoragePath?: string | null;
  attachmentMimeType?: string | null;
  attachmentFileSize?: number | null;
  cashAccount?: CashAccountItem | null;
  chartOfAccount?: { code: string; name: string } | null;
}

interface ExpensesClientProps {
  summary: {
    totalPostedAmount: string;
    totalPendingAmount: string;
    draftCount: number;
    submittedCount: number;
    approvedCount: number;
    postedCount: number;
    reversedCount: number;
    categoryBreakdown: { category: string; amount: string }[];
  };
  expenses: ExpenseItem[];
  categories: ExpenseCategoryItem[];
  cashAccounts: CashAccountItem[];
  expenseCoas: ExpenseCoaItem[];
  currentUserId: string;
  currentUserRole: string;
  isOrgAdmin: boolean;
}

export function ExpensesClient({
  summary,
  expenses,
  categories,
  cashAccounts,
  expenseCoas,
  currentUserId,
  currentUserRole,
  isOrgAdmin,
}: ExpensesClientProps) {
  const router = useRouter();

  // Tab & Filters
  const [activeTab, setActiveTab] = useState<"ALL" | "PENDING" | "READY_TO_PAY" | "CATEGORIES">("ALL");
  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");

  // Modals
  const [isRecordModal, setIsRecordModal] = useState(false);
  const [isCategoryModal, setIsCategoryModal] = useState(false);
  const [isApproveModal, setIsApproveModal] = useState(false);
  const [isRejectModal, setIsRejectModal] = useState(false);
  const [isPayModal, setIsPayModal] = useState(false);
  const [isReverseModal, setIsReverseModal] = useState(false);
  const [isDetailModal, setIsDetailModal] = useState(false);

  // Selected Entity
  const [selectedExpense, setSelectedExpense] = useState<ExpenseItem | null>(null);

  // Forms
  const [recordForm, setRecordForm] = useState({
    voucherNumber: `EXP-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${Date.now().toString().slice(-4)}`,
    categoryId: categories[0]?.id || "",
    category: categories[0]?.name || "Branch Rent & Office Expense",
    chartOfAccountId: categories[0]?.chartOfAccountId || expenseCoas[0]?.id || "",
    amount: "",
    expenseDate: new Date().toISOString().slice(0, 10),
    payee: "",
    paymentMethod: "CASH",
    description: "",
    supportingRef: "",
    autoSubmit: true,
  });

  const [categoryForm, setCategoryForm] = useState({
    code: `CAT-${Date.now().toString().slice(-4)}`,
    name: "",
    description: "",
    chartOfAccountId: expenseCoas[0]?.id || "",
  });

  const [approvalReason, setApprovalReason] = useState("");
  const [rejectionReason, setRejectionReason] = useState("");
  const [reversalReason, setReversalReason] = useState("");

  const [payForm, setPayForm] = useState({
    cashAccountId: cashAccounts[0]?.id || "",
    paymentReference: `PAY-${Date.now().toString().slice(-6)}`,
    amount: "",
  });

  // Attachment upload state for recording expense
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFileError(null);
    const file = e.target.files?.[0];
    if (!file) {
      setAttachmentFile(null);
      setFilePreview(null);
      return;
    }

    const validTypes = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
    if (!validTypes.includes(file.type)) {
      setFileError("Invalid format. Please upload JPG, PNG, WEBP image or PDF.");
      e.target.value = "";
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setFileError("File size exceeds 10MB limit.");
      e.target.value = "";
      return;
    }

    setAttachmentFile(file);
    if (file.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = () => {
        setFilePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    } else {
      setFilePreview(null);
    }
  };

  const handleRemoveFile = () => {
    setAttachmentFile(null);
    setFilePreview(null);
    setFileError(null);
  };

  // State
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const filteredExpenses = expenses.filter((exp) => {
    const matchesSearch =
      exp.voucherNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      exp.payee.toLowerCase().includes(searchTerm.toLowerCase()) ||
      exp.category.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (exp.description && exp.description.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesCategory = categoryFilter === "ALL" || exp.category === categoryFilter;
    const matchesStatus = statusFilter === "ALL" || exp.status === statusFilter;

    if (activeTab === "PENDING") {
      return (exp.status === "SUBMITTED" || exp.status === "DRAFT") && matchesSearch;
    }
    if (activeTab === "READY_TO_PAY") {
      return exp.status === "APPROVED" && matchesSearch;
    }

    return matchesSearch && matchesCategory && matchesStatus;
  });

  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await fetch("/api/expenses/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(categoryForm),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || "Failed to create category");
      }
      setSuccessMsg(`Expense Category ${data.name} (${data.code}) created successfully.`);
      setIsCategoryModal(false);
      router.refresh();
    } catch (err: unknown) {
      setErrorMsg((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const formData = new FormData();
      formData.append("voucherNumber", recordForm.voucherNumber);
      if (recordForm.categoryId) formData.append("categoryId", recordForm.categoryId);
      formData.append("category", recordForm.category);
      if (recordForm.chartOfAccountId) formData.append("chartOfAccountId", recordForm.chartOfAccountId);
      formData.append("amount", recordForm.amount);
      formData.append("expenseDate", recordForm.expenseDate);
      formData.append("payee", recordForm.payee);
      formData.append("paymentMethod", recordForm.paymentMethod);
      if (recordForm.description) formData.append("description", recordForm.description);
      if (recordForm.supportingRef) formData.append("supportingRef", recordForm.supportingRef);
      formData.append("autoSubmit", String(recordForm.autoSubmit));

      if (attachmentFile) {
        formData.append("attachment", attachmentFile);
      }

      const res = await fetch("/api/expenses", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || "Failed to record expense voucher");
      }
      setSuccessMsg(`Expense voucher ${data.voucherNumber} recorded successfully!`);
      setIsRecordModal(false);
      setAttachmentFile(null);
      setFilePreview(null);
      setFileError(null);
      setRecordForm({
        voucherNumber: `EXP-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${Date.now().toString().slice(-4)}`,
        categoryId: categories[0]?.id || "",
        category: categories[0]?.name || "Branch Rent & Office Expense",
        chartOfAccountId: categories[0]?.chartOfAccountId || expenseCoas[0]?.id || "",
        amount: "",
        expenseDate: new Date().toISOString().slice(0, 10),
        payee: "",
        paymentMethod: "CASH",
        description: "",
        supportingRef: "",
        autoSubmit: true,
      });
      router.refresh();
    } catch (err: unknown) {
      setErrorMsg((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmitExpense = async (expenseId: string) => {
    setIsLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await fetch(`/api/expenses/${expenseId}/submit`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || "Failed to submit expense");
      }
      setSuccessMsg(`Expense ${data.voucherNumber} submitted for approval.`);
      router.refresh();
    } catch (err: unknown) {
      setErrorMsg((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleApproveExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedExpense) return;
    setIsLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await fetch(`/api/expenses/${selectedExpense.id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: approvalReason }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || "Failed to approve expense claim");
      }
      setSuccessMsg(`Expense ${data.voucherNumber} approved for payout.`);
      setIsApproveModal(false);
      setApprovalReason("");
      router.refresh();
    } catch (err: unknown) {
      setErrorMsg((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRejectExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedExpense) return;
    setIsLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await fetch(`/api/expenses/${selectedExpense.id}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rejectionReason }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || "Failed to reject expense claim");
      }
      setSuccessMsg(`Expense ${data.voucherNumber} rejected.`);
      setIsRejectModal(false);
      setRejectionReason("");
      router.refresh();
    } catch (err: unknown) {
      setErrorMsg((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePayExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedExpense) return;
    setIsLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await fetch(`/api/expenses/${selectedExpense.id}/pay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cashAccountId: payForm.cashAccountId,
          paymentReference: payForm.paymentReference,
          amount: payForm.amount,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || "Failed to post expense payment");
      }
      setSuccessMsg(`Expense voucher ${data.voucherNumber} paid & posted to General Ledger!`);
      setIsPayModal(false);
      router.refresh();
    } catch (err: unknown) {
      setErrorMsg((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleReverseExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedExpense) return;
    setIsLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await fetch(`/api/expenses/${selectedExpense.id}/reverse`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reversalReason }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || "Failed to reverse expense voucher");
      }
      setSuccessMsg(`Expense voucher ${data.voucherNumber} reversed successfully.`);
      setIsReverseModal(false);
      setReversalReason("");
      router.refresh();
    } catch (err: unknown) {
      setErrorMsg((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Actions */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Operational Expenses</h1>
          <p className="text-sm text-slate-500 mt-1">
            Maker-checker expense approvals, cash/bank disbursements, and double-entry General Ledger postings.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            onClick={() => {
              setCategoryForm({
                code: `CAT-${Date.now().toString().slice(-4)}`,
                name: "",
                description: "",
                chartOfAccountId: expenseCoas[0]?.id || "",
              });
              setIsCategoryModal(true);
            }}
            className="flex items-center gap-1.5"
          >
            <Layers className="w-4 h-4" />
            <span>New Category</span>
          </Button>

          <Button
            onClick={() => {
              const defaultCat = categories[0];
              setRecordForm({
                voucherNumber: `EXP-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${Date.now().toString().slice(-4)}`,
                categoryId: defaultCat?.id || "",
                category: defaultCat?.name || "Branch Rent & Office Expense",
                chartOfAccountId: defaultCat?.chartOfAccountId || expenseCoas[0]?.id || "",
                amount: "",
                expenseDate: new Date().toISOString().slice(0, 10),
                payee: "",
                paymentMethod: "CASH",
                description: "",
                supportingRef: "",
                autoSubmit: true,
              });
              setIsRecordModal(true);
            }}
            className="flex items-center gap-1.5"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Record Expense</span>
          </Button>
        </div>
      </div>

      {/* Global Alerts */}
      {errorMsg && (
        <div className="p-4 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
            <span className="text-sm font-medium">{errorMsg}</span>
          </div>
          <button onClick={() => setErrorMsg(null)} className="text-rose-500 hover:text-rose-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {successMsg && (
        <div className="p-4 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <span className="text-sm font-medium">{successMsg}</span>
          </div>
          <button onClick={() => setSuccessMsg(null)} className="text-emerald-500 hover:text-emerald-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
              <FileText className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Total Posted Expenses</p>
              <h3 className="text-xl font-bold text-slate-900 mt-0.5">
                ₹{Number(summary.totalPostedAmount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">{summary.postedCount} posted vouchers</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="p-3 bg-amber-50 text-amber-600 rounded-xl">
              <Clock className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Pending Review</p>
              <h3 className="text-xl font-bold text-slate-900 mt-0.5">{summary.submittedCount + summary.draftCount}</h3>
              <p className="text-xs text-slate-400 mt-0.5">₹{Number(summary.totalPendingAmount).toFixed(2)} under evaluation</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Approved for Payout</p>
              <h3 className="text-xl font-bold text-slate-900 mt-0.5">{summary.approvedCount}</h3>
              <p className="text-xs text-slate-400 mt-0.5">Awaiting cashier disbursement</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="p-3 bg-slate-100 text-slate-700 rounded-xl">
              <Layers className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Expense Categories</p>
              <h3 className="text-xl font-bold text-slate-900 mt-0.5">{categories.length}</h3>
              <p className="text-xs text-slate-400 mt-0.5">Mapped to GL accounts</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-200">
        <div className="flex gap-4">
          <button
            onClick={() => setActiveTab("ALL")}
            className={`pb-3 text-sm font-semibold border-b-2 transition-colors ${
              activeTab === "ALL"
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            All Expenses ({expenses.length})
          </button>
          <button
            onClick={() => setActiveTab("PENDING")}
            className={`pb-3 text-sm font-semibold border-b-2 transition-colors ${
              activeTab === "PENDING"
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            Pending Approvals ({summary.submittedCount})
          </button>
          <button
            onClick={() => setActiveTab("READY_TO_PAY")}
            className={`pb-3 text-sm font-semibold border-b-2 transition-colors ${
              activeTab === "READY_TO_PAY"
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            Ready for Disbursal ({summary.approvedCount})
          </button>
          <button
            onClick={() => setActiveTab("CATEGORIES")}
            className={`pb-3 text-sm font-semibold border-b-2 transition-colors ${
              activeTab === "CATEGORIES"
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            Categories & GL Mapping ({categories.length})
          </button>
        </div>
      </div>

      {/* Tab: Categories View */}
      {activeTab === "CATEGORIES" && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {categories.map((cat) => (
            <Card key={cat.id} className="relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-1 bg-blue-600" />
              <CardContent className="p-5">
                <div className="flex justify-between items-start">
                  <div>
                    <span className="font-mono text-xs font-bold text-slate-400">{cat.code}</span>
                    <h3 className="font-bold text-slate-900 text-base mt-0.5">{cat.name}</h3>
                  </div>
                  <Badge variant="neutral">Active</Badge>
                </div>
                <p className="text-xs text-slate-500 mt-2">{cat.description || "General administrative operational category"}</p>
                <div className="mt-4 pt-4 border-t border-slate-100 flex justify-between items-center text-xs">
                  <span className="text-slate-400 font-medium">Mapped Ledger:</span>
                  <span className="font-mono font-semibold text-blue-700">
                    {cat.chartOfAccount ? `${cat.chartOfAccount.code} - ${cat.chartOfAccount.name}` : "GL 5001 Default"}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Tab: Expenses List View (ALL, PENDING, READY_TO_PAY) */}
      {activeTab !== "CATEGORIES" && (
        <Card>
          <CardHeader className="p-5 border-b border-slate-200">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <CardTitle className="text-lg font-bold text-slate-900">
                  {activeTab === "PENDING"
                    ? "Pending Review & Approval"
                    : activeTab === "READY_TO_PAY"
                    ? "Approved Expenses Ready for Payment"
                    : "Operational Expense Records"}
                </CardTitle>
                <CardDescription className="text-xs text-slate-500 mt-0.5">
                  Vouchers with double-entry journal and audit references
                </CardDescription>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    placeholder="Search voucher, payee, category..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 w-56"
                  />
                </div>

                {activeTab === "ALL" && (
                  <>
                    <div className="flex items-center gap-1.5 text-xs">
                      <Filter className="w-3.5 h-3.5 text-slate-400" />
                      <select
                        value={categoryFilter}
                        onChange={(e) => setCategoryFilter(e.target.value)}
                        className="py-1.5 px-2 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs text-slate-700"
                      >
                        <option value="ALL">All Categories</option>
                        {categories.map((c) => (
                          <option key={c.id} value={c.name}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="flex items-center gap-1.5 text-xs">
                      <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        className="py-1.5 px-2 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs text-slate-700"
                      >
                        <option value="ALL">All Status</option>
                        <option value="DRAFT">Draft</option>
                        <option value="SUBMITTED">Submitted</option>
                        <option value="APPROVED">Approved</option>
                        <option value="REJECTED">Rejected</option>
                        <option value="POSTED">Posted</option>
                        <option value="REVERSED">Reversed</option>
                      </select>
                    </div>
                  </>
                )}
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Voucher #</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Payee & Description</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Amount (₹)</TableHead>
                  <TableHead>Payment Method</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredExpenses.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="p-0">
                      <TableEmptyState message="No expense records match the specified filters." />
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredExpenses.map((expense) => {
                    const isMaker = expense.submittedById === currentUserId;
                    const canApprove = (isOrgAdmin || currentUserRole === "BRANCH_MANAGER") && (!isMaker || isOrgAdmin);

                    return (
                      <TableRow key={expense.id}>
                        <TableCell className="font-mono text-xs font-semibold text-blue-600">
                          <div className="flex items-center gap-1.5">
                            <span>{expense.voucherNumber}</span>
                            {expense.attachmentFileName && (
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedExpense(expense);
                                  setIsDetailModal(true);
                                }}
                                title={`Attachment: ${expense.attachmentFileName} (Click to view)`}
                                className="inline-flex items-center justify-center text-blue-600 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded p-1 transition-colors"
                              >
                                <Paperclip className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs font-mono text-slate-600">{expense.expenseDate}</TableCell>
                        <TableCell>
                          <div className="font-medium text-slate-900 text-xs">{expense.payee}</div>
                          <div className="text-[11px] text-slate-400 line-clamp-1">{expense.description || "-"}</div>
                        </TableCell>
                        <TableCell className="text-xs text-slate-700">{expense.category}</TableCell>
                        <TableCell className="text-right font-mono text-xs font-bold text-slate-900">
                          ₹{Number(expense.amount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell className="text-xs text-slate-600 font-mono">{expense.paymentMethod}</TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              expense.status === "POSTED"
                                ? "success"
                                : expense.status === "APPROVED"
                                ? "info"
                                : expense.status === "REJECTED" || expense.isReversed
                                ? "danger"
                                : "warning"
                            }
                          >
                            {expense.isReversed ? "REVERSED" : expense.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {/* Detail Button */}
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setSelectedExpense(expense);
                                setIsDetailModal(true);
                              }}
                              className="h-7 px-2 text-xs text-blue-600 hover:text-blue-800"
                              title="View Details"
                            >
                              <Eye className="w-3.5 h-3.5 mr-1" />
                              View
                            </Button>

                            {/* Submit draft / rejected */}
                            {(expense.status === "DRAFT" || expense.status === "REJECTED") && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleSubmitExpense(expense.id)}
                                className="h-7 px-2 text-xs text-blue-700 border-blue-300 hover:bg-blue-50"
                              >
                                Submit
                              </Button>
                            )}

                            {/* Approve / Reject */}
                            {(expense.status === "SUBMITTED" || expense.status === "DRAFT") && canApprove && (
                              <>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    setSelectedExpense(expense);
                                    setApprovalReason("Verified and approved for payment");
                                    setIsApproveModal(true);
                                  }}
                                  className="h-7 px-2 text-xs text-emerald-700 border-emerald-300 hover:bg-emerald-50"
                                >
                                  <Check className="w-3.5 h-3.5 mr-1" />
                                  Approve
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    setSelectedExpense(expense);
                                    setRejectionReason("");
                                    setIsRejectModal(true);
                                  }}
                                  className="h-7 px-2 text-xs text-rose-700 border-rose-300 hover:bg-rose-50"
                                >
                                  <X className="w-3.5 h-3.5 mr-1" />
                                  Reject
                                </Button>
                              </>
                            )}

                            {/* Disburse / Pay */}
                            {expense.status === "APPROVED" && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setSelectedExpense(expense);
                                  setPayForm({
                                    cashAccountId: cashAccounts[0]?.id || "",
                                    paymentReference: `PAY-${expense.voucherNumber}`,
                                    amount: expense.amount,
                                  });
                                  setIsPayModal(true);
                                }}
                                className="h-7 px-2 text-xs text-emerald-700 border-emerald-300 hover:bg-emerald-50"
                              >
                                <ArrowUpRight className="w-3.5 h-3.5 mr-1" />
                                Pay & Post
                              </Button>
                            )}

                            {/* Reverse */}
                            {expense.status === "POSTED" && !expense.isReversed && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setSelectedExpense(expense);
                                  setReversalReason("");
                                  setIsReverseModal(true);
                                }}
                                className="h-7 px-2 text-xs text-rose-600 hover:text-rose-800"
                              >
                                <RotateCcw className="w-3.5 h-3.5 mr-1" />
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
          </CardContent>
        </Card>
      )}

      {/* Modal: New Expense Category */}
      {isCategoryModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full overflow-hidden">
            <div className="p-5 border-b border-slate-200 flex justify-between items-center">
              <div>
                <h3 className="font-bold text-slate-900 text-base">New Expense Category</h3>
                <p className="text-xs text-slate-500">Map operational costs to Chart of Accounts</p>
              </div>
              <button onClick={() => setIsCategoryModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreateCategory} className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Category Code</label>
                  <input
                    type="text"
                    value={categoryForm.code}
                    onChange={(e) => setCategoryForm({ ...categoryForm, code: e.target.value.toUpperCase() })}
                    className="w-full text-xs font-mono p-2 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Category Name</label>
                  <input
                    type="text"
                    placeholder="e.g. Travel & Conveyance"
                    value={categoryForm.name}
                    onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })}
                    className="w-full text-xs p-2 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Mapped Chart of Account (GL)</label>
                <select
                  value={categoryForm.chartOfAccountId}
                  onChange={(e) => setCategoryForm({ ...categoryForm, chartOfAccountId: e.target.value })}
                  className="w-full text-xs p-2 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                >
                  {expenseCoas.map((coa) => (
                    <option key={coa.id} value={coa.id}>
                      {coa.code} - {coa.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Description (Optional)</label>
                <textarea
                  rows={2}
                  value={categoryForm.description}
                  onChange={(e) => setCategoryForm({ ...categoryForm, description: e.target.value })}
                  className="w-full text-xs p-2 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setIsCategoryModal(false)}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" isLoading={isLoading}>
                  Save Category
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Record Expense */}
      {isRecordModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[92vh] flex flex-col overflow-hidden">
            <div className="p-5 border-b border-slate-200 flex justify-between items-center">
              <div>
                <h3 className="font-bold text-slate-900 text-base">Record Expense Voucher</h3>
                <p className="text-xs text-slate-500">Draft operational claim for review and disbursement</p>
              </div>
              <button
                onClick={() => {
                  setIsRecordModal(false);
                  handleRemoveFile();
                }}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreateExpense} className="p-5 space-y-4 overflow-y-auto flex-1">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Voucher Number</label>
                  <input
                    type="text"
                    value={recordForm.voucherNumber}
                    onChange={(e) => setRecordForm({ ...recordForm, voucherNumber: e.target.value })}
                    className="w-full text-xs font-mono p-2 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Expense Date</label>
                  <input
                    type="date"
                    value={recordForm.expenseDate}
                    onChange={(e) => setRecordForm({ ...recordForm, expenseDate: e.target.value })}
                    className="w-full text-xs font-mono p-2 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Expense Category</label>
                <select
                  value={recordForm.categoryId}
                  onChange={(e) => {
                    const cat = categories.find((c) => c.id === e.target.value);
                    setRecordForm({
                      ...recordForm,
                      categoryId: e.target.value,
                      category: cat?.name || recordForm.category,
                      chartOfAccountId: cat?.chartOfAccountId || recordForm.chartOfAccountId,
                    });
                  }}
                  className="w-full text-xs p-2 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.chartOfAccount?.code || "GL 5001"})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Amount (₹)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="1"
                    placeholder="e.g. 3500.00"
                    value={recordForm.amount}
                    onChange={(e) => setRecordForm({ ...recordForm, amount: e.target.value })}
                    className="w-full text-base font-bold font-mono p-2 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-blue-700"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Payment Method</label>
                  <select
                    value={recordForm.paymentMethod}
                    onChange={(e) => setRecordForm({ ...recordForm, paymentMethod: e.target.value })}
                    className="w-full text-xs p-2 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="CASH">Cash</option>
                    <option value="BANK_TRANSFER">Bank Transfer</option>
                    <option value="CHEQUE">Cheque</option>
                    <option value="UPI">UPI</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Payee / Vendor Name</label>
                  <input
                    type="text"
                    placeholder="e.g. Landlord / Vendor Ltd"
                    value={recordForm.payee}
                    onChange={(e) => setRecordForm({ ...recordForm, payee: e.target.value })}
                    className="w-full text-xs p-2 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Invoice / Receipt Ref</label>
                  <input
                    type="text"
                    placeholder="e.g. INV-2026-99"
                    value={recordForm.supportingRef}
                    onChange={(e) => setRecordForm({ ...recordForm, supportingRef: e.target.value })}
                    className="w-full text-xs font-mono p-2 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Description & Purpose</label>
                <textarea
                  rows={2}
                  placeholder="Operational purpose of expenditure..."
                  value={recordForm.description}
                  onChange={(e) => setRecordForm({ ...recordForm, description: e.target.value })}
                  className="w-full text-xs p-2 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Voucher / Bill Document Upload Field */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-semibold text-slate-700">
                    Voucher / Bill Document <span className="text-slate-400 font-normal">(Optional)</span>
                  </label>
                  <span className="text-[10px] text-slate-400">JPG, PNG, WEBP, PDF up to 10MB</span>
                </div>

                {attachmentFile ? (
                  <div className="flex items-center justify-between p-2.5 bg-blue-50/70 border border-blue-200 rounded-lg">
                    <div className="flex items-center gap-2.5 min-w-0">
                      {filePreview ? (
                        <img
                          src={filePreview}
                          alt="Preview"
                          className="w-10 h-10 object-cover rounded border border-blue-200 bg-white shrink-0"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded border border-blue-200 bg-white flex items-center justify-center shrink-0 text-rose-500">
                          <FileText className="w-5 h-5" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-slate-800 truncate" title={attachmentFile.name}>
                          {attachmentFile.name}
                        </p>
                        <p className="text-[10px] text-slate-500">
                          {(attachmentFile.size / 1024).toFixed(1)} KB &bull;{" "}
                          {attachmentFile.type === "application/pdf" ? "PDF Document" : "Image"}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleRemoveFile}
                      className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-white transition-colors"
                      title="Remove document"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <label className="flex flex-col items-center justify-center p-3 border-2 border-dashed border-slate-300 hover:border-blue-400 bg-slate-50 hover:bg-blue-50/30 rounded-lg cursor-pointer transition-colors group">
                    <div className="flex items-center gap-2 text-slate-600 group-hover:text-blue-600">
                      <Upload className="w-4 h-4" />
                      <span className="text-xs font-medium">Upload voucher, bill, or receipt</span>
                    </div>
                    <span className="text-[10px] text-slate-400 mt-0.5">Click or drag & drop (JPG, PNG, WEBP, PDF)</span>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp,application/pdf,.pdf,.jpg,.jpeg,.png,.webp"
                      onChange={handleFileChange}
                      className="hidden"
                    />
                  </label>
                )}

                {fileError && (
                  <p className="text-[11px] text-rose-600 mt-1 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    {fileError}
                  </p>
                )}
              </div>

              <div className="pt-2">
                <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-700">
                  <input
                    type="checkbox"
                    checked={recordForm.autoSubmit}
                    onChange={(e) => setRecordForm({ ...recordForm, autoSubmit: e.target.checked })}
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span>Submit immediately for maker-checker approval</span>
                </label>
              </div>

              <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setIsRecordModal(false);
                    handleRemoveFile();
                  }}
                >
                  Cancel
                </Button>
                <Button type="submit" size="sm" isLoading={isLoading}>
                  Save Voucher
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Approve Expense */}
      {isApproveModal && selectedExpense && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full overflow-hidden">
            <div className="p-5 border-b border-slate-200 flex justify-between items-center bg-emerald-50/50">
              <div>
                <h3 className="font-bold text-slate-900 text-base">Approve Expense Claim</h3>
                <p className="text-xs text-slate-500">{selectedExpense.voucherNumber} &bull; ₹{Number(selectedExpense.amount).toFixed(2)}</p>
              </div>
              <button onClick={() => setIsApproveModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleApproveExpense} className="p-5 space-y-4">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-500">Payee:</span>
                  <span className="font-semibold text-slate-800">{selectedExpense.payee}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Category:</span>
                  <span className="font-semibold text-slate-800">{selectedExpense.category}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Invoice Ref:</span>
                  <span className="font-mono text-slate-700">{selectedExpense.supportingRef || "None"}</span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Approval Note</label>
                <input
                  type="text"
                  value={approvalReason}
                  onChange={(e) => setApprovalReason(e.target.value)}
                  className="w-full text-xs p-2 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  required
                />
              </div>

              <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setIsApproveModal(false)}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" className="bg-emerald-600 hover:bg-emerald-700" isLoading={isLoading}>
                  Authorize Approval
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Reject Expense */}
      {isRejectModal && selectedExpense && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full overflow-hidden">
            <div className="p-5 border-b border-slate-200 flex justify-between items-center bg-rose-50/50">
              <div>
                <h3 className="font-bold text-slate-900 text-base">Reject Expense Claim</h3>
                <p className="text-xs text-slate-500">{selectedExpense.voucherNumber}</p>
              </div>
              <button onClick={() => setIsRejectModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleRejectExpense} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Rejection Reason</label>
                <textarea
                  rows={3}
                  placeholder="State clear operational reason for rejection..."
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  className="w-full text-xs p-2 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500"
                  required
                />
              </div>

              <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setIsRejectModal(false)}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" className="bg-rose-600 hover:bg-rose-700" isLoading={isLoading}>
                  Confirm Rejection
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Disburse / Pay Expense */}
      {isPayModal && selectedExpense && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full overflow-hidden">
            <div className="p-5 border-b border-slate-200 flex justify-between items-center bg-emerald-50/50">
              <div>
                <h3 className="font-bold text-slate-900 text-base">Disburse & Post Expense</h3>
                <p className="text-xs text-slate-500">{selectedExpense.voucherNumber} &bull; {selectedExpense.payee}</p>
              </div>
              <button onClick={() => setIsPayModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handlePayExpense} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Disbursal Amount (₹)</label>
                <input
                  type="number"
                  step="0.01"
                  value={payForm.amount}
                  onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })}
                  className="w-full text-base font-bold font-mono p-2 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-emerald-800"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Disbursal Cash / Bank Desk</label>
                <select
                  value={payForm.cashAccountId}
                  onChange={(e) => setPayForm({ ...payForm, cashAccountId: e.target.value })}
                  className="w-full text-xs p-2 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  {cashAccounts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.code}) - Balance: ₹{Number(c.balance).toFixed(2)}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-slate-400 mt-1">
                  Atomically debits Expense GL and credits selected Cash/Bank desk.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Payment Reference</label>
                <input
                  type="text"
                  value={payForm.paymentReference}
                  onChange={(e) => setPayForm({ ...payForm, paymentReference: e.target.value })}
                  className="w-full text-xs font-mono p-2 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  required
                />
              </div>

              <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setIsPayModal(false)}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" className="bg-emerald-600 hover:bg-emerald-700" isLoading={isLoading}>
                  Post Disbursal
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Reverse Expense */}
      {isReverseModal && selectedExpense && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full overflow-hidden">
            <div className="p-5 border-b border-slate-200 flex justify-between items-center bg-rose-50/50">
              <div>
                <h3 className="font-bold text-slate-900 text-base">Reverse Expense Payment</h3>
                <p className="text-xs text-slate-500">{selectedExpense.voucherNumber} &bull; ₹{Number(selectedExpense.amount).toFixed(2)}</p>
              </div>
              <button onClick={() => setIsReverseModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleReverseExpense} className="p-5 space-y-4">
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <span>
                  Reversing this expense generates compensating double-entry journal lines, restores cash desk balance, and permanently logs the reversal reason in audit trails.
                </span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Reason for Reversal</label>
                <textarea
                  rows={3}
                  placeholder="Operational justification for audit compliance..."
                  value={reversalReason}
                  onChange={(e) => setReversalReason(e.target.value)}
                  className="w-full text-xs p-2 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500"
                  required
                />
              </div>

              <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setIsReverseModal(false)}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" className="bg-rose-600 hover:bg-rose-700" isLoading={isLoading}>
                  Confirm Reversal
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: View Details */}
      {isDetailModal && selectedExpense && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[92vh] flex flex-col overflow-hidden">
            <div className="p-5 border-b border-slate-200 flex justify-between items-center bg-slate-50">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-slate-900 text-base">{selectedExpense.voucherNumber}</h3>
                  <Badge
                    variant={
                      selectedExpense.status === "POSTED"
                        ? "success"
                        : selectedExpense.status === "APPROVED"
                        ? "info"
                        : selectedExpense.status === "REJECTED" || selectedExpense.isReversed
                        ? "danger"
                        : "warning"
                    }
                  >
                    {selectedExpense.isReversed ? "REVERSED" : selectedExpense.status}
                  </Badge>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">{selectedExpense.category} &bull; {selectedExpense.expenseDate}</p>
              </div>
              <button onClick={() => setIsDetailModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs overflow-y-auto flex-1">
              <div className="grid grid-cols-2 gap-4 p-3 bg-slate-50 rounded-lg">
                <div>
                  <span className="text-slate-400 font-medium">Payee</span>
                  <p className="font-bold text-slate-800 text-sm mt-0.5">{selectedExpense.payee}</p>
                </div>
                <div>
                  <span className="text-slate-400 font-medium">Amount</span>
                  <p className="font-bold text-blue-600 text-base mt-0.5">₹{Number(selectedExpense.amount).toFixed(2)}</p>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between border-b border-slate-100 pb-1.5">
                  <span className="text-slate-500">Payment Method:</span>
                  <span className="font-semibold text-slate-800 font-mono">{selectedExpense.paymentMethod}</span>
                </div>
                <div className="flex justify-between border-b border-slate-100 pb-1.5">
                  <span className="text-slate-500">Supporting Invoice Ref:</span>
                  <span className="font-mono text-slate-800">{selectedExpense.supportingRef || "None"}</span>
                </div>
                {selectedExpense.cashAccount && (
                  <div className="flex justify-between border-b border-slate-100 pb-1.5">
                    <span className="text-slate-500">Disbursed From Desk:</span>
                    <span className="font-semibold text-slate-800">{selectedExpense.cashAccount.name}</span>
                  </div>
                )}
                {selectedExpense.paymentReference && (
                  <div className="flex justify-between border-b border-slate-100 pb-1.5">
                    <span className="text-slate-500">Payment Ref / Cheque #:</span>
                    <span className="font-mono text-slate-800">{selectedExpense.paymentReference}</span>
                  </div>
                )}
                {selectedExpense.journalEntryId && (
                  <div className="flex justify-between border-b border-slate-100 pb-1.5">
                    <span className="text-slate-500">GL Journal Entry ID:</span>
                    <span className="font-mono text-slate-600 text-[11px]">{selectedExpense.journalEntryId}</span>
                  </div>
                )}
              </div>

              {/* Voucher / Bill Document Section */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Paperclip className="w-4 h-4 text-blue-600" />
                    <span className="font-bold text-slate-800 text-xs">Voucher / Bill Document</span>
                  </div>
                  {selectedExpense.attachmentFileName ? (
                    <Badge variant="success" className="text-[10px] px-2 py-0.5">
                      ATTACHED
                    </Badge>
                  ) : (
                    <span className="text-[10px] text-slate-400 font-medium">None Attached</span>
                  )}
                </div>

                {selectedExpense.attachmentFileName ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between p-2.5 bg-white border border-slate-200 rounded-lg">
                      <div className="flex items-center gap-2.5 min-w-0">
                        {selectedExpense.attachmentMimeType?.startsWith("image/") ? (
                          <ImageIcon className="w-5 h-5 text-blue-500 shrink-0" />
                        ) : (
                          <FileText className="w-5 h-5 text-rose-500 shrink-0" />
                        )}
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-800 text-xs truncate max-w-[200px]" title={selectedExpense.attachmentFileName}>
                            {selectedExpense.attachmentFileName}
                          </p>
                          <p className="text-[10px] text-slate-400">
                            {selectedExpense.attachmentFileSize
                              ? `${(selectedExpense.attachmentFileSize / 1024).toFixed(1)} KB`
                              : "Document"}{" "}
                            &bull; {selectedExpense.attachmentMimeType === "application/pdf" ? "PDF Document" : "Image"}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <a
                          href={`/api/expenses/${selectedExpense.id}/attachment`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-md transition-colors"
                          title="Open document in new tab"
                        >
                          <ExternalLink className="w-3.5 h-3.5" /> View
                        </a>
                        <a
                          href={`/api/expenses/${selectedExpense.id}/attachment?download=true`}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded-md transition-colors"
                          title="Download document"
                        >
                          <Download className="w-3.5 h-3.5" /> Download
                        </a>
                      </div>
                    </div>

                    {/* Image Inline Preview */}
                    {selectedExpense.attachmentMimeType?.startsWith("image/") && (
                      <div className="border border-slate-200 rounded-lg overflow-hidden bg-white p-2 flex flex-col items-center justify-center">
                        <img
                          src={`/api/expenses/${selectedExpense.id}/attachment`}
                          alt={selectedExpense.attachmentFileName || "Voucher Attachment"}
                          className="max-h-52 max-w-full rounded object-contain shadow-sm"
                        />
                      </div>
                    )}

                    {/* PDF Embedded Frame Preview */}
                    {selectedExpense.attachmentMimeType === "application/pdf" && (
                      <div className="border border-slate-200 rounded-lg overflow-hidden bg-white">
                        <iframe
                          src={`/api/expenses/${selectedExpense.id}/attachment`}
                          className="w-full h-56 border-none"
                          title="PDF Preview"
                        />
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-slate-500 italic">
                    No physical voucher or bill image/PDF was uploaded when recording this expense.
                  </p>
                )}
              </div>

              {selectedExpense.description && (
                <div className="p-3 bg-slate-50 rounded-lg">
                  <span className="text-slate-400 font-medium block mb-1">Operational Purpose:</span>
                  <p className="text-slate-700">{selectedExpense.description}</p>
                </div>
              )}

              {selectedExpense.rejectionReason && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg">
                  <span className="font-bold block mb-1">Rejection Reason:</span>
                  <p>{selectedExpense.rejectionReason}</p>
                </div>
              )}

              {selectedExpense.isReversed && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg">
                  <span className="font-bold block mb-1">Reversal Reason:</span>
                  <p>{selectedExpense.reversalReason}</p>
                </div>
              )}
            </div>

            <div className="p-4 border-t border-slate-200 bg-slate-50 flex justify-end">
              <Button size="sm" variant="outline" onClick={() => setIsDetailModal(false)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

