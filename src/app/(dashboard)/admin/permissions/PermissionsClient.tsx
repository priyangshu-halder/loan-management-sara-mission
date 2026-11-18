"use client";

import React, { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  KeyRound,
  Shield,
  UserCheck,
  CheckCircle2,
  AlertCircle,
  Save,
  RotateCcw,
  Search,
  SlidersHorizontal,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  User,
  Users,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import type { StaffPermissionSummary } from "@/modules/permissions/permission-management-service";
import type { SystemPermissionDef } from "@/lib/permissions/permission-registry";

interface Props {
  initialSummary: StaffPermissionSummary;
  preselectedUserId?: string;
}

const MODULE_LABELS: Record<string, string> = {
  customers: "Customer Management",
  loans: "Loan Management",
  collections: "Collection Management",
  savings: "Savings Account Management",
  expenses: "Expense Management",
  groups: "Group & Center Management",
  reports: "Reports & Documents",
  accounting: "Accounting & General Ledger",
  identity: "Staff & User Access (Administrative)",
  organizations: "Organization & Branches (Administrative)",
};

export function PermissionsClient({ initialSummary, preselectedUserId }: Props) {
  const router = useRouter();

  const [staffList] = useState(initialSummary.staffList);
  const [allPermissions] = useState<SystemPermissionDef[]>(initialSummary.allPermissions);
  const [profiles] = useState(initialSummary.profiles);

  // Selected staff ID
  const [selectedStaffId, setSelectedStaffId] = useState<string>(
    preselectedUserId || initialSummary.selectedStaff?.id || (staffList.length > 0 ? staffList[0].id : "")
  );

  const [selectedStaff, setSelectedStaff] = useState(initialSummary.selectedStaff);

  // Profile selection
  const [selectedProfileId, setSelectedProfileId] = useState<string>(
    initialSummary.selectedStaff?.permissionProfileId || ""
  );

  // State of checked permissions: code -> boolean
  const [checkedPermissions, setCheckedPermissions] = useState<Record<string, boolean>>(() => {
    const map: Record<string, boolean> = {};
    if (initialSummary.selectedStaff) {
      for (const code of initialSummary.selectedStaff.effectivePermissions) {
        map[code] = true;
      }
    }
    return map;
  });

  // UI state
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<"ALL" | "MAKER" | "CHECKER">("ALL");
  const [collapsedModules, setCollapsedModules] = useState<Record<string, boolean>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  // Handle Staff Change
  const handleStaffChange = async (newStaffId: string) => {
    setSelectedStaffId(newStaffId);
    setFeedback(null);

    try {
      const res = await fetch(`/api/admin/permissions?userId=${newStaffId}`);
      const data = await res.json();
      if (res.ok && data.selectedStaff) {
        setSelectedStaff(data.selectedStaff);
        setSelectedProfileId(data.selectedStaff.permissionProfileId || "");
        const newMap: Record<string, boolean> = {};
        for (const code of data.selectedStaff.effectivePermissions) {
          newMap[code] = true;
        }
        setCheckedPermissions(newMap);
      }
    } catch {
      setFeedback({ type: "error", message: "Failed to load staff permissions." });
    }
  };

  // Handle Profile Application (Editable Template)
  const handleApplyProfile = (profileCode: string) => {
    if (!profileCode) {
      setSelectedProfileId("");
      return;
    }

    const profile = profiles.find((p) => p.code === profileCode);
    if (!profile) return;

    setSelectedProfileId(profile.id);

    // Apply template permissions
    const updatedMap: Record<string, boolean> = {};
    for (const code of profile.permissions) {
      updatedMap[code] = true;
    }
    setCheckedPermissions(updatedMap);
    setFeedback({
      type: "success",
      message: `Profile template "${profile.name}" applied. Customize permissions below and click Save.`,
    });
  };

  // Toggle single permission
  const handleTogglePermission = (code: string) => {
    setCheckedPermissions((prev) => ({
      ...prev,
      [code]: !prev[code],
    }));
  };

  // Toggle all permissions within a module
  const handleToggleModule = (moduleKey: string, selectAll: boolean) => {
    const modulePerms = allPermissions.filter((p) => p.module === moduleKey);
    setCheckedPermissions((prev) => {
      const updated = { ...prev };
      for (const p of modulePerms) {
        updated[p.code] = selectAll;
      }
      return updated;
    });
  };

  // Toggle module card collapse
  const handleToggleCollapse = (moduleKey: string) => {
    setCollapsedModules((prev) => ({
      ...prev,
      [moduleKey]: !prev[moduleKey],
    }));
  };

  // Group permissions by module
  const groupedPermissions = useMemo(() => {
    const map: Record<string, SystemPermissionDef[]> = {};
    for (const perm of allPermissions) {
      // Exclude administrative from ordinary operational display unless superadmin
      if (perm.isAdministrative && selectedStaff?.username !== "admin") {
        continue;
      }

      // Filter by search term
      if (
        search &&
        !perm.name.toLowerCase().includes(search.toLowerCase()) &&
        !perm.code.toLowerCase().includes(search.toLowerCase()) &&
        !perm.description.toLowerCase().includes(search.toLowerCase())
      ) {
        continue;
      }

      // Filter by Maker / Checker
      if (roleFilter === "MAKER" && perm.makerCheckerRole !== "MAKER") continue;
      if (roleFilter === "CHECKER" && perm.makerCheckerRole !== "CHECKER") continue;

      if (!map[perm.module]) {
        map[perm.module] = [];
      }
      map[perm.module].push(perm);
    }
    return map;
  }, [allPermissions, search, roleFilter, selectedStaff]);

  // Check if granting checker permissions to non-checker staff
  const hasCheckerPermissionsGranted = useMemo(() => {
    return Object.entries(checkedPermissions).some(([code, isChecked]) => {
      if (!isChecked) return false;
      const def = allPermissions.find((p) => p.code === code);
      return def?.makerCheckerRole === "CHECKER";
    });
  }, [checkedPermissions, allPermissions]);

  // Initiate Save
  const handleInitiateSave = () => {
    // If granting checker permissions, show confirmation modal
    if (hasCheckerPermissionsGranted) {
      setShowConfirmModal(true);
    } else {
      executeSave();
    }
  };

  // Save changes
  const executeSave = async () => {
    setShowConfirmModal(false);
    setIsSaving(true);
    setFeedback(null);

    try {
      const res = await fetch("/api/admin/permissions", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetUserId: selectedStaffId,
          permissionProfileId: selectedProfileId || null,
          permissions: checkedPermissions,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || "Failed to update permissions");
      }

      setFeedback({
        type: "success",
        message: `Permissions updated successfully for @${selectedStaff?.username}. Effective permissions take effect immediately.`,
      });

      // Update selectedStaff state
      if (selectedStaff) {
        setSelectedStaff({
          ...selectedStaff,
          permissionProfileId: selectedProfileId || null,
          effectivePermissions: data.effectivePermissions,
        });
      }

      router.refresh();
    } catch (err: unknown) {
      setFeedback({
        type: "error",
        message: err instanceof Error ? err.message : "Error updating permissions",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const totalEffectiveCount = Object.values(checkedPermissions).filter(Boolean).length;

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Granular Staff Permissions & Roles
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Configure action-level permissions, enforce Maker-Checker separation, and assign editable profile templates
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            onClick={handleInitiateSave}
            disabled={isSaving || !selectedStaffId}
            className="flex items-center gap-2"
          >
            <Save className="h-4 w-4" />
            {isSaving ? "Saving Permissions..." : "Save Permission Changes"}
          </Button>
        </div>
      </div>

      {/* Global Feedback Banner */}
      {feedback && (
        <div
          className={`flex items-center gap-2 p-4 rounded-xl border text-sm ${
            feedback.type === "success"
              ? "bg-emerald-50 border-emerald-200 text-emerald-800"
              : "bg-rose-50 border-rose-200 text-rose-800"
          }`}
        >
          {feedback.type === "success" ? (
            <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
          ) : (
            <AlertCircle className="h-5 w-5 text-rose-600 shrink-0" />
          )}
          <span className="flex-1 font-medium">{feedback.message}</span>
          <button onClick={() => setFeedback(null)} className="text-xs font-semibold opacity-70 hover:opacity-100">
            Dismiss
          </button>
        </div>
      )}

      {/* Staff Selector & Profile Configuration Card */}
      <Card>
        <CardHeader>
          <CardTitle>Staff Member Selection & Profile Template</CardTitle>
          <CardDescription>
            Select an employee to view and customize their active operational authorization matrix.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Staff Dropdown */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Select Staff Member <span className="text-rose-500">*</span>
              </label>
              <select
                value={selectedStaffId}
                onChange={(e) => handleStaffChange(e.target.value)}
                className="w-full text-sm border border-slate-300 rounded-lg p-2.5 focus:ring-1 focus:ring-blue-500 bg-white font-medium"
              >
                {staffList.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.fullName} (@{s.username}) - {s.status}
                  </option>
                ))}
              </select>
            </div>

            {/* Profile Template Selector */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Apply Predefined Profile Template
              </label>
              <select
                value={profiles.find((p) => p.id === selectedProfileId)?.code || ""}
                onChange={(e) => handleApplyProfile(e.target.value)}
                className="w-full text-sm border border-slate-300 rounded-lg p-2.5 focus:ring-1 focus:ring-blue-500 bg-white"
              >
                <option value="">-- Custom Individual Permissions (No Template) --</option>
                {profiles.map((p) => (
                  <option key={p.id} value={p.code}>
                    {p.name} ({p.permissions.length} actions)
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-slate-500 mt-1">
                Applying a profile acts as an editable template. You can check or uncheck any individual permissions below.
              </p>
            </div>
          </div>

          {/* Selected Staff Profile Card */}
          {selectedStaff && (
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-lg shrink-0">
                  {selectedStaff.fullName.charAt(0).toUpperCase()}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-slate-900">{selectedStaff.fullName}</h3>
                    <Badge variant={selectedStaff.status === "ACTIVE" ? "success" : "danger"}>
                      {selectedStaff.status}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-500 font-mono mt-0.5">
                    <span>@{selectedStaff.username}</span>
                    <span>·</span>
                    <span>{selectedStaff.email}</span>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <div className="text-right">
                  <div className="text-xs text-slate-500">Effective Permissions</div>
                  <div className="text-lg font-bold text-blue-600">{totalEffectiveCount} Active Actions</div>
                </div>

                <div className="flex flex-wrap gap-1">
                  {selectedStaff.roles.map((r, i) => (
                    <Badge key={i} variant="info" className="text-xs">
                      <Shield className="h-3 w-3 mr-1" />
                      {r.name}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white p-3 rounded-xl border border-slate-200 shadow-xs">
        <div className="relative flex-1">
          <Search className="h-4 w-4 text-slate-400 absolute left-3 top-3" />
          <input
            type="text"
            placeholder="Search permissions by name, code, or description..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <div className="flex items-center gap-1.5 shrink-0 bg-slate-100 p-1 rounded-lg">
          <button
            onClick={() => setRoleFilter("ALL")}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
              roleFilter === "ALL" ? "bg-white text-slate-900 shadow-xs" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            All Actions
          </button>
          <button
            onClick={() => setRoleFilter("MAKER")}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
              roleFilter === "MAKER" ? "bg-emerald-600 text-white shadow-xs" : "text-emerald-700 hover:text-emerald-900"
            }`}
          >
            Makers
          </button>
          <button
            onClick={() => setRoleFilter("CHECKER")}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
              roleFilter === "CHECKER" ? "bg-amber-600 text-white shadow-xs" : "text-amber-700 hover:text-amber-900"
            }`}
          >
            Checkers
          </button>
        </div>
      </div>

      {/* Module-wise Permission Categories */}
      <div className="space-y-4">
        {Object.keys(groupedPermissions).length === 0 ? (
          <div className="p-8 text-center text-slate-500 bg-white rounded-xl border">
            No permissions match your current search and role filters.
          </div>
        ) : (
          Object.entries(groupedPermissions).map(([moduleKey, perms]) => {
            const isCollapsed = !!collapsedModules[moduleKey];
            const selectedInModule = perms.filter((p) => checkedPermissions[p.code]).length;

            return (
              <Card key={moduleKey} className="overflow-hidden">
                <div
                  className="px-6 py-4 border-b border-slate-200 bg-slate-50/70 flex items-center justify-between cursor-pointer select-none"
                  onClick={() => handleToggleCollapse(moduleKey)}
                >
                  <div className="flex items-center gap-3">
                    <button className="text-slate-500 hover:text-slate-800">
                      {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </button>
                    <div>
                      <h3 className="font-bold text-slate-900 text-sm">
                        {MODULE_LABELS[moduleKey] || moduleKey.toUpperCase()}
                      </h3>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {selectedInModule} of {perms.length} actions authorized
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      onClick={() => handleToggleModule(moduleKey, true)}
                      className="text-xs font-semibold text-blue-600 hover:underline px-2 py-1"
                    >
                      Select All
                    </button>
                    <span className="text-slate-300">|</span>
                    <button
                      type="button"
                      onClick={() => handleToggleModule(moduleKey, false)}
                      className="text-xs font-semibold text-slate-500 hover:underline px-2 py-1"
                    >
                      Deselect All
                    </button>
                  </div>
                </div>

                {!isCollapsed && (
                  <CardContent className="p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                    {perms.map((perm) => {
                      const isChecked = !!checkedPermissions[perm.code];

                      return (
                        <label
                          key={perm.code}
                          className={`flex items-start gap-3 p-3 rounded-xl border transition-all cursor-pointer ${
                            isChecked
                              ? "bg-blue-50/40 border-blue-200 shadow-xs"
                              : "bg-white border-slate-200 hover:bg-slate-50"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => handleTogglePermission(perm.code)}
                            className="mt-1 rounded text-blue-600 focus:ring-blue-500 h-4 w-4"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs font-bold text-slate-900 truncate">{perm.name}</span>
                              <Badge
                                variant={
                                  perm.makerCheckerRole === "MAKER"
                                    ? "success"
                                    : perm.makerCheckerRole === "CHECKER"
                                    ? "warning"
                                    : "info"
                                }
                                className="text-[10px] px-1.5 py-0.5 shrink-0"
                              >
                                {perm.makerCheckerRole}
                              </Badge>
                            </div>
                            <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">{perm.description}</p>
                            <span className="font-mono text-[10px] text-slate-400 mt-1 block">{perm.code}</span>
                          </div>
                        </label>
                      );
                    })}
                  </CardContent>
                )}
              </Card>
            );
          })
        )}
      </div>

      {/* Floating Save Actions Footer */}
      <div className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-xs border-t border-slate-200 py-3 px-6 z-40 shadow-lg">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="text-xs text-slate-600">
            Selected Employee:{" "}
            <strong className="text-slate-900">{selectedStaff?.fullName}</strong> (@{selectedStaff?.username}) ·{" "}
            <strong className="text-blue-600">{totalEffectiveCount}</strong> authorized actions
          </div>
          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                if (selectedStaff) {
                  const resetMap: Record<string, boolean> = {};
                  for (const code of selectedStaff.effectivePermissions) {
                    resetMap[code] = true;
                  }
                  setCheckedPermissions(resetMap);
                }
              }}
              disabled={isSaving}
            >
              <RotateCcw className="h-3.5 w-3.5 mr-1" />
              Reset
            </Button>
            <Button size="sm" onClick={handleInitiateSave} disabled={isSaving}>
              <Save className="h-3.5 w-3.5 mr-1.5" />
              {isSaving ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </div>
      </div>

      {/* High-Impact Checker Permission Confirmation Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl space-y-4">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-amber-100 text-amber-700 rounded-lg shrink-0">
                <AlertTriangle className="h-6 w-6" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900">Authorize Checker Privileges</h3>
                <p className="text-xs text-slate-500 mt-1">
                  You are granting Checker/Approval permissions to{" "}
                  <strong className="text-slate-800">{selectedStaff?.fullName}</strong>.
                </p>
              </div>
            </div>

            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900 space-y-1">
              <p className="font-semibold">• Maker-Checker Separation Policy will apply:</p>
              <p>• This employee will be able to sanction loans, verify KYC, or approve vouchers.</p>
              <p>• The system strictly prevents them from approving any transaction they created themselves.</p>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <Button variant="outline" onClick={() => setShowConfirmModal(false)} disabled={isSaving}>
                Cancel
              </Button>
              <Button onClick={executeSave} disabled={isSaving} className="bg-amber-600 hover:bg-amber-700 text-white">
                {isSaving ? "Authorizing..." : "Confirm & Save Permissions"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
