"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { clsx } from "clsx";
import {
  LayoutDashboard,
  Users,
  Building,
  FileText,
  BadgePercent,
  PiggyBank,
  Wallet,
  Receipt,
  BookOpen,
  BarChart3,
  ShieldAlert,
  FastForward,
  Clock,
  FileSpreadsheet,
  History,
  Settings,
  KeyRound,
} from "lucide-react";
import type { PublicSettings } from "@/modules/settings/settings-service";

interface SidebarProps {
  isSuperAdmin?: boolean;
  branding?: PublicSettings;
}

export function Sidebar({ isSuperAdmin = false, branding }: SidebarProps) {
  const pathname = usePathname();
  const [dynamicBranding, setDynamicBranding] = useState<PublicSettings>(
    branding || {
      appName: "Rayhan Microfinance ERP",
      companyName: "Rayhan Financial Services",
      companyLogo: null,
      currency: "INR",
      dateFormat: "DD/MM/YYYY",
      timeZone: "Asia/Kolkata",
    }
  );

  useEffect(() => {
    if (!branding) {
      fetch("/api/settings/public")
        .then((res) => res.json())
        .then((data) => {
          if (data.settings) setDynamicBranding(data.settings);
        })
        .catch(() => {});
    }
  }, [branding]);

  const navItems = [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { href: "/customers", label: "Customer Portal", icon: Users },
    { href: "/groups", label: "Centers & Groups", icon: Building },
    { href: "/loans", label: "Loans", icon: BadgePercent },
    { href: "/collections", label: "Daily Collections", icon: Receipt },
    { href: "/collections/advance", label: "Advance Collection", icon: FastForward },
    { href: "/collections/due", label: "Due Collection", icon: Clock },
    { href: "/collections/sheet", label: "Collection Sheet", icon: FileSpreadsheet },
    { href: "/collections/history", label: "Collection History", icon: History },
    { href: "/savings", label: "Savings Accounts", icon: PiggyBank },
    { href: "/deposits", label: "RD & FD Deposits", icon: Wallet },
    { href: "/expenses", label: "Expenses", icon: FileText },
    { href: "/accounting", label: "Accounting & Ledger", icon: BookOpen },
    { href: "/reports", label: "Reports & KPIs", icon: BarChart3 },
    ...(isSuperAdmin
      ? [
          { href: "/admin/users", label: "Staff Directory", icon: ShieldAlert },
          { href: "/admin/permissions", label: "Staff Permissions", icon: KeyRound },
          { href: "/settings", label: "System Settings", icon: Settings },
        ]
      : []),
  ];

  return (
    <aside className="w-64 border-r border-slate-200 bg-white flex flex-col h-screen shrink-0">
      <div className="h-16 flex items-center px-6 border-b border-slate-200">
        <Link href="/dashboard" className="flex items-center gap-2.5 font-bold text-slate-900 tracking-tight min-w-0">
          {dynamicBranding.companyLogo ? (
            <img
              src={dynamicBranding.companyLogo}
              alt="Logo"
              className="w-8 h-8 rounded-lg object-contain bg-white shrink-0 shadow-xs border border-slate-200 p-0.5"
            />
          ) : (
            <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-blue-600 text-white font-extrabold text-sm shadow-xs shrink-0">
              ₹
            </span>
          )}
          <span className="text-sm font-semibold truncate" title={dynamicBranding.appName}>
            {dynamicBranding.appName}
          </span>
        </Link>
      </div>

      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive =
            pathname === item.href ||
            (item.href !== "/dashboard" &&
              item.href !== "/collections" &&
              pathname.startsWith(item.href + "/"));

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
        <p className="font-semibold text-slate-700 truncate" title={dynamicBranding.companyName}>
          {dynamicBranding.companyName}
        </p>
        <p className="mt-0.5 text-[11px]">Strict Double-Entry Standard</p>
      </div>
    </aside>
  );
}
