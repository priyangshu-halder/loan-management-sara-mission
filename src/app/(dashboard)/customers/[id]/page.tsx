import React from "react";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/permissions/auth-guard";
import { getCustomerById } from "@/modules/customers/customer-service";
import {
  ArrowLeft,
  Edit,
  User,
  ShieldCheck,
  Landmark,
  FileText,
  Users,
  CreditCard,
  Building,
  CheckCircle2,
  Clock,
  AlertCircle,
  Calendar,
  Phone,
  Mail,
  Home,
  Briefcase,
  IndianRupee,
  GraduationCap,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";

interface Props {
  params: { id: string } | Promise<{ id: string }>;
}

export default async function CustomerDetailPage({ params }: Props) {
  const user = await getCurrentUser();
  if (!user) return null;

  const { id } = await Promise.resolve(params);

  let customer;
  try {
    customer = await getCustomerById(user, id);
  } catch {
    notFound();
  }

  const primaryGroup = customer.group || customer.customerGroups?.[0]?.group;
  const isKycVerified = Boolean(customer.aadhaarNumber);
  const applicationFormDoc = customer.documents?.find(
    (d: { documentType: string }) => d.documentType === "APPLICATION_FORM"
  );

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-12">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href="/customers">
            <Button variant="outline" size="sm">
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back to Customers
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight text-slate-900">
                {customer.fullName}
              </h1>
              <Badge variant="neutral" className="font-mono text-xs">
                {customer.customerCode}
              </Badge>
              <Badge
                variant={customer.status === "ACTIVE" ? "success" : "neutral"}
                className="text-xs"
              >
                {customer.status}
              </Badge>
            </div>
            <p className="text-xs text-slate-500">
              Registered on {new Date(customer.createdAt).toLocaleDateString("en-IN")}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link href={`/customers/${customer.id}/edit`}>
            <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold">
              <Edit className="h-3.5 w-3.5 mr-1.5" />
              Edit Profile
            </Button>
          </Link>
        </div>
      </div>

      {/* Grid: 2 Columns */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Card 1: Personal & KYC Identification */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <User className="h-4 w-4 text-emerald-600" />
              Profile & Contact Information
            </CardTitle>
            <CardDescription>Primary borrower identity and contact points</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3.5 text-xs">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase block">Guardian / Spouse</span>
                <span className="font-semibold text-slate-800">{customer.guardianName || "N/A"}</span>
              </div>
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase block">Contact Phone</span>
                <span className="font-semibold text-slate-800 font-mono flex items-center gap-1">
                  <Phone className="h-3 w-3 text-slate-400" />
                  {customer.phone}
                </span>
              </div>
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase block">Email</span>
                <span className="font-semibold text-slate-800">{customer.email || "Not Provided"}</span>
              </div>
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase block">Gender / DOB</span>
                <span className="font-semibold text-slate-800">
                  {customer.gender || "N/A"}{" "}
                  {customer.dateOfBirth
                    ? `• ${new Date(customer.dateOfBirth).toLocaleDateString("en-IN")}`
                    : ""}
                </span>
              </div>
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase block">Aadhaar (UID)</span>
                <span className="font-semibold text-slate-800 font-mono">
                  {customer.aadhaarNumber ? customer.aadhaarNumber : "Pending"}
                </span>
              </div>
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase block">PAN Number</span>
                <span className="font-semibold text-slate-800 font-mono">
                  {customer.panNumber || "NOT PROVIDED"}
                </span>
              </div>
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase block">Center / Group</span>
                <span className="font-semibold text-slate-800">
                  {primaryGroup ? `${primaryGroup.code} - ${primaryGroup.name}` : "Assigned Group"}
                </span>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-100">
              <span className="text-[10px] font-bold text-slate-400 uppercase block">Residential Address</span>
              <p className="font-medium text-slate-700 mt-0.5">
                {customer.residentialAddress || "No physical address specified"}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Card 2: Application Form & Onboarding Dossier */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="h-4 w-4 text-emerald-600" />
              Application Form & Verification
            </CardTitle>
            <CardDescription>Customer onboarding document and compliance dossier</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-xs">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase block">Application Form</span>
                <span className="font-semibold text-slate-800">
                  {applicationFormDoc ? applicationFormDoc.fileName : "Not Provided"}
                </span>
              </div>
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase block">File Size</span>
                <span className="font-semibold text-slate-800 font-mono">
                  {applicationFormDoc ? `${Math.round(applicationFormDoc.fileSize / 1024)} KB` : "N/A"}
                </span>
              </div>
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase block">Uploaded Date</span>
                <span className="font-semibold text-slate-800">
                  {applicationFormDoc
                    ? new Date(applicationFormDoc.createdAt).toLocaleDateString("en-IN")
                    : "N/A"}
                </span>
              </div>
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase block">KYC Verification</span>
                {isKycVerified ? (
                  <Badge variant="success" className="text-xs">
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    Verified
                  </Badge>
                ) : (
                  <Badge variant="warning" className="text-xs">
                    <Clock className="h-3 w-3 mr-1" />
                    Pending
                  </Badge>
                )}
              </div>
            </div>

            {applicationFormDoc ? (
              <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                <div>
                  <span className="text-xs font-semibold text-slate-800 block">Signed Application Form</span>
                  <span className="text-[11px] text-slate-400">Stored physical onboarding document copy</span>
                </div>
                <a
                  href={`/api/customers/${customer.id}/documents/application-form?download=true`}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 shadow-sm transition-colors"
                  target="_blank"
                  rel="noreferrer"
                >
                  <FileText className="h-3.5 w-3.5" /> Download Application Form
                </a>
              </div>
            ) : (
              <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                <span className="text-xs text-slate-500 italic">No application form document attached.</span>
                <Link href={`/customers/${customer.id}/edit`}>
                  <Button variant="outline" size="sm" className="text-xs">
                    Upload Form
                  </Button>
                </Link>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Card 3: Personal & Family Details */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4 text-emerald-600" />
              Personal & Family Details
            </CardTitle>
            <CardDescription>Household demographics and family size</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-xs">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase block">Marital Status</span>
                <span className="font-semibold text-slate-800">{customer.maritalStatus || "Not Specified"}</span>
              </div>
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase block">Family Members</span>
                <span className="font-semibold text-slate-800">
                  {customer.familyMembers !== null && customer.familyMembers !== undefined
                    ? `${customer.familyMembers} members`
                    : "Not Specified"}
                </span>
              </div>
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase block">Nominee Full Name</span>
                <span className="font-semibold text-slate-800">{customer.nomineeName || "N/A"}</span>
              </div>
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase block">Guarantor Name</span>
                <span className="font-semibold text-slate-800">{customer.guarantorName || "N/A"}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Card 4: Occupation & Financial Details */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <IndianRupee className="h-4 w-4 text-emerald-600" />
              Occupation & Financial Details
            </CardTitle>
            <CardDescription>Livelihood, education, and household earnings</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-xs">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase block">Primary Occupation</span>
                <span className="font-semibold text-slate-800 uppercase">
                  {customer.primaryOccupation || customer.occupation || "N/A"}
                </span>
              </div>
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase block">Annual Income (₹)</span>
                <span className="font-semibold text-emerald-700 font-mono text-sm">
                  {customer.annualIncome
                    ? `₹${parseFloat(String(customer.annualIncome)).toLocaleString("en-IN")}`
                    : "Not Specified"}
                </span>
              </div>
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase block">Community / Religion</span>
                <span className="font-semibold text-slate-800">
                  {customer.community?.name || "Not Specified"}
                </span>
              </div>
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase block">Education / Literacy</span>
                <span className="font-semibold text-slate-800">
                  {customer.education?.name || "Not Specified"}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* KYC Document Gallery */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4 text-emerald-600" />
            Uploaded Compliance Documents
          </CardTitle>
          <CardDescription>Dossier documents verified for KYC statutory compliance</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {/* Passport Photo */}
            <div className="border border-slate-200 rounded-lg p-3 text-center bg-slate-50">
              <span className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Passport Photo</span>
              {customer.passportPhoto ? (
                <a
                  href={`/api/customers/${customer.id}/documents/passport`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-emerald-600 font-bold hover:underline"
                >
                  View Photo
                </a>
              ) : (
                <span className="text-[11px] text-slate-400">Not Uploaded</span>
              )}
            </div>

            {/* Aadhaar Front */}
            <div className="border border-slate-200 rounded-lg p-3 text-center bg-slate-50">
              <span className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Aadhaar (Front)</span>
              {customer.aadhaarFrontDoc ? (
                <a
                  href={`/api/customers/${customer.id}/documents/aadhaar-front`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-emerald-600 font-bold hover:underline"
                >
                  View Front
                </a>
              ) : (
                <span className="text-[11px] text-slate-400">Not Uploaded</span>
              )}
            </div>

            {/* Aadhaar Back */}
            <div className="border border-slate-200 rounded-lg p-3 text-center bg-slate-50">
              <span className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Aadhaar (Back)</span>
              {customer.aadhaarBackDoc ? (
                <a
                  href={`/api/customers/${customer.id}/documents/aadhaar-back`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-emerald-600 font-bold hover:underline"
                >
                  View Back
                </a>
              ) : (
                <span className="text-[11px] text-slate-400">Not Uploaded</span>
              )}
            </div>

            {/* PAN Card */}
            <div className="border border-slate-200 rounded-lg p-3 text-center bg-slate-50">
              <span className="text-[10px] font-bold text-slate-500 uppercase block mb-1">PAN Document</span>
              {customer.panPhoto ? (
                <a
                  href={`/api/customers/${customer.id}/documents/pan`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-emerald-600 font-bold hover:underline"
                >
                  View PAN
                </a>
              ) : (
                <span className="text-[11px] text-slate-400">Not Uploaded</span>
              )}
            </div>

            {/* Application Form */}
            <div className="border border-slate-200 rounded-lg p-3 text-center bg-slate-50">
              <span className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Application Form</span>
              {applicationFormDoc ? (
                <a
                  href={`/api/customers/${customer.id}/documents/application-form?download=true`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-emerald-600 font-bold hover:underline"
                >
                  Download Form
                </a>
              ) : (
                <span className="text-[11px] text-slate-400">Not Uploaded</span>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
