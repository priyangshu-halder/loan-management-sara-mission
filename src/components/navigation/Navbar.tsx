"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut, Building, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";

export interface NavbarProps {
  user: {
    username: string;
    fullName: string;
    organizationCode: string;
    roles: string[];
    scopes: Array<{ scopeType: string; branchCode?: string | null }>;
  };
}

export function Navbar({ user }: NavbarProps) {
  const router = useRouter();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.push("/login");
      router.refresh();
    } catch (e) {
      console.error("Logout failed:", e);
      setIsLoggingOut(false);
    }
  };

  const primaryRole = user.roles[0] || "STAFF";
  const branchScope = user.scopes.find((s) => s.scopeType === "BRANCH");

  return (
    <header className="h-16 border-b border-slate-200 bg-white flex items-center justify-between px-6 shrink-0">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 text-xs font-medium text-slate-600 bg-slate-100 py-1 px-2.5 rounded-md">
          <Building className="h-3.5 w-3.5 text-slate-500" />
          <span>Tenant: <strong className="text-slate-800">{user.organizationCode}</strong></span>
        </div>
        {branchScope?.branchCode && (
          <Badge variant="info">Branch: {branchScope.branchCode}</Badge>
        )}
      </div>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 text-right">
          <UserCheck className="h-4 w-4 text-emerald-600" />
          <div>
            <p className="text-xs font-semibold text-slate-800">{user.fullName}</p>
            <p className="text-[11px] text-slate-500">{primaryRole}</p>
          </div>
        </div>

        <Button
          variant="outline"
          size="sm"
          isLoading={isLoggingOut}
          onClick={handleLogout}
          className="text-xs text-rose-600 border-rose-200 hover:bg-rose-50"
        >
          <LogOut className="h-3.5 w-3.5 mr-1" />
          Sign out
        </Button>
      </div>
    </header>
  );
}

