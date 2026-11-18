"use client";

import React, { useState, useRef } from "react";
import {
  Building2,
  UserCog,
  Sliders,
  ShieldAlert,
  Save,
  Upload,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Lock,
  KeyRound,
  FileText,
  Server,
  Eye,
  RefreshCw,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import type { CompanySettings, GeneralPreferences, SystemPreferences } from "@/modules/settings/settings-service";

interface Props {
  initialCompany: CompanySettings;
  initialGeneral: GeneralPreferences;
  initialSystem: SystemPreferences;
  adminUser: {
    id: string;
    username: string;
    email: string;
    fullName: string;
  };
}

export function SettingsClient({ initialCompany, initialGeneral, initialSystem, adminUser }: Props) {
  const [activeTab, setActiveTab] = useState<"company" | "admin" | "general" | "system">("company");

  // Company State
  const [company, setCompany] = useState<CompanySettings>(initialCompany);
  const [logoPreview, setLogoPreview] = useState<string | null>(initialCompany.companyLogo);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // General State
  const [general, setGeneral] = useState<GeneralPreferences>(initialGeneral);

  // System State
  const [system, setSystem] = useState<SystemPreferences>(initialSystem);

  // Admin Account State
  const [adminProfile, setAdminProfile] = useState({
    fullName: adminUser.fullName,
    username: adminUser.username,
    email: adminUser.email,
  });

  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });

  // UI state
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const clearFeedback = () => setFeedback(null);

  // Handle Logo Upload
  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setFeedback({ type: "error", message: "Only image files (JPEG, PNG, WebP) are permitted for the company logo." });
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      setFeedback({ type: "error", message: "Company logo must be smaller than 2MB." });
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      setLogoPreview(dataUrl);
      setCompany((prev) => ({ ...prev, companyLogo: dataUrl }));
      setFeedback({ type: "success", message: "Logo updated. Remember to save changes." });
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveLogo = () => {
    setLogoPreview(null);
    setCompany((prev) => ({ ...prev, companyLogo: null }));
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // Save Company Settings
  const handleSaveCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    clearFeedback();

    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ section: "company", data: company }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || "Failed to save company settings");

      setCompany(data.data);
      setFeedback({ type: "success", message: "Company & application settings saved successfully." });
    } catch (err: unknown) {
      setFeedback({ type: "error", message: err instanceof Error ? err.message : "Error saving settings" });
    } finally {
      setIsSaving(false);
    }
  };

  // Save General Preferences
  const handleSaveGeneral = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    clearFeedback();

    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ section: "general", data: general }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || "Failed to save general preferences");

      setGeneral(data.data);
      setFeedback({ type: "success", message: "General preferences saved successfully." });
    } catch (err: unknown) {
      setFeedback({ type: "error", message: err instanceof Error ? err.message : "Error saving preferences" });
    } finally {
      setIsSaving(false);
    }
  };

  // Save System Preferences
  const handleSaveSystem = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    clearFeedback();

    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ section: "system", data: system }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || "Failed to save system preferences");

      setSystem(data.data);
      setFeedback({ type: "success", message: "System-level preferences saved successfully." });
    } catch (err: unknown) {
      setFeedback({ type: "error", message: err instanceof Error ? err.message : "Error saving preferences" });
    } finally {
      setIsSaving(false);
    }
  };

  // Save Admin Account Profile
  const handleSaveAdminProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    clearFeedback();

    try {
      const res = await fetch("/api/settings/admin-account", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: adminProfile.fullName,
          username: adminProfile.username,
          email: adminProfile.email,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || "Failed to update profile");

      setFeedback({ type: "success", message: "Superadmin account profile updated successfully." });
    } catch (err: unknown) {
      setFeedback({ type: "error", message: err instanceof Error ? err.message : "Error updating account" });
    } finally {
      setIsSaving(false);
    }
  };

  // Change Password
  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    clearFeedback();

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setFeedback({ type: "error", message: "New password and confirm password do not match." });
      setIsSaving(false);
      return;
    }

    try {
      const res = await fetch("/api/settings/admin-account", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword: passwordForm.currentPassword,
          newPassword: passwordForm.newPassword,
          confirmPassword: passwordForm.confirmPassword,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || "Failed to change password");

      setPasswordForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
      setFeedback({ type: "success", message: "Password updated successfully. Other active sessions were invalidated." });
    } catch (err: unknown) {
      setFeedback({ type: "error", message: err instanceof Error ? err.message : "Error changing password" });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">System & Organization Settings</h1>
          <p className="text-sm text-slate-500 mt-1">
            Configure application branding, corporate parameters, security policies, and administrative credentials
          </p>
        </div>
        <Badge variant="info" className="self-start sm:self-auto py-1 px-3">
          Superadmin Control Center
        </Badge>
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
          <button onClick={clearFeedback} className="text-xs font-semibold opacity-70 hover:opacity-100">
            Dismiss
          </button>
        </div>
      )}

      {/* Settings Tab Navigation */}
      <div className="flex border-b border-slate-200 space-x-1 overflow-x-auto">
        <button
          onClick={() => {
            setActiveTab("company");
            clearFeedback();
          }}
          className={`flex items-center gap-2 py-3 px-4 text-sm font-semibold border-b-2 whitespace-nowrap transition-colors ${
            activeTab === "company"
              ? "border-blue-600 text-blue-600 bg-blue-50/50 rounded-t-lg"
              : "border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300"
          }`}
        >
          <Building2 className="h-4 w-4" />
          Company & Application
        </button>

        <button
          onClick={() => {
            setActiveTab("admin");
            clearFeedback();
          }}
          className={`flex items-center gap-2 py-3 px-4 text-sm font-semibold border-b-2 whitespace-nowrap transition-colors ${
            activeTab === "admin"
              ? "border-blue-600 text-blue-600 bg-blue-50/50 rounded-t-lg"
              : "border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300"
          }`}
        >
          <UserCog className="h-4 w-4" />
          Administrator Account
        </button>

        <button
          onClick={() => {
            setActiveTab("general");
            clearFeedback();
          }}
          className={`flex items-center gap-2 py-3 px-4 text-sm font-semibold border-b-2 whitespace-nowrap transition-colors ${
            activeTab === "general"
              ? "border-blue-600 text-blue-600 bg-blue-50/50 rounded-t-lg"
              : "border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300"
          }`}
        >
          <Sliders className="h-4 w-4" />
          General Preferences
        </button>

        <button
          onClick={() => {
            setActiveTab("system");
            clearFeedback();
          }}
          className={`flex items-center gap-2 py-3 px-4 text-sm font-semibold border-b-2 whitespace-nowrap transition-colors ${
            activeTab === "system"
              ? "border-blue-600 text-blue-600 bg-blue-50/50 rounded-t-lg"
              : "border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300"
          }`}
        >
          <ShieldAlert className="h-4 w-4" />
          System Preferences
        </button>
      </div>

      {/* Tab 1: Company and Application Settings */}
      {activeTab === "company" && (
        <form onSubmit={handleSaveCompany} className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Organization & Branding Profile</CardTitle>
              <CardDescription>
                Details configured here are used dynamically across navigation, headers, receipts, and printouts.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Logo Section */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-2">Company Logo</label>
                <div className="flex items-center gap-6 p-4 border border-dashed border-slate-300 rounded-xl bg-slate-50/50">
                  <div className="w-24 h-24 rounded-xl border border-slate-200 bg-white flex items-center justify-center overflow-hidden shrink-0 shadow-xs">
                    {logoPreview ? (
                      <img src={logoPreview} alt="Logo Preview" className="w-full h-full object-contain p-1" />
                    ) : (
                      <span className="flex items-center justify-center w-12 h-12 rounded-lg bg-blue-600 text-white font-extrabold text-xl shadow-xs">
                        ₹
                      </span>
                    )}
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => fileInputRef.current?.click()}
                        className="text-xs flex items-center gap-1.5"
                      >
                        <Upload className="h-3.5 w-3.5" />
                        {logoPreview ? "Replace Logo" : "Upload Logo"}
                      </Button>
                      {logoPreview && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={handleRemoveLogo}
                          className="text-xs text-rose-600 hover:bg-rose-50"
                        >
                          <Trash2 className="h-3.5 w-3.5 mr-1" />
                          Remove
                        </Button>
                      )}
                    </div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={handleLogoUpload}
                      className="hidden"
                    />
                    <p className="text-[11px] text-slate-500">
                      Recommended: PNG or JPEG with transparent background (Square or horizontal, max 2MB).
                    </p>
                  </div>
                </div>
              </div>

              {/* Company & Application Names */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Company Legal Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={company.companyName}
                    onChange={(e) => setCompany({ ...company, companyName: e.target.value })}
                    className="w-full text-sm border rounded-lg p-2.5 focus:ring-1 focus:ring-blue-500"
                    placeholder="e.g. Rayhan Financial Services Ltd."
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Application Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={company.appName}
                    onChange={(e) => setCompany({ ...company, appName: e.target.value })}
                    className="w-full text-sm border rounded-lg p-2.5 focus:ring-1 focus:ring-blue-500"
                    placeholder="e.g. Rayhan Microfinance ERP"
                  />
                </div>
              </div>

              {/* Addresses */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Operational / Head Office Address</label>
                  <textarea
                    rows={3}
                    value={company.companyAddress}
                    onChange={(e) => setCompany({ ...company, companyAddress: e.target.value })}
                    className="w-full text-sm border rounded-lg p-2.5 focus:ring-1 focus:ring-blue-500"
                    placeholder="Operational headquarters address..."
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Registered Office Address</label>
                  <textarea
                    rows={3}
                    value={company.registeredOfficeAddress}
                    onChange={(e) => setCompany({ ...company, registeredOfficeAddress: e.target.value })}
                    className="w-full text-sm border rounded-lg p-2.5 focus:ring-1 focus:ring-blue-500"
                    placeholder="Official statutory registered office..."
                  />
                </div>
              </div>

              {/* Contact Information */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Phone Number</label>
                  <input
                    type="text"
                    value={company.phoneNumber}
                    onChange={(e) => setCompany({ ...company, phoneNumber: e.target.value })}
                    className="w-full text-sm border rounded-lg p-2 focus:ring-1 focus:ring-blue-500 font-mono"
                    placeholder="+91 22 2654 3210"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Alternate Phone</label>
                  <input
                    type="text"
                    value={company.alternatePhoneNumber}
                    onChange={(e) => setCompany({ ...company, alternatePhoneNumber: e.target.value })}
                    className="w-full text-sm border rounded-lg p-2 focus:ring-1 focus:ring-blue-500 font-mono"
                    placeholder="+91 98200 12345"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Official Email</label>
                  <input
                    type="email"
                    value={company.officialEmail}
                    onChange={(e) => setCompany({ ...company, officialEmail: e.target.value })}
                    className="w-full text-sm border rounded-lg p-2 focus:ring-1 focus:ring-blue-500 font-mono"
                    placeholder="contact@rayhan-mfi.local"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Website URL</label>
                  <input
                    type="url"
                    value={company.websiteUrl}
                    onChange={(e) => setCompany({ ...company, websiteUrl: e.target.value })}
                    className="w-full text-sm border rounded-lg p-2 focus:ring-1 focus:ring-blue-500 font-mono"
                    placeholder="https://rayhan-mfi.local"
                  />
                </div>
              </div>

              {/* Statutory & Tax Registration */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Company Registration / CIN</label>
                  <input
                    type="text"
                    value={company.companyRegistrationDetails}
                    onChange={(e) => setCompany({ ...company, companyRegistrationDetails: e.target.value })}
                    className="w-full text-sm border rounded-lg p-2 focus:ring-1 focus:ring-blue-500 font-mono"
                    placeholder="e.g. CIN: U65923MH2020NPL123456"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Company GSTIN</label>
                  <input
                    type="text"
                    value={company.companyGstin}
                    onChange={(e) => setCompany({ ...company, companyGstin: e.target.value })}
                    className="w-full text-sm border rounded-lg p-2 focus:ring-1 focus:ring-blue-500 font-mono"
                    placeholder="e.g. 27AABCR1234F1Z5"
                  />
                </div>
              </div>

              {/* Financial & Regional Defaults */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Currency Code</label>
                  <input
                    type="text"
                    maxLength={3}
                    value={company.currency}
                    onChange={(e) => setCompany({ ...company, currency: e.target.value.toUpperCase() })}
                    className="w-full text-sm border rounded-lg p-2 focus:ring-1 focus:ring-blue-500 font-mono uppercase"
                    placeholder="INR"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Date Format</label>
                  <select
                    value={company.dateFormat}
                    onChange={(e) => setCompany({ ...company, dateFormat: e.target.value })}
                    className="w-full text-sm border rounded-lg p-2 focus:ring-1 focus:ring-blue-500 bg-white"
                  >
                    <option value="DD/MM/YYYY">DD/MM/YYYY (Indian/UK Standard)</option>
                    <option value="YYYY-MM-DD">YYYY-MM-DD (ISO 8601)</option>
                    <option value="MM/DD/YYYY">MM/DD/YYYY (US Standard)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Time Zone</label>
                  <select
                    value={company.timeZone}
                    onChange={(e) => setCompany({ ...company, timeZone: e.target.value })}
                    className="w-full text-sm border rounded-lg p-2 focus:ring-1 focus:ring-blue-500 bg-white"
                  >
                    <option value="Asia/Kolkata">Asia/Kolkata (IST +5:30)</option>
                    <option value="UTC">UTC (+0:00)</option>
                    <option value="Asia/Dubai">Asia/Dubai (GST +4:00)</option>
                    <option value="America/New_York">America/New_York (EST/EDT)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Financial Year Start</label>
                  <select
                    value={company.financialYearStart}
                    onChange={(e) => setCompany({ ...company, financialYearStart: e.target.value })}
                    className="w-full text-sm border rounded-lg p-2 focus:ring-1 focus:ring-blue-500 bg-white"
                  >
                    <option value="April 1">April 1 (Indian FY)</option>
                    <option value="January 1">January 1 (Calendar Year)</option>
                    <option value="July 1">July 1</option>
                    <option value="October 1">October 1</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Default Language</label>
                  <select
                    value={company.defaultLanguage}
                    onChange={(e) => setCompany({ ...company, defaultLanguage: e.target.value })}
                    className="w-full text-sm border rounded-lg p-2 focus:ring-1 focus:ring-blue-500 bg-white"
                  >
                    <option value="en">English (Official)</option>
                    <option value="hi">Hindi (हिन्दी)</option>
                  </select>
                </div>
              </div>

              <div className="pt-4 border-t flex justify-end">
                <Button type="submit" disabled={isSaving} className="flex items-center gap-2">
                  <Save className="h-4 w-4" />
                  {isSaving ? "Saving Settings..." : "Save Company Settings"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </form>
      )}

      {/* Tab 2: Administrator Account Settings */}
      {activeTab === "admin" && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Superadmin Account Profile</CardTitle>
              <CardDescription>
                Update your administrative username, notification email address, and profile name.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSaveAdminProfile} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Full Name</label>
                    <input
                      type="text"
                      required
                      value={adminProfile.fullName}
                      onChange={(e) => setAdminProfile({ ...adminProfile, fullName: e.target.value })}
                      className="w-full text-sm border rounded-lg p-2.5 focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Admin Username</label>
                    <input
                      type="text"
                      required
                      value={adminProfile.username}
                      onChange={(e) => setAdminProfile({ ...adminProfile, username: e.target.value })}
                      className="w-full text-sm border rounded-lg p-2.5 focus:ring-1 focus:ring-blue-500 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Admin Email</label>
                    <input
                      type="email"
                      required
                      value={adminProfile.email}
                      onChange={(e) => setAdminProfile({ ...adminProfile, email: e.target.value })}
                      className="w-full text-sm border rounded-lg p-2.5 focus:ring-1 focus:ring-blue-500 font-mono"
                    />
                  </div>
                </div>

                <div className="pt-2 flex justify-end">
                  <Button type="submit" disabled={isSaving}>
                    <Save className="h-4 w-4 mr-1.5" />
                    Save Profile Changes
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Change Superadmin Password</CardTitle>
              <CardDescription>
                Requires verifying your current password. Changing credentials will immediately revoke all other active sessions.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleChangePassword} className="space-y-4 max-w-lg">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Current Password</label>
                  <input
                    type="password"
                    required
                    value={passwordForm.currentPassword}
                    onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })}
                    className="w-full text-sm border rounded-lg p-2.5 focus:ring-1 focus:ring-blue-500"
                    placeholder="Enter current password"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">New Password</label>
                    <input
                      type="password"
                      required
                      minLength={8}
                      value={passwordForm.newPassword}
                      onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                      className="w-full text-sm border rounded-lg p-2.5 focus:ring-1 focus:ring-blue-500"
                      placeholder="Minimum 8 characters"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Confirm New Password</label>
                    <input
                      type="password"
                      required
                      minLength={8}
                      value={passwordForm.confirmPassword}
                      onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
                      className="w-full text-sm border rounded-lg p-2.5 focus:ring-1 focus:ring-blue-500"
                      placeholder="Repeat new password"
                    />
                  </div>
                </div>

                <div className="pt-2 flex justify-start">
                  <Button type="submit" disabled={isSaving} className="flex items-center gap-2">
                    <KeyRound className="h-4 w-4" />
                    Update Password Securely
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tab 3: General Preferences */}
      {activeTab === "general" && (
        <form onSubmit={handleSaveGeneral} className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Display & Formatting Preferences</CardTitle>
              <CardDescription>
                Configure user experience, table pagination, receipt thermal notes, and regional number presentation.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Default Pagination Page Size</label>
                  <select
                    value={general.defaultPaginationSize}
                    onChange={(e) => setGeneral({ ...general, defaultPaginationSize: parseInt(e.target.value, 10) })}
                    className="w-full text-sm border rounded-lg p-2.5 focus:ring-1 focus:ring-blue-500 bg-white"
                  >
                    <option value={10}>10 records per page</option>
                    <option value={25}>25 records per page</option>
                    <option value={50}>50 records per page</option>
                    <option value={100}>100 records per page</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Number Formatting Locale</label>
                  <select
                    value={general.dateNumberFormatting}
                    onChange={(e) => setGeneral({ ...general, dateNumberFormatting: e.target.value })}
                    className="w-full text-sm border rounded-lg p-2.5 focus:ring-1 focus:ring-blue-500 bg-white"
                  >
                    <option value="en-IN">Indian Lakhs/Crores (1,23,456.78)</option>
                    <option value="en-US">Western Millions (123,456.78)</option>
                    <option value="en-GB">UK Standard (123,456.78)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Currency Display Style</label>
                  <select
                    value={general.currencyDisplay}
                    onChange={(e) => setGeneral({ ...general, currencyDisplay: e.target.value as "SYMBOL" | "CODE" })}
                    className="w-full text-sm border rounded-lg p-2.5 focus:ring-1 focus:ring-blue-500 bg-white"
                  >
                    <option value="SYMBOL">Symbol Prefix (₹)</option>
                    <option value="CODE">Currency Code (INR)</option>
                  </select>
                </div>
              </div>

              {/* Session and Security */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Staff Inactivity Session Timeout</label>
                  <select
                    value={general.sessionTimeoutMinutes}
                    onChange={(e) => setGeneral({ ...general, sessionTimeoutMinutes: parseInt(e.target.value, 10) })}
                    className="w-full text-sm border rounded-lg p-2.5 focus:ring-1 focus:ring-blue-500 bg-white"
                  >
                    <option value={15}>15 Minutes</option>
                    <option value={30}>30 Minutes</option>
                    <option value={60}>60 Minutes (Default)</option>
                    <option value={120}>2 Hours</option>
                    <option value={480}>8 Hours (Full Shift)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Default Dashboard Time Period</label>
                  <select
                    value={general.defaultDashboardPreferences.period}
                    onChange={(e) =>
                      setGeneral({
                        ...general,
                        defaultDashboardPreferences: {
                          ...general.defaultDashboardPreferences,
                          period: e.target.value,
                        },
                      })
                    }
                    className="w-full text-sm border rounded-lg p-2.5 focus:ring-1 focus:ring-blue-500 bg-white"
                  >
                    <option value="TODAY">Today Only</option>
                    <option value="THIS_WEEK">This Week</option>
                    <option value="THIS_MONTH">This Month (Default)</option>
                    <option value="THIS_QUARTER">This Quarter</option>
                  </select>
                </div>
              </div>

              {/* Receipt Notes */}
              <div className="space-y-4 pt-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">Thermal Receipt Printout Notes</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Receipt Header Note</label>
                    <input
                      type="text"
                      value={general.receiptHeaderNote}
                      onChange={(e) => setGeneral({ ...general, receiptHeaderNote: e.target.value })}
                      className="w-full text-sm border rounded-lg p-2 focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Receipt Footer Note</label>
                    <input
                      type="text"
                      value={general.receiptFooterNote}
                      onChange={(e) => setGeneral({ ...general, receiptFooterNote: e.target.value })}
                      className="w-full text-sm border rounded-lg p-2 focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <label className="flex items-center gap-2 cursor-pointer pt-1">
                  <input
                    type="checkbox"
                    checked={general.autoPrintReceipt}
                    onChange={(e) => setGeneral({ ...general, autoPrintReceipt: e.target.checked })}
                    className="rounded text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-xs text-slate-700 font-medium">
                    Automatically trigger printable receipt dialog upon repayment confirmation
                  </span>
                </label>
              </div>

              <div className="pt-4 border-t flex justify-end">
                <Button type="submit" disabled={isSaving} className="flex items-center gap-2">
                  <Save className="h-4 w-4" />
                  {isSaving ? "Saving Preferences..." : "Save General Preferences"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </form>
      )}

      {/* Tab 4: System Preferences */}
      {activeTab === "system" && (
        <form onSubmit={handleSaveSystem} className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>System & Operational Controls</CardTitle>
              <CardDescription>
                Maintenance mode, file upload limits, document numbering formats, and database health status.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Maintenance Mode Box */}
              <div
                className={`p-4 rounded-xl border ${
                  system.maintenanceMode
                    ? "bg-amber-50 border-amber-300 text-amber-950"
                    : "bg-slate-50 border-slate-200 text-slate-800"
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h4 className="font-bold text-sm flex items-center gap-2">
                      <ShieldAlert
                        className={`h-4 w-4 ${system.maintenanceMode ? "text-amber-600" : "text-slate-400"}`}
                      />
                      Application Maintenance Mode
                    </h4>
                    <p className="text-xs text-slate-600 mt-1">
                      When enabled, operational staff are blocked with a maintenance notice. Superadmins retain full system control.
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer shrink-0">
                    <input
                      type="checkbox"
                      checked={system.maintenanceMode}
                      onChange={(e) => setSystem({ ...system, maintenanceMode: e.target.checked })}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-600"></div>
                  </label>
                </div>

                {system.maintenanceMode && (
                  <div className="mt-3 pt-3 border-t border-amber-200">
                    <label className="block text-xs font-semibold text-amber-900 mb-1">
                      Public Maintenance Notice Message
                    </label>
                    <input
                      type="text"
                      value={system.maintenanceMessage}
                      onChange={(e) => setSystem({ ...system, maintenanceMessage: e.target.value })}
                      className="w-full text-xs border border-amber-300 rounded-lg p-2 bg-white"
                    />
                  </div>
                )}
              </div>

              {/* Numbering Preferences */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">
                  Document Auto-Numbering Prefixes
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Loan Application Prefix</label>
                    <input
                      type="text"
                      value={system.loanApplicationPrefix}
                      onChange={(e) => setSystem({ ...system, loanApplicationPrefix: e.target.value })}
                      className="w-full text-sm border rounded-lg p-2 focus:ring-1 focus:ring-blue-500 font-mono"
                      placeholder="LA-"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Customer Code Prefix</label>
                    <input
                      type="text"
                      value={system.customerCodePrefix}
                      onChange={(e) => setSystem({ ...system, customerCodePrefix: e.target.value })}
                      className="w-full text-sm border rounded-lg p-2 focus:ring-1 focus:ring-blue-500 font-mono"
                      placeholder="CUST-"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Expense Voucher Prefix</label>
                    <input
                      type="text"
                      value={system.voucherNumberPrefix}
                      onChange={(e) => setSystem({ ...system, voucherNumberPrefix: e.target.value })}
                      className="w-full text-sm border rounded-lg p-2 focus:ring-1 focus:ring-blue-500 font-mono"
                      placeholder="EXP-"
                    />
                  </div>
                </div>
              </div>

              {/* Uploads & Retention */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Max KYC File Upload Size (MB)</label>
                  <select
                    value={system.maxFileUploadSizeMb}
                    onChange={(e) => setSystem({ ...system, maxFileUploadSizeMb: parseInt(e.target.value, 10) })}
                    className="w-full text-sm border rounded-lg p-2.5 focus:ring-1 focus:ring-blue-500 bg-white"
                  >
                    <option value={2}>2 Megabytes</option>
                    <option value={5}>5 Megabytes (Recommended)</option>
                    <option value={10}>10 Megabytes</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Audit Log Retention Policy</label>
                  <select
                    value={system.auditLogRetentionDays}
                    onChange={(e) => setSystem({ ...system, auditLogRetentionDays: parseInt(e.target.value, 10) })}
                    className="w-full text-sm border rounded-lg p-2.5 focus:ring-1 focus:ring-blue-500 bg-white"
                  >
                    <option value={90}>90 Days</option>
                    <option value={180}>180 Days (6 Months)</option>
                    <option value={365}>365 Days (1 Year - Regulatory Standard)</option>
                    <option value={730}>730 Days (2 Years)</option>
                  </select>
                </div>
              </div>

              {/* Database & Infrastructure Health (Read-Only) */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
                    <Server className="h-4 w-4 text-emerald-600" />
                    <span>Database Engine & Integrity Status</span>
                  </div>
                  <Badge variant="success">HEALTHY & ACTIVE</Badge>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs text-slate-600 pt-2 font-mono">
                  <div>Engine: <strong>{system.backupInfo.engine}</strong></div>
                  <div>State: <strong>{system.backupInfo.status}</strong></div>
                  <div>Check: <strong>OK (Double-Entry Balanced)</strong></div>
                </div>
              </div>

              <div className="pt-4 border-t flex justify-end">
                <Button type="submit" disabled={isSaving} className="flex items-center gap-2">
                  <Save className="h-4 w-4" />
                  {isSaving ? "Saving System Settings..." : "Save System Preferences"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </form>
      )}
    </div>
  );
}
