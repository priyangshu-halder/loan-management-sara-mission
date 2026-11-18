import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET, POST } from "./route";
import * as authGuard from "@/lib/permissions/auth-guard";
import * as catalogService from "@/modules/master-data/catalog-service";

describe("Master Catalogs API (/api/master-catalogs)", () => {
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

    const req = new NextRequest("http://localhost:3000/api/master-catalogs?category=COMMUNITY_RELIGION");
    const res = await GET(req);

    expect(res.status).toBe(401);
  });

  it("returns 400 when category parameter is missing on GET", async () => {
    vi.spyOn(authGuard, "getCurrentUser").mockResolvedValue(mockUser as any);

    const req = new NextRequest("http://localhost:3000/api/master-catalogs");
    const res = await GET(req);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.message).toContain("category");
  });

  it("returns catalog items on GET when authenticated", async () => {
    vi.spyOn(authGuard, "getCurrentUser").mockResolvedValue(mockUser as any);
    vi.spyOn(catalogService, "getMasterCatalogItems").mockResolvedValue([
      {
        id: "cat-1",
        organizationId: mockUser.organizationId,
        category: "COMMUNITY_RELIGION",
        code: "HINDU",
        name: "Hindu",
        description: null,
        sortOrder: 1,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    const req = new NextRequest("http://localhost:3000/api/master-catalogs?category=COMMUNITY_RELIGION");
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items).toHaveLength(1);
    expect(body.items[0].code).toBe("HINDU");
  });

  it("creates a new catalog item on POST when authenticated", async () => {
    vi.spyOn(authGuard, "getCurrentUser").mockResolvedValue(mockUser as any);
    vi.spyOn(catalogService, "createMasterCatalogItem").mockResolvedValue({
      id: "cat-2",
      organizationId: mockUser.organizationId,
      category: "COMMUNITY_RELIGION",
      code: "CUSTOM_COMMUNITY",
      name: "Custom Community",
      description: null,
      sortOrder: 10,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const req = new NextRequest("http://localhost:3000/api/master-catalogs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        category: "COMMUNITY_RELIGION",
        code: "CUSTOM_COMMUNITY",
        name: "Custom Community",
        sortOrder: 10,
      }),
    });
    const res = await POST(req);

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.item.code).toBe("CUSTOM_COMMUNITY");
  });
});
