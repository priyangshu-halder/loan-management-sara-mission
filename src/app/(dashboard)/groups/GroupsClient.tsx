"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Building,
  Users,
  PlusCircle,
  Clock,
  Search,
  Pencil,
  Trash2,
  X,
  AlertTriangle,
  CheckCircle2,
  Calendar,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableEmptyState,
} from "@/components/ui/Table";

export interface GroupItem {
  id: string;
  code: string;
  name: string;
  meetingDay: string | null;
  status: string;
  branchId: string | null;
  branch?: {
    id: string;
    name: string;
    code: string;
  } | null;
  customerGroups: Array<{
    id: string;
    customerId: string;
  }>;
}

export interface BranchOption {
  id: string;
  name: string;
  code: string;
}

interface GroupsClientProps {
  initialGroups: GroupItem[];
  branches: BranchOption[];
  searchParams?: { search?: string; branchId?: string };
}

export function GroupsClient({ initialGroups, branches, searchParams }: GroupsClientProps) {
  const router = useRouter();

  // Search & Branch Filter state
  const [searchTerm, setSearchTerm] = useState(searchParams?.search || "");

  // Notification state
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Edit Modal state
  const [editingGroup, setEditingGroup] = useState<GroupItem | null>(null);
  const [editForm, setEditForm] = useState({
    name: "",
    meetingDay: "WEDNESDAY",
    status: "ACTIVE",
  });
  const [isUpdating, setIsUpdating] = useState(false);

  // Delete Confirmation state
  const [deletingGroup, setDeletingGroup] = useState<GroupItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Filter groups
  const filteredGroups = initialGroups.filter((g) => {
    const term = searchTerm.trim().toLowerCase();
    const matchesSearch =
      !term ||
      g.name.toLowerCase().includes(term) ||
      g.code.toLowerCase().includes(term);
    return matchesSearch;
  });

  const totalBorrowers = initialGroups.reduce((acc, g) => acc + g.customerGroups.length, 0);

  // Open Edit Modal
  const openEditModal = (group: GroupItem) => {
    setErrorMsg(null);
    setSuccessMsg(null);
    setEditingGroup(group);
    setEditForm({
      name: group.name,
      meetingDay: group.meetingDay || "WEDNESDAY",
      status: group.status,
    });
  };

  // Submit Edit Form
  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingGroup) return;

    setIsUpdating(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await fetch(`/api/customers/groups/${editingGroup.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editForm.name,
          meetingDay: editForm.meetingDay || null,
          status: editForm.status,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || "Failed to update center/group");
      }

      setSuccessMsg(`Group "${editForm.name}" updated successfully.`);
      setEditingGroup(null);
      router.refresh();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to update center/group");
    } finally {
      setIsUpdating(false);
    }
  };

  // Submit Delete Action
  const handleDeleteSubmit = async () => {
    if (!deletingGroup) return;

    setIsDeleting(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await fetch(`/api/customers/groups/${deletingGroup.id}`, {
        method: "DELETE",
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || "Failed to delete center/group");
      }

      setSuccessMsg(`Center / Group "${deletingGroup.name}" deleted successfully.`);
      setDeletingGroup(null);
      router.refresh();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to delete center/group");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Notifications */}
      {errorMsg && (
        <div className="p-3.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 flex items-center justify-between text-xs animate-in fade-in">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{errorMsg}</span>
          </div>
          <button
            onClick={() => setErrorMsg(null)}
            className="text-rose-500 hover:text-rose-800 p-1"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {successMsg && (
        <div className="p-3.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 flex items-center justify-between text-xs animate-in fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{successMsg}</span>
          </div>
          <button
            onClick={() => setSuccessMsg(null)}
            className="text-emerald-500 hover:text-emerald-800 p-1"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Centers & Groups (JLG)
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Manage Joint Liability Groups, village collection centers, and weekly meeting routines.
          </p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-4 border-l-4 border-l-indigo-500">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Total Centers & JLGs
          </p>
          <p className="text-2xl font-bold text-slate-900 mt-1">{initialGroups.length}</p>
        </Card>

        <Card className="p-4 border-l-4 border-l-emerald-500">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Active Groups
          </p>
          <p className="text-2xl font-bold text-emerald-600 mt-1">
            {initialGroups.filter((g) => g.status === "ACTIVE").length}
          </p>
        </Card>

        <Card className="p-4 border-l-4 border-l-blue-500">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Total Mapped Borrowers
          </p>
          <p className="text-2xl font-bold text-slate-900 mt-1">{totalBorrowers}</p>
        </Card>
      </div>

      {/* Centers & Groups Table Card */}
      <Card>
        <CardHeader className="py-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-2">
              <Building className="h-4 w-4 text-indigo-600" />
              <CardTitle className="text-base">Center & JLG Directory</CardTitle>
              <Badge variant="info" className="ml-2 text-[11px]">
                {filteredGroups.length} Groups
              </Badge>
            </div>

            <div className="flex items-center gap-2.5 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap">
                <div className="relative">
                  <Search className="h-3.5 w-3.5 absolute left-2.5 top-2.5 text-slate-400" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search group code or name..."
                    className="pl-8 pr-3 py-1.5 rounded-lg border border-slate-300 text-xs w-52 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>

                {searchTerm && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchTerm("");
                    }}
                    className="text-xs text-slate-500 hover:text-slate-800 underline ml-1"
                  >
                    Clear
                  </button>
                )}
              </div>

              <Link href="/groups/new">
                <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-sm">
                  <PlusCircle className="h-3.5 w-3.5 mr-1.5" />
                  + Add Center / Group
                </Button>
              </Link>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-[#0B2240] text-white">
              <TableRow className="border-b-0">
                <TableHead className="text-white font-bold uppercase text-[11px]">Center Code & Name</TableHead>
                <TableHead className="text-white font-bold uppercase text-[11px]">Meeting Routine</TableHead>
                <TableHead className="text-white font-bold uppercase text-[11px]">Assigned Borrowers</TableHead>
                <TableHead className="text-white font-bold uppercase text-[11px]">Status</TableHead>
                <TableHead className="text-white font-bold uppercase text-[11px] text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredGroups.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5}>
                    <TableEmptyState message="No centers or groups matching your criteria." />
                  </TableCell>
                </TableRow>
              ) : (
                filteredGroups.map((group) => (
                  <TableRow key={group.id} className="hover:bg-slate-50">
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded font-semibold">
                          {group.code}
                        </span>
                        <strong className="text-slate-900 text-sm">{group.name}</strong>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="inline-flex items-center gap-1 text-xs text-indigo-700 bg-indigo-50 px-2.5 py-0.5 rounded-full font-medium">
                        <Clock className="h-3 w-3" />
                        <span>{group.meetingDay || "Flexible"}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5 font-semibold text-slate-800 text-xs">
                        <Users className="h-3.5 w-3.5 text-slate-400" />
                        <span>{group.customerGroups.length} Members</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={group.status === "ACTIVE" ? "success" : "neutral"} className="text-[11px]">
                        {group.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => openEditModal(group)}
                          title="Edit Center/Group"
                          className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setErrorMsg(null);
                            setDeletingGroup(group);
                          }}
                          title="Delete Center/Group"
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Edit Center / Group Modal */}
      {editingGroup && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-50/50">
              <div className="flex items-center gap-2">
                <Building className="h-4 w-4 text-indigo-600" />
                <h3 className="font-semibold text-slate-900 text-sm">
                  Edit Center / Group: {editingGroup.code}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setEditingGroup(null)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Center / Group Name *
                </label>
                <Input
                  required
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  placeholder="e.g. Rampur Mahila Samiti"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Meeting Day
                  </label>
                  <select
                    value={editForm.meetingDay}
                    onChange={(e) => setEditForm({ ...editForm, meetingDay: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs bg-white text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  >
                    <option value="MONDAY">Monday</option>
                    <option value="TUESDAY">Tuesday</option>
                    <option value="WEDNESDAY">Wednesday</option>
                    <option value="THURSDAY">Thursday</option>
                    <option value="FRIDAY">Friday</option>
                    <option value="SATURDAY">Saturday</option>
                    <option value="SUNDAY">Sunday</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Status
                  </label>
                  <select
                    value={editForm.status}
                    onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs bg-white text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  >
                    <option value="ACTIVE">ACTIVE</option>
                    <option value="INACTIVE">INACTIVE</option>
                  </select>
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setEditingGroup(null)}
                  disabled={isUpdating}
                  className="text-xs"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={isUpdating}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold"
                >
                  {isUpdating ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingGroup && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150 p-5 space-y-4">
            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-full bg-rose-100 text-rose-600 shrink-0">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <h3 className="font-bold text-slate-900 text-sm">
                  Delete Center / Group?
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Are you sure you want to permanently delete{" "}
                  <strong className="text-slate-800">{deletingGroup.name}</strong> (
                  <span className="font-mono">{deletingGroup.code}</span>)?
                </p>
                {deletingGroup.customerGroups.length > 0 && (
                  <div className="mt-2.5 p-2 rounded bg-amber-50 border border-amber-200 text-amber-800 text-[11px]">
                    <strong>Warning:</strong> This group has {deletingGroup.customerGroups.length} assigned member(s). You must reassign or remove all members before deleting.
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setDeletingGroup(null)}
                disabled={isDeleting}
                className="text-xs"
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={handleDeleteSubmit}
                disabled={isDeleting}
                className="bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold"
              >
                {isDeleting ? "Deleting..." : "Confirm Delete"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
