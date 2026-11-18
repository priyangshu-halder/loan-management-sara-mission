import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { PATCH, DELETE } from "./route";
import * as authGuard from "@/lib/permissions/auth-guard";
import * as catalogService from "@/modules/master-data/catalog-service";

describe("Single Master Catalog API (/api/master-catalogs/[id])", () => {
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

  it("returns 401 when unauthenticated on PATCH", async () => {
    vi.spyOn(authGuard, "getCurrentUser").mockResolvedValue(null);

    const req = new NextRequest("http://localhost:3000/api/master-catalogs/cat-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Updated Name" }),
    });
    const res = await PATCH(req, { params: { id: "cat-1" } });

    expect(res.status).toBe(401);
  });

  it("updates catalog item on PATCH when authenticated", async () => {
    vi.spyOn(authGuard, "getCurrentUser").mockResolvedValue(mockUser as any);
    vi.spyOn(catalogService, "updateMasterCatalogItem").mockResolvedValue({
      id: "cat-1",
      organizationId: mockUser.organizationId,
      category: "COMMUNITY_RELIGION",
      code: "HINDU",
      name: "Updated Hindu",
      description: null,
      sortOrder: 1,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const req = new NextRequest("http://localhost:3000/api/master-catalogs/cat-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Updated Hindu" }),
    });
    const res = await PATCH(req, { params: { id: "cat-1" } });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.item.name).toBe("Updated Hindu");
  });

  it("deletes catalog item on DELETE when authenticated", async () => {
    vi.spyOn(authGuard, "getCurrentUser").mockResolvedValue(mockUser as any);
    vi.spyOn(catalogService, "deleteMasterCatalogItem").mockResolvedValue({
      id: "cat-1",
      organizationId: mockUser.organizationId,
      category: "COMMUNITY_RELIGION",
      code: "HINDU",
      name: "Hindu",
      description: null,
      sortOrder: 1,
      isActive: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const req = new NextRequest("http://localhost:3000/api/master-catalogs/cat-1", {
      method: "DELETE",
    });
    const res = await DELETE(req, { params: { id: "cat-1" } });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });
});
