/* eslint-disable @next/next/no-img-element */
"use client";

import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  UserPlus,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  Camera,
  FileText,
  UploadCloud,
  X,
  Building,
  User,
  ShieldCheck,
  Home,
  Briefcase,
  Calendar,
  Users,
  IndianRupee,
  GraduationCap,
  FileCheck2,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";

interface GroupOption {
  id: string;
  code: string;
  name: string;
}

interface CatalogOption {
  id: string;
  code: string;
  name: string;
}

const ALLOWED_APP_FORM_EXTS = [".jpg", ".jpeg", ".png", ".webp", ".pdf", ".doc", ".docx"];
const ALLOWED_APP_FORM_MIMES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];
const MAX_APP_FORM_BYTES = 10 * 1024 * 1024; // 10MB

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export default function NewCustomerPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [groups, setGroups] = useState<GroupOption[]>([]);
  const [fetchingGroups, setFetchingGroups] = useState(true);

  // Master Catalogs
  const [communities, setCommunities] = useState<CatalogOption[]>([]);
  const [educations, setEducations] = useState<CatalogOption[]>([]);
  const [fetchingCatalogs, setFetchingCatalogs] = useState(true);

  // Application Form File State (Single Document)
  const [applicationFormFile, setApplicationFormFile] = useState<File | null>(null);
  const [applicationFormError, setApplicationFormError] = useState<string | null>(null);
  const appFormInputRef = useRef<HTMLInputElement>(null);

  // Form State
  const [formData, setFormData] = useState({
    customerCode: `CUST-${Date.now().toString().slice(-6)}`,
    fullName: "",
    guardianName: "",
    phone: "",
    email: "",
    dateOfBirth: "",
    gender: "FEMALE",
    aadhaarNumber: "",
    panNumber: "",
    groupId: "",
    occupation: "",
    residentialAddress: "",
    nomineeName: "",
    guarantorName: "",
    passportPhoto: "",
    aadhaarFrontDoc: "",
    aadhaarBackDoc: "",
    panPhoto: "",
    status: "ACTIVE" as const,

    // Personal and Family Details
    maritalStatus: "",
    familyMembers: "",

    // Occupation and Financial Details
    primaryOccupation: "",
    communityId: "",
    educationId: "",
    annualIncome: "",
  });

  // Hidden file input refs for KYC photos
  const passportInputRef = useRef<HTMLInputElement>(null);
  const aadhaarFrontInputRef = useRef<HTMLInputElement>(null);
  const aadhaarBackInputRef = useRef<HTMLInputElement>(null);
  const panInputRef = useRef<HTMLInputElement>(null);

  // Fetch groups for mandatory Center / Group selection
  useEffect(() => {
    async function loadGroups() {
      try {
        const res = await fetch("/api/customers/groups");
        if (res.ok) {
          const data = await res.json();
          setGroups(data.groups || []);
        }
      } catch (err) {
        console.error("Failed to load center groups", err);
      } finally {
        setFetchingGroups(false);
      }
    }
    loadGroups();
  }, []);

  // Fetch Master Catalogs
  useEffect(() => {
    async function loadCatalogs() {
      try {
        const [commRes, eduRes] = await Promise.all([
          fetch("/api/master-catalogs?category=COMMUNITY_RELIGION"),
          fetch("/api/master-catalogs?category=EDUCATION_LITERACY"),
        ]);
        if (commRes.ok) {
          const commData = await commRes.json();
          setCommunities(commData.items || []);
        }
        if (eduRes.ok) {
          const eduData = await eduRes.json();
          setEducations(eduData.items || []);
        }
      } catch (err) {
        console.error("Failed to load master catalogs", err);
      } finally {
        setFetchingCatalogs(false);
      }
    }
    loadCatalogs();
  }, []);

  // Handle Application Form file selection
  const handleApplicationFormChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setApplicationFormError(null);

    const ext = "." + file.name.split(".").pop()?.toLowerCase();
    const isAllowedExt = ALLOWED_APP_FORM_EXTS.includes(ext);
    const isAllowedMime = file.type ? ALLOWED_APP_FORM_MIMES.includes(file.type.toLowerCase()) : isAllowedExt;

    if (!isAllowedExt || !isAllowedMime) {
      setApplicationFormError(
        `Unsupported format "${file.name}". Accepted formats: Images (JPG, PNG, WEBP), PDF, DOC, or DOCX.`
      );
      if (appFormInputRef.current) appFormInputRef.current.value = "";
      return;
    }

    if (file.size > MAX_APP_FORM_BYTES) {
      setApplicationFormError(
        `File "${file.name}" (${formatBytes(file.size)}) exceeds the maximum allowed limit of 10MB.`
      );
      if (appFormInputRef.current) appFormInputRef.current.value = "";
      return;
    }

    setApplicationFormFile(file);
  };

  const removeApplicationForm = () => {
    setApplicationFormFile(null);
    setApplicationFormError(null);
    if (appFormInputRef.current) appFormInputRef.current.value = "";
  };

  // Process image / KYC document to Base64
  const handleKycFileChange = (
    field: "passportPhoto" | "aadhaarFrontDoc" | "aadhaarBackDoc" | "panPhoto"
  ) => {
    return (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      if (file.size > 5 * 1024 * 1024) {
        setError(`File "${file.name}" exceeds the 5MB size limit.`);
        return;
      }

      setError(null);

      if (file.type.startsWith("image/")) {
        const reader = new FileReader();
        reader.onload = (uploadEvent) => {
          const img = new Image();
          img.onload = () => {
            const canvas = document.createElement("canvas");
            let width = img.width;
            let height = img.height;
            const maxDimension = 1200;

            if (width > maxDimension || height > maxDimension) {
              if (width > height) {
                height = Math.round((height * maxDimension) / width);
                width = maxDimension;
              } else {
                width = Math.round((width * maxDimension) / height);
                height = maxDimension;
              }
            }

            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext("2d");
            if (ctx) {
              ctx.drawImage(img, 0, 0, width, height);
              const dataUrl = canvas.toDataURL("image/jpeg", 0.82);
              setFormData((prev) => ({ ...prev, [field]: dataUrl }));
            } else {
              setFormData((prev) => ({ ...prev, [field]: uploadEvent.target?.result as string }));
            }
          };
          img.onerror = () => {
            setFormData((prev) => ({ ...prev, [field]: uploadEvent.target?.result as string }));
          };
          img.src = uploadEvent.target?.result as string;
        };
        reader.readAsDataURL(file);
      } else {
        const reader = new FileReader();
        reader.onload = (uploadEvent) => {
          setFormData((prev) => ({ ...prev, [field]: uploadEvent.target?.result as string }));
        };
        reader.readAsDataURL(file);
      }
    };
  };

  const removeKycFile = (
    field: "passportPhoto" | "aadhaarFrontDoc" | "aadhaarBackDoc" | "panPhoto"
  ) => {
    setFormData((prev) => ({ ...prev, [field]: "" }));
    if (field === "passportPhoto" && passportInputRef.current) passportInputRef.current.value = "";
    if (field === "aadhaarFrontDoc" && aadhaarFrontInputRef.current) aadhaarFrontInputRef.current.value = "";
    if (field === "aadhaarBackDoc" && aadhaarBackInputRef.current) aadhaarBackInputRef.current.value = "";
    if (field === "panPhoto" && panInputRef.current) panInputRef.current.value = "";
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    // Group validation: MANDATORY
    if (!formData.groupId || !formData.groupId.trim()) {
      setError("Center / Group is required. Every customer must belong to a group.");
      setLoading(false);
      return;
    }

    const cleanedPhone = formData.phone.replace(/[\s-]/g, "");
    if (!/^\d{10}$/.test(cleanedPhone)) {
      setError("Phone number must be exactly 10 digits (numbers only).");
      setLoading(false);
      return;
    }

    if (!formData.guardianName.trim()) {
      setError("Guardian Name (Spouse / Father) is required.");
      setLoading(false);
      return;
    }

    const cleanedAadhaar = formData.aadhaarNumber.replace(/[\s-]/g, "");
    if (!/^\d{12}$/.test(cleanedAadhaar)) {
      setError("Aadhaar number must be a valid 12-digit number.");
      setLoading(false);
      return;
    }

    if (!formData.residentialAddress.trim()) {
      setError("Residential Address is required.");
      setLoading(false);
      return;
    }

    if (!formData.nomineeName.trim()) {
      setError("Nominee Full Name is required.");
      setLoading(false);
      return;
    }

    if (!formData.guarantorName.trim()) {
      setError("Guarantor Full Name is required.");
      setLoading(false);
      return;
    }

    if (formData.familyMembers !== "" && formData.familyMembers !== undefined) {
      const count = parseInt(formData.familyMembers, 10);
      if (isNaN(count) || count < 0) {
        setError("Family Members must be a valid non-negative integer.");
        setLoading(false);
        return;
      }
    }

    if (formData.annualIncome !== "" && formData.annualIncome !== undefined) {
      const inc = parseFloat(formData.annualIncome);
      if (isNaN(inc) || inc < 0) {
        setError("Annual Income must be a valid non-negative amount.");
        setLoading(false);
        return;
      }
    }

    try {
      const bodyFormData = new FormData();
      bodyFormData.append("customerCode", formData.customerCode.trim());
      bodyFormData.append("fullName", formData.fullName.trim());
      bodyFormData.append("guardianName", formData.guardianName.trim());
      bodyFormData.append("phone", cleanedPhone);
      if (formData.email.trim()) bodyFormData.append("email", formData.email.trim());
      if (formData.dateOfBirth) bodyFormData.append("dateOfBirth", formData.dateOfBirth);
      bodyFormData.append("gender", formData.gender);
      bodyFormData.append("aadhaarNumber", cleanedAadhaar);
      if (formData.panNumber.trim()) bodyFormData.append("panNumber", formData.panNumber.trim().toUpperCase());
      bodyFormData.append("groupId", formData.groupId.trim());
      if (formData.occupation.trim()) bodyFormData.append("occupation", formData.occupation.trim());
      bodyFormData.append("residentialAddress", formData.residentialAddress.trim());
      bodyFormData.append("nomineeName", formData.nomineeName.trim());
      bodyFormData.append("guarantorName", formData.guarantorName.trim());
      if (formData.passportPhoto) bodyFormData.append("passportPhoto", formData.passportPhoto);
      if (formData.aadhaarFrontDoc) bodyFormData.append("aadhaarFrontDoc", formData.aadhaarFrontDoc);
      if (formData.aadhaarBackDoc) bodyFormData.append("aadhaarBackDoc", formData.aadhaarBackDoc);
      if (formData.panPhoto) bodyFormData.append("panPhoto", formData.panPhoto);
      bodyFormData.append("status", formData.status);

      if (formData.maritalStatus) bodyFormData.append("maritalStatus", formData.maritalStatus);
      if (formData.familyMembers !== "") bodyFormData.append("familyMembers", formData.familyMembers);
      if (formData.primaryOccupation.trim()) bodyFormData.append("primaryOccupation", formData.primaryOccupation.trim());
      if (formData.communityId) bodyFormData.append("communityId", formData.communityId);
      if (formData.educationId) bodyFormData.append("educationId", formData.educationId);
      if (formData.annualIncome !== "") bodyFormData.append("annualIncome", formData.annualIncome);

      // Append Application Form Document if selected
      if (applicationFormFile) {
        bodyFormData.append("applicationForm", applicationFormFile);
      }

      const res = await fetch("/api/customers", {
        method: "POST",
        body: bodyFormData,
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || "Failed to register customer");
      }

      router.push("/customers");
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12">
      {/* Header Bar */}
      <div className="flex items-center gap-3">
        <Link href="/customers">
          <Button variant="outline" size="sm">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back to Customers
          </Button>
        </Link>
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">
            Register New Customer (KYC Intake)
          </h1>
          <p className="text-xs text-slate-500">
            Mandatory group association, borrower identification, and application document upload.
          </p>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800 flex items-start gap-2.5 shadow-sm">
          <AlertCircle className="h-4 w-4 shrink-0 text-red-600 mt-0.5" />
          <div className="font-medium">{error}</div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Section 1: Member Identity & Passport Photo */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <UserPlus className="h-4 w-4 text-emerald-600" />
              Member Profile & Passport Photo
            </CardTitle>
            <CardDescription>
              Basic applicant identification, primary contact, and profile photograph.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Passport Photo Upload Box */}
            <div className="flex flex-col sm:flex-row items-center gap-6 p-4 rounded-xl bg-slate-50 border border-slate-200">
              <div className="relative">
                {formData.passportPhoto ? (
                  <div className="relative h-28 w-24 rounded-lg overflow-hidden border-2 border-emerald-500 shadow-sm bg-white">
                    <img
                      src={formData.passportPhoto}
                      alt="Passport Size Photo Preview"
                      className="h-full w-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => removeKycFile("passportPhoto")}
                      className="absolute top-1 right-1 h-5 w-5 rounded-full bg-red-600 text-white flex items-center justify-center hover:bg-red-700 shadow"
                      title="Remove Photo"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ) : (
                  <div className="h-28 w-24 rounded-lg border-2 border-dashed border-slate-300 flex flex-col items-center justify-center bg-white text-slate-400">
                    <Camera className="h-7 w-7 text-slate-400 mb-1" />
                    <span className="text-[10px] text-center font-medium px-1">Passport Photo</span>
                  </div>
                )}
              </div>

              <div className="space-y-1.5 text-center sm:text-left flex-1">
                <label className="text-xs font-semibold text-slate-800 block">
                  PASSPORT SIZE PHOTO
                </label>
                <p className="text-xs text-slate-500">
                  Upload a clear, front-facing passport style portrait (JPG, PNG under 5MB).
                </p>
                <div className="pt-1 flex flex-wrap gap-2 justify-center sm:justify-start">
                  <input
                    type="file"
                    ref={passportInputRef}
                    accept="image/*"
                    onChange={handleKycFileChange("passportPhoto")}
                    className="hidden"
                    id="passport-photo-input"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="text-xs h-8"
                    onClick={() => passportInputRef.current?.click()}
                  >
                    <UploadCloud className="h-3.5 w-3.5 mr-1 text-slate-600" />
                    {formData.passportPhoto ? "Change Photo" : "Upload Passport Photo"}
                  </Button>
                  {formData.passportPhoto && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="text-xs h-8 text-red-600 border-red-200 hover:bg-red-50"
                      onClick={() => removeKycFile("passportPhoto")}
                    >
                      Remove
                    </Button>
                  )}
                </div>
              </div>
            </div>

            {/* Profile Fields */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Customer Code"
                required
                value={formData.customerCode}
                onChange={(e) => setFormData({ ...formData, customerCode: e.target.value.toUpperCase() })}
                placeholder="e.g. CUST-100234"
              />

              <Input
                label="Full Legal Name"
                required
                value={formData.fullName}
                onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                placeholder="e.g. Sunita Devi"
              />

              <Input
                label="Guardian Name (Spouse / Father)"
                required
                value={formData.guardianName}
                onChange={(e) => setFormData({ ...formData, guardianName: e.target.value })}
                placeholder="e.g. Rajesh Sharma"
              />

              <Input
                label="Phone Number (10 Digits)"
                required
                type="tel"
                maxLength={10}
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value.replace(/\D/g, "") })}
                placeholder="e.g. 9876543210"
                helperText="10-digit primary mobile number"
              />

              <Input
                label="Date of Birth"
                type="date"
                max={new Date().toISOString().split("T")[0]}
                value={formData.dateOfBirth}
                onChange={(e) => setFormData({ ...formData, dateOfBirth: e.target.value })}
              />

              <Select
                label="Gender"
                value={formData.gender}
                onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
              >
                <option value="FEMALE">Female</option>
                <option value="MALE">Male</option>
                <option value="OTHER">Other</option>
              </Select>

              <div className="sm:col-span-2">
                <Input
                  label="Email Address (Optional)"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="e.g. borrower@example.com"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Section 2: MANDATORY CENTER / GROUP & KYC IDENTIFICATION */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-emerald-600" />
              Center Affiliation & KYC Documents
            </CardTitle>
            <CardDescription>
              Mandatory Joint Liability Group / Center mapping and statutory identity verification.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Mandatory Center / Group Field */}
              <div className="sm:col-span-2">
                <Select
                  label="Center / Group"
                  required
                  value={formData.groupId}
                  onChange={(e) => setFormData({ ...formData, groupId: e.target.value })}
                  disabled={fetchingGroups}
                  helperText="Every customer must belong to a verified center/group. Individual customers without a group are prohibited."
                  error={!formData.groupId && error ? "Center / Group selection is mandatory." : undefined}
                >
                  <option value="">-- Select a Center / Group * --</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.code} - {g.name}
                    </option>
                  ))}
                </Select>
              </div>

              <Input
                label="Aadhaar Number (UID)"
                required
                maxLength={14}
                value={formData.aadhaarNumber}
                onChange={(e) => {
                  const raw = e.target.value.replace(/\D/g, "").slice(0, 12);
                  const formatted = raw.replace(/(\d{4})(?=\d)/g, "$1 ");
                  setFormData({ ...formData, aadhaarNumber: formatted });
                }}
                placeholder="e.g. 1234 5678 9012"
                helperText="12-digit Unique Identification Number"
              />

              <Input
                label="PAN Number (Optional)"
                maxLength={10}
                value={formData.panNumber}
                onChange={(e) => setFormData({ ...formData, panNumber: e.target.value.toUpperCase() })}
                placeholder="e.g. ABCDE1234F"
                helperText="10-character Permanent Account Number"
              />

              <div className="sm:col-span-2">
                <Input
                  label="General Occupation"
                  value={formData.occupation}
                  onChange={(e) => setFormData({ ...formData, occupation: e.target.value })}
                  placeholder="e.g. Dairy Farming, Grocery Store, Tailoring"
                />
              </div>

              <div className="sm:col-span-2">
                <Textarea
                  label="Residential Address"
                  required
                  rows={3}
                  value={formData.residentialAddress}
                  onChange={(e) => setFormData({ ...formData, residentialAddress: e.target.value })}
                  placeholder="Enter complete residential address with house/plot no, street/village, district, and pin code"
                />
              </div>
            </div>

            {/* KYC Identity Proof Uploads: Aadhaar & PAN */}
            <div className="pt-2 border-t border-slate-100">
              <h4 className="text-xs font-semibold text-slate-800 uppercase tracking-wider mb-3">
                KYC Identity Documents
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Aadhaar Front */}
                <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 flex flex-col justify-between space-y-3">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-semibold text-slate-800">
                        Aadhaar Card (Front)
                      </span>
                      {formData.aadhaarFrontDoc && (
                        <span className="inline-flex items-center text-[10px] text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded font-medium">
                          Uploaded
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500">
                      Front side showing photo, name & DOB.
                    </p>
                  </div>

                  <div className="space-y-2">
                    {formData.aadhaarFrontDoc ? (
                      <div className="relative h-28 w-full rounded-lg overflow-hidden border border-slate-200 bg-white">
                        {formData.aadhaarFrontDoc.startsWith("data:image/") ? (
                          <img
                            src={formData.aadhaarFrontDoc}
                            alt="Aadhaar Front"
                            className="h-full w-full object-contain"
                          />
                        ) : (
                          <div className="h-full w-full flex items-center justify-center gap-1.5 text-slate-600 text-xs">
                            <FileText className="h-5 w-5 text-emerald-600" />
                            <span>PDF Document</span>
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={() => removeKycFile("aadhaarFrontDoc")}
                          className="absolute top-1 right-1 h-5 w-5 rounded-full bg-red-600 text-white flex items-center justify-center hover:bg-red-700"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ) : (
                      <div
                        onClick={() => aadhaarFrontInputRef.current?.click()}
                        className="h-28 w-full rounded-lg border-2 border-dashed border-slate-300 bg-white flex flex-col items-center justify-center cursor-pointer hover:border-emerald-500 transition-colors"
                      >
                        <FileText className="h-6 w-6 text-slate-400 mb-1" />
                        <span className="text-[11px] text-slate-600 font-medium">
                          Choose Aadhaar Front
                        </span>
                        <span className="text-[10px] text-slate-400">JPG, PNG or PDF</span>
                      </div>
                    )}

                    <input
                      type="file"
                      ref={aadhaarFrontInputRef}
                      accept="image/*,application/pdf"
                      onChange={handleKycFileChange("aadhaarFrontDoc")}
                      className="hidden"
                    />

                    {formData.aadhaarFrontDoc && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="w-full text-xs h-7"
                        onClick={() => aadhaarFrontInputRef.current?.click()}
                      >
                        Change Document
                      </Button>
                    )}
                  </div>
                </div>

                {/* Aadhaar Back */}
                <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 flex flex-col justify-between space-y-3">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-semibold text-slate-800">
                        Aadhaar Card (Back)
                      </span>
                      {formData.aadhaarBackDoc && (
                        <span className="inline-flex items-center text-[10px] text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded font-medium">
                          Uploaded
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500">
                      Back side showing residential address & QR.
                    </p>
                  </div>

                  <div className="space-y-2">
                    {formData.aadhaarBackDoc ? (
                      <div className="relative h-28 w-full rounded-lg overflow-hidden border border-slate-200 bg-white">
                        {formData.aadhaarBackDoc.startsWith("data:image/") ? (
                          <img
                            src={formData.aadhaarBackDoc}
                            alt="Aadhaar Back"
                            className="h-full w-full object-contain"
                          />
                        ) : (
                          <div className="h-full w-full flex items-center justify-center gap-1.5 text-slate-600 text-xs">
                            <FileText className="h-5 w-5 text-emerald-600" />
                            <span>PDF Document</span>
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={() => removeKycFile("aadhaarBackDoc")}
                          className="absolute top-1 right-1 h-5 w-5 rounded-full bg-red-600 text-white flex items-center justify-center hover:bg-red-700"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ) : (
                      <div
                        onClick={() => aadhaarBackInputRef.current?.click()}
                        className="h-28 w-full rounded-lg border-2 border-dashed border-slate-300 bg-white flex flex-col items-center justify-center cursor-pointer hover:border-emerald-500 transition-colors"
                      >
                        <FileText className="h-6 w-6 text-slate-400 mb-1" />
                        <span className="text-[11px] text-slate-600 font-medium">
                          Choose Aadhaar Back
                        </span>
                        <span className="text-[10px] text-slate-400">JPG, PNG or PDF</span>
                      </div>
                    )}

                    <input
                      type="file"
                      ref={aadhaarBackInputRef}
                      accept="image/*,application/pdf"
                      onChange={handleKycFileChange("aadhaarBackDoc")}
                      className="hidden"
                    />

                    {formData.aadhaarBackDoc && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="w-full text-xs h-7"
                        onClick={() => aadhaarBackInputRef.current?.click()}
                      >
                        Change Document
                      </Button>
                    )}
                  </div>
                </div>

                {/* PAN Photo */}
                <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 flex flex-col justify-between space-y-3">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-semibold text-slate-800">
                        PAN Card Photo
                      </span>
                      {formData.panPhoto && (
                        <span className="inline-flex items-center text-[10px] text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded font-medium">
                          Uploaded
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500">
                      Optional clear photo of PAN card.
                    </p>
                  </div>

                  <div className="space-y-2">
                    {formData.panPhoto ? (
                      <div className="relative h-28 w-full rounded-lg overflow-hidden border border-slate-200 bg-white">
                        {formData.panPhoto.startsWith("data:image/") ? (
                          <img
                            src={formData.panPhoto}
                            alt="PAN Card"
                            className="h-full w-full object-contain"
                          />
                        ) : (
                          <div className="h-full w-full flex items-center justify-center gap-1.5 text-slate-600 text-xs">
                            <FileText className="h-5 w-5 text-emerald-600" />
                            <span>PDF Document</span>
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={() => removeKycFile("panPhoto")}
                          className="absolute top-1 right-1 h-5 w-5 rounded-full bg-red-600 text-white flex items-center justify-center hover:bg-red-700"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ) : (
                      <div
                        onClick={() => panInputRef.current?.click()}
                        className="h-28 w-full rounded-lg border-2 border-dashed border-slate-300 bg-white flex flex-col items-center justify-center cursor-pointer hover:border-emerald-500 transition-colors"
                      >
                        <FileText className="h-6 w-6 text-slate-400 mb-1" />
                        <span className="text-[11px] text-slate-600 font-medium">
                          Choose PAN Photo
                        </span>
                        <span className="text-[10px] text-slate-400">JPG, PNG or PDF</span>
                      </div>
                    )}

                    <input
                      type="file"
                      ref={panInputRef}
                      accept="image/*,application/pdf"
                      onChange={handleKycFileChange("panPhoto")}
                      className="hidden"
                    />

                    {formData.panPhoto && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="w-full text-xs h-7"
                        onClick={() => panInputRef.current?.click()}
                      >
                        Change Document
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Section 3: APPLICATION FORM DOCUMENT UPLOAD (Requirement 1) */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <FileCheck2 className="h-4 w-4 text-blue-600" />
              Application Form Document
            </CardTitle>
            <CardDescription>
              Upload physical or signed borrower loan/customer application form.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-800 block">
                  Application Form (Optional)
                </label>
                <p className="text-xs text-slate-500">
                  Accepted formats: Images (JPG, PNG, WEBP), PDF, DOC, DOCX. Max 10MB per document.
                </p>
                {applicationFormError && (
                  <p className="text-xs text-red-600 font-medium flex items-center gap-1 mt-1">
                    <AlertCircle className="h-3.5 w-3.5" />
                    {applicationFormError}
                  </p>
                )}
              </div>

              <div className="w-full md:w-auto">
                <input
                  type="file"
                  ref={appFormInputRef}
                  accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  onChange={handleApplicationFormChange}
                  className="hidden"
                  id="application-form-file-input"
                />

                {applicationFormFile ? (
                  <div className="flex items-center gap-3 bg-white p-2.5 rounded-lg border border-blue-200 shadow-sm">
                    <FileText className="h-6 w-6 text-blue-600 shrink-0" />
                    <div className="text-left min-w-0 pr-2">
                      <p className="text-xs font-semibold text-slate-800 truncate max-w-xs" title={applicationFormFile.name}>
                        {applicationFormFile.name}
                      </p>
                      <p className="text-[11px] text-slate-500">{formatBytes(applicationFormFile.size)}</p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="text-xs h-7"
                        onClick={() => appFormInputRef.current?.click()}
                      >
                        Replace
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="text-xs h-7 text-red-600 border-red-200 hover:bg-red-50"
                        onClick={removeApplicationForm}
                      >
                        Remove
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="text-xs h-9 bg-white hover:bg-slate-50"
                    onClick={() => appFormInputRef.current?.click()}
                  >
                    <UploadCloud className="h-4 w-4 mr-1.5 text-blue-600" />
                    Select Application Form
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Section 4: NOMINEE & GUARANTOR DETAILS */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4 text-emerald-600" />
              Nominee & Guarantor Details
            </CardTitle>
            <CardDescription>
              Designated legal nominee for claims and credit guarantor underwriting.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Nominee Full Name"
                required
                value={formData.nomineeName}
                onChange={(e) => setFormData({ ...formData, nomineeName: e.target.value })}
                placeholder="e.g. Ramesh Devi (Nominee)"
                helperText="Designated legal beneficiary"
              />

              <Input
                label="Guarantor Full Name"
                required
                value={formData.guarantorName}
                onChange={(e) => setFormData({ ...formData, guarantorName: e.target.value })}
                placeholder="e.g. Shyam Sundar (Guarantor)"
                helperText="Secondary credit surety / guarantor"
              />
            </div>
          </CardContent>
        </Card>

        {/* Section 5: PERSONAL AND FAMILY DETAILS */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4 text-emerald-600" />
              Personal and Family Details
            </CardTitle>
            <CardDescription>
              Household demographics, marital status, and family composition.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Select
                label="Marital Status"
                value={formData.maritalStatus}
                onChange={(e) => setFormData({ ...formData, maritalStatus: e.target.value })}
                helperText="Current legal marital status"
              >
                <option value="">-- Select Marital Status --</option>
                <option value="Single">Single</option>
                <option value="Married">Married</option>
                <option value="Widowed">Widowed</option>
                <option value="Divorced">Divorced</option>
                <option value="Other">Other</option>
              </Select>

              <Input
                label="Family Members"
                type="number"
                min="0"
                step="1"
                value={formData.familyMembers}
                onChange={(e) => setFormData({ ...formData, familyMembers: e.target.value })}
                placeholder="e.g. 4"
                helperText="Non-negative number of dependent family members"
              />
            </div>
          </CardContent>
        </Card>

        {/* Section 6: OCCUPATION AND FINANCIAL DETAILS */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <IndianRupee className="h-4 w-4 text-emerald-600" />
              Occupation and Financial Details
            </CardTitle>
            <CardDescription>
              Primary livelihood, community/religious group, educational literacy, and annual income.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Primary Occupation"
                value={formData.primaryOccupation}
                onChange={(e) => setFormData({ ...formData, primaryOccupation: e.target.value })}
                placeholder="e.g. Dairy Farming, Grocery Store, Handloom Weaving"
                helperText="Primary revenue-generating occupation or trade"
              />

              <Input
                label="Annual Income (₹)"
                type="number"
                min="0"
                step="5000"
                value={formData.annualIncome}
                onChange={(e) => setFormData({ ...formData, annualIncome: e.target.value })}
                placeholder="e.g. 180000"
                helperText="Annual gross household income in Indian Rupees"
              />

              <Select
                label="Community / Religion"
                value={formData.communityId}
                onChange={(e) => setFormData({ ...formData, communityId: e.target.value })}
                disabled={fetchingCatalogs}
                helperText="Populated dynamically from backend Master Catalog"
              >
                <option value="">-- Select Community / Religion (Master Catalog) --</option>
                {communities.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>

              <Select
                label="Education / Literacy"
                value={formData.educationId}
                onChange={(e) => setFormData({ ...formData, educationId: e.target.value })}
                disabled={fetchingCatalogs}
                helperText="Highest literacy/educational level achieved"
              >
                <option value="">-- Select Education Level (Master Catalog) --</option>
                {educations.map((ed) => (
                  <option key={ed.id} value={ed.id}>
                    {ed.name}
                  </option>
                ))}
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Action Buttons */}
        <div className="pt-4 flex items-center justify-end gap-3 border-t border-slate-200">
          <Link href="/customers">
            <Button type="button" variant="outline" size="sm" disabled={loading}>
              Cancel
            </Button>
          </Link>
          <Button
            type="submit"
            size="sm"
            disabled={loading}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-5 shadow-sm"
          >
            <CheckCircle2 className="h-4 w-4 mr-1.5" />
            {loading ? "Registering Borrower..." : "Register Customer"}
          </Button>
        </div>
      </form>
    </div>
  );
}
