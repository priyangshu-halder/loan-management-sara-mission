"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Wallet,
  PlusCircle,
  Search,
  Filter,
  Percent,
  Eye,
  CheckCircle2,
  AlertTriangle,
  X,
  CreditCard,
  Building,
  Calendar,
  Check,
  Clock,
  ArrowRight,
  TrendingUp,
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
}

interface CashAccountItem {
  id: string;
  code: string;
  name: string;
  accountType: string;
  balance: string;
}

interface SavingsAccountOption {
  id: string;
  accountNumber: string;
  customerId: string;
  customer: { fullName: string };
  balance: string;
}

interface DepositProductItem {
  id: string;
  code: string;
  name: string;
  productType: "FD" | "RD";
  interestRate: string;
  interestMethod: string;
  termMonths: number;
  minPrincipal: string;
  maxPrincipal: string;
  prematurePenaltyRate: string;
  installmentFrequency: string;
  status: string;
}

interface RdInstallmentItem {
  id: string;
  installmentNumber: number;
  dueDate: string;
  amountDue: string;
  amountPaid: string;
  status: "PENDING" | "PAID" | "MISSED";
  paidAt: string | null;
  receiptNumber: string | null;
}

interface InterestPostingItem {
  id: string;
  accrualPeriod: string;
  calculationDate: string;
  interestAmount: string;
  rateApplied: string;
  balanceBasis: string;
  status: string;
}

interface TermDepositAccountItem {
  id: string;
  accountNumber: string;
  principal: string;
  currentBalance: string;
  interestRate: string;
  depositDate: string;
  maturityDate: string;
  projectedMaturityValue: string;
  payoutInstruction: string;
  status: string;
  closureDate?: string | null;
  closureAmount?: string | null;
  closureReason?: string | null;
  customer: CustomerItem;
  product: DepositProductItem;
  rdInstallments?: RdInstallmentItem[];
  interestPostings?: InterestPostingItem[];
  _count?: { rdInstallments: number; interestPostings: number };
}

interface DepositsClientProps {
  summary: {
    totalTermDepositBalance: string;
    totalAccounts: number;
    activeFdCount: number;
    activeRdCount: number;
    maturedCount: number;
  };
  products: DepositProductItem[];
  accounts: TermDepositAccountItem[];
  savingsAccounts: SavingsAccountOption[];
  customers: CustomerItem[];
  cashAccounts: CashAccountItem[];
  currentUserRole: string;
}

export function DepositsClient({
  summary,
  products,
  accounts,
  savingsAccounts,
  customers,
  cashAccounts,
}: DepositsClientProps) {
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<"ACCOUNTS" | "PRODUCTS">("ACCOUNTS");
  const [searchTerm, setSearchTerm] = useState("");
  const [productTypeFilter, setProductTypeFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");

  // Modals state
  const [isProductModal, setIsProductModal] = useState(false);
  const [isOpenAccountModal, setIsOpenAccountModal] = useState(false);
  const [isDetailModal, setIsDetailModal] = useState(false);
  const [isPayInstallmentModal, setIsPayInstallmentModal] = useState(false);
  const [isInterestModal, setIsInterestModal] = useState(false);
  const [isPayoutModal, setIsPayoutModal] = useState(false);
  const [isPrematureCloseModal, setIsPrematureCloseModal] = useState(false);

  // Selected entities
  const [selectedAccount, setSelectedAccount] = useState<TermDepositAccountItem | null>(null);
  const [detailedAccount, setDetailedAccount] = useState<TermDepositAccountItem | null>(null);
  const [selectedInstallment, setSelectedInstallment] = useState<RdInstallmentItem | null>(null);

  // Forms
  const [productForm, setProductForm] = useState({
    code: `DEP-${Date.now().toString().slice(-4)}`,
    name: "Fixed Deposit 12M",
    productType: "FD" as "FD" | "RD",
    interestRate: "7.5000",
    interestMethod: "SIMPLE",
    termMonths: 12,
    minPrincipal: "5000.0000",
    maxPrincipal: "1000000.0000",
    prematurePenaltyRate: "1.0000",
    installmentFrequency: "MONTHLY",
  });

  const [openForm, setOpenForm] = useState({
    customerId: customers[0]?.id || "",
    productId: products[0]?.id || "",
    accountNumber: `TD-${Date.now().toString().slice(-6)}`,
    principal: "10000.0000",
    depositDate: new Date().toISOString().slice(0, 10),
    payoutInstruction: "PAYOUT_TO_SAVINGS",
    cashAccountId: cashAccounts[0]?.id || "",
  });

  const [installmentForm, setInstallmentForm] = useState({
    installmentNumber: 1,
    amount: "0.0000",
    transactionRef: `RD-INST-${Date.now().toString().slice(-6)}`,
    cashAccountId: cashAccounts[0]?.id || "",
  });

  const [interestForm, setInterestForm] = useState({
    accrualPeriod: new Date().toISOString().slice(0, 7),
    calculationDate: new Date().toISOString().slice(0, 10),
  });

  const [payoutForm, setPayoutForm] = useState({
    savingsAccountId: "",
    cashAccountId: cashAccounts[0]?.id || "",
    payoutDate: new Date().toISOString().slice(0, 10),
  });

  const [prematureForm, setPrematureForm] = useState({
    closureDate: new Date().toISOString().slice(0, 10),
    cashAccountId: cashAccounts[0]?.id || "",
    reason: "",
  });

  // Loading & message states
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const filteredAccounts = accounts.filter((acc) => {
    const matchesSearch =
      acc.accountNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      acc.customer.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      acc.product.name.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesType = productTypeFilter === "ALL" || acc.product.productType === productTypeFilter;
    const matchesStatus = statusFilter === "ALL" || acc.status === statusFilter;
    return matchesSearch && matchesType && matchesStatus;
  });

  const loadAccountDetails = async (accountId: string) => {
    try {
      setIsLoading(true);
      setErrorMsg(null);
      const res = await fetch(`/api/term-deposits/accounts/${accountId}`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || "Failed to load account details");
      }
      setDetailedAccount(data);
      setIsDetailModal(true);
    } catch (err: unknown) {
      setErrorMsg((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await fetch("/api/term-deposits/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(productForm),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || "Failed to create deposit product");
      }
      setSuccessMsg(`Deposit Product ${data.code} created successfully!`);
      setIsProductModal(false);
      router.refresh();
    } catch (err: unknown) {
      setErrorMsg((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await fetch("/api/term-deposits/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(openForm),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || "Failed to open term deposit account");
      }
      setSuccessMsg(`Term Deposit ${data.accountNumber} opened successfully!`);
      setIsOpenAccountModal(false);
      router.refresh();
    } catch (err: unknown) {
      setErrorMsg((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePayInstallment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!detailedAccount) return;
    setIsLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await fetch(`/api/term-deposits/accounts/${detailedAccount.id}/rd-installments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(installmentForm),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || "Failed to collect RD installment");
      }
      setSuccessMsg(`Installment #${data.installmentNumber} collected successfully!`);
      setIsPayInstallmentModal(false);
      router.refresh();
      loadAccountDetails(detailedAccount.id);
    } catch (err: unknown) {
      setErrorMsg((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePostInterest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!detailedAccount) return;
    setIsLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await fetch(`/api/term-deposits/accounts/${detailedAccount.id}/interest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(interestForm),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || "Failed to post deposit interest");
      }
      setSuccessMsg(`Deposit interest of ₹${data.interestAmount} posted for period ${data.accrualPeriod}!`);
      setIsInterestModal(false);
      router.refresh();
      loadAccountDetails(detailedAccount.id);
    } catch (err: unknown) {
      setErrorMsg((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleMaturityPayout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!detailedAccount) return;
    setIsLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await fetch(`/api/term-deposits/accounts/${detailedAccount.id}/payout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          payoutDate: payoutForm.payoutDate,
          savingsAccountId: payoutForm.savingsAccountId || undefined,
          cashAccountId: payoutForm.savingsAccountId ? undefined : payoutForm.cashAccountId,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || "Failed to execute maturity payout");
      }
      setSuccessMsg(`Deposit ${data.accountNumber} settled at maturity for ₹${data.closureAmount}!`);
      setIsPayoutModal(false);
      router.refresh();
      loadAccountDetails(detailedAccount.id);
    } catch (err: unknown) {
      setErrorMsg((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePrematureClose = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!detailedAccount) return;
    setIsLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await fetch(`/api/term-deposits/accounts/${detailedAccount.id}/premature-close`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(prematureForm),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || "Failed to prematurely close account");
      }
      setSuccessMsg(`Deposit ${data.accountNumber} prematurely closed for ₹${data.closureAmount}!`);
      setIsPrematureCloseModal(false);
      router.refresh();
      loadAccountDetails(detailedAccount.id);
    } catch (err: unknown) {
      setErrorMsg((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header and Actions */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Term Deposits (RD & FD)</h1>
          <p className="text-sm text-slate-500 mt-1">
            Fixed deposits, recurring deposits with amortization schedules, periodic interest accruals, and maturity settlement.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            onClick={() => {
              setProductForm({
                code: `DEP-${Date.now().toString().slice(-4)}`,
                name: "Standard FD Scheme",
                productType: "FD",
                interestRate: "7.2500",
                interestMethod: "SIMPLE",
                termMonths: 12,
                minPrincipal: "5000.0000",
                maxPrincipal: "500000.0000",
                prematurePenaltyRate: "1.0000",
                installmentFrequency: "MONTHLY",
              });
              setIsProductModal(true);
            }}
            className="flex items-center gap-1.5"
          >
            <PlusCircle className="w-4 h-4" />
            <span>New Product Scheme</span>
          </Button>

          <Button
            onClick={() => {
              setOpenForm({
                customerId: customers[0]?.id || "",
                productId: products[0]?.id || "",
                accountNumber: `TD-${Date.now().toString().slice(-6)}`,
                principal: products[0]?.minPrincipal || "10000.0000",
                depositDate: new Date().toISOString().slice(0, 10),
                payoutInstruction: "PAYOUT_TO_SAVINGS",
                cashAccountId: cashAccounts[0]?.id || "",
              });
              setIsOpenAccountModal(true);
            }}
            className="flex items-center gap-1.5"
          >
            <Wallet className="w-4 h-4" />
            <span>Open Term Deposit</span>
          </Button>
        </div>
      </div>

      {/* Alerts */}
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
              <Wallet className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Term Deposit Portfolio</p>
              <h3 className="text-xl font-bold text-slate-900 mt-0.5">₹{Number(summary.totalTermDepositBalance).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</h3>
              <p className="text-xs text-slate-400 mt-0.5">GL 2002/2003 Liabilities</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
              <TrendingUp className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Active Fixed Deposits</p>
              <h3 className="text-xl font-bold text-slate-900 mt-0.5">{summary.activeFdCount}</h3>
              <p className="text-xs text-slate-400 mt-0.5">Lump sum term investments</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl">
              <Clock className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Active Recurring Deposits</p>
              <h3 className="text-xl font-bold text-slate-900 mt-0.5">{summary.activeRdCount}</h3>
              <p className="text-xs text-slate-400 mt-0.5">Periodic amortized collections</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="p-3 bg-slate-100 text-slate-700 rounded-xl">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Settled / Closed</p>
              <h3 className="text-xl font-bold text-slate-900 mt-0.5">{summary.maturedCount}</h3>
              <p className="text-xs text-slate-400 mt-0.5">Matured or premature closures</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-200">
        <div className="flex gap-4">
          <button
            onClick={() => setActiveTab("ACCOUNTS")}
            className={`pb-3 text-sm font-semibold border-b-2 transition-colors ${
              activeTab === "ACCOUNTS"
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            Term Deposit Accounts ({accounts.length})
          </button>
          <button
            onClick={() => setActiveTab("PRODUCTS")}
            className={`pb-3 text-sm font-semibold border-b-2 transition-colors ${
              activeTab === "PRODUCTS"
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            Deposit Product Schemes ({products.length})
          </button>
        </div>
      </div>

      {/* Tab: Accounts View */}
      {activeTab === "ACCOUNTS" && (
        <Card>
          <CardHeader className="p-5 border-b border-slate-200">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <CardTitle className="text-lg font-bold text-slate-900">Deposit Accounts Portfolio</CardTitle>
                <CardDescription className="text-xs text-slate-500 mt-0.5">
                  Track maturity dates, collection progress, and settlement status
                </CardDescription>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    placeholder="Search account, member, or scheme..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 w-56"
                  />
                </div>
                <div className="flex items-center gap-1.5 text-xs">
                  <Filter className="w-3.5 h-3.5 text-slate-400" />
                  <select
                    value={productTypeFilter}
                    onChange={(e) => setProductTypeFilter(e.target.value)}
                    className="py-1.5 px-2 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs text-slate-700"
                  >
                    <option value="ALL">All Types</option>
                    <option value="FD">Fixed Deposit (FD)</option>
                    <option value="RD">Recurring Deposit (RD)</option>
                  </select>
                </div>
                <div className="flex items-center gap-1.5 text-xs">
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="py-1.5 px-2 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs text-slate-700"
                  >
                    <option value="ALL">All Status</option>
                    <option value="ACTIVE">Active</option>
                    <option value="MATURED">Matured</option>
                    <option value="PREMATURE_CLOSED">Premature Closed</option>
                  </select>
                </div>
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Account #</TableHead>
                  <TableHead>Member</TableHead>
                  <TableHead>Type & Scheme</TableHead>
                  <TableHead className="text-right">Balance / Principal</TableHead>
                  <TableHead className="text-right">Projected Maturity</TableHead>
                  <TableHead>Maturity Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAccounts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="p-0">
                      <TableEmptyState message="No deposit accounts found. Open an FD or RD account to get started." />
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredAccounts.map((account) => (
                    <TableRow key={account.id}>
                      <TableCell className="font-mono text-xs font-semibold text-blue-600">{account.accountNumber}</TableCell>
                      <TableCell>
                        <div className="font-medium text-slate-900 text-xs">{account.customer.fullName}</div>
                        <div className="text-[11px] text-slate-400">{account.customer.customerCode}</div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <Badge variant={account.product.productType === "FD" ? "info" : "warning"}>
                            {account.product.productType}
                          </Badge>
                          <span className="text-xs text-slate-700">{account.product.name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs font-bold text-slate-900">
                        ₹{Number(account.currentBalance).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs text-emerald-600 font-bold">
                        ₹{Number(account.projectedMaturityValue).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell className="text-xs text-slate-600 font-mono">{account.maturityDate}</TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            account.status === "ACTIVE"
                              ? "success"
                              : account.status === "MATURED"
                              ? "info"
                              : "danger"
                          }
                        >
                          {account.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => loadAccountDetails(account.id)}
                          className="h-7 px-2 text-xs text-blue-600 hover:text-blue-800"
                        >
                          <Eye className="w-3.5 h-3.5 mr-1" />
                          Manage & Lifecycle
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Tab: Products View */}
      {activeTab === "PRODUCTS" && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {products.map((p) => (
            <Card key={p.id} className="relative overflow-hidden">
              <div
                className={`absolute top-0 left-0 right-0 h-1.5 ${
                  p.productType === "FD" ? "bg-blue-600" : "bg-amber-500"
                }`}
              />
              <CardContent className="p-5">
                <div className="flex justify-between items-start">
                  <div>
                    <span className="font-mono text-xs font-bold text-slate-400">{p.code}</span>
                    <h3 className="font-bold text-slate-900 text-base mt-0.5">{p.name}</h3>
                  </div>
                  <Badge variant={p.productType === "FD" ? "info" : "warning"}>{p.productType}</Badge>
                </div>

                <div className="mt-4 pt-4 border-t border-slate-100 space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Interest Rate:</span>
                    <span className="font-bold text-emerald-600">{p.interestRate}% p.a.</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Duration / Term:</span>
                    <span className="font-semibold text-slate-800">{p.termMonths} Months</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Principal Range:</span>
                    <span className="font-semibold text-slate-800">
                      ₹{Number(p.minPrincipal).toLocaleString("en-IN")} - ₹{Number(p.maxPrincipal).toLocaleString("en-IN")}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Premature Penalty:</span>
                    <span className="font-semibold text-rose-600">{p.prematurePenaltyRate}% discount</span>
                  </div>
                  {p.productType === "RD" && (
                    <div className="flex justify-between">
                      <span className="text-slate-500">Frequency:</span>
                      <span className="font-semibold text-slate-800">{p.installmentFrequency}</span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Modal: Create Deposit Product */}
      {isProductModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full overflow-hidden">
            <div className="p-5 border-b border-slate-200 flex justify-between items-center">
              <div>
                <h3 className="font-bold text-slate-900 text-base">New Term Deposit Product</h3>
                <p className="text-xs text-slate-500">Configure interest rates, terms, and penalty rules</p>
              </div>
              <button onClick={() => setIsProductModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreateProduct} className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Product Code</label>
                  <input
                    type="text"
                    value={productForm.code}
                    onChange={(e) => setProductForm({ ...productForm, code: e.target.value })}
                    className="w-full text-xs font-mono p-2 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Deposit Type</label>
                  <select
                    value={productForm.productType}
                    onChange={(e) => setProductForm({ ...productForm, productType: e.target.value as "FD" | "RD" })}
                    className="w-full text-xs p-2 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-semibold"
                  >
                    <option value="FD">Fixed Deposit (FD)</option>
                    <option value="RD">Recurring Deposit (RD)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Product Name</label>
                <input
                  type="text"
                  value={productForm.name}
                  onChange={(e) => setProductForm({ ...productForm, name: e.target.value })}
                  className="w-full text-xs p-2 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Annual Interest Rate (%)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={productForm.interestRate}
                    onChange={(e) => setProductForm({ ...productForm, interestRate: e.target.value })}
                    className="w-full text-xs p-2 font-mono bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Term (Months)</label>
                  <input
                    type="number"
                    min="1"
                    max="600"
                    value={productForm.termMonths}
                    onChange={(e) => setProductForm({ ...productForm, termMonths: parseInt(e.target.value, 10) })}
                    className="w-full text-xs p-2 font-mono bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Min Principal (₹)</label>
                  <input
                    type="number"
                    step="1"
                    value={productForm.minPrincipal}
                    onChange={(e) => setProductForm({ ...productForm, minPrincipal: e.target.value })}
                    className="w-full text-xs p-2 font-mono bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Max Principal (₹)</label>
                  <input
                    type="number"
                    step="1"
                    value={productForm.maxPrincipal}
                    onChange={(e) => setProductForm({ ...productForm, maxPrincipal: e.target.value })}
                    className="w-full text-xs p-2 font-mono bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Premature Penalty Rate (%)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={productForm.prematurePenaltyRate}
                    onChange={(e) => setProductForm({ ...productForm, prematurePenaltyRate: e.target.value })}
                    className="w-full text-xs p-2 font-mono bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Installment Frequency</label>
                  <select
                    value={productForm.installmentFrequency}
                    onChange={(e) => setProductForm({ ...productForm, installmentFrequency: e.target.value })}
                    className="w-full text-xs p-2 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="MONTHLY">Monthly</option>
                    <option value="WEEKLY">Weekly</option>
                  </select>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setIsProductModal(false)}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" isLoading={isLoading}>
                  Save Product Scheme
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Open Term Deposit Account */}
      {isOpenAccountModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full overflow-hidden">
            <div className="p-5 border-b border-slate-200 flex justify-between items-center">
              <div>
                <h3 className="font-bold text-slate-900 text-base">Open Term Deposit Account</h3>
                <p className="text-xs text-slate-500">Collect opening deposit and create schedule</p>
              </div>
              <button onClick={() => setIsOpenAccountModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleOpenAccount} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Select Customer</label>
                <select
                  value={openForm.customerId}
                  onChange={(e) => setOpenForm({ ...openForm, customerId: e.target.value })}
                  className="w-full text-xs p-2 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                >
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.fullName} ({c.customerCode})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Deposit Product Scheme</label>
                <select
                  value={openForm.productId}
                  onChange={(e) => setOpenForm({ ...openForm, productId: e.target.value })}
                  className="w-full text-xs p-2 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                >
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      [{p.productType}] {p.name} - {p.interestRate}% ({p.termMonths}M)
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Account Number</label>
                  <input
                    type="text"
                    value={openForm.accountNumber}
                    onChange={(e) => setOpenForm({ ...openForm, accountNumber: e.target.value })}
                    className="w-full text-xs font-mono p-2 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Deposit Amount / Installment (₹)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={openForm.principal}
                    onChange={(e) => setOpenForm({ ...openForm, principal: e.target.value })}
                    className="w-full text-xs font-mono font-bold p-2 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-blue-700"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Deposit Date</label>
                  <input
                    type="date"
                    value={openForm.depositDate}
                    onChange={(e) => setOpenForm({ ...openForm, depositDate: e.target.value })}
                    className="w-full text-xs font-mono p-2 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Payout Instruction</label>
                  <select
                    value={openForm.payoutInstruction}
                    onChange={(e) => setOpenForm({ ...openForm, payoutInstruction: e.target.value })}
                    className="w-full text-xs p-2 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="PAYOUT_TO_SAVINGS">Credit to Savings</option>
                    <option value="PAYOUT_TO_BANK">Payout in Cash/Bank</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Receipt Cash Desk</label>
                <select
                  value={openForm.cashAccountId}
                  onChange={(e) => setOpenForm({ ...openForm, cashAccountId: e.target.value })}
                  className="w-full text-xs p-2 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {cashAccounts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.code}) - Balance: ₹{Number(c.balance).toFixed(2)}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-slate-400 mt-1">Atomically credits Deposit Liability (GL 2002 for RD, 2003 for FD).</p>
              </div>

              <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setIsOpenAccountModal(false)}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" isLoading={isLoading}>
                  Open & Collect
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Account Lifecycle Management */}
      {isDetailModal && detailedAccount && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden">
            <div className="p-5 border-b border-slate-200 flex justify-between items-center bg-slate-50">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-slate-900 text-base">{detailedAccount.accountNumber}</h3>
                  <Badge variant={detailedAccount.product.productType === "FD" ? "info" : "warning"}>
                    {detailedAccount.product.productType}
                  </Badge>
                  <Badge variant={detailedAccount.status === "ACTIVE" ? "success" : "neutral"}>
                    {detailedAccount.status}
                  </Badge>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  {detailedAccount.customer.fullName} ({detailedAccount.customer.customerCode}) &bull; {detailedAccount.product.name}
                </p>
              </div>
              <button onClick={() => setIsDetailModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Account Summary Strip */}
            <div className="p-5 border-b border-slate-200 bg-white grid grid-cols-4 gap-4 text-xs">
              <div>
                <span className="text-slate-400 font-medium">Current Balance</span>
                <p className="font-bold text-base text-blue-600">₹{Number(detailedAccount.currentBalance).toFixed(2)}</p>
              </div>
              <div>
                <span className="text-slate-400 font-medium">Interest Rate</span>
                <p className="font-bold text-emerald-600">{detailedAccount.interestRate}% p.a.</p>
              </div>
              <div>
                <span className="text-slate-400 font-medium">Maturity Date</span>
                <p className="font-bold text-slate-800">{detailedAccount.maturityDate}</p>
              </div>
              <div>
                <span className="text-slate-400 font-medium">Projected Maturity</span>
                <p className="font-bold text-base text-emerald-600">₹{Number(detailedAccount.projectedMaturityValue).toFixed(2)}</p>
              </div>
            </div>

            {/* Lifecycle Action Bar */}
            {detailedAccount.status === "ACTIVE" && (
              <div className="p-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setInterestForm({
                      accrualPeriod: new Date().toISOString().slice(0, 7),
                      calculationDate: new Date().toISOString().slice(0, 10),
                    });
                    setIsInterestModal(true);
                  }}
                  className="text-xs text-amber-700 border-amber-300 hover:bg-amber-50"
                >
                  <Percent className="w-3.5 h-3.5 mr-1" />
                  Post Monthly Accrual
                </Button>

                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const custSavings = savingsAccounts.find((s) => s.customerId === detailedAccount.customer.id);
                    setPayoutForm({
                      savingsAccountId: custSavings?.id || "",
                      cashAccountId: cashAccounts[0]?.id || "",
                      payoutDate: new Date().toISOString().slice(0, 10),
                    });
                    setIsPayoutModal(true);
                  }}
                  className="text-xs text-emerald-700 border-emerald-300 hover:bg-emerald-50"
                >
                  <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                  Maturity Payout Settlement
                </Button>

                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setPrematureForm({
                      closureDate: new Date().toISOString().slice(0, 10),
                      cashAccountId: cashAccounts[0]?.id || "",
                      reason: "",
                    });
                    setIsPrematureCloseModal(true);
                  }}
                  className="text-xs text-rose-700 border-rose-300 hover:bg-rose-50"
                >
                  <AlertTriangle className="w-3.5 h-3.5 mr-1" />
                  Premature Closure
                </Button>
              </div>
            )}

            {/* Schedule / Postings Table */}
            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              {detailedAccount.product.productType === "RD" && (
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">
                    Recurring Installment Amortization Schedule
                  </h4>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>#</TableHead>
                        <TableHead>Due Date</TableHead>
                        <TableHead className="text-right">Amount Due</TableHead>
                        <TableHead className="text-right">Amount Paid</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Receipt Ref</TableHead>
                        <TableHead className="text-right">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {detailedAccount.rdInstallments?.map((inst) => (
                        <TableRow key={inst.id}>
                          <TableCell className="font-mono text-xs font-semibold">{inst.installmentNumber}</TableCell>
                          <TableCell className="text-xs font-mono text-slate-600">
                            {new Date(inst.dueDate).toISOString().slice(0, 10)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs font-bold text-slate-800">
                            ₹{Number(inst.amountDue).toFixed(2)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs font-bold text-emerald-700">
                            ₹{Number(inst.amountPaid).toFixed(2)}
                          </TableCell>
                          <TableCell>
                            <Badge variant={inst.status === "PAID" ? "success" : "warning"}>
                              {inst.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs font-mono text-slate-400">
                            {inst.receiptNumber || "-"}
                          </TableCell>
                          <TableCell className="text-right">
                            {inst.status === "PENDING" && detailedAccount.status === "ACTIVE" && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setSelectedInstallment(inst);
                                  setInstallmentForm({
                                    installmentNumber: inst.installmentNumber,
                                    amount: inst.amountDue,
                                    transactionRef: `RD-${detailedAccount.accountNumber}-${inst.installmentNumber}`,
                                    cashAccountId: cashAccounts[0]?.id || "",
                                  });
                                  setIsPayInstallmentModal(true);
                                }}
                                className="h-6 px-2 text-[11px] text-emerald-700 border-emerald-300 hover:bg-emerald-50"
                              >
                                Collect
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}

              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">
                  Periodic Deposit Interest Postings
                </h4>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Period</TableHead>
                      <TableHead>Calculation Date</TableHead>
                      <TableHead className="text-right">Balance Basis</TableHead>
                      <TableHead className="text-right">Rate %</TableHead>
                      <TableHead className="text-right">Interest Amount</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detailedAccount.interestPostings?.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="p-0">
                          <TableEmptyState message="No interest postings yet. Monthly interest accruals will appear here." />
                        </TableCell>
                      </TableRow>
                    ) : (
                      detailedAccount.interestPostings?.map((ip) => (
                        <TableRow key={ip.id}>
                          <TableCell className="font-mono text-xs font-bold text-slate-800">{ip.accrualPeriod}</TableCell>
                          <TableCell className="text-xs font-mono text-slate-500">{ip.calculationDate}</TableCell>
                          <TableCell className="text-right font-mono text-xs text-slate-700">₹{Number(ip.balanceBasis).toFixed(2)}</TableCell>
                          <TableCell className="text-right font-mono text-xs text-emerald-600">{ip.rateApplied}%</TableCell>
                          <TableCell className="text-right font-mono text-xs font-bold text-emerald-700">
                            +₹{Number(ip.interestAmount).toFixed(2)}
                          </TableCell>
                          <TableCell>
                            <Badge variant="success">{ip.status}</Badge>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>

            <div className="p-4 border-t border-slate-200 bg-slate-50 flex justify-end">
              <Button size="sm" variant="outline" onClick={() => setIsDetailModal(false)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Pay RD Installment */}
      {isPayInstallmentModal && detailedAccount && selectedInstallment && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full overflow-hidden">
            <div className="p-5 border-b border-slate-200 flex justify-between items-center bg-emerald-50/50">
              <div>
                <h3 className="font-bold text-slate-900 text-base">Collect Installment #{selectedInstallment.installmentNumber}</h3>
                <p className="text-xs text-slate-500">{detailedAccount.accountNumber} ({detailedAccount.customer.fullName})</p>
              </div>
              <button onClick={() => setIsPayInstallmentModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handlePayInstallment} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Installment Amount (₹)</label>
                <input
                  type="number"
                  step="0.01"
                  value={installmentForm.amount}
                  onChange={(e) => setInstallmentForm({ ...installmentForm, amount: e.target.value })}
                  className="w-full text-base font-bold font-mono p-2 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-emerald-800"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Receipt Reference</label>
                <input
                  type="text"
                  value={installmentForm.transactionRef}
                  onChange={(e) => setInstallmentForm({ ...installmentForm, transactionRef: e.target.value })}
                  className="w-full text-xs font-mono p-2 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Cash / Bank Account</label>
                <select
                  value={installmentForm.cashAccountId}
                  onChange={(e) => setInstallmentForm({ ...installmentForm, cashAccountId: e.target.value })}
                  className="w-full text-xs p-2 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  {cashAccounts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.code}) - Balance: ₹{Number(c.balance).toFixed(2)}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-slate-400 mt-1">Debits Cash and credits RD Liability (GL 2002).</p>
              </div>

              <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setIsPayInstallmentModal(false)}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" className="bg-emerald-600 hover:bg-emerald-700" isLoading={isLoading}>
                  Confirm Payment
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Post Periodic Interest */}
      {isInterestModal && detailedAccount && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full overflow-hidden">
            <div className="p-5 border-b border-slate-200 flex justify-between items-center bg-amber-50/50">
              <div>
                <h3 className="font-bold text-slate-900 text-base">Post Term Deposit Interest</h3>
                <p className="text-xs text-slate-500">{detailedAccount.accountNumber} ({detailedAccount.product.productType})</p>
              </div>
              <button onClick={() => setIsInterestModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handlePostInterest} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Accrual Period (YYYY-MM)</label>
                <input
                  type="month"
                  value={interestForm.accrualPeriod}
                  onChange={(e) => setInterestForm({ ...interestForm, accrualPeriod: e.target.value })}
                  className="w-full text-xs font-mono p-2 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                  required
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Credits deposit liability and debits 5004 Interest Expense on Member Deposits.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Calculation Date</label>
                <input
                  type="date"
                  value={interestForm.calculationDate}
                  onChange={(e) => setInterestForm({ ...interestForm, calculationDate: e.target.value })}
                  className="w-full text-xs font-mono p-2 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                  required
                />
              </div>

              <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setIsInterestModal(false)}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" className="bg-amber-600 hover:bg-amber-700 text-white" isLoading={isLoading}>
                  Post Accrual
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Maturity Payout Settlement */}
      {isPayoutModal && detailedAccount && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full overflow-hidden">
            <div className="p-5 border-b border-slate-200 flex justify-between items-center bg-emerald-50/50">
              <div>
                <h3 className="font-bold text-slate-900 text-base">Settle Maturity Payout</h3>
                <p className="text-xs text-slate-500">{detailedAccount.accountNumber} &bull; Matures to ₹{Number(detailedAccount.projectedMaturityValue).toFixed(2)}</p>
              </div>
              <button onClick={() => setIsPayoutModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleMaturityPayout} className="p-5 space-y-4">
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-emerald-700">Projected Maturity Payout:</span>
                  <span className="font-bold text-slate-900 text-sm">₹{Number(detailedAccount.projectedMaturityValue).toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-emerald-700">Current Balance:</span>
                  <span className="font-bold text-slate-900">₹{Number(detailedAccount.currentBalance).toFixed(2)}</span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Transfer to Member Savings Account</label>
                <select
                  value={payoutForm.savingsAccountId}
                  onChange={(e) => setPayoutForm({ ...payoutForm, savingsAccountId: e.target.value })}
                  className="w-full text-xs p-2 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="">-- Disburse in Cash / Bank instead --</option>
                  {savingsAccounts
                    .filter((s) => s.customerId === detailedAccount.customer.id)
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.accountNumber} - Current Balance: ₹{Number(s.balance).toFixed(2)}
                      </option>
                    ))}
                </select>
              </div>

              {!payoutForm.savingsAccountId && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Cash / Bank Disbursal Desk</label>
                  <select
                    value={payoutForm.cashAccountId}
                    onChange={(e) => setPayoutForm({ ...payoutForm, cashAccountId: e.target.value })}
                    className="w-full text-xs p-2 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    {cashAccounts.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.code}) - Balance: ₹{Number(c.balance).toFixed(2)}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Settlement Date</label>
                <input
                  type="date"
                  value={payoutForm.payoutDate}
                  onChange={(e) => setPayoutForm({ ...payoutForm, payoutDate: e.target.value })}
                  className="w-full text-xs font-mono p-2 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  required
                />
              </div>

              <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setIsPayoutModal(false)}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" className="bg-emerald-600 hover:bg-emerald-700" isLoading={isLoading}>
                  Authorize Maturity Settlement
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Premature Closure */}
      {isPrematureCloseModal && detailedAccount && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full overflow-hidden">
            <div className="p-5 border-b border-slate-200 flex justify-between items-center bg-rose-50/50">
              <div>
                <h3 className="font-bold text-slate-900 text-base">Premature Deposit Closure</h3>
                <p className="text-xs text-slate-500">{detailedAccount.accountNumber} ({detailedAccount.customer.fullName})</p>
              </div>
              <button onClick={() => setIsPrematureCloseModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handlePrematureClose} className="p-5 space-y-4">
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs space-y-1 text-amber-900">
                <div className="flex justify-between">
                  <span>Product Rate:</span>
                  <span className="font-semibold">{detailedAccount.interestRate}%</span>
                </div>
                <div className="flex justify-between">
                  <span>Premature Penalty Discount:</span>
                  <span className="font-semibold text-rose-600">-{detailedAccount.product.prematurePenaltyRate}%</span>
                </div>
                <div className="flex justify-between">
                  <span>Effective Penal Rate:</span>
                  <span className="font-bold text-slate-900">
                    {Math.max(0, Number(detailedAccount.interestRate) - Number(detailedAccount.product.prematurePenaltyRate))}%
                  </span>
                </div>
                <p className="text-[11px] text-amber-700 pt-1">
                  Interest will be prorated at the penalized rate and remaining liability cleared via general ledger.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Closure Date</label>
                <input
                  type="date"
                  value={prematureForm.closureDate}
                  onChange={(e) => setPrematureForm({ ...prematureForm, closureDate: e.target.value })}
                  className="w-full text-xs font-mono p-2 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Disbursement Cash Desk</label>
                <select
                  value={prematureForm.cashAccountId}
                  onChange={(e) => setPrematureForm({ ...prematureForm, cashAccountId: e.target.value })}
                  className="w-full text-xs p-2 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500"
                >
                  {cashAccounts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.code}) - Balance: ₹{Number(c.balance).toFixed(2)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Reason for Premature Closure</label>
                <textarea
                  rows={2}
                  placeholder="Operational justification for audit compliance..."
                  value={prematureForm.reason}
                  onChange={(e) => setPrematureForm({ ...prematureForm, reason: e.target.value })}
                  className="w-full text-xs p-2 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500"
                  required
                />
              </div>

              <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setIsPrematureCloseModal(false)}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" className="bg-rose-600 hover:bg-rose-700" isLoading={isLoading}>
                  Confirm Premature Closure
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
