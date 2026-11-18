import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET, PATCH } from "./route";
import * as authGuard from "@/lib/permissions/auth-guard";
import * as customerService from "@/modules/customers/customer-service";

describe("Single Customer API (/api/customers/[id])", () => {
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

  it("returns 401 when unauthenticated on GET", async () => {
    vi.spyOn(authGuard, "getCurrentUser").mockResolvedValue(null);

    const req = new NextRequest("http://localhost:3000/api/customers/cust-123");
    const res = await GET(req, { params: { id: "cust-123" } });

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  it("returns customer details on GET when authenticated", async () => {
    vi.spyOn(authGuard, "getCurrentUser").mockResolvedValue(mockUser as any);
    vi.spyOn(customerService, "getCustomerById").mockResolvedValue({
      id: "cust-123",
      fullName: "MITHU MONDAL",
      customerCode: "CUST-HO-001-260004",
      aadhaarNumber: "123456789012",
    } as any);

    const req = new NextRequest("http://localhost:3000/api/customers/cust-123");
    const res = await GET(req, { params: { id: "cust-123" } });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.customer.fullName).toBe("MITHU MONDAL");
    expect(body.customer.customerCode).toBe("CUST-HO-001-260004");
  });

  it("updates customer on PATCH when authenticated", async () => {
    vi.spyOn(authGuard, "getCurrentUser").mockResolvedValue(mockUser as any);
    vi.spyOn(customerService, "updateCustomer").mockResolvedValue({
      id: "cust-123",
      fullName: "MITHU MONDAL",
      aadhaarNumber: "123456789012",
      occupation: "TEXTILE SHOP",
    } as any);

    const req = new NextRequest("http://localhost:3000/api/customers/cust-123", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ occupation: "TEXTILE SHOP" }),
    });
    const res = await PATCH(req, { params: { id: "cust-123" } });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.customer.occupation).toBe("TEXTILE SHOP");
  });

  it("updates extended customer profile, group, and family fields on PATCH", async () => {
    vi.spyOn(authGuard, "getCurrentUser").mockResolvedValue(mockUser as any);
    vi.spyOn(customerService, "updateCustomer").mockResolvedValue({
      id: "cust-123",
      fullName: "MITHU MONDAL",
      groupId: "00000000-0000-0000-0000-000000000001",
      maritalStatus: "MARRIED",
      familyMembers: 3,
      primaryOccupation: "HANDICRAFTS",
      annualIncome: "360000.00",
    } as any);

    const req = new NextRequest("http://localhost:3000/api/customers/cust-123", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        groupId: "00000000-0000-0000-0000-000000000001",
        maritalStatus: "MARRIED",
        familyMembers: 3,
        primaryOccupation: "HANDICRAFTS",
        annualIncome: "360000.00",
      }),
    });
    const res = await PATCH(req, { params: { id: "cust-123" } });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.customer.primaryOccupation).toBe("HANDICRAFTS");
    expect(body.customer.maritalStatus).toBe("MARRIED");
    expect(body.customer.familyMembers).toBe(3);
  });
});
