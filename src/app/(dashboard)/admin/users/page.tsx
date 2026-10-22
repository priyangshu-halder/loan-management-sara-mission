import React from "react";
import { UserPlus, Shield, Building } from "lucide-react";
import { getCurrentUser, requirePermission } from "@/lib/permissions/auth-guard";
import { prisma } from "@/lib/db/prisma";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableEmptyState,
} from "@/components/ui/Table";
import { formatDisplayDate } from "@/lib/dates/dates";

export default async function AdminUsersPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser) return null;

  // Enforce server-side permission check
  requirePermission(currentUser, "user.manage");

  // Query users scoped to current user's organization
  const users = await prisma.user.findMany({
    where: { organizationId: currentUser.organizationId },
    include: {
      userRoles: { include: { role: true } },
      userScopes: { include: { branch: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Staff & User Management
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Manage system users, assigned roles, and branch authorization scopes
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Organization Staff Directory</CardTitle>
              <CardDescription>
                Users belonging to organization {currentUser.organizationCode}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200">
              <UserPlus className="h-4 w-4 text-slate-400" />
              <span>{users.length} Staff Members</span>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Staff Member</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Assigned Roles</TableHead>
                <TableHead>Scope</TableHead>
                <TableHead>Joined</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6}>
                    <TableEmptyState message="No staff members registered in this organization." />
                  </TableCell>
                </TableRow>
              ) : (
                users.map((u) => {
                  const roles = u.userRoles.map((ur) => ur.role.name || ur.role.code);
                  const scopes = u.userScopes.map((us) =>
                    us.scopeType === "ORGANIZATION"
                      ? "Organization-Wide"
                      : `Branch: ${us.branch?.name || us.branch?.code || "Assigned"}`
                  );

                  return (
                    <TableRow key={u.id}>
                      <TableCell>
                        <div className="font-semibold text-slate-900">{u.fullName}</div>
                        <div className="text-xs text-slate-400">@{u.username}</div>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{u.email}</TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            u.status === "ACTIVE"
                              ? "success"
                              : u.status === "SUSPENDED"
                              ? "warning"
                              : "danger"
                          }
                        >
                          {u.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {roles.map((r, i) => (
                            <Badge key={i} variant="info" className="text-[11px]">
                              <Shield className="h-3 w-3 mr-1" />
                              {r}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {scopes.map((s, i) => (
                            <span
                              key={i}
                              className="inline-flex items-center text-xs text-slate-600 bg-slate-100 px-2 py-0.5 rounded"
                            >
                              <Building className="h-3 w-3 mr-1 text-slate-400" />
                              {s}
                            </span>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-slate-500">
                        {formatDisplayDate(u.createdAt)}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
