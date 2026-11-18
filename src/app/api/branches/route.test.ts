import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";
import * as authGuard from "@/lib/permissions/auth-guard";
import * as customerService from "@/modules/customers/customer-service";

describe("Branches API (/api/branches)", () => {
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

    const req = new NextRequest("http://localhost:3000/api/branches");
    const res = await GET(req);

    expect(res.status).toBe(401);
  });

  it("returns active branches for authenticated organization", async () => {
    vi.spyOn(authGuard, "getCurrentUser").mockResolvedValue(mockUser as any);
    vi.spyOn(customerService, "getBranches").mockResolvedValue([
      { id: "br-1", code: "HO-001", name: "Kolkata Head Office", status: "ACTIVE" } as any,
    ]);

    const req = new NextRequest("http://localhost:3000/api/branches");
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.branches).toHaveLength(1);
    expect(body.branches[0].name).toBe("Kolkata Head Office");
  });
});
