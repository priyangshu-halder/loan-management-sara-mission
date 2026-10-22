"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { clsx } from "clsx";
import {
  LayoutDashboard,
  Users,
  FileText,
  BadgePercent,
  PiggyBank,
  Wallet,
  Receipt,
  BookOpen,
  BarChart3,
  ShieldAlert,
} from "lucide-react";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/customers", label: "Customers & Groups", icon: Users },
  { href: "/loans", label: "Loans", icon: BadgePercent },
  { href: "/collections", label: "Daily Collections", icon: Receipt },
  { href: "/savings", label: "Savings Accounts", icon: PiggyBank },
  { href: "/deposits", label: "RD & FD Deposits", icon: Wallet },
  { href: "/expenses", label: "Expenses", icon: FileText },
  { href: "/accounting", label: "Accounting & Ledger", icon: BookOpen },
  { href: "/reports", label: "Reports & KPIs", icon: BarChart3 },
  { href: "/admin/users", label: "Administration", icon: ShieldAlert },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 border-r border-slate-200 bg-white flex flex-col h-screen shrink-0">
      <div className="h-16 flex items-center px-6 border-b border-slate-200">
        <Link href="/dashboard" className="flex items-center gap-2.5 font-bold text-slate-900 tracking-tight">
          <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-blue-600 text-white font-extrabold text-sm shadow-sm">
            ₹
          </span>
          <span className="text-base font-semibold">Rayhan MFI ERP</span>
        </Link>
      </div>

      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href));

          return (
            <Link
              key={item.href}
              href={item.href}
              className={clsx(
                "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                isActive
                  ? "bg-blue-50 text-blue-700 font-semibold"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              )}
            >
              <Icon className={clsx("h-4 w-4 shrink-0", isActive ? "text-blue-700" : "text-slate-400")} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-slate-200 bg-slate-50 text-xs text-slate-500">
        <p className="font-semibold text-slate-700">Financial Management System</p>
        <p className="mt-0.5 text-[11px]">Strict Double-Entry Standard</p>
      </div>
    </aside>
  );
}

