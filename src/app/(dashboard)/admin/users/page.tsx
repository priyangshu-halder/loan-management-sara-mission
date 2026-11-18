import React from "react";
import { getCurrentUser, requirePermission } from "@/lib/permissions/auth-guard";
import { prisma } from "@/lib/db/prisma";
import { UserManagementClient } from "./UserManagementClient";

export default async function AdminUsersPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser) return null;

  // Enforce server-side permission check
  requirePermission(currentUser, "user.manage");

  // Query users, roles, and branches scoped to current user's organization
  const [users, roles, branches] = await Promise.all([
    prisma.user.findMany({
      where: { organizationId: currentUser.organizationId },
      include: {
        userRoles: { include: { role: true } },
        userScopes: { include: { branch: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.role.findMany({
      where: { organizationId: currentUser.organizationId },
      orderBy: { name: "asc" },
    }),
    prisma.branch.findMany({
      where: { organizationId: currentUser.organizationId, status: "ACTIVE" },
      orderBy: { name: "asc" },
    }),
  ]);

  const serializedUsers = JSON.parse(JSON.stringify(users));
  const serializedRoles = JSON.parse(JSON.stringify(roles));
  const serializedBranches = JSON.parse(JSON.stringify(branches));

  return (
    <UserManagementClient
      users={serializedUsers}
      roles={serializedRoles}
      branches={serializedBranches}
      organizationCode={currentUser.organizationCode}
      currentUserId={currentUser.userId}
    />
  );
}
