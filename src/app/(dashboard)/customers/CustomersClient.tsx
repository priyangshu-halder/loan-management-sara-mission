/* eslint-disable @next/next/no-img-element */
"use client";

import React, { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Search,
  Filter,
  UserPlus,
  FileSpreadsheet,
  FileText,
  Plus,
  Check,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Phone,
  Building,
  ShieldCheck,
  Eye,
  X,
  Upload,
  Calendar,
  CreditCard,
  User,
  ArrowRight,
  ExternalLink,
  ChevronRight,
  Download,
  AlertCircle,
  Landmark,
  Edit,
  IndianRupee,
  GraduationCap,
  EyeOff,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";

export interface CustomerGroupAffiliation {
  id: string;
  role: string;
  group: {
    id: string;
    code: string;
    name: string;
    meetingDay: string | null;
  };
}

export interface CustomerItem {
  id: string;
  organizationId: string;
  branchId: string | null;
  customerCode: string;
  fullName: string;
  phone: string;
  email: string | null;
  status: string;
  guardianName: string | null;
  dateOfBirth: Date | string | null;
  gender: string | null;
  aadhaarNumber: string | null;
  panNumber: string | null;
  occupation: string | null;
  residentialAddress: string | null;
  nomineeName: string | null;
  guarantorName: string | null;
  passportPhoto: string | null;
  aadhaarFrontDoc: string | null;
  aadhaarBackDoc: string | null;
  panPhoto: string | null;
  // Extended Personal & Financial Details
  maritalStatus?: string | null;
  familyMembers?: number | null;
  primaryOccupation?: string | null;
  communityId?: string | null;
  educationId?: string | null;
  annualIncome?: unknown;
  community?: {
    id: string;
    code: string;
    name: string;
  } | null;
  education?: {
    id: string;
    code: string;
    name: string;
  } | null;

  createdAt: Date | string;
  updatedAt: Date | string;
  branch?: {
    id: string;
    code: string;
    name: string;
  } | null;
  group?: {
    id: string;
    code: string;
    name: string;
  } | null;
  documents?: Array<{
    id: string;
    documentType: string;
    fileName: string;
    mimeType: string;
    fileSize: number;
    createdAt: Date | string;
  }>;
  customerGroups: CustomerGroupAffiliation[];
  loanAccounts: Array<{
    id: string;
    status: string;
    principalOutstanding: unknown;
  }>;
  savingsAccounts: Array<{
    id: string;
    status: string;
    balance: unknown;
  }>;
}

export interface BranchOption {
  id: string;
  code: string;
  name: string;
}

export interface SchemeVersion {
  versionNumber: number;
  minPrincipal?: string | null;
  maxPrincipal?: string | null;
  principalAmount?: string | null;
  totalRepaymentAmount?: string | null;
  termMonths: number;
  interestRate?: string | null;
  interestMethod?: string | null;
  repaymentFrequency: string;
}

export interface LoanSchemeOption {
  id: string;
  code: string;
  name: string;
  status: string;
  versions: SchemeVersion[];
}

export interface CustomerKPIs {
  totalCustomers: number;
  activeBorrowers: number;
  kycVerifiedPercent: number;
  jlgMapped: number;
  pendingKyc: number;
}

interface CustomersClientProps {
  initialCustomers: CustomerItem[];
  branches: BranchOption[];
  loanSchemes: LoanSchemeOption[];
  kpis: CustomerKPIs;
  currentUserId?: string;
  currentUserName?: string;
}

const AVATAR_COLORS = [
  "bg-blue-600",
  "bg-emerald-600",
  "bg-purple-600",
  "bg-amber-600",
  "bg-rose-600",
  "bg-indigo-600",
  "bg-cyan-600",
  "bg-teal-600",
];

function getAvatarBg(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % AVATAR_COLORS.length;
  return AVATAR_COLORS[index];
}

function formatAadhaar(num: string | null | undefined): string {
  if (!num) return "NOT PROVIDED";
  const cleaned = num.replace(/\D/g, "");
  if (cleaned.length === 12) {
    return `${cleaned.slice(0, 4)} ${cleaned.slice(4, 8)} ${cleaned.slice(8, 12)}`;
  }
  return num;
}

export default function CustomersClient({
  initialCustomers,
  branches,
  loanSchemes,
  kpis,
  currentUserName = "Maker Officer",
}: CustomersClientProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  // Filter States
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedKycStatus, setSelectedKycStatus] = useState("ALL");
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

  // Local state for customers to reflect immediate updates (like quick verification)
  const [customersList, setCustomersList] = useState<CustomerItem[]>(initialCustomers);

  // Modals state
  const [docsModalCustomer, setDocsModalCustomer] = useState<CustomerItem | null>(null);
  const [zoomDoc, setZoomDoc] = useState<{ title: string; url: string } | null>(null);
  const [loanModalCustomer, setLoanModalCustomer] = useState<CustomerItem | null>(null);
  const [verifyModalCustomer, setVerifyModalCustomer] = useState<CustomerItem | null>(null);

  // Loan Maker Modal Form
  const [selectedSchemeId, setSelectedSchemeId] = useState<string>("");
  const [requestedPrincipal, setRequestedPrincipal] = useState<string>("");
  const [requestedTermMonths, setRequestedTermMonths] = useState<string>("");
  const [requestedTotalRepayment, setRequestedTotalRepayment] = useState<string>("");
  const [loanPurpose, setLoanPurpose] = useState<string>("");
  const [isSubmittingLoan, setIsSubmittingLoan] = useState<boolean>(false);
  const [loanFormError, setLoanFormError] = useState<string | null>(null);
  const [loanSuccessResult, setLoanSuccessResult] = useState<{
    id: string;
    principal: string;
    status: string;
  } | null>(null);

  // Quick KYC verification state
  const [verifyAadhaarInput, setVerifyAadhaarInput] = useState("");
  const [isVerifyingKyc, setIsVerifyingKyc] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);

  // Active scheme version helper
  const selectedScheme = loanSchemes.find((s) => s.id === selectedSchemeId);
  const activeSchemeVersion = selectedScheme?.versions[0];

  // Initialize scheme defaults when opening Loan Modal
  const openLoanMakerModal = (cust: CustomerItem) => {
    setLoanModalCustomer(cust);
    setLoanFormError(null);
    setLoanSuccessResult(null);

    // Pick first published scheme by default
    const defaultScheme = loanSchemes[0];
    if (defaultScheme) {
      setSelectedSchemeId(defaultScheme.id);
      const v = defaultScheme.versions[0];
      if (v) {
        const p = v.principalAmount ?? v.minPrincipal ?? "50000";
        const t = v.termMonths ? String(v.termMonths) : "12";
        const r = v.totalRepaymentAmount ?? v.minPrincipal ?? p;
        setRequestedPrincipal(p);
        setRequestedTermMonths(t);
        setRequestedTotalRepayment(r);
      }
    }
    setLoanPurpose("Working capital for micro-enterprise operations");
  };

  const handleSchemeChange = (schemeId: string) => {
    setSelectedSchemeId(schemeId);
    const scheme = loanSchemes.find((s) => s.id === schemeId);
    if (scheme?.versions[0]) {
      const v = scheme.versions[0];
      const p = v.principalAmount ?? v.minPrincipal ?? "50000";
      const t = v.termMonths ? String(v.termMonths) : "12";
      const r = v.totalRepaymentAmount ?? v.minPrincipal ?? p;
      setRequestedPrincipal(p);
      setRequestedTermMonths(t);
      setRequestedTotalRepayment(r);
    }
  };

  // Submit Loan Application as Maker
  const handleMakerLoanSubmit = async (status: "DRAFT" | "SUBMITTED") => {
    if (!loanModalCustomer || !selectedSchemeId || !activeSchemeVersion) return;

    setLoanFormError(null);
    const principalNum = parseFloat(requestedPrincipal);
    const totalRepayNum = parseFloat(requestedTotalRepayment);

    if (isNaN(principalNum) || principalNum <= 0) {
      setLoanFormError("Please enter a valid loan principal amount.");
      return;
    }

    if (isNaN(totalRepayNum) || totalRepayNum < principalNum) {
      setLoanFormError("Total repayment amount must be greater than or equal to loan amount.");
      return;
    }

    const termNum = parseInt(requestedTermMonths, 10);
    if (isNaN(termNum) || termNum <= 0) {
      setLoanFormError("Please specify a valid loan term in months.");
      return;
    }

    if (!loanPurpose || loanPurpose.trim().length < 3) {
      setLoanFormError("Please state the specific loan / business purpose.");
      return;
    }

    setIsSubmittingLoan(true);

    try {
      const res = await fetch("/api/loans/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId: loanModalCustomer.id,
          schemeId: selectedSchemeId,
          requestedPrincipal: principalNum.toFixed(4),
          requestedTermMonths: termNum,
          totalRepaymentAmount: totalRepayNum.toFixed(4),
          purpose: loanPurpose.trim(),
          status,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || "Failed to submit loan application as maker.");
      }

      setLoanSuccessResult({
        id: data.application?.id || "APP-SUCCESS",
        principal: principalNum.toLocaleString("en-IN"),
        status,
      });

      startTransition(() => {
        router.refresh();
      });
    } catch (err: unknown) {
      setLoanFormError(err instanceof Error ? err.message : "Error creating loan application.");
    } finally {
      setIsSubmittingLoan(false);
    }
  };

  // Open Verify Modal
  const openVerifyModal = (cust: CustomerItem) => {
    setVerifyModalCustomer(cust);
    setVerifyAadhaarInput(cust.aadhaarNumber || "");
    setVerifyError(null);
  };

  // Perform quick KYC verification
  const handleVerifyKycSubmit = async () => {
    if (!verifyModalCustomer) return;
    setVerifyError(null);

    const aadhaarClean = verifyAadhaarInput.replace(/\D/g, "");
    if (aadhaarClean.length !== 12) {
      setVerifyError("Aadhaar Number must be exactly 12 digits.");
      return;
    }

    setIsVerifyingKyc(true);
    try {
      const res = await fetch(`/api/customers/${verifyModalCustomer.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          aadhaarNumber: aadhaarClean,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || "Failed to verify KYC.");
      }

      // Update in local state
      setCustomersList((prev) =>
        prev.map((c) =>
          c.id === verifyModalCustomer.id ? { ...c, aadhaarNumber: aadhaarClean } : c
        )
      );

      if (docsModalCustomer?.id === verifyModalCustomer.id) {
        setDocsModalCustomer((prev) => (prev ? { ...prev, aadhaarNumber: aadhaarClean } : null));
      }

      setVerifyModalCustomer(null);
      startTransition(() => {
        router.refresh();
      });
    } catch (err: unknown) {
      setVerifyError(err instanceof Error ? err.message : "Failed to verify KYC.");
    } finally {
      setIsVerifyingKyc(false);
    }
  };

  // Upload missing document directly from Docs modal
  const handleUploadDoc = async (
    field: "passportPhoto" | "aadhaarFrontDoc" | "aadhaarBackDoc" | "panPhoto",
    file: File
  ) => {
    if (!docsModalCustomer) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      const base64Data = e.target?.result as string;
      try {
        const res = await fetch(`/api/customers/${docsModalCustomer.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ [field]: base64Data }),
        });

        if (res.ok) {
          const updated = { ...docsModalCustomer, [field]: base64Data };
          setDocsModalCustomer(updated);
          setCustomersList((prev) =>
            prev.map((c) => (c.id === docsModalCustomer.id ? updated : c))
          );
          startTransition(() => {
            router.refresh();
          });
        }
      } catch (err) {
        console.error("Document upload failed", err);
      }
    };
    reader.readAsDataURL(file);
  };

  // Upload or replace application form document
  const handleUploadApplicationForm = async (file: File) => {
    if (!docsModalCustomer) return;
    try {
      const formData = new FormData();
      formData.append("applicationForm", file);
      const res = await fetch(`/api/customers/${docsModalCustomer.id}`, {
        method: "PATCH",
        body: formData,
      });

      if (res.ok) {
        const json = await res.json();
        const updated = {
          ...docsModalCustomer,
          documents: json.customer?.documents || docsModalCustomer.documents,
        };
        setDocsModalCustomer(updated);
        setCustomersList((prev) =>
          prev.map((c) => (c.id === docsModalCustomer.id ? updated : c))
        );
        startTransition(() => {
          router.refresh();
        });
      }
    } catch (err) {
      console.error("Application form upload failed", err);
    }
  };

  // Filter logic
  const filteredCustomers = customersList.filter((c) => {
    // Search
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase().trim();
      const matchName = c.fullName.toLowerCase().includes(q);
      const matchCode = c.customerCode.toLowerCase().includes(q);
      const matchPhone = c.phone.toLowerCase().includes(q);
      const matchAadhaar = (c.aadhaarNumber || "").toLowerCase().includes(q);
      const matchOccupation = (c.occupation || "").toLowerCase().includes(q);
      const matchGuardian = (c.guardianName || "").toLowerCase().includes(q);
      if (!matchName && !matchCode && !matchPhone && !matchAadhaar && !matchOccupation && !matchGuardian) {
        return false;
      }
    }

    // KYC Status
    if (selectedKycStatus === "VERIFIED" && !c.aadhaarNumber) {
      return false;
    }
    if (selectedKycStatus === "PENDING" && c.aadhaarNumber) {
      return false;
    }

    return true;
  });

  // Client-side CSV Download
  const handleExportCsv = () => {
    const headers = [
      "Member ID",
      "Member Name",
      "Guardian / Spouse",
      "Contact Phone",
      "Email",
      "Branch",
      "Center / Group",
      "Aadhaar Number",
      "PAN Number",
      "KYC Status",
      "Occupation",
      "Status",
      "Nominee Name",
      "Guarantor Name",
      "Residential Address",
      "Marital Status",
      "Family Members",
      "Primary Occupation",
      "Community / Religion",
      "Education / Literacy",
      "Annual Income (₹)",
      "Registration Date",
    ];

    const escapeCsv = (val: unknown) => {
      if (val === null || val === undefined) return '""';
      let str = String(val);
      if (/^[=+\-@\t\r]/.test(str)) str = "'" + str;
      return `"${str.replace(/"/g, '""')}"`;
    };

    const rows = filteredCustomers.map((c) => {
      const assignedGroup = c.group?.name || c.customerGroups?.[0]?.group?.name || "Assigned Group";
      const branchName = c.branch?.name || "Main Branch";
      const kyc = c.aadhaarNumber ? "KYC VERIFIED" : "PENDING KYC";
      const regDate = new Date(c.createdAt).toLocaleDateString("en-IN");

      return [
        escapeCsv(c.customerCode),
        escapeCsv(c.fullName),
        escapeCsv(c.guardianName || ""),
        escapeCsv(c.phone),
        escapeCsv(c.email || ""),
        escapeCsv(branchName),
        escapeCsv(assignedGroup),
        escapeCsv(c.aadhaarNumber || ""),
        escapeCsv(c.panNumber || ""),
        escapeCsv(kyc),
        escapeCsv(c.occupation || ""),
        escapeCsv(c.status),
        escapeCsv(c.nomineeName || ""),
        escapeCsv(c.guarantorName || ""),
        escapeCsv(c.residentialAddress || ""),
        escapeCsv(c.maritalStatus || ""),
        escapeCsv(c.familyMembers ?? ""),
        escapeCsv(c.primaryOccupation || c.occupation || ""),
        escapeCsv(c.community?.name || ""),
        escapeCsv(c.education?.name || ""),
        escapeCsv(c.annualIncome ? String(c.annualIncome) : ""),
        escapeCsv(regDate),
      ].join(",");
    });

    const csvContent = "\uFEFF" + [headers.map((h) => `"${h}"`).join(","), ...rows].join("\r\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `customer_roster_${new Date().toISOString().split("T")[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5 max-w-[1400px] mx-auto pb-12">
      {/* Top Banner Matching Reference Theme */}
      <div className="bg-[#0B2240] text-white rounded-xl p-5 shadow-sm flex flex-col md:flex-row md:items-center md:justify-between gap-4 border border-slate-800">
        <div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-blue-950/70 text-[11px] font-semibold tracking-wider uppercase mb-1.5 text-blue-300">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
            Core Borrower Portal & Underwriting Desk
          </div>
          <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
            Customer Operations Directory
          </h1>
          <p className="text-xs text-slate-300 mt-1 max-w-2xl">
            Search, filter, inspect digital KYC documents, originate loan applications as maker, and export complete member rosters.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Link href="/customers/new">
            <Button
              size="sm"
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-3.5 py-2 rounded-lg flex items-center gap-1.5 shadow-sm uppercase tracking-wider"
            >
              <UserPlus className="h-4 w-4" />
              + Add Customer
            </Button>
          </Link>
          <Button
            onClick={handleExportCsv}
            size="sm"
            className="bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs px-3.5 py-2 rounded-lg flex items-center gap-1.5 shadow-sm uppercase tracking-wider"
          >
            <FileSpreadsheet className="h-4 w-4" />
            Excel Export
          </Button>
        </div>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm border-l-4 border-l-blue-600">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Total Borrowers</p>
          <p className="text-2xl font-black text-slate-900 mt-0.5">{kpis.totalCustomers}</p>
        </div>
        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm border-l-4 border-l-emerald-600">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Active Loans</p>
          <p className="text-2xl font-black text-slate-900 mt-0.5">{kpis.activeBorrowers}</p>
        </div>
        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm border-l-4 border-l-teal-600">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">KYC Verified Rate</p>
          <p className="text-2xl font-black text-emerald-600 mt-0.5">{kpis.kycVerifiedPercent}%</p>
        </div>
        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm border-l-4 border-l-indigo-600">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">JLG Mapped</p>
          <p className="text-2xl font-black text-slate-900 mt-0.5">{kpis.jlgMapped}</p>
        </div>
        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm border-l-4 border-l-amber-500 col-span-2 md:col-span-1">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Pending KYC</p>
          <p className="text-2xl font-black text-amber-600 mt-0.5">{kpis.pendingKyc}</p>
        </div>
      </div>

      {/* Control Bar Exactly Matching Screenshot */}
      <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-[300px]">
          {/* Blue Filter Customers Button */}
          <Button
            onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
            size="sm"
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs px-3.5 py-2 rounded-lg flex items-center gap-1.5 shadow-sm uppercase tracking-wider shrink-0"
          >
            <Filter className="h-3.5 w-3.5" />
            FILTER CUSTOMERS
          </Button>

          {/* Search Aadhaar, Phone, Name */}
          <div className="relative flex-1 min-w-[240px] max-w-md">
            <Search className="h-4 w-4 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="SEARCH AADHAAR, PHONE, NAME"
              className="w-full pl-9 pr-3 py-1.5 rounded-lg border border-slate-300 text-xs tracking-wider bg-slate-50/60 font-semibold text-slate-800 placeholder:text-slate-400 placeholder:font-normal focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 uppercase"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm("")}
                className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Filter Button */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
            className="text-xs font-bold text-slate-700 uppercase flex items-center gap-1 px-3 py-1.5 border-slate-300 hover:bg-slate-50 shrink-0"
          >
            <Filter className="h-3.5 w-3.5 text-slate-600" />
            FILTER
          </Button>
        </div>

        {/* Action Buttons: Add & Excel */}
        <div className="flex items-center gap-2 shrink-0">
          <Link href="/customers/new">
            <Button
              size="sm"
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-3.5 py-1.5 rounded-lg flex items-center gap-1.5 shadow-sm uppercase tracking-wider"
            >
              <UserPlus className="h-3.5 w-3.5" />
              + ADD
            </Button>
          </Link>

          <Button
            onClick={handleExportCsv}
            size="sm"
            className="bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs px-3.5 py-1.5 rounded-lg flex items-center gap-1.5 shadow-sm uppercase tracking-wider"
          >
            <FileSpreadsheet className="h-3.5 w-3.5" />
            EXCEL
          </Button>
        </div>
      </div>

      {/* Expandable Advanced Filters */}
      {showAdvancedFilters && (
        <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs space-y-3">
          <div className="flex items-center justify-between">
            <span className="font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
              <Filter className="h-3.5 w-3.5 text-blue-600" /> Advanced Borrower Query Filter
            </span>
            <button
              onClick={() => {
                setSearchTerm("");
                setSelectedKycStatus("ALL");
              }}
              className="text-blue-600 hover:text-blue-800 font-semibold"
            >
              Reset Filters
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 uppercase mb-1">
                KYC Verification Status
              </label>
              <select
                value={selectedKycStatus}
                onChange={(e) => setSelectedKycStatus(e.target.value)}
                className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-medium"
              >
                <option value="ALL">All KYC Statuses</option>
                <option value="VERIFIED">KYC Verified Only</option>
                <option value="PENDING">Pending KYC Only</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-600 uppercase mb-1">
                Active Matches Found
              </label>
              <div className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-700 font-semibold">
                {filteredCustomers.length} Borrowers Displayed
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Table Styled Exactly Like Screenshot */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            {/* Header: Dark Navy */}
            <thead>
              <tr className="bg-[#0B2240] text-white">
                <th className="py-3 px-4 text-[11px] font-black uppercase tracking-wider text-white">
                  MEMBER ID
                </th>
                <th className="py-3 px-4 text-[11px] font-black uppercase tracking-wider text-white">
                  MEMBER NAME & GUARDIAN
                </th>
                <th className="py-3 px-4 text-[11px] font-black uppercase tracking-wider text-white">
                  CONTACT
                </th>
                <th className="py-3 px-4 text-[11px] font-black uppercase tracking-wider text-white">
                  BRANCH & CENTER
                </th>
                <th className="py-3 px-4 text-[11px] font-black uppercase tracking-wider text-white">
                  AADHAAR / KYC
                </th>
                <th className="py-3 px-4 text-[11px] font-black uppercase tracking-wider text-white">
                  OCCUPATION
                </th>
                <th className="py-3 px-4 text-[11px] font-black uppercase tracking-wider text-white">
                  STATUS
                </th>
                <th className="py-3 px-4 text-[11px] font-black uppercase tracking-wider text-white text-center">
                  ACTION
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100 text-xs">
              {filteredCustomers.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-500">
                    <p className="font-semibold text-sm text-slate-700">No customers found</p>
                    <p className="text-xs text-slate-400 mt-1">
                      Try adjusting your search criteria or register a new borrower.
                    </p>
                  </td>
                </tr>
              ) : (
                filteredCustomers.map((cust) => {
                  const initialLetter = cust.fullName ? cust.fullName.trim().charAt(0).toUpperCase() : "M";
                  const avatarColor = getAvatarBg(cust.fullName);
                  const isVerified = Boolean(cust.aadhaarNumber && cust.aadhaarNumber.trim().length > 0);
                  const spouseOrGuardian = cust.guardianName
                    ? `SPOUSE: ${cust.guardianName.toUpperCase()}`
                    : "SPOUSE / GUARDIAN: N/A";
                  const branchName = cust.branch?.name ? cust.branch.name.toUpperCase() : "KOLKATA HEAD OFFICE";

                  // Group/Center display
                  const groupNames = cust.customerGroups.map((g) => g.group.name.toUpperCase()).join(" • ");
                  const centerGroupDisplay = groupNames || "BIDHANNAGAR MAHILA CENTER";

                  return (
                    <tr key={cust.id} className="hover:bg-slate-50/80 transition-colors">
                      {/* MEMBER ID */}
                      <td className="py-3.5 px-4 font-mono font-bold text-slate-900 text-xs whitespace-nowrap">
                        {cust.customerCode}
                      </td>

                      {/* MEMBER NAME & GUARDIAN */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          {cust.passportPhoto ? (
                            <img
                              src={cust.passportPhoto}
                              alt={cust.fullName}
                              className="h-9 w-9 rounded-full object-cover border border-slate-200 shrink-0"
                            />
                          ) : (
                            <div
                              className={`h-9 w-9 rounded-full ${avatarColor} text-white font-black text-sm flex items-center justify-center shrink-0 shadow-sm`}
                            >
                              {initialLetter}
                            </div>
                          )}
                          <div>
                            <div className="font-extrabold text-slate-900 text-xs uppercase tracking-tight">
                              {cust.fullName}
                            </div>
                            <div className="text-[10.5px] font-semibold text-slate-500 uppercase mt-0.5">
                              {spouseOrGuardian}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* CONTACT */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-1.5 font-bold text-slate-800 text-xs">
                          <Phone className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                          <span>{cust.phone}</span>
                        </div>
                        {cust.email && (
                          <div className="text-[10px] text-slate-400 lowercase pl-5">{cust.email}</div>
                        )}
                      </td>

                      {/* BRANCH & CENTER */}
                      <td className="py-3.5 px-4 max-w-[240px]">
                        <div>
                          <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-sky-100 text-blue-700 border border-blue-200 uppercase tracking-tight">
                            {branchName}
                          </span>
                          <div className="text-[10.5px] font-semibold text-slate-600 uppercase mt-1 truncate">
                            {centerGroupDisplay}
                          </div>
                        </div>
                      </td>

                      {/* AADHAAR / KYC */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div>
                          <div className="font-mono font-bold text-slate-900 text-xs tracking-wider">
                            {formatAadhaar(cust.aadhaarNumber)}
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-1">
                            {isVerified ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-300 uppercase tracking-tight">
                                <Check className="h-3 w-3 stroke-[3]" />
                                KYC VERIFIED
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-300 uppercase tracking-tight">
                                <Clock className="h-3 w-3" />
                                PENDING KYC
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* OCCUPATION */}
                      <td className="py-3.5 px-4 font-bold text-slate-800 text-[11px] uppercase tracking-tight whitespace-nowrap">
                        {cust.primaryOccupation || cust.occupation || "BUSINESS & TRADING"}
                      </td>

                      {/* STATUS */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10.5px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-300 uppercase">
                          {cust.status}
                        </span>
                      </td>

                      {/* ACTION BUTTONS */}
                      <td className="py-3.5 px-4 whitespace-nowrap text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          {/* EDIT BUTTON */}
                          <Link
                            href={`/customers/${cust.id}/edit`}
                            className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[11px] px-2.5 py-1.5 rounded-md flex items-center gap-1 shadow-sm transition-colors uppercase tracking-tight"
                            title="Edit customer details and documents"
                          >
                            <Edit className="h-3.5 w-3.5" />
                            EDIT
                          </Link>

                          {/* DOCS BUTTON (Amber) */}
                          <button
                            onClick={() => setDocsModalCustomer(cust)}
                            className="bg-amber-500 hover:bg-amber-600 text-white font-extrabold text-[11px] px-2.5 py-1.5 rounded-md flex items-center gap-1 shadow-sm transition-colors uppercase tracking-tight"
                            title="View KYC documents and full member details"
                          >
                            <FileText className="h-3.5 w-3.5" />
                            DOCS
                          </button>

                          {/* VERIFY BUTTON (Green, shown when pending or for quick verify) */}
                          {!isVerified && (
                            <button
                              onClick={() => openVerifyModal(cust)}
                              className="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-[11px] px-2.5 py-1.5 rounded-md flex items-center gap-1 shadow-sm transition-colors uppercase tracking-tight"
                              title="Verify borrower KYC with Aadhaar"
                            >
                              <Check className="h-3.5 w-3.5 stroke-[3]" />
                              VERIFY
                            </button>
                          )}

                          {/* + LOAN BUTTON (Blue) */}
                          <button
                            onClick={() => openLoanMakerModal(cust)}
                            className="bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-[11px] px-2.5 py-1.5 rounded-md flex items-center gap-1 shadow-sm transition-colors uppercase tracking-tight"
                            title="Assign / Originate loan application as maker"
                          >
                            <Plus className="h-3.5 w-3.5 stroke-[3]" />
                            LOAN
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Bottom Pagination / Summary Bar */}
        <div className="p-3.5 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-600 gap-2">
          <div>
            Showing <strong className="text-slate-900">{filteredCustomers.length}</strong> of{" "}
            <strong className="text-slate-900">{customersList.length}</strong> registered members
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-slate-500">Maker-Checker Underwriting Protocol Active</span>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 1. MODAL: DOCS & CUSTOMER INFORMATION DOSSIER                             */}
      {/* ========================================================================= */}
      {docsModalCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-3xl w-full p-6 shadow-2xl space-y-5 max-h-[92vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-start justify-between border-b pb-4">
              <div className="flex items-center gap-3">
                {docsModalCustomer.passportPhoto ? (
                  <img
                    src={docsModalCustomer.passportPhoto}
                    alt={docsModalCustomer.fullName}
                    className="h-12 w-12 rounded-full object-cover border-2 border-blue-500 shrink-0"
                  />
                ) : (
                  <div
                    className={`h-12 w-12 rounded-full ${getAvatarBg(
                      docsModalCustomer.fullName
                    )} text-white font-black text-lg flex items-center justify-center shrink-0`}
                  >
                    {docsModalCustomer.fullName.charAt(0).toUpperCase()}
                  </div>
                )}
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-extrabold text-slate-900 text-lg uppercase tracking-tight">
                      {docsModalCustomer.fullName}
                    </h3>
                    <Badge variant="neutral" className="font-mono text-xs">
                      {docsModalCustomer.customerCode}
                    </Badge>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Member Dossier & Digital KYC Document Repository
                  </p>
                </div>
              </div>

              <button
                onClick={() => setDocsModalCustomer(null)}
                className="text-slate-400 hover:text-slate-700 p-1 rounded-lg hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Document Gallery Section */}
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-3 flex items-center gap-1.5">
                <FileText className="h-4 w-4 text-blue-600" />
                Uploaded Compliance Documents
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {/* 1. Passport Size Photo */}
                <div className="border border-slate-200 rounded-xl p-3 bg-slate-50/50 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-bold text-xs text-slate-800">Passport Photograph</span>
                      {docsModalCustomer.passportPhoto ? (
                        <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                          UPLOADED
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                          MISSING
                        </span>
                      )}
                    </div>

                    <div className="h-32 bg-white rounded-lg border border-slate-200 flex items-center justify-center overflow-hidden relative group">
                      {docsModalCustomer.passportPhoto ? (
                        <img
                          src={docsModalCustomer.passportPhoto}
                          alt="Passport Photo"
                          className="h-full w-full object-contain p-1"
                        />
                      ) : (
                        <div className="text-center text-slate-400 p-2">
                          <User className="h-8 w-8 mx-auto mb-1 opacity-50" />
                          <span className="text-[11px]">No Photo Attached</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="mt-2.5 flex items-center gap-2">
                    {docsModalCustomer.passportPhoto && (
                      <button
                        onClick={() =>
                          setZoomDoc({
                            title: "Passport Size Photograph",
                            url: docsModalCustomer.passportPhoto!,
                          })
                        }
                        className="flex-1 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 font-semibold text-[11px] py-1 px-2 rounded flex items-center justify-center gap-1"
                      >
                        <Eye className="h-3 w-3" /> View Zoom
                      </button>
                    )}
                    <label className="flex-1 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 font-semibold text-[11px] py-1 px-2 rounded flex items-center justify-center gap-1 cursor-pointer">
                      <Upload className="h-3 w-3" />
                      {docsModalCustomer.passportPhoto ? "Replace" : "Upload"}
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleUploadDoc("passportPhoto", file);
                        }}
                      />
                    </label>
                  </div>
                </div>

                {/* 2. Aadhaar Card - Front */}
                <div className="border border-slate-200 rounded-xl p-3 bg-slate-50/50 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-bold text-xs text-slate-800">Aadhaar Card (Front)</span>
                      {docsModalCustomer.aadhaarFrontDoc ? (
                        <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                          UPLOADED
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                          MISSING
                        </span>
                      )}
                    </div>

                    <div className="h-32 bg-white rounded-lg border border-slate-200 flex items-center justify-center overflow-hidden relative group">
                      {docsModalCustomer.aadhaarFrontDoc ? (
                        <img
                          src={docsModalCustomer.aadhaarFrontDoc}
                          alt="Aadhaar Front"
                          className="h-full w-full object-contain p-1"
                        />
                      ) : (
                        <div className="text-center text-slate-400 p-2">
                          <CreditCard className="h-8 w-8 mx-auto mb-1 opacity-50" />
                          <span className="text-[11px]">No Front Document</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="mt-2.5 flex items-center gap-2">
                    {docsModalCustomer.aadhaarFrontDoc && (
                      <button
                        onClick={() =>
                          setZoomDoc({
                            title: "Aadhaar Card Front",
                            url: docsModalCustomer.aadhaarFrontDoc!,
                          })
                        }
                        className="flex-1 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 font-semibold text-[11px] py-1 px-2 rounded flex items-center justify-center gap-1"
                      >
                        <Eye className="h-3 w-3" /> View Zoom
                      </button>
                    )}
                    <label className="flex-1 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 font-semibold text-[11px] py-1 px-2 rounded flex items-center justify-center gap-1 cursor-pointer">
                      <Upload className="h-3 w-3" />
                      {docsModalCustomer.aadhaarFrontDoc ? "Replace" : "Upload"}
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleUploadDoc("aadhaarFrontDoc", file);
                        }}
                      />
                    </label>
                  </div>
                </div>

                {/* 3. Aadhaar Card - Back */}
                <div className="border border-slate-200 rounded-xl p-3 bg-slate-50/50 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-bold text-xs text-slate-800">Aadhaar Card (Back)</span>
                      {docsModalCustomer.aadhaarBackDoc ? (
                        <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                          UPLOADED
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                          MISSING
                        </span>
                      )}
                    </div>

                    <div className="h-32 bg-white rounded-lg border border-slate-200 flex items-center justify-center overflow-hidden relative group">
                      {docsModalCustomer.aadhaarBackDoc ? (
                        <img
                          src={docsModalCustomer.aadhaarBackDoc}
                          alt="Aadhaar Back"
                          className="h-full w-full object-contain p-1"
                        />
                      ) : (
                        <div className="text-center text-slate-400 p-2">
                          <CreditCard className="h-8 w-8 mx-auto mb-1 opacity-50" />
                          <span className="text-[11px]">No Back Document</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="mt-2.5 flex items-center gap-2">
                    {docsModalCustomer.aadhaarBackDoc && (
                      <button
                        onClick={() =>
                          setZoomDoc({
                            title: "Aadhaar Card Back",
                            url: docsModalCustomer.aadhaarBackDoc!,
                          })
                        }
                        className="flex-1 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 font-semibold text-[11px] py-1 px-2 rounded flex items-center justify-center gap-1"
                      >
                        <Eye className="h-3 w-3" /> View Zoom
                      </button>
                    )}
                    <label className="flex-1 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 font-semibold text-[11px] py-1 px-2 rounded flex items-center justify-center gap-1 cursor-pointer">
                      <Upload className="h-3 w-3" />
                      {docsModalCustomer.aadhaarBackDoc ? "Replace" : "Upload"}
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleUploadDoc("aadhaarBackDoc", file);
                        }}
                      />
                    </label>
                  </div>
                </div>

                {/* 4. PAN Card Photo */}
                <div className="border border-slate-200 rounded-xl p-3 bg-slate-50/50 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-bold text-xs text-slate-800">PAN Card Document</span>
                      {docsModalCustomer.panPhoto ? (
                        <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                          UPLOADED
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                          MISSING
                        </span>
                      )}
                    </div>

                    <div className="h-32 bg-white rounded-lg border border-slate-200 flex items-center justify-center overflow-hidden relative group">
                      {docsModalCustomer.panPhoto ? (
                        <img
                          src={docsModalCustomer.panPhoto}
                          alt="PAN Photo"
                          className="h-full w-full object-contain p-1"
                        />
                      ) : (
                        <div className="text-center text-slate-400 p-2">
                          <CreditCard className="h-8 w-8 mx-auto mb-1 opacity-50" />
                          <span className="text-[11px]">No PAN Attached</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="mt-2.5 flex items-center gap-2">
                    {docsModalCustomer.panPhoto && (
                      <button
                        onClick={() =>
                          setZoomDoc({
                            title: "PAN Card Document",
                            url: docsModalCustomer.panPhoto!,
                          })
                        }
                        className="flex-1 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 font-semibold text-[11px] py-1 px-2 rounded flex items-center justify-center gap-1"
                      >
                        <Eye className="h-3 w-3" /> View Zoom
                      </button>
                    )}
                    <label className="flex-1 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 font-semibold text-[11px] py-1 px-2 rounded flex items-center justify-center gap-1 cursor-pointer">
                      <Upload className="h-3 w-3" />
                      {docsModalCustomer.panPhoto ? "Replace" : "Upload"}
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleUploadDoc("panPhoto", file);
                        }}
                      />
                    </label>
                  </div>
                </div>

                {/* 5. Signed Customer Application Form */}
                {(() => {
                  const appFormDoc = docsModalCustomer.documents?.find(
                    (d) => d.documentType === "APPLICATION_FORM"
                  );
                  return (
                    <div className="border border-slate-200 rounded-xl p-3 bg-slate-50/50 flex flex-col justify-between">
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-bold text-xs text-slate-800">Application Form</span>
                          {appFormDoc ? (
                            <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                              UPLOADED
                            </span>
                          ) : (
                            <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200">
                              OPTIONAL
                            </span>
                          )}
                        </div>

                        <div className="h-32 bg-white rounded-lg border border-slate-200 flex items-center justify-center overflow-hidden relative group p-2">
                          {appFormDoc ? (
                            <div className="text-center text-emerald-700 p-2 flex flex-col items-center">
                              <FileText className="h-8 w-8 mb-1 text-emerald-600" />
                              <span className="text-[11px] font-bold truncate max-w-[140px]" title={appFormDoc.fileName}>
                                {appFormDoc.fileName}
                              </span>
                              <span className="text-[10px] text-slate-400">
                                {Math.round(appFormDoc.fileSize / 1024)} KB
                              </span>
                            </div>
                          ) : (
                            <div className="text-center text-slate-400 p-2">
                              <FileText className="h-8 w-8 mx-auto mb-1 opacity-40" />
                              <span className="text-[11px]">No Application Form</span>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="mt-2.5 flex items-center gap-2">
                        {appFormDoc && (
                          <a
                            href={`/api/customers/${docsModalCustomer.id}/documents/application-form?download=true`}
                            target="_blank"
                            rel="noreferrer"
                            className="flex-1 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 font-semibold text-[11px] py-1 px-2 rounded flex items-center justify-center gap-1"
                          >
                            <Download className="h-3 w-3" /> Download
                          </a>
                        )}
                        <label className="flex-1 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 font-semibold text-[11px] py-1 px-2 rounded flex items-center justify-center gap-1 cursor-pointer">
                          <Upload className="h-3 w-3" />
                          {appFormDoc ? "Replace" : "Upload"}
                          <input
                            type="file"
                            accept="image/*,.pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) handleUploadApplicationForm(file);
                            }}
                          />
                        </label>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>

            {/* Complete Member Dossier Information */}
            <div className="border-t pt-4">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-3 flex items-center gap-1.5">
                <User className="h-4 w-4 text-blue-600" />
                Comprehensive Member Information
              </h4>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200 text-xs">
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase block">Spouse / Guardian</span>
                  <span className="font-semibold text-slate-800">{docsModalCustomer.guardianName || "N/A"}</span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase block">Contact Phone</span>
                  <span className="font-semibold text-slate-800 font-mono">{docsModalCustomer.phone}</span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase block">Email</span>
                  <span className="font-semibold text-slate-800">{docsModalCustomer.email || "N/A"}</span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase block">Aadhaar (UID)</span>
                  <span className="font-semibold text-slate-800 font-mono">
                    {formatAadhaar(docsModalCustomer.aadhaarNumber)}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase block">PAN Number</span>
                  <span className="font-semibold text-slate-800 font-mono">
                    {docsModalCustomer.panNumber || "NOT PROVIDED"}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase block">Occupation</span>
                  <span className="font-semibold text-slate-800 uppercase">
                    {docsModalCustomer.occupation || "N/A"}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase block">Nominee Name</span>
                  <span className="font-semibold text-slate-800">{docsModalCustomer.nomineeName || "N/A"}</span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase block">Guarantor Name</span>
                  <span className="font-semibold text-slate-800">{docsModalCustomer.guarantorName || "N/A"}</span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase block">Branch Location</span>
                  <span className="font-semibold text-slate-800">
                    {docsModalCustomer.branch?.name || "Main Branch"}
                  </span>
                </div>
                <div className="col-span-2 sm:col-span-3">
                  <span className="text-[10px] font-bold text-slate-400 uppercase block">Residential Address</span>
                  <span className="font-semibold text-slate-800">
                    {docsModalCustomer.residentialAddress || "No physical address specified"}
                  </span>
                </div>
              </div>

              {/* Personal, Family, & Occupation Sub-Card */}
              <div className="mt-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200 text-xs">
                <div className="flex items-center gap-1.5 border-b pb-1.5 mb-2">
                  <span className="font-bold text-slate-800 flex items-center gap-1.5">
                    <Users className="h-3.5 w-3.5 text-blue-600" />
                    Demographic & Financial Profiling
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase block">Marital Status</span>
                    <span className="font-semibold text-slate-800">{docsModalCustomer.maritalStatus || "N/A"}</span>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase block">Family Members</span>
                    <span className="font-semibold text-slate-800">
                      {docsModalCustomer.familyMembers !== null && docsModalCustomer.familyMembers !== undefined
                        ? docsModalCustomer.familyMembers
                        : "N/A"}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase block">Community / Religion</span>
                    <span className="font-semibold text-slate-800">
                      {docsModalCustomer.community?.name || "N/A"}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase block">Education / Literacy</span>
                    <span className="font-semibold text-slate-800">
                      {docsModalCustomer.education?.name || "N/A"}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase block">Primary Occupation</span>
                    <span className="font-semibold text-slate-800 uppercase">
                      {docsModalCustomer.primaryOccupation || docsModalCustomer.occupation || "N/A"}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase block">Annual Income (₹)</span>
                    <span className="font-semibold text-emerald-700 font-mono">
                      {docsModalCustomer.annualIncome
                        ? `₹${parseFloat(String(docsModalCustomer.annualIncome)).toLocaleString("en-IN")}`
                        : "N/A"}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-end gap-2 border-t pt-4">
              <Link href={`/customers/${docsModalCustomer.id}/edit`}>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs text-slate-700 font-semibold"
                >
                  <Edit className="h-3.5 w-3.5 mr-1" />
                  Edit Customer Profile
                </Button>
              </Link>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDocsModalCustomer(null)}
                className="text-xs"
              >
                Close Dossier
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  const c = docsModalCustomer;
                  setDocsModalCustomer(null);
                  openLoanMakerModal(c);
                }}
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs"
              >
                <Plus className="h-3.5 w-3.5 mr-1" />
                Assign Loan to Member
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. MODAL: IMAGE / DOCUMENT ZOOM PREVIEW                                   */}
      {/* ========================================================================= */}
      {zoomDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-4 shadow-2xl space-y-3">
            <div className="flex items-center justify-between border-b pb-2">
              <h3 className="font-bold text-slate-900 text-sm uppercase">{zoomDoc.title}</h3>
              <button
                onClick={() => setZoomDoc(null)}
                className="text-slate-400 hover:text-slate-700 p-1"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="max-h-[75vh] flex items-center justify-center overflow-auto p-2 bg-slate-900 rounded-lg">
              <img
                src={zoomDoc.url}
                alt={zoomDoc.title}
                className="max-h-[70vh] w-auto object-contain rounded"
              />
            </div>
            <div className="text-right">
              <Button size="sm" variant="outline" onClick={() => setZoomDoc(null)} className="text-xs">
                Close Viewer
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. MODAL: ORIGINATE LOAN APPLICATION AS MAKER                             */}
      {/* ========================================================================= */}
      {loanModalCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl space-y-4 max-h-[92vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-start justify-between border-b pb-3">
              <div>
                <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-blue-50 text-[10.5px] font-bold text-blue-700 uppercase mb-1">
                  <CreditCard className="h-3 w-3" /> Maker Origination Desk
                </div>
                <h3 className="font-extrabold text-slate-900 text-lg uppercase tracking-tight">
                  Assign Loan: {loanModalCustomer.fullName}
                </h3>
                <p className="text-xs text-slate-500 font-mono">{loanModalCustomer.customerCode}</p>
              </div>

              <button
                onClick={() => setLoanModalCustomer(null)}
                className="text-slate-400 hover:text-slate-700 p-1 rounded-lg"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Maker-Checker Alert Banner */}
            <div className="bg-blue-50/70 border border-blue-200 rounded-xl p-3 text-xs text-blue-900 flex items-start gap-2.5">
              <ShieldCheck className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
              <div>
                <strong className="block font-bold">Maker Officer: {currentUserName}</strong>
                <span>
                  Under institutional separation of duties, submitting this application assigns it to the independent Credit Committee appraisal queue.
                </span>
              </div>
            </div>

            {loanSuccessResult ? (
              /* Success State */
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-5 text-center space-y-3">
                <CheckCircle2 className="h-10 w-10 text-emerald-600 mx-auto" />
                <h4 className="font-extrabold text-emerald-900 text-base">
                  Loan Application Successfully Recorded!
                </h4>
                <p className="text-xs text-emerald-700">
                  Principal amount of <strong>₹{loanSuccessResult.principal}</strong> registered with status{" "}
                  <Badge variant="success" className="text-[11px] ml-1">
                    {loanSuccessResult.status}
                  </Badge>
                </p>
                <div className="pt-2 flex justify-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setLoanModalCustomer(null)}
                    className="text-xs"
                  >
                    Done
                  </Button>
                  <Link href="/loans">
                    <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white text-xs">
                      View in Loans Queue <ArrowRight className="h-3.5 w-3.5 ml-1" />
                    </Button>
                  </Link>
                </div>
              </div>
            ) : (
              /* Form State */
              <div className="space-y-4">
                {loanFormError && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 shrink-0 text-red-500" />
                    <span>{loanFormError}</span>
                  </div>
                )}

                {/* Loan Scheme Select */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 uppercase">
                    Select Loan Scheme / Product *
                  </label>
                  <select
                    value={selectedSchemeId}
                    onChange={(e) => handleSchemeChange(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-semibold rounded-lg border border-slate-300 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  >
                    {loanSchemes.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.code})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Scheme Metrics Card */}
                {activeSchemeVersion && (
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase block">Principal Amount</span>
                      <span className="font-extrabold text-slate-800">
                        ₹{parseFloat(activeSchemeVersion.principalAmount ?? activeSchemeVersion.minPrincipal ?? "0").toLocaleString("en-IN")}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase block">Repayment Period</span>
                      <span className="font-semibold text-slate-800">
                        {activeSchemeVersion.termMonths} Months
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase block">Total Repayment</span>
                      <span className="font-semibold text-slate-800">
                        ₹{parseFloat(activeSchemeVersion.totalRepaymentAmount ?? activeSchemeVersion.minPrincipal ?? "0").toLocaleString("en-IN")}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase block">Indicative Monthly</span>
                      <span className="font-semibold text-blue-700">
                        ₹{activeSchemeVersion.termMonths > 0
                          ? (parseFloat(activeSchemeVersion.totalRepaymentAmount ?? activeSchemeVersion.minPrincipal ?? "0") / activeSchemeVersion.termMonths).toFixed(2)
                          : "0.00"}
                      </span>
                    </div>
                  </div>
                )}

                {/* Requested Principal, Total Repayment & Term */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700 uppercase">
                      Loan Principal (₹) *
                    </label>
                    <input
                      type="number"
                      required
                      value={requestedPrincipal}
                      onChange={(e) => setRequestedPrincipal(e.target.value)}
                      placeholder="e.g. 50000"
                      className="w-full px-3 py-2 text-xs font-bold rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700 uppercase">
                      Repayment Period (Months) *
                    </label>
                    <input
                      type="number"
                      required
                      value={requestedTermMonths}
                      onChange={(e) => setRequestedTermMonths(e.target.value)}
                      placeholder="e.g. 12"
                      className="w-full px-3 py-2 text-xs font-bold rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700 uppercase">
                      Total Repayment (₹) *
                    </label>
                    <input
                      type="number"
                      required
                      value={requestedTotalRepayment}
                      onChange={(e) => setRequestedTotalRepayment(e.target.value)}
                      placeholder="e.g. 54000"
                      className="w-full px-3 py-2 text-xs font-bold rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    />
                  </div>
                </div>

                {/* Live Monthly Installment Preview */}
                {parseFloat(requestedTermMonths) > 0 && parseFloat(requestedTotalRepayment) > 0 && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-2.5 flex items-center justify-between text-xs text-blue-900">
                    <span className="font-medium">
                      Indicative Monthly Installment:{" "}
                      <span className="font-mono text-slate-500 text-[11px]">(indicative schedule calculation, not interest)</span>
                    </span>
                    <span className="font-extrabold text-blue-800 text-sm">
                      ₹{(parseFloat(requestedTotalRepayment) / parseFloat(requestedTermMonths)).toFixed(2)} / month
                    </span>
                  </div>
                )}

                {/* Purpose */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 uppercase">
                    Loan Purpose & Business Utilization *
                  </label>
                  <textarea
                    rows={2}
                    value={loanPurpose}
                    onChange={(e) => setLoanPurpose(e.target.value)}
                    placeholder="Describe borrower's business or household credit purpose..."
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  />
                  {/* Quick Pick Purpose Pills */}
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {[
                      "Textile Shop Inventory",
                      "Dairy Cattle Purchase",
                      "Handicrafts Raw Material",
                      "Tailoring Machinery",
                      "Grocery Store Capital",
                    ].map((pill) => (
                      <button
                        key={pill}
                        type="button"
                        onClick={() => setLoanPurpose(pill)}
                        className="text-[10px] bg-slate-100 hover:bg-slate-200 text-slate-700 px-2 py-0.5 rounded-full font-medium transition-colors"
                      >
                        + {pill}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Actions */}
                <div className="pt-2 flex items-center justify-end gap-2 border-t">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setLoanModalCustomer(null)}
                    className="text-xs"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={isSubmittingLoan}
                    onClick={() => handleMakerLoanSubmit("DRAFT")}
                    className="text-xs"
                  >
                    Save as Draft
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    disabled={isSubmittingLoan}
                    onClick={() => handleMakerLoanSubmit("SUBMITTED")}
                    className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs"
                  >
                    {isSubmittingLoan ? "Submitting..." : "Submit as Maker"}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 4. MODAL: QUICK KYC VERIFICATION DIALOG                                   */}
      {/* ========================================================================= */}
      {verifyModalCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-emerald-600" />
                <h3 className="font-extrabold text-slate-900 text-base uppercase">
                  Verify Borrower KYC
                </h3>
              </div>
              <button
                onClick={() => setVerifyModalCustomer(null)}
                className="text-slate-400 hover:text-slate-700 p-1 rounded-lg"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="text-xs text-slate-600">
              Confirm official 12-digit Aadhaar UID number for{" "}
              <strong className="text-slate-900">{verifyModalCustomer.fullName}</strong> (
              <span className="font-mono">{verifyModalCustomer.customerCode}</span>):
            </div>

            {verifyError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 text-red-500" />
                <span>{verifyError}</span>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 uppercase">
                12-Digit Aadhaar Number *
              </label>
              <input
                type="text"
                maxLength={14}
                value={verifyAadhaarInput}
                onChange={(e) => setVerifyAadhaarInput(e.target.value)}
                placeholder="e.g. 123456789012"
                className="w-full px-3 py-2 text-sm font-mono font-bold tracking-widest rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setVerifyModalCustomer(null)}
                className="text-xs"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={isVerifyingKyc}
                onClick={handleVerifyKycSubmit}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs"
              >
                {isVerifyingKyc ? "Verifying..." : "Confirm & Verify KYC"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
