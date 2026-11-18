import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET, PUT, DELETE } from "./route";
import * as authGuard from "@/lib/permissions/auth-guard";
import * as schemeService from "@/modules/loans/loan-scheme-service";
import { ConflictError, NotFoundError } from "@/lib/errors/app-error";

describe("Loan Scheme By ID API (/api/loans/schemes/[id])", () => {
  const mockUser = {
    userId: "user-uuid-1",
    organizationId: "11111111-1111-1111-1111-111111111111",
    organizationCode: "RAYHAN-MFI",
    username: "admin",
    email: "admin@rayhan.org",
    fullName: "System Admin",
    roles: ["ORG_ADMIN"],
    permissions: new Set(["loan.scheme.read", "loan.scheme.manage"]),
    scopeType: "ORGANIZATION" as const,
    branchId: null,
    isSuperAdmin: false,
  };

  const schemeId = "scheme-uuid-101";

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 401 when unauthenticated on GET", async () => {
    vi.spyOn(authGuard, "getCurrentUser").mockResolvedValue(null);

    const req = new NextRequest(`http://localhost:3000/api/loans/schemes/${schemeId}`);
    const res = await GET(req, { params: { id: schemeId } });

    expect(res.status).toBe(401);
  });

  it("returns scheme on GET when authenticated", async () => {
    vi.spyOn(authGuard, "getCurrentUser").mockResolvedValue(mockUser as any);
    vi.spyOn(schemeService, "getLoanSchemeById").mockResolvedValue({
      id: schemeId,
      code: "MSME-01",
      name: "MSME Micro Loan",
      versions: [],
    } as any);

    const req = new NextRequest(`http://localhost:3000/api/loans/schemes/${schemeId}`);
    const res = await GET(req, { params: { id: schemeId } });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.scheme.id).toBe(schemeId);
  });

  it("returns 404 on GET when scheme is not found", async () => {
    vi.spyOn(authGuard, "getCurrentUser").mockResolvedValue(mockUser as any);
    vi.spyOn(schemeService, "getLoanSchemeById").mockRejectedValue(new NotFoundError("LoanScheme", schemeId));

    const req = new NextRequest(`http://localhost:3000/api/loans/schemes/${schemeId}`);
    const res = await GET(req, { params: { id: schemeId } });

    expect(res.status).toBe(404);
  });

  it("updates loan scheme on PUT when authenticated", async () => {
    vi.spyOn(authGuard, "getCurrentUser").mockResolvedValue(mockUser as any);
    const updateSpy = vi.spyOn(schemeService, "updateLoanScheme").mockResolvedValue({
      id: schemeId,
      code: "MSME-01",
      name: "Updated MSME Loan",
      status: "PUBLISHED",
      versions: [],
    } as any);

    const updatePayload = {
      name: "Updated MSME Loan",
      interestRate: "14.5000",
      termMonths: 24,
    };

    const req = new NextRequest(`http://localhost:3000/api/loans/schemes/${schemeId}`, {
      method: "PUT",
      body: JSON.stringify(updatePayload),
    });
    const res = await PUT(req, { params: { id: schemeId } });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(updateSpy).toHaveBeenCalledWith(
      mockUser,
      expect.objectContaining({
        schemeId,
        organizationId: mockUser.organizationId,
        name: "Updated MSME Loan",
        interestRate: "14.5000",
        termMonths: 24,
      })
    );
  });

  it("deletes loan scheme on DELETE when unlinked", async () => {
    vi.spyOn(authGuard, "getCurrentUser").mockResolvedValue(mockUser as any);
    const deleteSpy = vi.spyOn(schemeService, "deleteLoanScheme").mockResolvedValue({
      success: true,
      deletedSchemeId: schemeId,
    });

    const req = new NextRequest(`http://localhost:3000/api/loans/schemes/${schemeId}`, {
      method: "DELETE",
    });
    const res = await DELETE(req, { params: { id: schemeId } });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(deleteSpy).toHaveBeenCalledWith(mockUser, schemeId);
  });

  it("returns 409 conflict when scheme cannot be deleted due to existing loans", async () => {
    vi.spyOn(authGuard, "getCurrentUser").mockResolvedValue(mockUser as any);
    vi.spyOn(schemeService, "deleteLoanScheme").mockRejectedValue(
      new ConflictError("Cannot delete loan scheme linked to existing accounts")
    );

    const req = new NextRequest(`http://localhost:3000/api/loans/schemes/${schemeId}`, {
      method: "DELETE",
    });
    const res = await DELETE(req, { params: { id: schemeId } });

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.code).toBe("CONFLICT");
  });
});
