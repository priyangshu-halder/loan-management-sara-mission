import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";
import * as authGuard from "@/lib/permissions/auth-guard";
import * as customerService from "@/modules/customers/customer-service";

describe("Customers CSV Export API (/api/customers/export)", () => {
  const mockUser = {
    userId: "user-uuid-1",
    organizationId: "11111111-1111-1111-1111-111111111111",
    organizationCode: "RAYHAN-MFI",
    username: "admin",
    email: "admin@rayhan.org",
    fullName: "System Admin",
    roles: ["ORG_ADMIN"],
    permissions: new Set(["loan.application.create"]),
    scopeType: "ORGANIZATION" as const,
    branchId: null,
    isSuperAdmin: false,
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    vi.spyOn(authGuard, "getCurrentUser").mockResolvedValue(null);

    const req = new NextRequest("http://localhost:3000/api/customers/export");
    const res = await GET(req);

    expect(res.status).toBe(401);
  });

  it("returns CSV formatted output with proper headers and neutralizes formula injection", async () => {
    vi.spyOn(authGuard, "getCurrentUser").mockResolvedValue(mockUser as any);
    vi.spyOn(customerService, "getCustomers").mockResolvedValue({
      items: [
        {
          id: "cust-1",
          customerCode: "=MALICIOUS_FORMULA",
          fullName: "MITHU MONDAL",
          guardianName: "MITHU",
          phone: "1234567890",
          email: "mithu@example.com",
          branch: { name: "Kolkata Head Office" },
          customerGroups: [{ group: { name: "Bidhannagar Mahila Center" } }],
          aadhaarNumber: "123456789012",
          panNumber: "ABCDE1234F",
          occupation: "TEXTILE SHOP",
          status: "ACTIVE",
          gender: "FEMALE",
          dateOfBirth: new Date("1990-01-01"),
          nomineeName: "Subhas",
          guarantorName: "Tapan",
          residentialAddress: "Kolkata, WB",
          maritalStatus: "MARRIED",
          familyMembers: 4,
          primaryOccupation: "Textile Crafts",
          community: { name: "Hindu" },
          education: { name: "Secondary / 10th Pass" },
          annualIncome: "300000.00",
          createdAt: new Date("2026-01-01"),
        },
      ],
      pagination: { page: 1, pageSize: 500, totalItems: 1, totalPages: 1 },
    } as any);

    const req = new NextRequest("http://localhost:3000/api/customers/export");
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/csv");
    expect(res.headers.get("Content-Disposition")).toContain("customers_export_");

    const text = await res.text();
    expect(text).toContain('"Member ID"');
    expect(text).toContain('"Member Name"');
    expect(text).toContain('"MITHU MONDAL"');
    expect(text).toContain('"TEXTILE SHOP"');
    expect(text).not.toContain('"Bank Account"');
    expect(text).not.toContain('"IFSC Code"');
    expect(text).toContain('"Hindu"');
    expect(text).toContain('"Secondary / 10th Pass"');
    // Notice formula injection check: prepended single quote before '='
    expect(text).toContain("\"'=MALICIOUS_FORMULA\"");
  });
});
