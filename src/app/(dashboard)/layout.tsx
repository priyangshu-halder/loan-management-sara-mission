import React from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/permissions/auth-guard";
import { Sidebar } from "@/components/navigation/Sidebar";
import { Navbar } from "@/components/navigation/Navbar";
import { getPublicSettings } from "@/modules/settings/settings-service";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  const branding = await getPublicSettings(user.organizationCode);
  const isSuperAdmin = user.isSuperAdmin || user.roles.includes("SUPER_ADMIN") || user.roles.includes("ORG_ADMIN");

  return (
    <div className="flex h-screen w-full bg-slate-50 overflow-hidden">
      <Sidebar isSuperAdmin={isSuperAdmin} branding={branding} />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Navbar
          user={{
            username: user.username,
            fullName: user.fullName,
            organizationCode: user.organizationCode,
            roles: user.roles,
            scopes: user.scopes,
          }}
          branding={branding}
        />
        <main className="flex-1 overflow-y-auto p-8">{children}</main>
      </div>
    </div>
  );
}

