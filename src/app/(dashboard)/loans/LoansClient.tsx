"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BadgePercent,
  CheckCircle2,
  Clock,
  PlusCircle,
  Search,
  Filter,
  DollarSign,
  ArrowRight,
  ShieldCheck,
  AlertTriangle,
  FileText,
  Calendar,
  X,
  CreditCard,
  Building,
  User,
  Users,
  Eye,
  Check,
  XCircle,
  RotateCcw,
  Printer,
  Award,
  MapPin,
  Phone,
  Mail,
  FileCheck,
  Briefcase,
  Home,
  Shield,
  ListFilter,
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

interface CustomerItem {
  id: string;
  customerCode: string;
  fullName: string;
  phone: string;
  email: string | null;
  guardianName?: string | null;
  gender?: string | null;
  dateOfBirth?: string | Date | null;
  aadhaarNumber?: string | null;
  panNumber?: string | null;
  occupation?: string | null;
  residentialAddress?: string | null;
  nomineeName?: string | null;
  guarantorName?: string | null;
  passportPhoto?: string | null;
  status?: string;
  branch?: {
    id: string;
    name: string;
    code: string;
  } | null;
  customerGroups?: Array<{
    group: {
      id: string;
      name: string;
      code: string;
    };
  }>;
  loanAccounts?: Array<{
    id: string;
    loanAccountNumber?: string;
    status: string;
    principalDisbursed?: string | number;
    principalOutstanding: string | number;
    createdAt?: string | Date;
    scheme?: { name: string; code: string };
  }>;
  savingsAccounts?: Array<{
    id: string;
    accountNumber?: string;
    status: string;
    balance: string | number;
  }>;
}

interface SchemeVersion {
  versionNumber: number;
  principalAmount?: string | null;
  totalRepaymentAmount?: string | null;
  termMonths: number;
  termsAndConditions?: string | null;
  minPrincipal?: string | null;
  maxPrincipal?: string | null;
  interestRate?: string | null;
  interestMethod?: string | null;
  repaymentFrequency?: string;
}

interface SchemeItem {
  id: string;
  code: string;
  name: string;
  versions: SchemeVersion[];
}

interface CashAccountItem {
  id: string;
  code: string;
  name: string;
  accountType: string;
  balance: unknown;
}

interface ApplicationItem {
  id: string;
  requestedPrincipal: string;
  requestedTermMonths: number;
  purpose: string;
  businessPurpose?: string | null;
  status: string;
  submittedAt?: Date | string | null;
  approvedAt?: Date | string | null;
  rejectedAt?: Date | string | null;
  createdAt: Date | string;
  createdById?: string | null;
  submittedById?: string | null;
  approvalReason?: string | null;
  rejectionReason?: string | null;
  customer: CustomerItem;
  scheme: {
    id: string;
    code: string;
    name: string;
    versions?: Array<{
      interestRate?: string;
      interestMethod?: string;
      repaymentFrequency?: string;
      minPrincipal?: string;
      maxPrincipal?: string;
      termMonths?: number;
    }>;
  };
  disbursements?: Array<{
    id: string;
    amount: string;
    status: string;
    disbursementDate: Date | string;
    loanAccountId?: string | null;
  }>;
}

interface LoanAccountItem {
  id: string;
  loanAccountNumber: string;
  principalDisbursed: string;
  principalOutstanding: string;
  totalRepaymentAmount?: string | null;
  totalPaid?: string | null;
  termMonths?: number | null;
  status: string;
  nextDueDate: Date | string | null;
  createdAt: Date | string;
  customer: {
    id: string;
    customerCode: string;
    fullName: string;
    phone: string;
    email: string | null;
  };
  scheme: {
    id: string;
    code: string;
    name: string;
  };
}

interface InstallmentItem {
  id: string;
  installmentNumber: number;
  dueDate: string;
  principalDue: string | number;
  interestDue: string | number;
  totalDue: string | number;
  principalPaid: string | number;
  interestPaid: string | number;
  totalPaid: string | number;
  status: string;
}

interface LoanDetailItem extends LoanAccountItem {
  installments: InstallmentItem[];
  disbursements: Array<{
    id: string;
    amount: string;
    disbursementDate: string;
    sourceReference: string;
  }>;
}

interface ClosureItem {
  id: string;
  closureNumber: string | null;
  asOfDate: string;
  principalOutstanding: string;
  accruedInterest: string;
  feeAmount: string;
  penaltyAmount: string;
  waiverAmount: string;
  waiverReason: string | null;
  totalSettlement: string;
  settlementPaymentAmount: string | null;
  status: string;
  reason: string;
  isReopened: boolean;
  reopenedAt: string | null;
  reopenReason: string | null;
  createdAt: string;
  loanAccount: {
    id: string;
    loanAccountNumber: string;
    customer: {
      id: string;
      customerCode: string;
      fullName: string;
      phone: string;
    };
    scheme: {
      name: string;
    };
  };
  cashAccount?: {
    id: string;
    name: string;
    code: string;
  } | null;
}

interface LoansClientProps {
  currentUserId: string;
  userRole?: string;
  userPermissions?: string[];
  summary: {
    totalDisbursed: string;
    totalOutstanding: string;
    activeCount: number;
    closedCount: number;
    totalAccounts: number;
    pipeline: {
      draft: number;
      submitted: number;
      approved: number;
    };
  };
  accounts: LoanAccountItem[];
  applications: ApplicationItem[];
  customers: CustomerItem[];
  schemes: SchemeItem[];
  cashAccounts: CashAccountItem[];
  closures?: ClosureItem[];
}

export function LoansClient({
  currentUserId,
  userPermissions,
  summary,
  accounts,
  applications,
  customers,
  schemes,
  cashAccounts,
  closures = [],
}: LoansClientProps) {
  const router = useRouter();
  const canCreateApplication = !userPermissions || userPermissions.includes("loan.application.create");
  const [activeTab, setActiveTab] = useState<"portfolio" | "applications" | "approvals" | "disbursements" | "closures">("portfolio");
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");

  // Modals state
  const [isApplyModalOpen, setIsApplyModalOpen] = useState(false);
  const [isDecisionModalOpen, setIsDecisionModalOpen] = useState(false);
  const [isDisburseModalOpen, setIsDisburseModalOpen] = useState(false);
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [isSubmitModalOpen, setIsSubmitModalOpen] = useState(false);

  // Closure states
  const [isCloseModalOpen, setIsCloseModalOpen] = useState(false);
  const [selectedAccountIdForClose, setSelectedAccountIdForClose] = useState<string | null>(null);
  const [settlementQuote, setSettlementQuote] = useState<any | null>(null);
  const [loadingQuote, setLoadingQuote] = useState(false);
  const [closeForm, setCloseForm] = useState({
    asOfDate: new Date().toISOString().slice(0, 10),
    waiverAmount: "0",
    waiverReason: "",
    settlementPaymentAmount: "",
    paymentMethod: "CASH" as "CASH" | "BANK_TRANSFER" | "UPI" | "CHEQUE",
    cashAccountId: cashAccounts[0]?.id || "",
    reason: "Full loan payoff & closure",
  });
  const [submittingClose, setSubmittingClose] = useState(false);
  const [closeError, setCloseError] = useState("");

  // Certificate modal state
  const [isCertModalOpen, setIsCertModalOpen] = useState(false);
  const [certData, setCertData] = useState<any | null>(null);
  const [loadingCert, setLoadingCert] = useState(false);

  // Reopen modal state
  const [isReopenModalOpen, setIsReopenModalOpen] = useState(false);
  const [selectedClosureForReopen, setSelectedClosureForReopen] = useState<ClosureItem | null>(null);
  const [reopenReason, setReopenReason] = useState("");
  const [submittingReopen, setSubmittingReopen] = useState(false);
  const [reopenError, setReopenError] = useState("");

  // Selected records
  const [selectedApp, setSelectedApp] = useState<ApplicationItem | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<LoanDetailItem | null>(null);
  const [loadingSchedule, setLoadingSchedule] = useState(false);

  // Credit Committee Appraisal states
  const [appraisalFilter, setAppraisalFilter] = useState<"PENDING" | "ALL" | "APPROVED" | "REJECTED">("PENDING");
  const [appraisalSearch, setAppraisalSearch] = useState("");
  const [showLoansView, setShowLoansView] = useState(false);
  const [appraisalModalTab, setAppraisalModalTab] = useState<"dossier" | "application" | "loans">("dossier");

  const openAppraisalModal = (app: ApplicationItem) => {
    setSelectedApp(app);
    setDecisionNotes(app.rejectionReason || app.approvalReason || "");
    setDecisionError("");
    setAppraisalModalTab("dossier");
    setIsDecisionModalOpen(true);
  };

  // Form states
  const [applyForm, setApplyForm] = useState({
    customerId: "",
    schemeId: "",
    requestedPrincipal: "",
    requestedTermMonths: "12",
    totalRepaymentAmount: "",
    purpose: "",
  });
  const [decisionNotes, setDecisionNotes] = useState("");
  const [decisionError, setDecisionError] = useState("");
  const [submitPurpose, setSubmitPurpose] = useState("");
  const [disburseForm, setDisburseForm] = useState({
    cashAccountId: cashAccounts[0]?.id || "",
    disbursementDate: new Date().toISOString().slice(0, 10),
    sourceReference: "",
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const handleSchemeSelect = (schemeId: string) => {
    const s = schemes.find((sc) => sc.id === schemeId);
    const v = s?.versions[0];
    const p = v?.principalAmount ?? v?.minPrincipal ?? "";
    const t = v?.termMonths ? String(v.termMonths) : "12";
    const r = v?.totalRepaymentAmount ?? v?.minPrincipal ?? p;
    setApplyForm((prev) => ({
      ...prev,
      schemeId,
      requestedPrincipal: p,
      requestedTermMonths: t,
      totalRepaymentAmount: r,
    }));
  };

  // Live calculation preview in application modal
  const selectedSchemeObj = schemes.find((s) => s.id === applyForm.schemeId);
  const activeVersion = selectedSchemeObj?.versions[0];
  const principalNum = parseFloat(applyForm.requestedPrincipal || "0");
  const termNum = parseInt(applyForm.requestedTermMonths || "1", 10);
  const totalRepayNum = parseFloat(applyForm.totalRepaymentAmount || applyForm.requestedPrincipal || "0");
  const estEmi = termNum > 0 && !isNaN(totalRepayNum) ? (totalRepayNum / termNum).toFixed(2) : "0.00";

  // Filter accounts
  const filteredAccounts = accounts.filter((acc) => {
    const matchesSearch =
      acc.loanAccountNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      acc.customer.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      acc.customer.customerCode.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === "ALL" || acc.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  // Filter applications
  const filteredApps = applications.filter((app) => {
    return (
      app.customer.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      app.customer.customerCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
      app.purpose.toLowerCase().includes(searchTerm.toLowerCase())
    );
  });

  const pendingApprovals = applications.filter((app) => app.status === "SUBMITTED");
  const readyDisbursements = applications.filter(
    (app) => app.status === "APPROVED" && (!app.disbursements || app.disbursements.length === 0)
  );

  const getCustomerLoans = (app: ApplicationItem) => {
    if (app.customer.loanAccounts && app.customer.loanAccounts.length > 0) {
      return app.customer.loanAccounts;
    }
    return accounts
      .filter(
        (acc) =>
          acc.customer.id === app.customer.id ||
          acc.customer.customerCode === app.customer.customerCode
      )
      .map((acc) => ({
        id: acc.id,
        loanAccountNumber: acc.loanAccountNumber,
        status: acc.status,
        principalDisbursed: acc.principalDisbursed,
        principalOutstanding: acc.principalOutstanding,
        createdAt: acc.createdAt,
        scheme: acc.scheme,
      }));
  };

  const getCustomerFull = (app: ApplicationItem) => {
    const fromList = customers.find(
      (c) => c.id === app.customer.id || c.customerCode === app.customer.customerCode
    );
    return {
      ...app.customer,
      ...(fromList || {}),
    };
  };

  const filteredAppraisals = applications.filter((app) => {
    let matchesFilter = true;
    if (appraisalFilter === "PENDING") {
      matchesFilter = app.status === "SUBMITTED";
    } else if (appraisalFilter === "APPROVED") {
      matchesFilter = app.status === "APPROVED" || app.status === "DISBURSED";
    } else if (appraisalFilter === "REJECTED") {
      matchesFilter = app.status === "REJECTED";
    }

    const term = appraisalSearch.toLowerCase().trim();
    if (!term) return matchesFilter;

    const cust = getCustomerFull(app);
    return (
      cust.fullName.toLowerCase().includes(term) ||
      cust.customerCode.toLowerCase().includes(term) ||
      (cust.phone && cust.phone.toLowerCase().includes(term)) ||
      (cust.aadhaarNumber && cust.aadhaarNumber.toLowerCase().includes(term)) ||
      app.scheme.name.toLowerCase().includes(term) ||
      (app.businessPurpose && app.businessPurpose.toLowerCase().includes(term)) ||
      (app.purpose && app.purpose.toLowerCase().includes(term))
    );
  });

  // Handlers
  async function handleCreateApplication(e: React.FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorMessage("");
    try {
      const res = await fetch("/api/loans/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId: applyForm.customerId,
          schemeId: applyForm.schemeId,
          requestedPrincipal: parseFloat(applyForm.requestedPrincipal).toFixed(4),
          requestedTermMonths: parseInt(applyForm.requestedTermMonths, 10),
          totalRepaymentAmount: parseFloat(applyForm.totalRepaymentAmount || applyForm.requestedPrincipal).toFixed(4),
          purpose: applyForm.purpose,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || "Failed to create loan application");
      }

      setIsApplyModalOpen(false);
      setSuccessMessage("Loan application saved as draft successfully.");
      router.refresh();
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : "Submission failed");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSubmitForReview(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedApp) return;
    setIsSubmitting(true);
    setErrorMessage("");
    try {
      const res = await fetch(`/api/loans/applications/${selectedApp.id}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessPurpose: submitPurpose || selectedApp.purpose,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || "Failed to submit loan application");
      }

      setIsSubmitModalOpen(false);
      setSuccessMessage("Application submitted to Credit Review Desk.");
      router.refresh();
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : "Submit failed");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDecision(action: "APPROVE" | "REJECT") {
    if (!selectedApp) return;
    setIsSubmitting(true);
    setDecisionError("");
    try {
      const res = await fetch(`/api/loans/applications/${selectedApp.id}/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          approvalReason: action === "APPROVE" ? decisionNotes || "Approved by Credit Committee" : undefined,
          rejectionReason: action === "REJECT" ? decisionNotes : undefined,
          enforceMakerChecker: true,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || "Decision failed");
      }

      setIsDecisionModalOpen(false);
      setSuccessMessage(`Application ${action.toLowerCase()}d successfully.`);
      router.refresh();
    } catch (err: unknown) {
      setDecisionError(err instanceof Error ? err.message : "Decision error");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDisburse(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedApp) return;
    setIsSubmitting(true);
    setErrorMessage("");
    try {
      const res = await fetch("/api/loans/disburse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          applicationId: selectedApp.id,
          cashAccountId: disburseForm.cashAccountId,
          disbursementDate: disburseForm.disbursementDate,
          amount: parseFloat(selectedApp.requestedPrincipal).toFixed(4),
          sourceReference: disburseForm.sourceReference || `VOUCH-${Date.now().toString().slice(-6)}`,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || "Disbursement failed");
      }

      setIsDisburseModalOpen(false);
      setSuccessMessage(`Loan disbursed successfully! Account LA-${data.result.loanAccount.loanAccountNumber} activated and general ledger voucher posted.`);
      router.refresh();
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : "Disbursement error");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function viewSchedule(accountId: string) {
    setLoadingSchedule(true);
    setIsScheduleModalOpen(true);
    setSelectedDetail(null);
    try {
      const res = await fetch(`/api/loans/accounts/${accountId}`);
      const data = await res.json();
      if (res.ok) {
        setSelectedDetail(data.account);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingSchedule(false);
    }
  }

  async function openCloseModal(accountId: string) {
    setSelectedAccountIdForClose(accountId);
    setIsCloseModalOpen(true);
    setLoadingQuote(true);
    setCloseError("");
    setSettlementQuote(null);
    try {
      const today = new Date().toISOString().slice(0, 10);
      const res = await fetch(`/api/loans/accounts/${accountId}/quote?asOfDate=${today}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || "Failed to calculate quote");
      setSettlementQuote(data.quote);
      setCloseForm({
        asOfDate: today,
        waiverAmount: "0",
        waiverReason: "",
        settlementPaymentAmount: data.quote.netSettlement,
        paymentMethod: "CASH",
        cashAccountId: cashAccounts[0]?.id || "",
        reason: "Full loan payoff & closure",
      });
    } catch (err: unknown) {
      setCloseError(err instanceof Error ? err.message : "Error fetching settlement quote");
    } finally {
      setLoadingQuote(false);
    }
  }

  async function handleAsOfDateChange(newDate: string) {
    if (!selectedAccountIdForClose) return;
    setCloseForm((f) => ({ ...f, asOfDate: newDate }));
    try {
      const res = await fetch(
        `/api/loans/accounts/${selectedAccountIdForClose}/quote?asOfDate=${newDate}&waiverAmount=${closeForm.waiverAmount}`
      );
      const data = await res.json();
      if (res.ok) {
        setSettlementQuote(data.quote);
        setCloseForm((f) => ({ ...f, settlementPaymentAmount: data.quote.netSettlement }));
      }
    } catch (err) {
      console.error(err);
    }
  }

  function handleWaiverChange(newWaiver: string) {
    const waiverVal = parseFloat(newWaiver || "0");
    setCloseForm((f) => ({ ...f, waiverAmount: newWaiver }));
    if (settlementQuote) {
      const gross = parseFloat(settlementQuote.grossSettlement);
      const net = Math.max(0, gross - waiverVal);
      setSettlementQuote((q: any) => ({
        ...q,
        waiverAmount: waiverVal.toFixed(4),
        netSettlement: net.toFixed(4),
      }));
      setCloseForm((f) => ({ ...f, settlementPaymentAmount: net.toFixed(4) }));
    }
  }

  async function handlePostClosure() {
    if (!selectedAccountIdForClose) return;
    setSubmittingClose(true);
    setCloseError("");
    try {
      const res = await fetch(`/api/loans/accounts/${selectedAccountIdForClose}/close`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          asOfDate: closeForm.asOfDate,
          settlementPaymentAmount: closeForm.settlementPaymentAmount,
          cashAccountId: parseFloat(closeForm.settlementPaymentAmount || "0") > 0 ? closeForm.cashAccountId : undefined,
          paymentMethod: closeForm.paymentMethod,
          waiverAmount: closeForm.waiverAmount,
          waiverReason: closeForm.waiverReason,
          reason: closeForm.reason,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || "Loan closure failed");

      setIsCloseModalOpen(false);
      setSuccessMessage(`Loan closure posted successfully! Receipt: ${data.closure.closureNumber}. General ledger updated.`);
      router.refresh();
      openCertificateModal(selectedAccountIdForClose);
    } catch (err: unknown) {
      setCloseError(err instanceof Error ? err.message : "Closure error");
    } finally {
      setSubmittingClose(false);
    }
  }

  async function openCertificateModal(loanAccountId: string) {
    setIsCertModalOpen(true);
    setLoadingCert(true);
    setCertData(null);
    try {
      const res = await fetch(`/api/loans/closures/${loanAccountId}/certificate`);
      const data = await res.json();
      if (res.ok) {
        setCertData(data.certificate);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingCert(false);
    }
  }

  function openReopenModal(closure: ClosureItem) {
    setSelectedClosureForReopen(closure);
    setIsReopenModalOpen(true);
    setReopenReason("");
    setReopenError("");
  }

  async function handleReopenClosure() {
    if (!selectedClosureForReopen) return;
    setSubmittingReopen(true);
    setReopenError("");
    try {
      const res = await fetch(`/api/loans/closures/${selectedClosureForReopen.id}/reopen`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reason: reopenReason,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || "Failed to reopen loan");

      setIsReopenModalOpen(false);
      setSuccessMessage(`Loan account reinstated to ACTIVE status! Reversal journal recorded.`);
      router.refresh();
    } catch (err: unknown) {
      setReopenError(err instanceof Error ? err.message : "Reopen error");
    } finally {
      setSubmittingReopen(false);
    }
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Top Banner */}
      <div className="bg-slate-900 text-white rounded-xl p-6 shadow-sm flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-blue-900/60 text-[11px] font-semibold tracking-wider uppercase mb-2 text-blue-200">
            <BadgePercent className="h-3 w-3" />
            Credit Operations
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Loan Operations & Portfolio Command Center</h1>
          <p className="text-xs text-slate-300 mt-1 max-w-2xl">
            Atomic disbursement pipeline, dual-officer maker-checker approvals, and balanced General Ledger postings
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/loans/schemes">
            <Button variant="secondary" size="sm" className="bg-slate-800 text-slate-200 border-slate-700 hover:bg-slate-700">
              Schemes Catalog
            </Button>
          </Link>
          {canCreateApplication && (
            <Button size="sm" onClick={() => setIsApplyModalOpen(true)} className="bg-blue-600 hover:bg-blue-500 text-white shadow">
              <PlusCircle className="h-4 w-4 mr-1.5" />
              New Application
            </Button>
          )}
        </div>
      </div>

      {/* Success / Error Notification Banners */}
      {successMessage && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-3 rounded-lg text-sm flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
            <span>{successMessage}</span>
          </div>
          <button onClick={() => setSuccessMessage("")} className="text-emerald-600 hover:text-emerald-800">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {errorMessage && (
        <div className="bg-rose-50 border border-rose-200 text-rose-800 px-4 py-3 rounded-lg text-sm flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0" />
            <span>{errorMessage}</span>
          </div>
          <button onClick={() => setErrorMessage("")} className="text-rose-600 hover:text-rose-800">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-4 bg-white border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase text-slate-500">Active Accounts</span>
            <span className="p-1.5 bg-blue-50 rounded text-blue-600"><Building className="h-4 w-4" /></span>
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-900">{summary.activeCount}</div>
          <div className="text-[11px] text-slate-500 mt-1">Total Created: {summary.totalAccounts}</div>
        </Card>

        <Card className="p-4 bg-white border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase text-slate-500">Total Disbursed</span>
            <span className="p-1.5 bg-emerald-50 rounded text-emerald-600"><DollarSign className="h-4 w-4" /></span>
          </div>
          <div className="mt-2 text-2xl font-bold text-emerald-700">₹{parseFloat(summary.totalDisbursed).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</div>
          <div className="text-[11px] text-slate-500 mt-1">Cumulative Portfolio</div>
        </Card>

        <Card className="p-4 bg-white border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase text-slate-500">Outstanding Principal</span>
            <span className="p-1.5 bg-indigo-50 rounded text-indigo-600"><CreditCard className="h-4 w-4" /></span>
          </div>
          <div className="mt-2 text-2xl font-bold text-indigo-700">₹{parseFloat(summary.totalOutstanding).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</div>
          <div className="text-[11px] text-slate-500 mt-1">GL Account 1201 Active</div>
        </Card>

        <Card className="p-4 bg-white border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase text-slate-500">Pipeline Queues</span>
            <span className="p-1.5 bg-amber-50 rounded text-amber-600"><Clock className="h-4 w-4" /></span>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <span className="text-base font-bold text-amber-600">{summary.pipeline.submitted} Review</span>
            <span className="text-xs text-slate-300">|</span>
            <span className="text-base font-bold text-blue-600">{summary.pipeline.approved} Disburse</span>
          </div>
          <div className="text-[11px] text-slate-500 mt-1">{summary.pipeline.draft} Draft Applications</div>
        </Card>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 gap-6 text-sm font-semibold">
        <button
          onClick={() => setActiveTab("portfolio")}
          className={`pb-3 transition-colors flex items-center gap-2 ${
            activeTab === "portfolio" ? "border-b-2 border-blue-600 text-blue-700 font-bold" : "text-slate-500 hover:text-slate-900"
          }`}
        >
          <span>Active Loan Accounts</span>
          <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-slate-100 text-slate-600">{accounts.length}</span>
        </button>

        <button
          onClick={() => setActiveTab("applications")}
          className={`pb-3 transition-colors flex items-center gap-2 ${
            activeTab === "applications" ? "border-b-2 border-blue-600 text-blue-700 font-bold" : "text-slate-500 hover:text-slate-900"
          }`}
        >
          <span>Application Pipeline</span>
          <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-slate-100 text-slate-600">{applications.length}</span>
        </button>

        <button
          onClick={() => setActiveTab("approvals")}
          className={`pb-3 transition-colors flex items-center gap-2 ${
            activeTab === "approvals" ? "border-b-2 border-amber-600 text-amber-700 font-bold" : "text-slate-500 hover:text-slate-900"
          }`}
        >
          <span>Credit Committee Appraisal</span>
          {pendingApprovals.length > 0 && (
            <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-amber-100 text-amber-800 font-bold">{pendingApprovals.length}</span>
          )}
        </button>

        <button
          onClick={() => setActiveTab("disbursements")}
          className={`pb-3 transition-colors flex items-center gap-2 ${
            activeTab === "disbursements" ? "border-b-2 border-emerald-600 text-emerald-700 font-bold" : "text-slate-500 hover:text-slate-900"
          }`}
        >
          <span>Disbursement Desk</span>
          {readyDisbursements.length > 0 && (
            <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-emerald-100 text-emerald-800 font-bold">{readyDisbursements.length}</span>
          )}
        </button>

        <button
          onClick={() => setActiveTab("closures")}
          className={`pb-3 transition-colors flex items-center gap-2 ${
            activeTab === "closures" ? "border-b-2 border-indigo-600 text-indigo-700 font-bold" : "text-slate-500 hover:text-slate-900"
          }`}
        >
          <span>Loan Closures & Settlements</span>
          <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-slate-100 text-slate-600">{closures.length}</span>
        </button>
      </div>

      {/* Filter / Search Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3 rounded-lg border border-slate-200">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search by customer name, code, loan account number, or purpose..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-1.5 text-sm rounded-md border border-slate-200 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          />
        </div>
        {activeTab === "portfolio" && (
          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-500 font-medium">Status:</span>
            {["ALL", "ACTIVE", "CLOSED"].map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-2.5 py-1 rounded text-xs font-semibold ${
                  statusFilter === s ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Tab 1: Active Loan Accounts */}
      {activeTab === "portfolio" && (
        <Card className="bg-white border border-slate-200 shadow-sm overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Account Number</TableHead>
                <TableHead>Borrower</TableHead>
                <TableHead>Loan Scheme</TableHead>
                <TableHead>Disbursed</TableHead>
                <TableHead>Outstanding</TableHead>
                <TableHead>Next Due Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredAccounts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="p-0">
                    <TableEmptyState message="No loan accounts found. Disburse approved loan applications to activate accounts." />
                  </TableCell>
                </TableRow>
              ) : (
                filteredAccounts.map((account) => (
                  <TableRow key={account.id}>
                    <TableCell className="font-mono text-xs font-bold text-blue-700">
                      {account.loanAccountNumber}
                    </TableCell>
                    <TableCell>
                      <div className="font-medium text-slate-900">{account.customer.fullName}</div>
                      <div className="text-[11px] text-slate-500">{account.customer.customerCode} • {account.customer.phone}</div>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs font-semibold text-slate-700">{account.scheme.name}</span>
                    </TableCell>
                    <TableCell className="font-medium text-slate-900">
                      ₹{parseFloat(account.principalDisbursed).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell className="font-semibold text-indigo-700">
                      ₹{parseFloat(account.principalOutstanding).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell className="text-xs text-slate-600">
                      {account.nextDueDate ? new Date(account.nextDueDate).toLocaleDateString("en-IN") : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={account.status === "ACTIVE" ? "success" : "neutral"} className="text-[11px]">
                        {account.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right space-x-1 whitespace-nowrap">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => viewSchedule(account.id)}
                        className="text-xs text-blue-700 hover:bg-blue-50"
                      >
                        <Eye className="h-3.5 w-3.5 mr-1" />
                        Schedule
                      </Button>
                      {account.status === "ACTIVE" && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openCloseModal(account.id)}
                          className="text-xs text-rose-700 border-rose-200 hover:bg-rose-50"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                          Close Loan
                        </Button>
                      )}
                      {account.status === "CLOSED" && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openCertificateModal(account.id)}
                          className="text-xs text-emerald-700 border-emerald-200 hover:bg-emerald-50"
                        >
                          <FileText className="h-3.5 w-3.5 mr-1" />
                          Certificate
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Tab 2: Application Pipeline */}
      {activeTab === "applications" && (
        <Card className="bg-white border border-slate-200 shadow-sm overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Borrower</TableHead>
                <TableHead>Requested Scheme</TableHead>
                <TableHead>Requested Principal</TableHead>
                <TableHead>Term</TableHead>
                <TableHead>Purpose</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredApps.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="p-0">
                    <TableEmptyState message="No applications in pipeline. Click 'New Application' to draft a loan request." />
                  </TableCell>
                </TableRow>
              ) : (
                filteredApps.map((app) => (
                  <TableRow key={app.id}>
                    <TableCell>
                      <div className="font-medium text-slate-900">{app.customer.fullName}</div>
                      <div className="text-[11px] text-slate-500">{app.customer.customerCode} • {app.customer.phone}</div>
                    </TableCell>
                    <TableCell className="text-xs text-slate-700 font-medium">
                      {app.scheme.name}
                    </TableCell>
                    <TableCell className="font-bold text-slate-900">
                      ₹{parseFloat(app.requestedPrincipal).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell className="text-xs text-slate-600">
                      {app.requestedTermMonths} Months
                    </TableCell>
                    <TableCell className="text-xs text-slate-600 max-w-xs truncate">
                      {app.purpose}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          app.status === "APPROVED"
                            ? "success"
                            : app.status === "SUBMITTED"
                            ? "warning"
                            : app.status === "REJECTED"
                            ? "danger"
                            : "neutral"
                        }
                        className="text-[11px]"
                      >
                        {app.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {app.status === "DRAFT" && (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            setSelectedApp(app);
                            setSubmitPurpose(app.purpose);
                            setIsSubmitModalOpen(true);
                          }}
                          className="text-xs"
                        >
                          Submit
                        </Button>
                      )}
                      {app.status === "SUBMITTED" && (
                        <Button
                          size="sm"
                          onClick={() => {
                            openAppraisalModal(app);
                          }}
                          className="text-xs bg-amber-600 hover:bg-amber-500 text-white"
                        >
                          Appraisal Desk
                        </Button>
                      )}
                      {app.status === "APPROVED" && (
                        <Button
                          size="sm"
                          onClick={() => {
                            setSelectedApp(app);
                            setIsDisburseModalOpen(true);
                          }}
                          className="text-xs bg-emerald-600 hover:bg-emerald-500 text-white"
                        >
                          Disburse
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Tab 3: Credit Committee Appraisal Desk */}
      {activeTab === "approvals" && (
        <div className="space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-900 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-amber-700 shrink-0" />
              <span>
                <strong>Maker-Checker Enforced:</strong> Credit appraisals cannot be sanctioned by the submitting credit officer. Click any row or the Appraise button to view borrower KYC, active loans, and committee review desk.
              </span>
            </div>
            <span className="font-semibold text-amber-800 bg-amber-100/70 px-2 py-0.5 rounded shrink-0">
              {pendingApprovals.length} Pending Review
            </span>
          </div>

          {/* Appraisal Controls & Toolbar */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-white p-3 rounded-lg border border-slate-200 shadow-xs">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setAppraisalFilter("PENDING")}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  appraisalFilter === "PENDING"
                    ? "bg-amber-600 text-white shadow-xs"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                Pending Appraisal ({pendingApprovals.length})
              </button>
              <button
                type="button"
                onClick={() => setAppraisalFilter("ALL")}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  appraisalFilter === "ALL"
                    ? "bg-blue-600 text-white shadow-xs"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                Show All Applications ({applications.length})
              </button>
              <button
                type="button"
                onClick={() => setAppraisalFilter("APPROVED")}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  appraisalFilter === "APPROVED"
                    ? "bg-emerald-600 text-white shadow-xs"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                Approved Loans ({applications.filter((a) => a.status === "APPROVED" || a.status === "DISBURSED").length})
              </button>
              <button
                type="button"
                onClick={() => setAppraisalFilter("REJECTED")}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  appraisalFilter === "REJECTED"
                    ? "bg-rose-600 text-white shadow-xs"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                Rejected ({applications.filter((a) => a.status === "REJECTED").length})
              </button>
            </div>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant={showLoansView ? "primary" : "secondary"}
                onClick={() => setShowLoansView(!showLoansView)}
                className={`text-xs flex items-center gap-1.5 ${showLoansView ? "bg-indigo-600 text-white" : ""}`}
                title="Toggle inline borrower loan accounts display"
              >
                <CreditCard className="h-3.5 w-3.5" />
                {showLoansView ? "Hide Loans View" : "Show Loans Mode"}
              </Button>
              <div className="relative w-64">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search applicant, Aadhaar, scheme..."
                  value={appraisalSearch}
                  onChange={(e) => setAppraisalSearch(e.target.value)}
                  className="w-full text-xs pl-8 pr-3 py-1.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>

          {/* Table */}
          <Card className="bg-white border border-slate-200 shadow-sm overflow-hidden">
            <div className="bg-slate-50 px-4 py-2 border-b border-slate-200 flex items-center justify-between text-[11px] text-slate-500">
              <span className="flex items-center gap-1.5">
                <ListFilter className="h-3.5 w-3.5 text-slate-400" />
                Showing {filteredAppraisals.length} application(s) • <em>Every row is clickable to show borrower dossier & loan details</em>
              </span>
              <span>Filter: {appraisalFilter}</span>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Applicant & KYC</TableHead>
                  <TableHead>Center & Branch</TableHead>
                  <TableHead>Scheme & Terms</TableHead>
                  <TableHead>Requested Principal</TableHead>
                  <TableHead>Customer Loans</TableHead>
                  <TableHead>Business Purpose</TableHead>
                  <TableHead>Maker Officer</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAppraisals.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="p-0">
                      <TableEmptyState message="No loan applications found matching your appraisal filter and search criteria." />
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredAppraisals.map((app) => {
                    const isMaker = app.createdById === currentUserId || app.submittedById === currentUserId;
                    const custFull = getCustomerFull(app);
                    const custLoans = getCustomerLoans(app);
                    const activeLoans = custLoans.filter((l) => l.status === "ACTIVE");
                    const activeBal = activeLoans.reduce(
                      (sum, l) => sum + parseFloat(String(l.principalOutstanding || "0")),
                      0
                    );
                    const centerName = custFull.customerGroups?.[0]?.group?.name;
                    const branchName = custFull.branch?.name;

                    return (
                      <React.Fragment key={app.id}>
                        <TableRow
                          onClick={() => openAppraisalModal(app)}
                          className="cursor-pointer hover:bg-amber-50/80 transition-colors group"
                          title="Click row to open borrower details & loan application dossier"
                        >
                          <TableCell>
                            <div className="font-semibold text-slate-900 group-hover:text-blue-700 flex items-center gap-1.5">
                              {app.customer.fullName}
                              {custFull.aadhaarNumber && (
                                <span title="Aadhaar KYC Verified" className="text-emerald-600">
                                  <Shield className="h-3 w-3" />
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-500 font-mono">
                              {app.customer.customerCode} • {app.customer.phone}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="text-xs font-medium text-slate-800">{centerName || "Individual"}</div>
                            <div className="text-[11px] text-slate-500">{branchName || "Main Branch"}</div>
                          </TableCell>
                          <TableCell>
                            <div className="font-semibold text-xs text-slate-800">{app.scheme.name}</div>
                            <div className="text-[11px] text-slate-500">
                              {app.requestedTermMonths} Mos @ {app.scheme.versions?.[0]?.interestRate ?? "14"}% p.a.
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="font-bold text-slate-900">
                              ₹{parseFloat(app.requestedPrincipal).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                            </div>
                            <div className="text-[10px] text-slate-400">Principal</div>
                          </TableCell>
                          <TableCell>
                            {activeLoans.length > 0 ? (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openAppraisalModal(app);
                                  setAppraisalModalTab("loans");
                                }}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100 transition-colors"
                                title="Click to inspect borrower loans"
                              >
                                <CreditCard className="h-3 w-3" />
                                {activeLoans.length} Active (₹{activeBal.toLocaleString("en-IN")})
                              </button>
                            ) : custLoans.length > 0 ? (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openAppraisalModal(app);
                                  setAppraisalModalTab("loans");
                                }}
                                className="inline-flex items-center gap-1 text-[11px] text-slate-600 hover:text-slate-900"
                                title="Click to inspect borrower loans"
                              >
                                {custLoans.length} Prior (Closed)
                              </button>
                            ) : (
                              <Badge variant="neutral" className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200">
                                New Borrower
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-xs text-slate-600 max-w-xs truncate" title={app.businessPurpose || app.purpose}>
                            {app.businessPurpose || app.purpose}
                          </TableCell>
                          <TableCell className="text-xs">
                            {isMaker ? (
                              <Badge variant="warning" className="text-[10px]">You are Maker</Badge>
                            ) : (
                              <span className="text-slate-500 text-[11px]">Credit Officer</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                app.status === "APPROVED" || app.status === "DISBURSED"
                                  ? "success"
                                  : app.status === "REJECTED"
                                  ? "danger"
                                  : app.status === "SUBMITTED"
                                  ? "warning"
                                  : "neutral"
                              }
                              className="text-[10px]"
                            >
                              {app.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                openAppraisalModal(app);
                              }}
                              className="text-xs bg-amber-600 hover:bg-amber-500 text-white flex items-center gap-1 shadow-xs ml-auto"
                            >
                              <Eye className="h-3.5 w-3.5" />
                              <span>Show & Appraise</span>
                            </Button>
                          </TableCell>
                        </TableRow>

                        {/* Inline Expandable Loans view when showLoansView is active */}
                        {showLoansView && (
                          <TableRow className="bg-slate-50/70 border-b border-slate-200">
                            <TableCell colSpan={9} className="py-2.5 px-6">
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                                <div className="flex items-center gap-2">
                                  <span className="font-semibold text-slate-700 flex items-center gap-1.5">
                                    <CreditCard className="h-3.5 w-3.5 text-indigo-600" />
                                    Existing Loan Accounts for {app.customer.fullName}:
                                  </span>
                                  {custLoans.length === 0 ? (
                                    <span className="text-slate-400 italic">No existing loan accounts found for this borrower.</span>
                                  ) : (
                                    <div className="flex flex-wrap gap-1.5">
                                      {custLoans.map((cl) => (
                                        <span
                                          key={cl.id}
                                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-white border border-slate-200 text-slate-700 text-[11px]"
                                        >
                                          <span className="font-mono font-bold text-slate-900">{cl.loanAccountNumber || "Loan"}</span>
                                          <span className="text-slate-300">•</span>
                                          <span className="font-semibold text-indigo-700">₹{parseFloat(String(cl.principalOutstanding || "0")).toLocaleString("en-IN")} due</span>
                                          <span className="text-slate-300">•</span>
                                          <span className={`text-[10px] uppercase font-bold ${cl.status === "ACTIVE" ? "text-emerald-600" : "text-slate-500"}`}>
                                            {cl.status}
                                          </span>
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                </div>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openAppraisalModal(app);
                                  }}
                                  className="text-xs text-blue-600 hover:text-blue-800"
                                >
                                  Open Borrower Dossier →
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </React.Fragment>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </Card>
        </div>
      )}

      {/* Tab 4: Disbursement Desk */}
      {activeTab === "disbursements" && (
        <div className="space-y-4">
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-xs text-emerald-900 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-700" />
              <span><strong>Atomic Payout Invariant:</strong> Disbursement generates loan account, calculates repayment schedule, and commits general ledger lines atomically.</span>
            </div>
            <span className="font-semibold">{readyDisbursements.length} Ready for Payout</span>
          </div>

          <Card className="bg-white border border-slate-200 shadow-sm overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Borrower</TableHead>
                  <TableHead>Scheme</TableHead>
                  <TableHead>Approved Amount</TableHead>
                  <TableHead>Term</TableHead>
                  <TableHead>Approval Date</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {readyDisbursements.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="p-0">
                      <TableEmptyState message="No approved loans awaiting disbursement. When applications are approved by credit committee, they appear here for payout." />
                    </TableCell>
                  </TableRow>
                ) : (
                  readyDisbursements.map((app) => (
                    <TableRow key={app.id}>
                      <TableCell>
                        <div className="font-medium text-slate-900">{app.customer.fullName}</div>
                        <div className="text-[11px] text-slate-500">{app.customer.customerCode} • {app.customer.phone}</div>
                      </TableCell>
                      <TableCell className="text-xs text-slate-700 font-semibold">{app.scheme.name}</TableCell>
                      <TableCell className="font-bold text-emerald-700 text-sm">
                        ₹{parseFloat(app.requestedPrincipal).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell className="text-xs text-slate-600">{app.requestedTermMonths} Months</TableCell>
                      <TableCell className="text-xs text-slate-500">
                        {app.approvedAt ? new Date(app.approvedAt).toLocaleDateString("en-IN") : "Recent"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          onClick={() => {
                            setSelectedApp(app);
                            setDisburseForm({
                              cashAccountId: disburseForm.cashAccountId || cashAccounts[0]?.id || "",
                              disbursementDate: new Date().toISOString().slice(0, 10),
                              sourceReference: `DISB-${app.customer.customerCode || "VOUCH"}-${Date.now().toString().slice(-4)}`,
                            });
                            setIsDisburseModalOpen(true);
                          }}
                          className="text-xs bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm"
                        >
                          <CreditCard className="h-3.5 w-3.5 mr-1" />
                          Post Disbursement
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

      {/* Tab 5: Loan Closures & Settlements */}
      {activeTab === "closures" && (
        <div className="space-y-4">
          <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3 text-xs text-indigo-900 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-indigo-700" />
              <span>
                <strong>Controlled Closure Invariant:</strong> Loans cannot close with unresolved balances unless explicit approved waivers or settlements balance the account to NIL.
              </span>
            </div>
            <span className="font-semibold">{closures.length} Total Closures Recorded</span>
          </div>

          <Card className="bg-white border border-slate-200 shadow-sm overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Closure Ref</TableHead>
                  <TableHead>Borrower</TableHead>
                  <TableHead>Loan Account</TableHead>
                  <TableHead>As-Of Date</TableHead>
                  <TableHead>Principal Settled</TableHead>
                  <TableHead>Waiver</TableHead>
                  <TableHead>Settlement Paid</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {closures.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="p-0">
                      <TableEmptyState message="No loan closures recorded yet. When active loans are settled in full or waived, formal closure certificates and ledger entries will appear here." />
                    </TableCell>
                  </TableRow>
                ) : (
                  closures.map((closure) => (
                    <TableRow key={closure.id}>
                      <TableCell className="font-mono text-xs font-bold text-indigo-700">
                        {closure.closureNumber ?? "—"}
                      </TableCell>
                      <TableCell>
                        <div className="font-medium text-slate-900">{closure.loanAccount.customer.fullName}</div>
                        <div className="text-[11px] text-slate-500">{closure.loanAccount.customer.customerCode} • {closure.loanAccount.customer.phone}</div>
                      </TableCell>
                      <TableCell>
                        <span className="font-mono text-xs text-slate-800">{closure.loanAccount.loanAccountNumber}</span>
                        <div className="text-[10px] text-slate-500">{closure.loanAccount.scheme.name}</div>
                      </TableCell>
                      <TableCell className="text-xs text-slate-600">
                        {closure.asOfDate}
                      </TableCell>
                      <TableCell className="font-medium text-slate-900 text-xs">
                        ₹{parseFloat(closure.principalOutstanding).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell className="text-xs">
                        {parseFloat(closure.waiverAmount) > 0 ? (
                          <div>
                            <span className="text-rose-700 font-semibold">₹{parseFloat(closure.waiverAmount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
                            {closure.waiverReason && (
                              <div className="text-[10px] text-slate-500 truncate max-w-[140px]" title={closure.waiverReason}>
                                {closure.waiverReason}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </TableCell>
                      <TableCell className="font-bold text-emerald-700 text-xs">
                        ₹{parseFloat(closure.settlementPaymentAmount || closure.totalSettlement).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={closure.status === "POSTED" ? "success" : "warning"}
                          className="text-[10px]"
                        >
                          {closure.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right space-x-1 whitespace-nowrap">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => openCertificateModal(closure.loanAccount.id)}
                          className="text-xs text-emerald-700 hover:bg-emerald-50"
                        >
                          <FileText className="h-3.5 w-3.5 mr-1" />
                          Certificate
                        </Button>
                        {closure.status === "POSTED" && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => openReopenModal(closure)}
                            className="text-xs text-amber-700 hover:bg-amber-50"
                          >
                            <RotateCcw className="h-3.5 w-3.5 mr-1" />
                            Reopen
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Card>
        </div>
      )}

      {/* --- MODAL: New Loan Application --- */}
      {isApplyModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl max-w-lg w-full p-6 shadow-xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b pb-3">
              <div>
                <h3 className="font-bold text-slate-900">New Loan Application</h3>
                <p className="text-xs text-slate-500">Draft a loan request for borrower appraisal</p>
              </div>
              <button onClick={() => setIsApplyModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreateApplication} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Borrower</label>
                <select
                  required
                  value={applyForm.customerId}
                  onChange={(e) => setApplyForm({ ...applyForm, customerId: e.target.value })}
                  className="w-full text-sm border rounded-lg p-2 focus:ring-1 focus:ring-blue-500"
                >
                  <option value="">Select registered customer...</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>{c.fullName} ({c.customerCode})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Loan Scheme</label>
                <select
                  required
                  value={applyForm.schemeId}
                  onChange={(e) => handleSchemeSelect(e.target.value)}
                  className="w-full text-sm border rounded-lg p-2 focus:ring-1 focus:ring-blue-500"
                >
                  <option value="">Select loan scheme...</option>
                  {schemes.map((s) => (
                    <option key={s.id} value={s.id}>{s.name} ({s.code})</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Principal Amount (₹)</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    placeholder="e.g. 50000"
                    value={applyForm.requestedPrincipal}
                    onChange={(e) => setApplyForm({ ...applyForm, requestedPrincipal: e.target.value })}
                    className="w-full text-sm border rounded-lg p-2 focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Duration (Months)</label>
                  <input
                    type="number"
                    min="1"
                    max="600"
                    required
                    value={applyForm.requestedTermMonths}
                    onChange={(e) => setApplyForm({ ...applyForm, requestedTermMonths: e.target.value })}
                    className="w-full text-sm border rounded-lg p-2 focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Total Repayment (₹)</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    placeholder="e.g. 54000"
                    value={applyForm.totalRepaymentAmount}
                    onChange={(e) => setApplyForm({ ...applyForm, totalRepaymentAmount: e.target.value })}
                    className="w-full text-sm border rounded-lg p-2 focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Real-time preview */}
              {principalNum > 0 && activeVersion && (
                <div className="bg-blue-50/70 border border-blue-200 rounded-lg p-3 text-xs space-y-1">
                  <div className="font-semibold text-blue-900 flex items-center justify-between">
                    <span>Scheme Repayment Preview</span>
                    <span className="font-mono text-blue-700">{selectedSchemeObj?.code}</span>
                  </div>
                  <div className="flex justify-between text-slate-700">
                    <span>Principal Amount:</span>
                    <span className="font-semibold text-slate-900">₹{principalNum.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div className="flex justify-between text-slate-700">
                    <span>Total Repayment Obligation:</span>
                    <span className="font-bold text-slate-900">₹{totalRepayNum.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div className="flex justify-between text-slate-700">
                    <span>Repayment Duration:</span>
                    <span className="font-semibold text-slate-900">{termNum} Months</span>
                  </div>
                  <div className="flex justify-between text-blue-800 border-t border-blue-200/60 pt-1 mt-1">
                    <span>Indicative Monthly EMI:</span>
                    <span className="font-bold">₹{estEmi} / mo</span>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Purpose of Loan</label>
                <textarea
                  rows={2}
                  required
                  placeholder="Detail borrower's business or personal loan utilization..."
                  value={applyForm.purpose}
                  onChange={(e) => setApplyForm({ ...applyForm, purpose: e.target.value })}
                  className="w-full text-sm border rounded-lg p-2 focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t">
                <Button type="button" variant="secondary" size="sm" onClick={() => setIsApplyModalOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={isSubmitting} className="bg-blue-600 text-white">
                  {isSubmitting ? "Saving..." : "Save Draft Application"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- MODAL: Submit Application for Review --- */}
      {isSubmitModalOpen && selectedApp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-bold text-slate-900">Submit Application for Review</h3>
              <button onClick={() => setIsSubmitModalOpen(false)} className="text-slate-400">
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="text-xs text-slate-600">
              Submit loan application for <strong>{selectedApp.customer.fullName}</strong> (₹{parseFloat(selectedApp.requestedPrincipal).toLocaleString("en-IN")}) to the Credit Review Desk.
            </p>

            <form onSubmit={handleSubmitForReview} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Business Purpose Statement</label>
                <textarea
                  rows={3}
                  required
                  value={submitPurpose}
                  onChange={(e) => setSubmitPurpose(e.target.value)}
                  className="w-full text-sm border rounded-lg p-2"
                />
              </div>

              <div className="flex justify-end gap-2 border-t pt-2">
                <Button type="button" variant="secondary" size="sm" onClick={() => setIsSubmitModalOpen(false)}>Cancel</Button>
                <Button type="submit" size="sm" disabled={isSubmitting} className="bg-blue-600 text-white">
                  {isSubmitting ? "Submitting..." : "Submit to Committee"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- MODAL: Credit Committee Appraisal & Borrower Dossier --- */}
      {isDecisionModalOpen && selectedApp && (() => {
        const isMaker = selectedApp.createdById === currentUserId || selectedApp.submittedById === currentUserId;
        const custFull = getCustomerFull(selectedApp);
        const custLoans = getCustomerLoans(selectedApp);
        const activeCustLoans = custLoans.filter((l) => l.status === "ACTIVE");
        const totalOutstanding = activeCustLoans.reduce(
          (sum, l) => sum + parseFloat(String(l.principalOutstanding || "0")),
          0
        );
        const totalDisbursed = custLoans.reduce(
          (sum, l) => sum + parseFloat(String(l.principalDisbursed || "0")),
          0
        );
        const centerName = custFull.customerGroups?.[0]?.group?.name;
        const branchName = custFull.branch?.name;
        const schemeVersion = selectedApp.scheme.versions?.[0];
        const interestRate = schemeVersion?.interestRate || "14.00";
        const interestMethod = schemeVersion?.interestMethod || "REDUCING_BALANCE";
        const repaymentFreq = schemeVersion?.repaymentFrequency || "MONTHLY";

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
            <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[92vh] shadow-2xl flex flex-col overflow-hidden animate-in fade-in-50 duration-200">
              {/* Modal Header */}
              <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 bg-slate-50/80">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-amber-100 text-amber-800 rounded-xl">
                    <ShieldCheck className="h-6 w-6" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-lg text-slate-900">Credit Committee Appraisal & Dossier</h3>
                      <Badge
                        variant={
                          selectedApp.status === "APPROVED" || selectedApp.status === "DISBURSED"
                            ? "success"
                            : selectedApp.status === "REJECTED"
                            ? "danger"
                            : "warning"
                        }
                      >
                        {selectedApp.status}
                      </Badge>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Borrower: <strong className="text-slate-800">{custFull.fullName}</strong> ({custFull.customerCode}) • Application #{selectedApp.id.slice(0, 8)}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsDecisionModalOpen(false)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Maker restriction alert */}
              {isMaker && (
                <div className="mx-6 mt-4 bg-amber-50 border border-amber-300 rounded-lg p-3 text-xs text-amber-900 flex items-start gap-2.5">
                  <AlertTriangle className="h-4 w-4 text-amber-700 shrink-0 mt-0.5" />
                  <div>
                    <strong>Dual-Control Maker Restriction:</strong> You are recorded as the maker who submitted this loan application. Under core maker-checker credit policy, you cannot sanction or reject this application. Another authorized credit officer or manager must appraise and decide.
                  </div>
                </div>
              )}

              {/* Decision Error */}
              {decisionError && (
                <div className="mx-6 mt-4 bg-rose-50 border border-rose-200 text-rose-800 p-3 rounded-lg text-xs flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span>{decisionError}</span>
                </div>
              )}

              {/* Sub-Tabs Selector */}
              <div className="flex border-b border-slate-200 px-6 gap-6 pt-3 text-xs font-semibold bg-white">
                <button
                  type="button"
                  onClick={() => setAppraisalModalTab("dossier")}
                  className={`pb-2.5 flex items-center gap-1.5 transition-colors ${
                    appraisalModalTab === "dossier"
                      ? "border-b-2 border-amber-600 text-amber-700 font-bold"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  <User className="h-3.5 w-3.5" />
                  Borrower KYC & Profile
                </button>
                <button
                  type="button"
                  onClick={() => setAppraisalModalTab("application")}
                  className={`pb-2.5 flex items-center gap-1.5 transition-colors ${
                    appraisalModalTab === "application"
                      ? "border-b-2 border-amber-600 text-amber-700 font-bold"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  <FileText className="h-3.5 w-3.5" />
                  Loan Application Specs
                </button>
                <button
                  type="button"
                  onClick={() => setAppraisalModalTab("loans")}
                  className={`pb-2.5 flex items-center gap-1.5 transition-colors ${
                    appraisalModalTab === "loans"
                      ? "border-b-2 border-amber-600 text-amber-700 font-bold"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  <CreditCard className="h-3.5 w-3.5" />
                  Customer Existing Loans
                  <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-slate-100 text-slate-700">
                    {custLoans.length}
                  </span>
                </button>
              </div>

              {/* Modal Body: Scrollable */}
              <div className="p-6 overflow-y-auto space-y-4 flex-1">
                {/* TAB 1: BORROWER KYC & PROFILE */}
                {appraisalModalTab === "dossier" && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {/* Personal Info */}
                      <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2.5 text-xs">
                        <div className="font-bold text-slate-900 uppercase tracking-wider text-[11px] flex items-center gap-1.5 border-b pb-1.5">
                          <User className="h-3.5 w-3.5 text-blue-600" /> Personal Identity
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Full Legal Name:</span>
                          <span className="font-semibold text-slate-900">{custFull.fullName}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Customer ID:</span>
                          <span className="font-mono font-bold text-slate-800">{custFull.customerCode}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Guardian / Spouse:</span>
                          <span className="text-slate-900">{custFull.guardianName || "Not Provided"}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Gender / DOB:</span>
                          <span className="text-slate-900">
                            {custFull.gender || "—"}{" "}
                            {custFull.dateOfBirth ? `• ${new Date(custFull.dateOfBirth).toLocaleDateString("en-IN")}` : ""}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Member Status:</span>
                          <Badge variant={custFull.status === "ACTIVE" ? "success" : "neutral"} className="text-[10px]">
                            {custFull.status || "ACTIVE"}
                          </Badge>
                        </div>
                      </div>

                      {/* Contact & Address */}
                      <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2.5 text-xs">
                        <div className="font-bold text-slate-900 uppercase tracking-wider text-[11px] flex items-center gap-1.5 border-b pb-1.5">
                          <MapPin className="h-3.5 w-3.5 text-emerald-600" /> Contact & Location
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Primary Phone:</span>
                          <span className="font-semibold text-slate-900">{custFull.phone}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Email Address:</span>
                          <span className="text-slate-900">{custFull.email || "—"}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Occupation:</span>
                          <span className="font-medium text-slate-900">{custFull.occupation || "Not Specified"}</span>
                        </div>
                        <div className="space-y-1">
                          <span className="text-slate-500 block">Residential Address:</span>
                          <p className="text-slate-800 bg-white p-2 rounded border border-slate-200 text-[11px] leading-relaxed">
                            {custFull.residentialAddress || "No residential address recorded in KYC dossier."}
                          </p>
                        </div>
                      </div>

                      {/* KYC Documents & Affiliations */}
                      <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2.5 text-xs">
                        <div className="font-bold text-slate-900 uppercase tracking-wider text-[11px] flex items-center gap-1.5 border-b pb-1.5">
                          <Shield className="h-3.5 w-3.5 text-indigo-600" /> KYC & Affiliations
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-slate-500">Aadhaar Number:</span>
                          {custFull.aadhaarNumber ? (
                            <span className="font-mono font-bold text-slate-900 flex items-center gap-1">
                              {custFull.aadhaarNumber}
                              <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                            </span>
                          ) : (
                            <span className="text-amber-600 italic">Pending KYC</span>
                          )}
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">PAN Number:</span>
                          <span className="font-mono text-slate-900">{custFull.panNumber || "—"}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Center / JLG:</span>
                          <span className="font-medium text-slate-900">{centerName || "Individual / Direct"}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Operating Branch:</span>
                          <span className="text-slate-900">{branchName || "Main Branch"}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Nominee / Guarantor:</span>
                          <span className="text-slate-900">
                            {custFull.nomineeName ? `Nominee: ${custFull.nomineeName}` : custFull.guarantorName ? `Guarantor: ${custFull.guarantorName}` : "—"}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Savings Accounts Collateral Banner */}
                    {custFull.savingsAccounts && custFull.savingsAccounts.length > 0 && (
                      <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Building className="h-4 w-4 text-blue-700" />
                          <span className="text-blue-900">
                            <strong>Linked Savings Account ({custFull.savingsAccounts[0].accountNumber}):</strong> Balance: ₹
                            {parseFloat(String(custFull.savingsAccounts[0].balance || "0")).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                        <Badge variant="success" className="text-[10px]">Liquid Collateral</Badge>
                      </div>
                    )}
                  </div>
                )}

                {/* TAB 2: LOAN APPLICATION SPECS */}
                {appraisalModalTab === "application" && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Financial Terms */}
                      <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3 text-xs">
                        <div className="font-bold text-slate-900 uppercase tracking-wider text-[11px] flex items-center gap-1.5 border-b pb-1.5">
                          <DollarSign className="h-3.5 w-3.5 text-emerald-600" /> Financial Parameters
                        </div>
                        <div className="flex justify-between items-baseline">
                          <span className="text-slate-500">Requested Principal:</span>
                          <span className="text-lg font-bold text-emerald-700">
                            ₹{parseFloat(selectedApp.requestedPrincipal).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Product Scheme:</span>
                          <span className="font-semibold text-slate-900">{selectedApp.scheme.name} ({selectedApp.scheme.code})</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Tenure (Term):</span>
                          <span className="font-bold text-slate-900">{selectedApp.requestedTermMonths} Months</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Annual Interest Rate:</span>
                          <span className="font-bold text-indigo-700">{interestRate}% p.a.</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Interest Method:</span>
                          <span className="font-mono text-slate-800">{interestMethod}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Repayment Cadence:</span>
                          <span className="font-medium text-slate-900">{repaymentFreq}</span>
                        </div>
                      </div>

                      {/* Underwriting Purpose & Audit */}
                      <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3 text-xs">
                        <div className="font-bold text-slate-900 uppercase tracking-wider text-[11px] flex items-center gap-1.5 border-b pb-1.5">
                          <FileCheck className="h-3.5 w-3.5 text-blue-600" /> Business Purpose & Origin
                        </div>
                        <div>
                          <span className="text-slate-500 block mb-1">Business Utilization Purpose:</span>
                          <p className="bg-white p-3 rounded-lg border border-slate-200 text-slate-800 text-xs leading-relaxed italic">
                            &ldquo;{selectedApp.businessPurpose || selectedApp.purpose}&rdquo;
                          </p>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Submitting Maker:</span>
                          <span className="font-medium text-slate-900">
                            {isMaker ? "You (Logged-in Officer)" : selectedApp.submittedById || "Field Officer"}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Submission Timestamp:</span>
                          <span className="text-slate-700">
                            {selectedApp.submittedAt ? new Date(selectedApp.submittedAt).toLocaleString("en-IN") : new Date(selectedApp.createdAt).toLocaleString("en-IN")}
                          </span>
                        </div>
                        {selectedApp.approvalReason && (
                          <div className="bg-emerald-50 border border-emerald-200 p-2.5 rounded text-xs text-emerald-800">
                            <strong>Sanction Notes:</strong> {selectedApp.approvalReason}
                          </div>
                        )}
                        {selectedApp.rejectionReason && (
                          <div className="bg-rose-50 border border-rose-200 p-2.5 rounded text-xs text-rose-800">
                            <strong>Rejection Reason:</strong> {selectedApp.rejectionReason}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* TAB 3: CUSTOMER EXISTING LOANS */}
                {appraisalModalTab === "loans" && (
                  <div className="space-y-4">
                    {/* KPI Exposure Summary */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                        <span className="text-[11px] font-semibold uppercase text-slate-500">Total Loans Count</span>
                        <div className="text-xl font-bold text-slate-900 mt-1">{custLoans.length} Loans</div>
                        <div className="text-[11px] text-slate-500">{activeCustLoans.length} Currently Active</div>
                      </div>
                      <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                        <span className="text-[11px] font-semibold uppercase text-slate-500">Outstanding Exposure</span>
                        <div className="text-xl font-bold text-indigo-700 mt-1">
                          ₹{totalOutstanding.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                        </div>
                        <div className="text-[11px] text-slate-500">Active Principal Balance</div>
                      </div>
                      <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                        <span className="text-[11px] font-semibold uppercase text-slate-500">Cumulative Disbursed</span>
                        <div className="text-xl font-bold text-emerald-700 mt-1">
                          ₹{totalDisbursed.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                        </div>
                        <div className="text-[11px] text-slate-500">Lifetime Principal Borrowed</div>
                      </div>
                    </div>

                    {/* Existing Loans Table */}
                    <div className="border border-slate-200 rounded-xl overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-slate-50">
                            <TableHead className="text-xs">Loan Account Number</TableHead>
                            <TableHead className="text-xs">Product Scheme</TableHead>
                            <TableHead className="text-xs">Disbursed Principal</TableHead>
                            <TableHead className="text-xs">Principal Outstanding</TableHead>
                            <TableHead className="text-xs">Status</TableHead>
                            <TableHead className="text-xs">Opened Date</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {custLoans.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={6} className="text-center py-6 text-slate-500 text-xs">
                                <div className="space-y-1">
                                  <CreditCard className="h-8 w-8 text-slate-300 mx-auto" />
                                  <div className="font-semibold text-slate-700">No Existing Loan Accounts</div>
                                  <div className="text-slate-400">This borrower has no active or past loan accounts on record. New borrower under appraisal.</div>
                                </div>
                              </TableCell>
                            </TableRow>
                          ) : (
                            custLoans.map((l) => (
                              <TableRow key={l.id} className="text-xs">
                                <TableCell className="font-mono font-bold text-slate-900">
                                  {l.loanAccountNumber || "LA-" + l.id.slice(0, 8)}
                                </TableCell>
                                <TableCell className="font-medium text-slate-700">
                                  {l.scheme?.name || "Standard Microloan"}
                                </TableCell>
                                <TableCell className="font-semibold text-slate-800">
                                  ₹{parseFloat(String(l.principalDisbursed || "0")).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                                </TableCell>
                                <TableCell className="font-bold text-indigo-700">
                                  ₹{parseFloat(String(l.principalOutstanding || "0")).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                                </TableCell>
                                <TableCell>
                                  <Badge
                                    variant={
                                      l.status === "ACTIVE"
                                        ? "success"
                                        : l.status === "CLOSED"
                                        ? "neutral"
                                        : "warning"
                                    }
                                    className="text-[10px]"
                                  >
                                    {l.status}
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-slate-500">
                                  {l.createdAt ? new Date(l.createdAt).toLocaleDateString("en-IN") : "—"}
                                </TableCell>
                              </TableRow>
                            ))
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                )}
              </div>

              {/* Committee Decision Controls Footer */}
              <div className="border-t border-slate-200 px-6 py-4 bg-slate-50 space-y-3">
                {selectedApp.status === "SUBMITTED" ? (
                  <>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Credit Committee Appraisal Notes / Rejection Reason (Mandatory if rejecting)
                      </label>
                      <textarea
                        rows={2}
                        placeholder="Enter credit sanction conditions, committee approval notes, or justification if rejecting..."
                        value={decisionNotes}
                        onChange={(e) => setDecisionNotes(e.target.value)}
                        className="w-full text-xs border border-slate-300 rounded-lg p-2.5 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <Button
                        type="button"
                        variant="danger"
                        size="sm"
                        disabled={isSubmitting || isMaker}
                        onClick={() => handleDecision("REJECT")}
                        className="text-xs"
                      >
                        <XCircle className="h-4 w-4 mr-1.5" />
                        Reject Application
                      </Button>

                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={() => setIsDecisionModalOpen(false)}
                          className="text-xs"
                        >
                          Close
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          disabled={isSubmitting || isMaker}
                          onClick={() => handleDecision("APPROVE")}
                          className="text-xs bg-emerald-600 hover:bg-emerald-500 text-white shadow-xs"
                        >
                          <Check className="h-4 w-4 mr-1.5" />
                          Approve Loan (Sanction)
                        </Button>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="flex items-center justify-between">
                    <div className="text-xs text-slate-600">
                      This application has already been decided (Status: <strong>{selectedApp.status}</strong>).
                    </div>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => setIsDecisionModalOpen(false)}
                      className="text-xs"
                    >
                      Close Dossier
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* --- MODAL: Post Disbursement --- */}
      {isDisburseModalOpen && selectedApp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <div className="flex items-center gap-2">
                <CreditCard className="h-5 w-5 text-emerald-600" />
                <h3 className="font-bold text-slate-900">Post Loan Disbursement</h3>
              </div>
              <button onClick={() => setIsDisburseModalOpen(false)} className="text-slate-400">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="bg-emerald-50/70 p-3 rounded-lg text-xs space-y-1.5 border border-emerald-200 text-emerald-950">
              <div className="flex justify-between"><span>Borrower:</span><span className="font-bold">{selectedApp.customer.fullName}</span></div>
              <div className="flex justify-between"><span>Disbursement Amount:</span><span className="font-extrabold text-sm text-emerald-800">₹{parseFloat(selectedApp.requestedPrincipal).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span></div>
              <div className="flex justify-between"><span>Schedule:</span><span>{selectedApp.requestedTermMonths} Monthly Installments</span></div>
            </div>

            <form onSubmit={handleDisburse} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Disbursement Source Account</label>
                <select
                  required
                  value={disburseForm.cashAccountId}
                  onChange={(e) => setDisburseForm({ ...disburseForm, cashAccountId: e.target.value })}
                  className="w-full text-sm border rounded-lg p-2"
                >
                  {cashAccounts.map((ca) => (
                    <option key={ca.id} value={ca.id}>
                      {ca.name} ({ca.code})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Disbursement Date</label>
                <input
                  type="date"
                  required
                  value={disburseForm.disbursementDate}
                  onChange={(e) => setDisburseForm({ ...disburseForm, disbursementDate: e.target.value })}
                  className="w-full text-sm border rounded-lg p-2"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Voucher Source Reference</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. HDFC-CHQ-10492 or VAULT-VOUCH-01"
                  value={disburseForm.sourceReference}
                  onChange={(e) => setDisburseForm({ ...disburseForm, sourceReference: e.target.value })}
                  className="w-full text-sm border rounded-lg p-2"
                />
              </div>

              <div className="bg-slate-50 p-2.5 rounded border text-[11px] text-slate-600">
                <strong>General Ledger Impact:</strong> Dr. 1201 Loan Principal Receivable | Cr. Selected Cash/Bank Account.
              </div>

              <div className="flex justify-end gap-2 border-t pt-3">
                <Button type="button" variant="secondary" size="sm" onClick={() => setIsDisburseModalOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={isSubmitting} className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold">
                  {isSubmitting ? "Posting Voucher..." : "Confirm & Post Disbursement"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- MODAL: Repayment Schedule & Statement --- */}
      {isScheduleModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl max-w-3xl w-full p-6 shadow-xl space-y-4 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between border-b pb-3 shrink-0">
              <div>
                <h3 className="font-bold text-slate-900">Loan Repayment Schedule & Statement</h3>
                <p className="text-xs text-slate-500">
                  {selectedDetail ? `${selectedDetail.loanAccountNumber} • ${selectedDetail.customer.fullName}` : "Loading..."}
                </p>
              </div>
              <button onClick={() => setIsScheduleModalOpen(false)} className="text-slate-400">
                <X className="h-5 w-5" />
              </button>
            </div>

            {loadingSchedule ? (
              <div className="py-12 text-center text-slate-500 text-sm">Loading amortization schedule...</div>
            ) : selectedDetail ? (
              <div className="space-y-4 overflow-y-auto pr-1">
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 bg-slate-50 p-3 rounded-lg border text-xs">
                  <div>
                    <span className="text-slate-500">Disbursed Principal:</span>
                    <div className="font-bold text-slate-900">₹{parseFloat(selectedDetail.principalDisbursed).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</div>
                  </div>
                  <div>
                    <span className="text-slate-500">Total Repayable:</span>
                    <div className="font-bold text-slate-900">₹{parseFloat(selectedDetail.totalRepaymentAmount ?? selectedDetail.principalDisbursed).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</div>
                  </div>
                  <div>
                    <span className="text-slate-500">Total Collected:</span>
                    <div className="font-bold text-emerald-700">₹{parseFloat(selectedDetail.totalPaid ?? "0").toLocaleString("en-IN", { minimumFractionDigits: 2 })}</div>
                  </div>
                  <div>
                    <span className="text-slate-500">Outstanding Balance:</span>
                    <div className="font-bold text-indigo-700">₹{parseFloat(selectedDetail.principalOutstanding).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</div>
                  </div>
                  <div>
                    <span className="text-slate-500">Status:</span>
                    <div><Badge variant={selectedDetail.status === "ACTIVE" ? "success" : "neutral"}>{selectedDetail.status}</Badge></div>
                  </div>
                </div>

                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12">#</TableHead>
                        <TableHead>Due Date</TableHead>
                        <TableHead>Principal Due</TableHead>
                        <TableHead>Interest Due</TableHead>
                        <TableHead>Total EMI</TableHead>
                        <TableHead>Paid</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedDetail.installments.map((inst) => (
                        <TableRow key={inst.id}>
                          <TableCell className="font-mono text-xs">{inst.installmentNumber}</TableCell>
                          <TableCell className="text-xs">{new Date(inst.dueDate).toLocaleDateString("en-IN")}</TableCell>
                          <TableCell className="text-xs font-medium">₹{parseFloat(inst.principalDue.toString()).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</TableCell>
                          <TableCell className="text-xs text-slate-600">₹{parseFloat(inst.interestDue.toString()).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</TableCell>
                          <TableCell className="text-xs font-bold text-slate-900">₹{parseFloat(inst.totalDue.toString()).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</TableCell>
                          <TableCell className="text-xs text-emerald-700 font-semibold">₹{parseFloat(inst.totalPaid.toString()).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                inst.status === "PAID"
                                  ? "success"
                                  : inst.status === "OVERDUE"
                                  ? "danger"
                                  : "neutral"
                              }
                              className="text-[10px]"
                            >
                              {inst.status}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            ) : null}

            <div className="flex justify-end border-t pt-3 shrink-0">
              <Button size="sm" variant="secondary" onClick={() => setIsScheduleModalOpen(false)}>
                Close Statement
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* --- MODAL: Loan Settlement & Payoff Closure --- */}
      {isCloseModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-xl w-full p-6 shadow-xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b pb-3">
              <div>
                <h3 className="font-bold text-slate-900">Loan Settlement & Formal Closure</h3>
                <p className="text-xs text-slate-500">Calculate payoff quote, apply authorized waivers, and record final closure.</p>
              </div>
              <button onClick={() => setIsCloseModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            {closeError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700">
                {closeError}
              </div>
            )}

            {loadingQuote ? (
              <div className="py-8 text-center text-sm text-slate-500">Calculating settlement quote...</div>
            ) : settlementQuote ? (
              <div className="space-y-4 text-xs">
                {/* As-Of Date Selection */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-600 font-medium mb-1">As-Of Calculation Date</label>
                    <input
                      type="date"
                      value={closeForm.asOfDate}
                      onChange={(e) => handleAsOfDateChange(e.target.value)}
                      className="w-full px-3 py-1.5 border rounded-md"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 font-medium mb-1">Loan Account</label>
                    <div className="font-mono font-bold text-slate-800 pt-1">{settlementQuote.loanAccountNumber}</div>
                    <div className="text-slate-500">{settlementQuote.customer?.fullName}</div>
                  </div>
                </div>

                {/* Breakdown Card */}
                <div className="bg-slate-50 p-3 rounded-lg border space-y-2">
                  <div className="flex justify-between">
                    <span className="text-slate-600">Principal Outstanding:</span>
                    <span className="font-bold text-slate-900">₹{parseFloat(settlementQuote.principalOutstanding).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">Accrued Interest (to {closeForm.asOfDate}):</span>
                    <span className="font-medium text-slate-900">₹{parseFloat(settlementQuote.accruedInterest).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
                  </div>
                  {parseFloat(settlementQuote.futureInterest) > 0 && (
                    <div className="flex justify-between text-slate-400">
                      <span>Future Unaccrued Interest:</span>
                      <span>₹{parseFloat(settlementQuote.futureInterest).toLocaleString("en-IN", { minimumFractionDigits: 2 })} (waived on payoff)</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-slate-600">Unpaid Fees & Penalties:</span>
                    <span className="font-medium text-slate-900">₹{(parseFloat(settlementQuote.feeAmount) + parseFloat(settlementQuote.penaltyAmount)).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div className="border-t pt-1 flex justify-between font-bold text-sm">
                    <span className="text-slate-800">Gross Settlement:</span>
                    <span className="text-indigo-700">₹{parseFloat(settlementQuote.grossSettlement).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
                  </div>
                </div>

                {/* Waiver Section */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-600 font-medium mb-1">Authorized Waiver Amount (₹)</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={closeForm.waiverAmount}
                      onChange={(e) => handleWaiverChange(e.target.value)}
                      className="w-full px-3 py-1.5 border rounded-md"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 font-medium mb-1">Waiver Reason</label>
                    <input
                      type="text"
                      placeholder="e.g. Early payoff interest discount"
                      value={closeForm.waiverReason}
                      onChange={(e) => setCloseForm((f) => ({ ...f, waiverReason: e.target.value }))}
                      className="w-full px-3 py-1.5 border rounded-md"
                    />
                  </div>
                </div>

                {/* Net Settlement Payoff */}
                <div className="bg-emerald-50 p-3 rounded-lg border border-emerald-200 flex justify-between items-center">
                  <div>
                    <div className="text-emerald-800 font-bold text-sm">Net Payoff Settlement</div>
                    <div className="text-[11px] text-emerald-600">Amount required from borrower to close account</div>
                  </div>
                  <div className="text-lg font-bold text-emerald-800">
                    ₹{parseFloat(settlementQuote.netSettlement).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                  </div>
                </div>

                {/* Payment Details */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-600 font-medium mb-1">Settlement Payment (₹)</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={closeForm.settlementPaymentAmount}
                      onChange={(e) => setCloseForm((f) => ({ ...f, settlementPaymentAmount: e.target.value }))}
                      className="w-full px-3 py-1.5 border rounded-md font-semibold"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 font-medium mb-1">Payment Method</label>
                    <select
                      value={closeForm.paymentMethod}
                      onChange={(e) => setCloseForm((f) => ({ ...f, paymentMethod: e.target.value as any }))}
                      className="w-full px-3 py-1.5 border rounded-md"
                    >
                      <option value="CASH">Cash</option>
                      <option value="BANK_TRANSFER">Bank Transfer / NEFT</option>
                      <option value="UPI">UPI</option>
                      <option value="CHEQUE">Cheque</option>
                    </select>
                  </div>
                </div>

                {parseFloat(closeForm.settlementPaymentAmount || "0") > 0 && (
                  <div>
                    <label className="block text-slate-600 font-medium mb-1">Deposit To Cash / Bank Account</label>
                    <select
                      value={closeForm.cashAccountId}
                      onChange={(e) => setCloseForm((f) => ({ ...f, cashAccountId: e.target.value }))}
                      className="w-full px-3 py-1.5 border rounded-md"
                    >
                      {cashAccounts.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.code} — {c.name} ({c.accountType})
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div>
                  <label className="block text-slate-600 font-medium mb-1">Closure Reason / Notes *</label>
                  <input
                    type="text"
                    placeholder="e.g. Borrower settled full outstanding balance at maturity"
                    value={closeForm.reason}
                    onChange={(e) => setCloseForm((f) => ({ ...f, reason: e.target.value }))}
                    className="w-full px-3 py-1.5 border rounded-md"
                    required
                  />
                </div>

                <div className="flex justify-end gap-2 pt-3 border-t">
                  <Button size="sm" variant="ghost" onClick={() => setIsCloseModalOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={handlePostClosure}
                    disabled={submittingClose}
                    className="bg-rose-700 hover:bg-rose-800 text-white"
                  >
                    {submittingClose ? "Posting Closure..." : "Confirm & Close Loan"}
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* --- MODAL: Formal Loan Closure Certificate --- */}
      {isCertModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 print:p-0">
          <div className="bg-white rounded-xl max-w-2xl w-full p-8 shadow-2xl space-y-6 max-h-[95vh] overflow-y-auto print:shadow-none print:max-w-full">
            <div className="flex items-center justify-between border-b pb-3 print:hidden">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Formal Closure Certificate</span>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={() => window.print()} className="text-xs">
                  <Printer className="h-3.5 w-3.5 mr-1" />
                  Print
                </Button>
                <button onClick={() => setIsCertModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {loadingCert ? (
              <div className="py-12 text-center text-sm text-slate-500">Loading certificate details...</div>
            ) : certData ? (
              <div className="border-4 border-double border-slate-700 p-6 rounded-lg space-y-6 bg-amber-50/20">
                {/* Header */}
                <div className="text-center space-y-1">
                  <div className="text-xs font-bold uppercase tracking-widest text-slate-500">Rayhan Microfinance Operations</div>
                  <h2 className="text-xl font-serif font-black tracking-wide text-slate-900 uppercase">No Objection & Loan Closure Certificate</h2>
                  <div className="text-xs text-slate-600 font-mono">Certificate Ref: <span className="font-bold text-slate-900">{certData.certificateNumber}</span> • Date: {certData.issuedDate}</div>
                </div>

                <div className="border-t border-b border-slate-300 py-3 grid grid-cols-2 gap-4 text-xs">
                  <div>
                    <span className="text-slate-500 uppercase font-semibold text-[10px]">Borrower Information</span>
                    <div className="font-bold text-slate-900 mt-1">{certData.customer.fullName}</div>
                    <div className="text-slate-600">Code: {certData.customer.customerCode}</div>
                    <div className="text-slate-600">Phone: {certData.customer.phone}</div>
                  </div>
                  <div>
                    <span className="text-slate-500 uppercase font-semibold text-[10px]">Loan Particulars</span>
                    <div className="font-bold text-slate-900 mt-1">A/C: {certData.loan.loanAccountNumber}</div>
                    <div className="text-slate-600">Scheme: {certData.loan.schemeName}</div>
                    <div className="text-slate-600">Disbursed: ₹{parseFloat(certData.loan.principalDisbursed).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</div>
                  </div>
                </div>

                {/* Statement of Account */}
                <div className="text-xs space-y-2">
                  <span className="text-slate-500 uppercase font-semibold text-[10px]">Settlement & Clearance Summary</span>
                  <div className="grid grid-cols-3 gap-2 bg-slate-50 p-3 rounded border text-center">
                    <div>
                      <span className="text-[10px] text-slate-500">Principal Settled</span>
                      <div className="font-bold text-slate-900">₹{parseFloat(certData.settlement.principalSettled).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</div>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500">Interest & Fees</span>
                      <div className="font-bold text-slate-900">₹{(parseFloat(certData.settlement.accruedInterest) + parseFloat(certData.settlement.feeAmount) + parseFloat(certData.settlement.penaltyAmount)).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</div>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500">Total Settlement Paid</span>
                      <div className="font-bold text-emerald-700">₹{parseFloat(certData.settlement.settlementPaymentAmount || certData.settlement.totalSettlement).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</div>
                    </div>
                  </div>
                </div>

                {/* Declaration */}
                <div className="bg-emerald-50 border border-emerald-300 p-3 rounded text-center">
                  <div className="text-xs font-bold text-emerald-900 uppercase tracking-wide mb-1">
                    STATUS: FORMALLY CLOSED • OUTSTANDING BALANCE: NIL (₹0.00)
                  </div>
                  <p className="text-[11px] text-emerald-800 leading-relaxed font-serif">
                    {certData.declarationText}
                  </p>
                </div>

                {/* Signatures */}
                <div className="grid grid-cols-2 pt-8 gap-12 text-center text-xs">
                  <div className="border-t border-slate-400 pt-1">
                    <span className="text-slate-600 font-medium">Branch Operations Manager</span>
                  </div>
                  <div className="border-t border-slate-400 pt-1">
                    <span className="text-slate-600 font-medium">Authorized Financial Signatory</span>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* --- MODAL: Reopen Loan Closure --- */}
      {isReopenModalOpen && selectedClosureForReopen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-bold text-slate-900">Reopen Closed Loan Account</h3>
              <button onClick={() => setIsReopenModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 space-y-1">
              <div className="font-bold flex items-center gap-1.5 text-amber-900">
                <AlertTriangle className="h-4 w-4 shrink-0 text-amber-700" />
                <span>Accounting & Balance Reinstatement Notice</span>
              </div>
              <p>
                Reopening will reverse the loan closure journal entry, restore the outstanding principal of
                <strong> ₹{parseFloat(selectedClosureForReopen.principalOutstanding).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</strong>, and reinstate the loan account back to <strong>ACTIVE</strong> status.
              </p>
            </div>

            {reopenError && (
              <div className="p-2 bg-rose-50 border border-rose-200 rounded text-xs text-rose-700">
                {reopenError}
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Mandatory Reversal Reason *</label>
              <textarea
                rows={3}
                placeholder="e.g. Cheque payment dishonoured / operational correction authorized by audit"
                value={reopenReason}
                onChange={(e) => setReopenReason(e.target.value)}
                className="w-full px-3 py-2 border rounded-md text-xs"
                required
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button size="sm" variant="ghost" onClick={() => setIsReopenModalOpen(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                variant="primary"
                onClick={handleReopenClosure}
                disabled={submittingReopen || reopenReason.trim().length < 5}
                className="bg-amber-600 hover:bg-amber-700 text-white"
              >
                {submittingReopen ? "Reopening..." : "Confirm & Reopen Loan"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
