import React from "react";
import { getCurrentUser } from "@/lib/permissions/auth-guard";
import { getGroups, getBranches } from "@/modules/customers/customer-service";
import { GroupsClient } from "./GroupsClient";

export default async function GroupsPage({
  searchParams,
}: {
  searchParams?: { search?: string; branchId?: string };
}) {
  const user = await getCurrentUser();
  if (!user) return null;

  const [groups, branches] = await Promise.all([
    getGroups(user, searchParams?.branchId),
    getBranches(user),
  ]);

  const serializedGroups = JSON.parse(JSON.stringify(groups));
  const serializedBranches = JSON.parse(JSON.stringify(branches));

  return (
    <GroupsClient
      initialGroups={serializedGroups}
      branches={serializedBranches}
      searchParams={searchParams}
    />
  );
}
