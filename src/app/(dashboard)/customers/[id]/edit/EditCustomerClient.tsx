/* eslint-disable @next/next/no-img-element */
"use client";

import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  Camera,
  FileText,
  UploadCloud,
  X,
  User,
  ShieldCheck,
  Home,
  Briefcase,
  Calendar,
  Users,
  IndianRupee,
  GraduationCap,
  FileCheck2,
  Download,
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

interface ExistingDocument {
  id: string;
  documentType: string;
  fileName: string;
  storagePath: string;
  mimeType: string;
  fileSize: number;
}

interface CustomerData {
  id: string;
  customerCode: string;
  fullName: string;
  guardianName: string | null;
  phone: string;
  email: string | null;
  dateOfBirth: string | null;
  gender: string | null;
  aadhaarNumber: string | null;
  panNumber: string | null;
  groupId?: string | null;
  group?: { id: string; code: string; name: string } | null;
  customerGroups?: Array<{ groupId: string; group: { id: string; code: string; name: string } }>;
  documents?: ExistingDocument[];
  occupation: string | null;
  residentialAddress: string | null;
  nomineeName: string | null;
  guarantorName: string | null;
  passportPhoto: string | null;
  aadhaarFrontDoc: string | null;
  aadhaarBackDoc: string | null;
  panPhoto: string | null;
  status: string;

  maritalStatus?: string | null;
  familyMembers?: number | null;
  primaryOccupation?: string | null;
  communityId?: string | null;
  educationId?: string | null;
  annualIncome?: unknown;
}

interface Props {
  initialCustomer: CustomerData;
  groups: GroupOption[];
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

export function EditCustomerClient({ initialCustomer, groups }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Master Catalogs
  const [communities, setCommunities] = useState<CatalogOption[]>([]);
  const [educations, setEducations] = useState<CatalogOption[]>([]);
  const [fetchingCatalogs, setFetchingCatalogs] = useState(true);

  // Initial group determination
  const initialGroupId =
    initialCustomer.groupId ||
    initialCustomer.group?.id ||
    initialCustomer.customerGroups?.[0]?.groupId ||
    "";

  // Initial application form determination
  const initialAppDoc = initialCustomer.documents?.find(
    (d) => d.documentType === "APPLICATION_FORM"
  );
  const [existingAppDoc, setExistingAppDoc] = useState<ExistingDocument | null>(
    initialAppDoc || null
  );
  const [removeExistingAppDoc, setRemoveExistingAppDoc] = useState(false);
  const [newApplicationFormFile, setNewApplicationFormFile] = useState<File | null>(null);
  const [applicationFormError, setApplicationFormError] = useState<string | null>(null);
  const appFormInputRef = useRef<HTMLInputElement>(null);

  const formattedDob = initialCustomer.dateOfBirth
    ? new Date(initialCustomer.dateOfBirth).toISOString().split("T")[0]
    : "";

  const [formData, setFormData] = useState({
    customerCode: initialCustomer.customerCode || "",
    fullName: initialCustomer.fullName || "",
    guardianName: initialCustomer.guardianName || "",
    phone: initialCustomer.phone || "",
    email: initialCustomer.email || "",
    dateOfBirth: formattedDob,
    gender: initialCustomer.gender || "FEMALE",
    aadhaarNumber: initialCustomer.aadhaarNumber || "",
    panNumber: initialCustomer.panNumber || "",
    groupId: initialGroupId,
    occupation: initialCustomer.occupation || "",
    residentialAddress: initialCustomer.residentialAddress || "",
    nomineeName: initialCustomer.nomineeName || "",
    guarantorName: initialCustomer.guarantorName || "",
    passportPhoto: initialCustomer.passportPhoto || "",
    aadhaarFrontDoc: initialCustomer.aadhaarFrontDoc || "",
    aadhaarBackDoc: initialCustomer.aadhaarBackDoc || "",
    panPhoto: initialCustomer.panPhoto || "",
    status: initialCustomer.status || "ACTIVE",

    // Personal & Family
    maritalStatus: initialCustomer.maritalStatus || "",
    familyMembers:
      initialCustomer.familyMembers !== null && initialCustomer.familyMembers !== undefined
        ? String(initialCustomer.familyMembers)
        : "",

    // Occupation & Financial
    primaryOccupation: initialCustomer.primaryOccupation || initialCustomer.occupation || "",
    communityId: initialCustomer.communityId || "",
    educationId: initialCustomer.educationId || "",
    annualIncome: initialCustomer.annualIncome ? String(initialCustomer.annualIncome) : "",
  });

  const passportInputRef = useRef<HTMLInputElement>(null);
  const aadhaarFrontInputRef = useRef<HTMLInputElement>(null);
  const aadhaarBackInputRef = useRef<HTMLInputElement>(null);
  const panInputRef = useRef<HTMLInputElement>(null);

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

    setNewApplicationFormFile(file);
    setRemoveExistingAppDoc(false);
  };

  const handleRemoveExistingAppDoc = () => {
    setRemoveExistingAppDoc(true);
    setNewApplicationFormFile(null);
    setApplicationFormError(null);
    if (appFormInputRef.current) appFormInputRef.current.value = "";
  };

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
    setSuccess(false);

    if (!formData.groupId || !formData.groupId.trim()) {
      setError("Center / Group is required. Every customer must belong to a group.");
      setLoading(false);
      return;
    }

    const cleanedPhone = formData.phone.replace(/[\s-]/g, "");
    if (!/^\d{10}$/.test(cleanedPhone)) {
      setError("PHONE NUMBER must be exactly 10 digits.");
      setLoading(false);
      return;
    }

    if (!formData.guardianName.trim()) {
      setError("GUARDIAN NAME is required.");
      setLoading(false);
      return;
    }

    const cleanedAadhaar = formData.aadhaarNumber.replace(/[\s-]/g, "");
    if (!/^\d{12}$/.test(cleanedAadhaar)) {
      setError("AADHAAR NUMBER must be a valid 12-digit number.");
      setLoading(false);
      return;
    }

    if (!formData.residentialAddress.trim()) {
      setError("RESIDENTIAL ADDRESS is required.");
      setLoading(false);
      return;
    }

    if (!formData.nomineeName.trim()) {
      setError("NOMINEE FULL NAME is required.");
      setLoading(false);
      return;
    }

    if (!formData.guarantorName.trim()) {
      setError("GUARANTOR FULL NAME is required.");
      setLoading(false);
      return;
    }

    if (formData.familyMembers !== "" && formData.familyMembers !== undefined) {
      const count = parseInt(formData.familyMembers, 10);
      if (isNaN(count) || count < 0) {
        setError("FAMILY MEMBERS must be a valid non-negative integer.");
        setLoading(false);
        return;
      }
    }

    if (formData.annualIncome !== "" && formData.annualIncome !== undefined) {
      const inc = parseFloat(formData.annualIncome);
      if (isNaN(inc) || inc < 0) {
        setError("ANNUAL INCOME must be a valid non-negative amount.");
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
      bodyFormData.append("email", formData.email.trim());
      if (formData.dateOfBirth) bodyFormData.append("dateOfBirth", formData.dateOfBirth);
      bodyFormData.append("gender", formData.gender);
      bodyFormData.append("aadhaarNumber", cleanedAadhaar);
      bodyFormData.append("panNumber", formData.panNumber.trim().toUpperCase());
      bodyFormData.append("groupId", formData.groupId.trim());
      bodyFormData.append("occupation", formData.occupation.trim());
      bodyFormData.append("residentialAddress", formData.residentialAddress.trim());
      bodyFormData.append("nomineeName", formData.nomineeName.trim());
      bodyFormData.append("guarantorName", formData.guarantorName.trim());
      bodyFormData.append("passportPhoto", formData.passportPhoto);
      bodyFormData.append("aadhaarFrontDoc", formData.aadhaarFrontDoc);
      bodyFormData.append("aadhaarBackDoc", formData.aadhaarBackDoc);
      bodyFormData.append("panPhoto", formData.panPhoto);
      bodyFormData.append("status", formData.status);

      bodyFormData.append("maritalStatus", formData.maritalStatus);
      bodyFormData.append("familyMembers", formData.familyMembers);
      bodyFormData.append("primaryOccupation", formData.primaryOccupation.trim());
      bodyFormData.append("communityId", formData.communityId);
      bodyFormData.append("educationId", formData.educationId);
      bodyFormData.append("annualIncome", formData.annualIncome);

      if (newApplicationFormFile) {
        bodyFormData.append("applicationForm", newApplicationFormFile);
      } else if (removeExistingAppDoc) {
        bodyFormData.append("removeApplicationForm", "true");
      }

      const res = await fetch(`/api/customers/${initialCustomer.id}`, {
        method: "PATCH",
        body: bodyFormData,
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || "Failed to update customer");
      }

      setSuccess(true);
      router.refresh();
      setTimeout(() => {
        router.push(`/customers/${initialCustomer.id}`);
      }, 1000);
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
        <Link href={`/customers/${initialCustomer.id}`}>
          <Button variant="outline" size="sm">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back to Profile
          </Button>
        </Link>
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">
            Edit Customer Profile: {initialCustomer.fullName}
          </h1>
          <p className="text-xs text-slate-500 font-mono">
            ID: {initialCustomer.customerCode} • Institutional Borrower Record
          </p>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800 flex items-start gap-2.5 shadow-sm">
          <AlertCircle className="h-4 w-4 shrink-0 text-red-600 mt-0.5" />
          <div className="font-medium">{error}</div>
        </div>
      )}

      {success && (
        <div className="p-4 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-start gap-2.5 shadow-sm">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 mt-0.5" />
          <div className="font-medium">Customer profile updated successfully! Redirecting...</div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Section 1: Profile & Passport Photo */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <User className="h-4 w-4 text-emerald-600" />
              Member Profile & Passport Photo
            </CardTitle>
            <CardDescription>Update primary identifying and contact details</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
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
                  Update customer portrait photograph (JPG, PNG under 5MB).
                </p>
                <div className="pt-1 flex flex-wrap gap-2 justify-center sm:justify-start">
                  <input
                    type="file"
                    ref={passportInputRef}
                    accept="image/*"
                    onChange={handleKycFileChange("passportPhoto")}
                    className="hidden"
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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Customer Code"
                required
                value={formData.customerCode}
                onChange={(e) => setFormData({ ...formData, customerCode: e.target.value.toUpperCase() })}
              />

              <Input
                label="Full Legal Name"
                required
                value={formData.fullName}
                onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
              />

              <Input
                label="Guardian Name (Spouse / Father)"
                required
                value={formData.guardianName}
                onChange={(e) => setFormData({ ...formData, guardianName: e.target.value })}
              />

              <Input
                label="Phone Number (10 Digits)"
                required
                type="tel"
                maxLength={10}
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value.replace(/\D/g, "") })}
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

              <Select
                label="Customer Status"
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value })}
              >
                <option value="ACTIVE">Active</option>
                <option value="INACTIVE">Inactive</option>
                <option value="SUSPENDED">Suspended</option>
              </Select>

              <Input
                label="Email Address"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              />
            </div>
          </CardContent>
        </Card>

        {/* Section 2: MANDATORY CENTER / GROUP & KYC */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-emerald-600" />
              Center Affiliation & KYC
            </CardTitle>
            <CardDescription>Mandatory Joint Liability Group mapping and address verification</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <Select
                  label="Center / Group"
                  required
                  value={formData.groupId}
                  onChange={(e) => setFormData({ ...formData, groupId: e.target.value })}
                  helperText="Every customer must belong to a verified center/group."
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
              />

              <Input
                label="PAN Number (Optional)"
                maxLength={10}
                value={formData.panNumber}
                onChange={(e) => setFormData({ ...formData, panNumber: e.target.value.toUpperCase() })}
              />

              <div className="sm:col-span-2">
                <Textarea
                  label="Residential Address"
                  required
                  rows={3}
                  value={formData.residentialAddress}
                  onChange={(e) => setFormData({ ...formData, residentialAddress: e.target.value })}
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

        {/* Section 3: APPLICATION FORM DOCUMENT (Requirement 1) */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <FileCheck2 className="h-4 w-4 text-blue-600" />
              Application Form Document
            </CardTitle>
            <CardDescription>
              Upload, replace, or remove signed customer application form.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-800 block">
                  Application Form Document
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
                />

                {newApplicationFormFile ? (
                  <div className="flex items-center gap-3 bg-white p-2.5 rounded-lg border border-blue-200 shadow-sm">
                    <FileText className="h-6 w-6 text-blue-600 shrink-0" />
                    <div className="text-left min-w-0 pr-2">
                      <p className="text-xs font-semibold text-slate-800 truncate max-w-xs">
                        {newApplicationFormFile.name} (New)
                      </p>
                      <p className="text-[11px] text-slate-500">{formatBytes(newApplicationFormFile.size)}</p>
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
                        onClick={() => setNewApplicationFormFile(null)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : existingAppDoc && !removeExistingAppDoc ? (
                  <div className="flex items-center gap-3 bg-white p-2.5 rounded-lg border border-emerald-200 shadow-sm">
                    <FileText className="h-6 w-6 text-emerald-600 shrink-0" />
                    <div className="text-left min-w-0 pr-2">
                      <p className="text-xs font-semibold text-slate-800 truncate max-w-xs">
                        {existingAppDoc.fileName}
                      </p>
                      <p className="text-[11px] text-slate-500">{formatBytes(existingAppDoc.fileSize)}</p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <a
                        href={`/api/customers/${initialCustomer.id}/documents/application-form?download=true`}
                        className="inline-flex items-center px-2 py-1 text-xs border border-slate-300 rounded hover:bg-slate-50 text-slate-700"
                        target="_blank"
                        rel="noreferrer"
                      >
                        <Download className="h-3.5 w-3.5 mr-1" />
                        Download
                      </a>
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
                        onClick={handleRemoveExistingAppDoc}
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
                    {removeExistingAppDoc ? "Select New Form" : "Upload Application Form"}
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
            <CardDescription>Designated legal beneficiary and guarantor surety</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Nominee Full Name"
                required
                value={formData.nomineeName}
                onChange={(e) => setFormData({ ...formData, nomineeName: e.target.value })}
              />

              <Input
                label="Guarantor Full Name"
                required
                value={formData.guarantorName}
                onChange={(e) => setFormData({ ...formData, guarantorName: e.target.value })}
              />
            </div>
          </CardContent>
        </Card>

        {/* Section 5: PERSONAL AND FAMILY DETAILS */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4 text-emerald-600" />
              Personal & Family Details
            </CardTitle>
            <CardDescription>Demographics and family size</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Select
                label="Marital Status"
                value={formData.maritalStatus}
                onChange={(e) => setFormData({ ...formData, maritalStatus: e.target.value })}
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
              />
            </div>
          </CardContent>
        </Card>

        {/* Section 6: OCCUPATION AND FINANCIAL DETAILS */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <IndianRupee className="h-4 w-4 text-emerald-600" />
              Occupation & Financial Details
            </CardTitle>
            <CardDescription>Livelihood, education, and household earnings</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Primary Occupation"
                value={formData.primaryOccupation}
                onChange={(e) => setFormData({ ...formData, primaryOccupation: e.target.value })}
              />

              <Input
                label="Annual Income (₹)"
                type="number"
                min="0"
                step="5000"
                value={formData.annualIncome}
                onChange={(e) => setFormData({ ...formData, annualIncome: e.target.value })}
              />

              <Select
                label="Community / Religion"
                value={formData.communityId}
                onChange={(e) => setFormData({ ...formData, communityId: e.target.value })}
                disabled={fetchingCatalogs}
              >
                <option value="">-- Select Community / Religion --</option>
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
              >
                <option value="">-- Select Education Level --</option>
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
          <Link href={`/customers/${initialCustomer.id}`}>
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
            {loading ? "Saving Changes..." : "Save Changes"}
          </Button>
        </div>
      </form>
    </div>
  );
}
