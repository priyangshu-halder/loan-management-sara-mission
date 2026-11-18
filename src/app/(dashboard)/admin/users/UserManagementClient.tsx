"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import {
  UserPlus,
  Shield,
  X,
  AlertCircle,
  CheckCircle2,
  Search,
  Pencil,
  Trash2,
  KeyRound,
  UserX,
  AlertTriangle,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
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

export interface RoleOption {
  id: string;
  code: string;
  name: string;
  description: string | null;
}

export interface BranchOption {
  id: string;
  code: string;
  name: string;
}

export interface UserRow {
  id: string;
  username: string;
  email: string;
  fullName: string;
  status: string;
  createdAt: string | Date;
  userRoles: Array<{ role: { id: string; code: string; name: string } }>;
  userScopes?: Array<{ scopeType: string; branch: { id: string; name: string; code: string } | null }>;
}

interface Props {
  users: UserRow[];
  roles: RoleOption[];
  branches?: BranchOption[];
  organizationCode: string;
  currentUserId?: string;
}

export function UserManagementClient({ users: initialUsers, roles, organizationCode, currentUserId }: Props) {
  const router = useRouter();
  const [usersList, setUsersList] = useState<UserRow[]>(initialUsers);
  const [search, setSearch] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Add Staff Modal State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [addForm, setAddForm] = useState({
    fullName: "",
    username: "",
    email: "",
    password: "",
    selectedRoleCodes: [] as string[],
  });

  // Edit Staff Modal State
  const [editingUser, setEditingUser] = useState<UserRow | null>(null);
  const [editForm, setEditForm] = useState({
    fullName: "",
    email: "",
    status: "ACTIVE" as "ACTIVE" | "SUSPENDED" | "DEACTIVATED",
    password: "",
    selectedRoleCodes: [] as string[],
  });

  // Delete/Deactivate Confirmation State
  const [deletingUser, setDeletingUser] = useState<UserRow | null>(null);

  // Open Edit Modal
  const handleOpenEdit = (user: UserRow) => {
    setEditingUser(user);
    setEditForm({
      fullName: user.fullName,
      email: user.email,
      status: (user.status as "ACTIVE" | "SUSPENDED" | "DEACTIVATED") || "ACTIVE",
      password: "",
      selectedRoleCodes: user.userRoles.map((ur) => ur.role.code),
    });
    setErrorMsg(null);
    setSuccessMsg(null);
  };

  // Toggle roles in add form
  const handleAddRoleToggle = (code: string) => {
    setAddForm((prev) => {
      const exists = prev.selectedRoleCodes.includes(code);
      return {
        ...prev,
        selectedRoleCodes: exists
          ? prev.selectedRoleCodes.filter((c) => c !== code)
          : [...prev.selectedRoleCodes, code],
      };
    });
  };

  // Toggle roles in edit form
  const handleEditRoleToggle = (code: string) => {
    setEditForm((prev) => {
      const exists = prev.selectedRoleCodes.includes(code);
      return {
        ...prev,
        selectedRoleCodes: exists
          ? prev.selectedRoleCodes.filter((c) => c !== code)
          : [...prev.selectedRoleCodes, code],
      };
    });
  };

  // Create User
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (addForm.selectedRoleCodes.length === 0) {
      setErrorMsg("Please select at least one role for this staff member.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: addForm.fullName,
          username: addForm.username,
          email: addForm.email,
          password: addForm.password,
          roleCodes: addForm.selectedRoleCodes,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || "Failed to create staff member");
      }

      setSuccessMsg(`Staff member ${data.user.fullName} (@${data.user.username}) created successfully.`);
      setAddForm({
        fullName: "",
        username: "",
        email: "",
        password: "",
        selectedRoleCodes: [],
      });
      setIsAddModalOpen(false);
      router.refresh();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "An unexpected error occurred.");
    } finally {
      setSubmitting(false);
    }
  };

  // Update User
  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    setErrorMsg(null);
    setSuccessMsg(null);

    setSubmitting(true);
    try {
      const res = await fetch(`/api/admin/users/${editingUser.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: editForm.fullName,
          email: editForm.email,
          status: editForm.status,
          password: editForm.password ? editForm.password : undefined,
          roleCodes: editForm.selectedRoleCodes,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || "Failed to update staff member");
      }

      setSuccessMsg(`Staff member ${editForm.fullName} updated successfully.`);
      // Update local state
      setUsersList((prev) =>
        prev.map((u) =>
          u.id === editingUser.id
            ? {
                ...u,
                fullName: editForm.fullName,
                email: editForm.email,
                status: editForm.status,
                userRoles: editForm.selectedRoleCodes.map((code) => {
                  const roleObj = roles.find((r) => r.code === code);
                  return {
                    role: {
                      id: roleObj?.id || "",
                      code,
                      name: roleObj?.name || code,
                    },
                  };
                }),
              }
            : u
        )
      );

      setEditingUser(null);
      router.refresh();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "An error occurred updating user.");
    } finally {
      setSubmitting(false);
    }
  };

  // Deactivate User
  const handleConfirmDelete = async () => {
    if (!deletingUser) return;
    setErrorMsg(null);
    setSuccessMsg(null);
    setSubmitting(true);

    try {
      const res = await fetch(`/api/admin/users/${deletingUser.id}`, {
        method: "DELETE",
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || "Failed to deactivate staff member");
      }

      setSuccessMsg(`Staff member @${deletingUser.username} deactivated successfully.`);
      setUsersList((prev) =>
        prev.map((u) => (u.id === deletingUser.id ? { ...u, status: "DEACTIVATED" } : u))
      );
      setDeletingUser(null);
      router.refresh();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to deactivate user.");
    } finally {
      setSubmitting(false);
    }
  };

  const filteredUsers = usersList.filter(
    (u) =>
      u.fullName.toLowerCase().includes(search.toLowerCase()) ||
      u.username.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Staff & User Management
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Manage employee accounts, security status, and granular operational permissions
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            onClick={() => {
              setIsAddModalOpen(true);
              setErrorMsg(null);
            }}
            className="flex items-center gap-2"
          >
            <UserPlus className="h-4 w-4" />
            Add Staff Member
          </Button>
        </div>
      </div>

      {successMsg && (
        <div className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg text-sm">
          <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="flex items-center gap-2 p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg text-sm">
          <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Directory Card */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <CardTitle>Organization Staff Directory</CardTitle>
              <CardDescription>
                Staff accounts belonging to tenant {organizationCode}
              </CardDescription>
            </div>
            <div className="flex items-center gap-3">
              <div className="relative">
                <Search className="h-4 w-4 text-slate-400 absolute left-2.5 top-2.5" />
                <input
                  type="text"
                  placeholder="Search staff..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg w-52 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200">
                <UserPlus className="h-4 w-4 text-slate-400" />
                <span>{usersList.length} Staff Members</span>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Staff Member</TableHead>
                <TableHead>Email Address</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Assigned Roles</TableHead>
                <TableHead>Joined Date</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredUsers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6}>
                    <TableEmptyState
                      message={
                        search
                          ? "No staff members match your search criteria."
                          : "No staff members registered in this organization."
                      }
                    />
                  </TableCell>
                </TableRow>
              ) : (
                filteredUsers.map((u) => {
                  const userRoles = u.userRoles.map((ur) => ur.role.name || ur.role.code);
                  const isSuperAdminAccount =
                    u.username === "admin" || u.userRoles.some((r) => r.role.code === "SUPER_ADMIN");

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
                          {userRoles.map((r, i) => (
                            <Badge key={i} variant="info" className="text-[11px]">
                              <Shield className="h-3 w-3 mr-1" />
                              {r}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-slate-500">
                        {formatDisplayDate(u.createdAt)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Manage Permissions */}
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => router.push(`/admin/permissions?userId=${u.id}`)}
                            title="Manage Permissions"
                            className="h-8 px-2.5 text-xs text-blue-600 hover:bg-blue-50 border-blue-200"
                          >
                            <KeyRound className="h-3.5 w-3.5 mr-1" />
                            <span className="hidden sm:inline">Permissions</span>
                          </Button>

                          {/* Edit Staff Button */}
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleOpenEdit(u)}
                            title="Edit Staff Member"
                            className="h-8 w-8 p-0 text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>

                          {/* Deactivate/Delete Button */}
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={isSuperAdminAccount && currentUserId === u.id}
                            onClick={() => setDeletingUser(u)}
                            title={
                              isSuperAdminAccount && currentUserId === u.id
                                ? "Cannot delete your own account"
                                : "Deactivate Staff Member"
                            }
                            className="h-8 w-8 p-0 text-rose-600 hover:text-rose-700 hover:bg-rose-50 border-rose-200"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Add Staff Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl max-w-lg w-full p-6 shadow-xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b pb-3">
              <div>
                <h3 className="font-bold text-slate-900">Add New Staff Member</h3>
                <p className="text-xs text-slate-500">
                  Create an authenticated staff member and assign primary roles
                </p>
              </div>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreateUser} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Full Legal Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={addForm.fullName}
                  onChange={(e) => setAddForm({ ...addForm, fullName: e.target.value })}
                  placeholder="e.g. Priya Sharma"
                  className="w-full text-sm border rounded-lg p-2 focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Username <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={addForm.username}
                    onChange={(e) => setAddForm({ ...addForm, username: e.target.value })}
                    placeholder="psharma"
                    className="w-full text-sm border rounded-lg p-2 focus:ring-1 focus:ring-blue-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Email Address <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="email"
                    required
                    value={addForm.email}
                    onChange={(e) => setAddForm({ ...addForm, email: e.target.value })}
                    placeholder="priya@rayhan.org"
                    className="w-full text-sm border rounded-lg p-2 focus:ring-1 focus:ring-blue-500 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Initial Password <span className="text-rose-500">*</span>
                </label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={addForm.password}
                  onChange={(e) => setAddForm({ ...addForm, password: e.target.value })}
                  placeholder="Minimum 8 characters"
                  className="w-full text-sm border rounded-lg p-2 focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-2">
                  Assigned Roles <span className="text-rose-500">*</span>
                </label>
                <div className="space-y-2 border border-slate-200 rounded-lg p-3 max-h-48 overflow-y-auto">
                  {roles.length === 0 ? (
                    <p className="text-xs text-slate-500">No roles configured for this organization.</p>
                  ) : (
                    roles.map((r) => {
                      const checked = addForm.selectedRoleCodes.includes(r.code);
                      return (
                        <label
                          key={r.id}
                          className="flex items-start gap-2.5 p-1.5 rounded hover:bg-slate-50 cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => handleAddRoleToggle(r.code)}
                            className="mt-0.5 rounded text-blue-600 focus:ring-blue-500"
                          />
                          <div>
                            <div className="text-xs font-semibold text-slate-800">
                              {r.name}{" "}
                              <span className="font-mono text-[10px] text-slate-400">({r.code})</span>
                            </div>
                            {r.description && (
                              <div className="text-[11px] text-slate-500">{r.description}</div>
                            )}
                          </div>
                        </label>
                      );
                    })
                  )}
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsAddModalOpen(false)}
                  disabled={submitting}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={submitting}>
                  {submitting ? "Creating Staff..." : "Create Staff Member"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Staff Modal */}
      {editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl max-w-lg w-full p-6 shadow-xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b pb-3">
              <div>
                <h3 className="font-bold text-slate-900">Edit Staff Member</h3>
                <p className="text-xs text-slate-500">
                  Update employee details for @{editingUser.username}
                </p>
              </div>
              <button
                onClick={() => setEditingUser(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleUpdateUser} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Full Legal Name</label>
                <input
                  type="text"
                  required
                  value={editForm.fullName}
                  onChange={(e) => setEditForm({ ...editForm, fullName: e.target.value })}
                  className="w-full text-sm border rounded-lg p-2 focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Username</label>
                  <input
                    type="text"
                    disabled
                    value={editingUser.username}
                    className="w-full text-sm border rounded-lg p-2 bg-slate-100 text-slate-500 font-mono cursor-not-allowed"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Email Address</label>
                  <input
                    type="email"
                    required
                    value={editForm.email}
                    onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                    className="w-full text-sm border rounded-lg p-2 focus:ring-1 focus:ring-blue-500 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Account Status</label>
                <select
                  value={editForm.status}
                  onChange={(e) =>
                    setEditForm({
                      ...editForm,
                      status: e.target.value as "ACTIVE" | "SUSPENDED" | "DEACTIVATED",
                    })
                  }
                  className="w-full text-sm border rounded-lg p-2 focus:ring-1 focus:ring-blue-500 bg-white"
                >
                  <option value="ACTIVE">ACTIVE (Authorized Access)</option>
                  <option value="SUSPENDED">SUSPENDED (Temporarily Locked)</option>
                  <option value="DEACTIVATED">DEACTIVATED (Revoked Access)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Reset Password (Leave blank to keep existing)
                </label>
                <input
                  type="password"
                  minLength={8}
                  value={editForm.password}
                  onChange={(e) => setEditForm({ ...editForm, password: e.target.value })}
                  placeholder="Enter new password to reset"
                  className="w-full text-sm border rounded-lg p-2 focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-2">Assigned Roles</label>
                <div className="space-y-2 border border-slate-200 rounded-lg p-3 max-h-40 overflow-y-auto">
                  {roles.map((r) => {
                    const checked = editForm.selectedRoleCodes.includes(r.code);
                    return (
                      <label
                        key={r.id}
                        className="flex items-start gap-2.5 p-1.5 rounded hover:bg-slate-50 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => handleEditRoleToggle(r.code)}
                          className="mt-0.5 rounded text-blue-600 focus:ring-blue-500"
                        />
                        <div>
                          <div className="text-xs font-semibold text-slate-800">
                            {r.name}{" "}
                            <span className="font-mono text-[10px] text-slate-400">({r.code})</span>
                          </div>
                          {r.description && (
                            <div className="text-[11px] text-slate-500">{r.description}</div>
                          )}
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setEditingUser(null)}
                  disabled={submitting}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={submitting}>
                  {submitting ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete / Deactivate Confirmation Dialog */}
      {deletingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl space-y-4">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-rose-100 text-rose-600 rounded-lg shrink-0">
                <AlertTriangle className="h-6 w-6" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900">Deactivate Staff Account</h3>
                <p className="text-xs text-slate-500 mt-1">
                  Are you sure you want to deactivate{" "}
                  <strong className="text-slate-800">{deletingUser.fullName}</strong> (@{deletingUser.username})?
                </p>
              </div>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-600 space-y-1">
              <p>• Account access will be revoked immediately.</p>
              <p>• All active login sessions will be terminated.</p>
              <p>• Historical loan, collection, and audit entries will remain permanently preserved.</p>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <Button
                variant="outline"
                onClick={() => setDeletingUser(null)}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                onClick={handleConfirmDelete}
                disabled={submitting}
                className="bg-rose-600 hover:bg-rose-700 text-white"
              >
                {submitting ? "Deactivating..." : "Deactivate Account"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
