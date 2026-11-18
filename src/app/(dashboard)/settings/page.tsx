import React from "react";
import { getCurrentUser, requireSuperAdmin } from "@/lib/permissions/auth-guard";
import {
  getCompanySettings,
  getGeneralPreferences,
  getSystemPreferences,
} from "@/modules/settings/settings-service";
import { SettingsClient } from "./SettingsClient";
import { redirect } from "next/navigation";

export default async function SettingsPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    redirect("/login");
  }

  // Superadmin check
  try {
    requireSuperAdmin(currentUser);
  } catch {
    redirect("/dashboard");
  }

  const [company, general, system] = await Promise.all([
    getCompanySettings(currentUser.organizationId),
    getGeneralPreferences(currentUser.organizationId),
    getSystemPreferences(currentUser.organizationId),
  ]);

  return (
    <SettingsClient
      initialCompany={company}
      initialGeneral={general}
      initialSystem={system}
      adminUser={{
        id: currentUser.userId,
        username: currentUser.username,
        email: currentUser.email,
        fullName: currentUser.fullName,
      }}
    />
  );
}
