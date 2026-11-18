"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import {
  PiggyBank,
  PlusCircle,
  ArrowDownRight,
  ArrowUpRight,
  Search,
  Filter,
  Percent,
  RotateCcw,
  Eye,
  CheckCircle2,
  AlertTriangle,
  X,
  CreditCard,
  Building,
  User,
  Clock,
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

interface SavingsTransactionItem {
  id: string;
  type: string;
  amount: string;
  balanceAfter: string;
  businessDate: string;
  transactionRef: string;
  status: string;
  note: string | null;
  isReversed: boolean;
  reversalReason: string | null;
  createdAt: string;
  cashAccount?: { name: string; code: string } | null;
}

interface InterestPostingItem {
  id: string;
  accrualPeriod: string;
  calculationDate: string;
  interestAmount: string;
  rateApplied: string;
  balanceBasis: string;
  status: string;
  createdAt: string;
}

interface SavingsAccountItem {
  id: string;
  accountNumber: string;
  productName: string;
  balance: string;
  minBalance: string;
  interestRate: string;
  status: string;
  createdAt: string;
  customer: CustomerItem;
  transactions?: SavingsTransactionItem[];
  interestPostings?: InterestPostingItem[];
  _count?: { transactions: number };
}

interface SavingsClientProps {
  summary: {
    totalSavingsBalance: string;
    totalAccounts: number;
    activeAccounts: number;
    totalInterestPaid: string;
    interestRunsCount: number;
  };
  accounts: SavingsAccountItem[];
  customers: CustomerItem[];
  cashAccounts: CashAccountItem[];
  currentUserRole: string;
}

export function SavingsClient({
  summary,
  accounts,
  customers,
  cashAccounts,
}: SavingsClientProps) {
  const router = useRouter();

  // Filter and search
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");

  // Modals state
  const [isOpenModal, setIsOpenModal] = useState(false);
  const [isDepositModal, setIsDepositModal] = useState(false);
  const [isWithdrawModal, setIsWithdrawModal] = useState(false);
  const [isInterestModal, setIsInterestModal] = useState(false);
  const [isStatementModal, setIsStatementModal] = useState(false);
  const [isReverseModal, setIsReverseModal] = useState(false);

  // Selected account/transaction state
  const [selectedAccount, setSelectedAccount] = useState<SavingsAccountItem | null>(null);
  const [selectedTransaction, setSelectedTransaction] = useState<SavingsTransactionItem | null>(null);
  const [detailedAccount, setDetailedAccount] = useState<SavingsAccountItem | null>(null);

  // Form states
  const [openForm, setOpenForm] = useState({
    customerId: customers[0]?.id || "",
    accountNumber: `SV-${Date.now().toString().slice(-6)}`,
    productName: "Member General Savings",
    minBalance: "100.0000",
    interestRate: "4.0000",
  });

  const [depositForm, setDepositForm] = useState({
    accountId: "",
    amount: "",
    transactionRef: `DEP-${Date.now().toString().slice(-6)}`,
    cashAccountId: cashAccounts[0]?.id || "",
    note: "",
  });

  const [withdrawForm, setWithdrawForm] = useState({
    accountId: "",
    amount: "",
    transactionRef: `WD-${Date.now().toString().slice(-6)}`,
    cashAccountId: cashAccounts[0]?.id || "",
    note: "",
  });

  const [interestForm, setInterestForm] = useState({
    accountId: "",
    accrualPeriod: new Date().toISOString().slice(0, 7), // YYYY-MM
    calculationDate: new Date().toISOString().slice(0, 10),
    daysCount: 30,
  });

  const [reversalReason, setReversalReason] = useState("");

  // Processing & message state
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const filteredAccounts = accounts.filter((acc) => {
    const matchesSearch =
      acc.accountNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      acc.customer.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      acc.customer.customerCode.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus = statusFilter === "ALL" || acc.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const loadAccountDetails = async (accountId: string) => {
    try {
      setIsLoading(true);
      setErrorMsg(null);
      const res = await fetch(`/api/savings/accounts/${accountId}`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || "Failed to load account details");
      }
      setDetailedAccount(data);
      setIsStatementModal(true);
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
      const res = await fetch("/api/savings/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(openForm),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || "Failed to open savings account");
      }
      setSuccessMsg(`Account ${data.accountNumber} opened successfully!`);
      setIsOpenModal(false);
      router.refresh();
    } catch (err: unknown) {
      setErrorMsg((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeposit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await fetch(`/api/savings/accounts/${depositForm.accountId}/deposit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(depositForm),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || "Failed to post deposit");
      }
      setSuccessMsg(`Deposit of ₹${data.amount} successfully posted!`);
      setIsDepositModal(false);
      router.refresh();
      if (detailedAccount && detailedAccount.id === depositForm.accountId) {
        loadAccountDetails(depositForm.accountId);
      }
    } catch (err: unknown) {
      setErrorMsg((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleWithdraw = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await fetch(`/api/savings/accounts/${withdrawForm.accountId}/withdraw`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(withdrawForm),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || "Failed to post withdrawal");
      }
      setSuccessMsg(`Withdrawal of ₹${data.amount} successfully processed!`);
      setIsWithdrawModal(false);
      router.refresh();
      if (detailedAccount && detailedAccount.id === withdrawForm.accountId) {
        loadAccountDetails(withdrawForm.accountId);
      }
    } catch (err: unknown) {
      setErrorMsg((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePostInterest = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await fetch(`/api/savings/accounts/${interestForm.accountId}/interest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accrualPeriod: interestForm.accrualPeriod,
          calculationDate: interestForm.calculationDate,
          daysCount: Number(interestForm.daysCount),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || "Failed to post savings interest");
      }
      setSuccessMsg(`Interest of ₹${data.interestAmount} successfully credited for ${data.accrualPeriod}!`);
      setIsInterestModal(false);
      router.refresh();
      if (detailedAccount && detailedAccount.id === interestForm.accountId) {
        loadAccountDetails(interestForm.accountId);
      }
    } catch (err: unknown) {
      setErrorMsg((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleReverseTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTransaction) return;
    setIsLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await fetch(`/api/savings/transactions/${selectedTransaction.id}/reverse`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reversalReason }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || "Failed to reverse transaction");
      }
      setSuccessMsg(`Transaction ${selectedTransaction.transactionRef} reversed successfully.`);
      setIsReverseModal(false);
      setReversalReason("");
      router.refresh();
      if (detailedAccount) {
        loadAccountDetails(detailedAccount.id);
      }
    } catch (err: unknown) {
      setErrorMsg((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header and Top Actions */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Savings Management</h1>
          <p className="text-sm text-slate-500 mt-1">
            Member liquid savings, atomic deposit and withdrawal ledger postings, and periodic interest runs.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            onClick={() => {
              setOpenForm({
                customerId: customers[0]?.id || "",
                accountNumber: `SV-${Date.now().toString().slice(-6)}`,
                productName: "Member General Savings",
                minBalance: "100.0000",
                interestRate: "4.0000",
              });
              setIsOpenModal(true);
            }}
            className="flex items-center gap-1.5"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Open Account</span>
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

      {/* Metrics Row */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
              <PiggyBank className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Total Savings Liability</p>
              <h3 className="text-xl font-bold text-slate-900 mt-0.5">₹{Number(summary.totalSavingsBalance).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</h3>
              <p className="text-xs text-slate-400 mt-0.5">Dr GL 2001 Member Savings</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Active Accounts</p>
              <h3 className="text-xl font-bold text-slate-900 mt-0.5">{summary.activeAccounts}</h3>
              <p className="text-xs text-slate-400 mt-0.5">Out of {summary.totalAccounts} total</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="p-3 bg-amber-50 text-amber-600 rounded-xl">
              <Percent className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Interest Accrued</p>
              <h3 className="text-xl font-bold text-slate-900 mt-0.5">₹{Number(summary.totalInterestPaid).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</h3>
              <p className="text-xs text-slate-400 mt-0.5">{summary.interestRunsCount} interest cycles</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="p-3 bg-purple-50 text-purple-600 rounded-xl">
              <Building className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Cash Disbursal Desks</p>
              <h3 className="text-xl font-bold text-slate-900 mt-0.5">{cashAccounts.length}</h3>
              <p className="text-xs text-slate-400 mt-0.5">Vault & Bank ledgers</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Table Card */}
      <Card>
        <CardHeader className="p-5 border-b border-slate-200">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <CardTitle className="text-lg font-bold text-slate-900">Member Savings Accounts</CardTitle>
              <CardDescription className="text-xs text-slate-500 mt-0.5">
                Real-time ledger balances and transaction access
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Search account or member..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 w-52"
                />
              </div>
              <div className="flex items-center gap-1.5 text-xs">
                <Filter className="w-3.5 h-3.5 text-slate-400" />
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="py-1.5 px-2 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs text-slate-700"
                >
                  <option value="ALL">All Status</option>
                  <option value="ACTIVE">Active</option>
                  <option value="INACTIVE">Inactive</option>
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
                <TableHead>Customer</TableHead>
                <TableHead>Product</TableHead>
                <TableHead className="text-right">Balance</TableHead>
                <TableHead className="text-right">Min Balance</TableHead>
                <TableHead className="text-right">Rate %</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredAccounts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="p-0">
                    <TableEmptyState message="No savings accounts found. Open a new savings account to get started." />
                  </TableCell>
                </TableRow>
              ) : (
                filteredAccounts.map((account) => (
                  <TableRow key={account.id}>
                    <TableCell className="font-mono text-xs font-semibold text-blue-600">
                      {account.accountNumber}
                    </TableCell>
                    <TableCell>
                      <div className="font-medium text-slate-900 text-xs">{account.customer.fullName}</div>
                      <div className="text-[11px] text-slate-400">{account.customer.customerCode}</div>
                    </TableCell>
                    <TableCell className="text-xs text-slate-600">{account.productName}</TableCell>
                    <TableCell className="text-right font-mono text-xs font-bold text-slate-900">
                      ₹{Number(account.balance).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs text-slate-500">
                      ₹{Number(account.minBalance).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs text-emerald-600 font-medium">
                      {account.interestRate}%
                    </TableCell>
                    <TableCell>
                      <Badge variant={account.status === "ACTIVE" ? "success" : "neutral"}>
                        {account.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => loadAccountDetails(account.id)}
                          className="h-7 px-2 text-xs text-blue-600 hover:text-blue-800"
                          title="View Statement & History"
                        >
                          <Eye className="w-3.5 h-3.5 mr-1" />
                          Statement
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSelectedAccount(account);
                            setDepositForm({
                              accountId: account.id,
                              amount: "",
                              transactionRef: `DEP-${Date.now().toString().slice(-6)}`,
                              cashAccountId: cashAccounts[0]?.id || "",
                              note: "",
                            });
                            setIsDepositModal(true);
                          }}
                          className="h-7 px-2 text-xs border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                          title="Deposit Cash/Bank"
                        >
                          <ArrowDownRight className="w-3.5 h-3.5 mr-1" />
                          Deposit
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSelectedAccount(account);
                            setWithdrawForm({
                              accountId: account.id,
                              amount: "",
                              transactionRef: `WD-${Date.now().toString().slice(-6)}`,
                              cashAccountId: cashAccounts[0]?.id || "",
                              note: "",
                            });
                            setIsWithdrawModal(true);
                          }}
                          className="h-7 px-2 text-xs border-rose-300 text-rose-700 hover:bg-rose-50"
                          title="Withdraw Cash"
                        >
                          <ArrowUpRight className="w-3.5 h-3.5 mr-1" />
                          Withdraw
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSelectedAccount(account);
                            setInterestForm({
                              accountId: account.id,
                              accrualPeriod: new Date().toISOString().slice(0, 7),
                              calculationDate: new Date().toISOString().slice(0, 10),
                              daysCount: 30,
                            });
                            setIsInterestModal(true);
                          }}
                          className="h-7 px-2 text-xs border-amber-300 text-amber-700 hover:bg-amber-50"
                          title="Post Periodic Interest"
                        >
                          <Percent className="w-3.5 h-3.5 mr-1" />
                          Interest
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Modal: Open Savings Account */}
      {isOpenModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full overflow-hidden">
            <div className="p-5 border-b border-slate-200 flex justify-between items-center">
              <div>
                <h3 className="font-bold text-slate-900 text-base">Open Member Savings Account</h3>
                <p className="text-xs text-slate-500">Configure parameters and assign to member</p>
              </div>
              <button onClick={() => setIsOpenModal(false)} className="text-slate-400 hover:text-slate-600">
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
                      {c.fullName} ({c.customerCode}) - {c.phone}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Account Number</label>
                <input
                  type="text"
                  value={openForm.accountNumber}
                  onChange={(e) => setOpenForm({ ...openForm, accountNumber: e.target.value })}
                  className="w-full text-xs p-2 font-mono bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Product Name</label>
                <input
                  type="text"
                  value={openForm.productName}
                  onChange={(e) => setOpenForm({ ...openForm, productName: e.target.value })}
                  className="w-full text-xs p-2 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Min Balance (₹)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={openForm.minBalance}
                    onChange={(e) => setOpenForm({ ...openForm, minBalance: e.target.value })}
                    className="w-full text-xs p-2 font-mono bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Annual Interest Rate (%)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={openForm.interestRate}
                    onChange={(e) => setOpenForm({ ...openForm, interestRate: e.target.value })}
                    className="w-full text-xs p-2 font-mono bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setIsOpenModal(false)}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" isLoading={isLoading}>
                  Create Account
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Deposit */}
      {isDepositModal && selectedAccount && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full overflow-hidden">
            <div className="p-5 border-b border-slate-200 flex justify-between items-center bg-emerald-50/50">
              <div>
                <h3 className="font-bold text-slate-900 text-base">Deposit to Savings</h3>
                <p className="text-xs text-slate-500">
                  {selectedAccount.accountNumber} ({selectedAccount.customer.fullName})
                </p>
              </div>
              <button onClick={() => setIsDepositModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleDeposit} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Deposit Amount (₹)</label>
                <input
                  type="number"
                  step="0.01"
                  min="1"
                  placeholder="e.g. 5000"
                  value={depositForm.amount}
                  onChange={(e) => setDepositForm({ ...depositForm, amount: e.target.value })}
                  className="w-full text-base font-bold font-mono p-2 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-emerald-800"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Receipt / Ref Number</label>
                <input
                  type="text"
                  value={depositForm.transactionRef}
                  onChange={(e) => setDepositForm({ ...depositForm, transactionRef: e.target.value })}
                  className="w-full text-xs font-mono p-2 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Cash / Bank Account</label>
                <select
                  value={depositForm.cashAccountId}
                  onChange={(e) => setDepositForm({ ...depositForm, cashAccountId: e.target.value })}
                  className="w-full text-xs p-2 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  {cashAccounts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.code}) - Balance: ₹{Number(c.balance).toFixed(2)}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-slate-400 mt-1">Atomically debits Cash and credits Member Savings Liability 2001.</p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Note (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Monthly voluntary member contribution"
                  value={depositForm.note}
                  onChange={(e) => setDepositForm({ ...depositForm, note: e.target.value })}
                  className="w-full text-xs p-2 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setIsDepositModal(false)}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" className="bg-emerald-600 hover:bg-emerald-700" isLoading={isLoading}>
                  Post Deposit
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Withdraw */}
      {isWithdrawModal && selectedAccount && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full overflow-hidden">
            <div className="p-5 border-b border-slate-200 flex justify-between items-center bg-rose-50/50">
              <div>
                <h3 className="font-bold text-slate-900 text-base">Withdraw from Savings</h3>
                <p className="text-xs text-slate-500">
                  {selectedAccount.accountNumber} ({selectedAccount.customer.fullName})
                </p>
              </div>
              <button onClick={() => setIsWithdrawModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleWithdraw} className="p-5 space-y-4">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg flex justify-between items-center">
                <div>
                  <p className="text-[11px] text-slate-500 font-medium">Available Balance</p>
                  <p className="text-sm font-bold text-slate-900">
                    ₹{Number(selectedAccount.balance).toFixed(2)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[11px] text-slate-500 font-medium">Minimum Threshold</p>
                  <p className="text-sm font-semibold text-rose-600">
                    ₹{Number(selectedAccount.minBalance).toFixed(2)}
                  </p>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Withdrawal Amount (₹)</label>
                <input
                  type="number"
                  step="0.01"
                  min="1"
                  placeholder="e.g. 2000"
                  value={withdrawForm.amount}
                  onChange={(e) => setWithdrawForm({ ...withdrawForm, amount: e.target.value })}
                  className="w-full text-base font-bold font-mono p-2 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500 text-rose-800"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Voucher / Ref Number</label>
                <input
                  type="text"
                  value={withdrawForm.transactionRef}
                  onChange={(e) => setWithdrawForm({ ...withdrawForm, transactionRef: e.target.value })}
                  className="w-full text-xs font-mono p-2 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Cash / Bank Account</label>
                <select
                  value={withdrawForm.cashAccountId}
                  onChange={(e) => setWithdrawForm({ ...withdrawForm, cashAccountId: e.target.value })}
                  className="w-full text-xs p-2 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500"
                >
                  {cashAccounts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.code}) - Balance: ₹{Number(c.balance).toFixed(2)}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-slate-400 mt-1">Atomically debits Savings Liability 2001 and credits Cash desk.</p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Note (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Member emergency withdrawal"
                  value={withdrawForm.note}
                  onChange={(e) => setWithdrawForm({ ...withdrawForm, note: e.target.value })}
                  className="w-full text-xs p-2 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500"
                />
              </div>

              <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setIsWithdrawModal(false)}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" className="bg-rose-600 hover:bg-rose-700" isLoading={isLoading}>
                  Authorize Withdrawal
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Periodic Interest */}
      {isInterestModal && selectedAccount && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full overflow-hidden">
            <div className="p-5 border-b border-slate-200 flex justify-between items-center bg-amber-50/50">
              <div>
                <h3 className="font-bold text-slate-900 text-base">Post Periodic Savings Interest</h3>
                <p className="text-xs text-slate-500">
                  {selectedAccount.accountNumber} ({selectedAccount.customer.fullName})
                </p>
              </div>
              <button onClick={() => setIsInterestModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handlePostInterest} className="p-5 space-y-4">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-500">Current Balance Basis:</span>
                  <span className="font-bold text-slate-900">₹{Number(selectedAccount.balance).toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Annual Product Rate:</span>
                  <span className="font-bold text-emerald-600">{selectedAccount.interestRate}%</span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Accrual Period (YYYY-MM)</label>
                <input
                  type="month"
                  value={interestForm.accrualPeriod}
                  onChange={(e) => setInterestForm({ ...interestForm, accrualPeriod: e.target.value })}
                  className="w-full text-xs font-mono p-2 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                  required
                />
                <p className="text-[11px] text-slate-400 mt-1">Strictly idempotent: each account can only have 1 interest posting per period.</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
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
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Days in Period</label>
                  <input
                    type="number"
                    min="1"
                    max="366"
                    value={interestForm.daysCount}
                    onChange={(e) => setInterestForm({ ...interestForm, daysCount: parseInt(e.target.value, 10) })}
                    className="w-full text-xs font-mono p-2 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                    required
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setIsInterestModal(false)}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" className="bg-amber-600 hover:bg-amber-700 text-white" isLoading={isLoading}>
                  Calculate & Credit Interest
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Drawer/Modal: Statement & History */}
      {isStatementModal && detailedAccount && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden">
            <div className="p-5 border-b border-slate-200 flex justify-between items-center bg-slate-50">
              <div>
                <h3 className="font-bold text-slate-900 text-base">Account Statement & Audit Trail</h3>
                <p className="text-xs text-slate-500">
                  {detailedAccount.accountNumber} &bull; {detailedAccount.customer.fullName} ({detailedAccount.customer.customerCode})
                </p>
              </div>
              <button onClick={() => setIsStatementModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 border-b border-slate-200 bg-white grid grid-cols-4 gap-4 text-xs">
              <div>
                <span className="text-slate-400 font-medium">Product</span>
                <p className="font-bold text-slate-800">{detailedAccount.productName}</p>
              </div>
              <div>
                <span className="text-slate-400 font-medium">Current Balance</span>
                <p className="font-bold text-base text-blue-600">₹{Number(detailedAccount.balance).toFixed(2)}</p>
              </div>
              <div>
                <span className="text-slate-400 font-medium">Minimum Balance</span>
                <p className="font-bold text-slate-800">₹{Number(detailedAccount.minBalance).toFixed(2)}</p>
              </div>
              <div>
                <span className="text-slate-400 font-medium">Interest Rate</span>
                <p className="font-bold text-emerald-600">{detailedAccount.interestRate}% p.a.</p>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-5">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">Transaction History</h4>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Reference</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="text-right">Balance After</TableHead>
                    <TableHead>Desk / Channel</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detailedAccount.transactions?.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="p-0">
                        <TableEmptyState message="No transactions yet. All deposits and withdrawals will appear here." />
                      </TableCell>
                    </TableRow>
                  ) : (
                    detailedAccount.transactions?.map((tx) => (
                      <TableRow key={tx.id}>
                        <TableCell className="text-xs font-mono text-slate-600">{tx.businessDate}</TableCell>
                        <TableCell className="text-xs font-mono font-semibold text-slate-800">{tx.transactionRef}</TableCell>
                        <TableCell>
                          <Badge variant={tx.type === "DEPOSIT" ? "success" : tx.type === "WITHDRAWAL" ? "danger" : "info"}>
                            {tx.type}
                          </Badge>
                        </TableCell>
                        <TableCell className={`text-right font-mono text-xs font-bold ${tx.type === "DEPOSIT" || tx.type === "INTEREST" ? "text-emerald-700" : "text-rose-700"}`}>
                          {tx.type === "WITHDRAWAL" ? "-" : "+"}₹{Number(tx.amount).toFixed(2)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs font-bold text-slate-900">
                          ₹{Number(tx.balanceAfter).toFixed(2)}
                        </TableCell>
                        <TableCell className="text-xs text-slate-500">{tx.cashAccount?.name || "Ledger Entry"}</TableCell>
                        <TableCell>
                          <Badge variant={tx.isReversed ? "danger" : "neutral"}>
                            {tx.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          {!tx.isReversed && (tx.type === "DEPOSIT" || tx.type === "WITHDRAWAL") && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setSelectedTransaction(tx);
                                setIsReverseModal(true);
                              }}
                              className="h-6 px-2 text-[11px] text-rose-600 hover:text-rose-800"
                            >
                              <RotateCcw className="w-3 h-3 mr-1" />
                              Reverse
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            <div className="p-4 border-t border-slate-200 bg-slate-50 flex justify-end">
              <Button size="sm" variant="outline" onClick={() => setIsStatementModal(false)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Reverse Savings Transaction */}
      {isReverseModal && selectedTransaction && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full overflow-hidden">
            <div className="p-5 border-b border-slate-200 flex justify-between items-center bg-rose-50/50">
              <div>
                <h3 className="font-bold text-slate-900 text-base">Reverse Financial Transaction</h3>
                <p className="text-xs text-slate-500">Ref: {selectedTransaction.transactionRef} (₹{Number(selectedTransaction.amount).toFixed(2)})</p>
              </div>
              <button onClick={() => setIsReverseModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleReverseTransaction} className="p-5 space-y-4">
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <span>
                  Posting a reversal creates compensating double-entry journal lines, restores member balance, and marks this transaction REVERSED in audit trails.
                </span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Reason for Reversal</label>
                <textarea
                  rows={3}
                  placeholder="Provide explicit operational rationale for audit compliance..."
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
    </div>
  );
}
