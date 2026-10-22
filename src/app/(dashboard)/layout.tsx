import React from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/permissions/auth-guard";
import { Sidebar } from "@/components/navigation/Sidebar";
import { Navbar } from "@/components/navigation/Navbar";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="flex h-screen w-full bg-slate-50 overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Navbar
          user={{
            username: user.username,
            fullName: user.fullName,
            organizationCode: user.organizationCode,
            roles: user.roles,
            scopes: user.scopes,
          }}
        />
        <main className="flex-1 overflow-y-auto p-8">{children}</main>
      </div>
    </div>
  );
}
