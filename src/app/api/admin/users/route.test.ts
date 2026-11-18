import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET, POST } from "./route";
import * as authGuard from "@/lib/permissions/auth-guard";
import * as userService from "@/modules/identity/user-service";
import { prisma } from "@/lib/db/prisma";
import { ConflictError, ForbiddenError } from "@/lib/errors/app-error";

describe("Admin Users API (/api/admin/users)", () => {
  const mockAdminUser = {
    userId: "admin-user-id",
    organizationId: "11111111-1111-1111-1111-111111111111",
    organizationCode: "RAYHAN-MFI",
    username: "admin",
    email: "admin@rayhan.org",
    fullName: "System Admin",
    roles: ["ORG_ADMIN"],
    permissions: new Set(["user.manage"]),
    scopeType: "ORGANIZATION" as const,
    branchId: null,
    isSuperAdmin: false,
  };

  const mockNonAdminUser = {
    ...mockAdminUser,
    roles: ["LOAN_OFFICER"],
    permissions: new Set(["loans.read"]),
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 401 when unauthenticated on GET", async () => {
    vi.spyOn(authGuard, "getCurrentUser").mockResolvedValue(null);

    const req = new NextRequest("http://localhost:3000/api/admin/users");
    const res = await GET(req);

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  it("returns 403 when user lacks user.manage on GET", async () => {
    vi.spyOn(authGuard, "getCurrentUser").mockResolvedValue(mockNonAdminUser as any);

    const req = new NextRequest("http://localhost:3000/api/admin/users");
    const res = await GET(req);

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe("FORBIDDEN");
  });

  it("returns 200 with sanitized users on GET for authorized admin", async () => {
    vi.spyOn(authGuard, "getCurrentUser").mockResolvedValue(mockAdminUser as any);
    vi.spyOn(prisma.user, "findMany").mockResolvedValue([
      {
        id: "u-1",
        organizationId: "org-uuid-1",
        username: "jdoe",
        email: "jdoe@rayhan.org",
        fullName: "John Doe",
        status: "ACTIVE",
        createdAt: new Date("2026-01-01"),
        userRoles: [{ role: { id: "r-1", code: "LOAN_OFFICER", name: "Loan Officer" } }],
        userScopes: [{ id: "s-1", scopeType: "BRANCH", branchId: "b-1", branch: { name: "North Branch" } }],
      },
    ] as any);

    const req = new NextRequest("http://localhost:3000/api/admin/users");
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.users).toHaveLength(1);
    expect(body.users[0].username).toBe("jdoe");
    expect(body.users[0].roles[0].code).toBe("LOAN_OFFICER");
  });

  it("returns 400 on POST when validation fails", async () => {
    vi.spyOn(authGuard, "getCurrentUser").mockResolvedValue(mockAdminUser as any);

    const req = new NextRequest("http://localhost:3000/api/admin/users", {
      method: "POST",
      body: JSON.stringify({
        fullName: "A", // too short (< 2)
        username: "bad user name with spaces",
        email: "not-an-email",
        password: "123", // too short (< 8)
        roleCodes: [], // empty
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 409 Conflict when username or email already exists", async () => {
    vi.spyOn(authGuard, "getCurrentUser").mockResolvedValue(mockAdminUser as any);
    vi.spyOn(userService, "createUser").mockRejectedValue(
      new ConflictError('Username "existing_user" is already in use in this organization')
    );

    const req = new NextRequest("http://localhost:3000/api/admin/users", {
      method: "POST",
      body: JSON.stringify({
        fullName: "Existing User",
        username: "existing_user",
        email: "existing@rayhan.org",
        password: "Password@123",
        roleCodes: ["LOAN_OFFICER"],
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.code).toBe("CONFLICT");
    expect(body.error.message).toContain("already in use");
  });

  it("creates user and returns 201 when valid payload submitted", async () => {
    vi.spyOn(authGuard, "getCurrentUser").mockResolvedValue(mockAdminUser as any);
    vi.spyOn(userService, "createUser").mockResolvedValue({
      id: "new-user-1",
      organizationId: "org-uuid-1",
      username: "newstaff",
      email: "newstaff@rayhan.org",
      fullName: "New Staff Member",
      status: "ACTIVE",
    } as any);

    const req = new NextRequest("http://localhost:3000/api/admin/users", {
      method: "POST",
      body: JSON.stringify({
        fullName: "New Staff Member",
        username: "newstaff",
        email: "newstaff@rayhan.org",
        password: "SecurePassword123!",
        roleCodes: ["LOAN_OFFICER"],
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.user.username).toBe("newstaff");
  });
});
