import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/permissions/auth-guard";
import { getCustomers } from "@/modules/customers/customer-service";
import { handleApiError } from "@/lib/errors/api-response";

function escapeCsvCell(val: unknown): string {
  if (val === null || val === undefined) return '""';
  let str = String(val);
  // Neutralize formula injection risk
  if (/^[=+\-@\t\r]/.test(str)) {
    str = "'" + str;
  }
  return `"${str.replace(/"/g, '""')}"`;
}

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { error: { code: "UNAUTHORIZED", message: "Authentication required" } },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search") || undefined;
    const branchId = searchParams.get("branchId") || undefined;
    const status = searchParams.get("status") || undefined;
    const kycStatus = searchParams.get("kycStatus") || undefined;

    // Fetch matching customers up to 500
    const result = await getCustomers(user, {
      search,
      branchId,
      status,
      kycStatus,
      page: 1,
      pageSize: 500,
    });

    const headers = [
      "Member ID",
      "Member Name",
      "Guardian / Spouse",
      "Contact Phone",
      "Email",
      "Branch",
      "Center / Group",
      "Aadhaar Number",
      "PAN Number",
      "KYC Status",
      "Occupation",
      "Status",
      "Gender",
      "Date of Birth",
      "Nominee Name",
      "Guarantor Name",
      "Residential Address",
      "Marital Status",
      "Family Members",
      "Primary Occupation",
      "Community / Religion",
      "Education / Literacy",
      "Annual Income (₹)",
      "Registration Date",
    ];

    const rows = result.items.map((c: any) => {
      const assignedGroup = c.group?.name || c.customerGroups[0]?.group?.name || "Unassigned";
      const branchName = c.branch?.name || "Main Branch";
      const kyc = c.aadhaarNumber ? "VERIFIED" : "PENDING";
      const dob = c.dateOfBirth ? new Date(c.dateOfBirth).toISOString().split("T")[0] : "";
      const regDate = new Date(c.createdAt).toISOString().split("T")[0];
      const communityName = c.community?.name || "";
      const educationName = c.education?.name || "";
      const annualIncomeStr = c.annualIncome ? String(c.annualIncome) : "";

      return [
        escapeCsvCell(c.customerCode),
        escapeCsvCell(c.fullName),
        escapeCsvCell(c.guardianName || ""),
        escapeCsvCell(c.phone),
        escapeCsvCell(c.email || ""),
        escapeCsvCell(branchName),
        escapeCsvCell(assignedGroup),
        escapeCsvCell(c.aadhaarNumber || ""),
        escapeCsvCell(c.panNumber || ""),
        escapeCsvCell(kyc),
        escapeCsvCell(c.occupation || ""),
        escapeCsvCell(c.status),
        escapeCsvCell(c.gender || ""),
        escapeCsvCell(dob),
        escapeCsvCell(c.nomineeName || ""),
        escapeCsvCell(c.guarantorName || ""),
        escapeCsvCell(c.residentialAddress || ""),
        escapeCsvCell(c.maritalStatus || ""),
        escapeCsvCell(c.familyMembers ?? ""),
        escapeCsvCell(c.primaryOccupation || c.occupation || ""),
        escapeCsvCell(communityName),
        escapeCsvCell(educationName),
        escapeCsvCell(annualIncomeStr),
        escapeCsvCell(regDate),
      ].join(",");
    });

    const csvContent = [headers.map((h) => `"${h}"`).join(","), ...rows].join("\r\n");

    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="customers_export_${new Date().toISOString().split("T")[0]}.csv"`,
      },
    });
  } catch (err: unknown) {
    return handleApiError(err, "Failed to export customers");
  }
}
