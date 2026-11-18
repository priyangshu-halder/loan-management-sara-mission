import React from "react";
import { redirect } from "next/navigation";
import { getCurrentUser, requireSuperAdmin } from "@/lib/permissions/auth-guard";
import { getStaffPermissionSummary } from "@/modules/permissions/permission-management-service";
import { PermissionsClient } from "./PermissionsClient";

interface Props {
  searchParams: {
    userId?: string;
  };
}

export default async function AdminPermissionsPage({ searchParams }: Props) {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    redirect("/login");
  }

  try {
    requireSuperAdmin(currentUser);
  } catch {
    redirect("/dashboard");
  }

  const summary = await getStaffPermissionSummary(currentUser, searchParams.userId);

  return (
    <PermissionsClient
      initialSummary={summary}
      preselectedUserId={searchParams.userId}
    />
  );
}
