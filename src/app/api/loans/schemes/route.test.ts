import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET, POST } from "./route";
import * as authGuard from "@/lib/permissions/auth-guard";
import * as schemeService from "@/modules/loans/loan-scheme-service";
import { ValidationError } from "@/lib/errors/app-error";

describe("Loan Schemes API (/api/loans/schemes)", () => {
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

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 401 when unauthenticated on GET", async () => {
    vi.spyOn(authGuard, "getCurrentUser").mockResolvedValue(null);

    const req = new NextRequest("http://localhost:3000/api/loans/schemes");
    const res = await GET(req);

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  it("returns schemes on GET when authenticated", async () => {
    vi.spyOn(authGuard, "getCurrentUser").mockResolvedValue(mockUser as any);
    vi.spyOn(schemeService, "getLoanSchemes").mockResolvedValue([
      { id: "scheme-1", code: "SCH-01", name: "Agri Crop Loan" } as any,
    ]);

    const req = new NextRequest("http://localhost:3000/api/loans/schemes");
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.schemes).toHaveLength(1);
    expect(body.schemes[0].code).toBe("SCH-01");
  });

  it("returns 401 when unauthenticated on POST", async () => {
    vi.spyOn(authGuard, "getCurrentUser").mockResolvedValue(null);

    const req = new NextRequest("http://localhost:3000/api/loans/schemes", {
      method: "POST",
      body: JSON.stringify({ code: "TEST" }),
    });
    const res = await POST(req);

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  it("creates a loan scheme with flat payload from form submission", async () => {
    vi.spyOn(authGuard, "getCurrentUser").mockResolvedValue(mockUser as any);
    const createSpy = vi.spyOn(schemeService, "createLoanScheme").mockResolvedValue({
      id: "scheme-123",
      code: "AGRI-CROP-01",
      name: "Agricultural Crop Loan",
      status: "PUBLISHED",
      versions: [],
    } as any);

    const payload = {
      code: "AGRI-CROP-01",
      name: "Agricultural Crop Loan",
      minPrincipal: "10000",
      maxPrincipal: "100000",
      termMonths: 12,
      interestRate: "12.0000",
      interestMethod: "REDUCING_BALANCE",
      repaymentFrequency: "MONTHLY",
      gracePeriodDays: 0,
      status: "PUBLISHED",
    };

    const req = new NextRequest("http://localhost:3000/api/loans/schemes", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    const res = await POST(req);

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.scheme.code).toBe("AGRI-CROP-01");
    expect(createSpy).toHaveBeenCalledWith(
      mockUser,
      expect.objectContaining({
        ...payload,
        organizationId: mockUser.organizationId,
      })
    );
  });

  it("creates a loan scheme with nested version payload for backward compatibility", async () => {
    vi.spyOn(authGuard, "getCurrentUser").mockResolvedValue(mockUser as any);
    const createSpy = vi.spyOn(schemeService, "createLoanScheme").mockResolvedValue({
      id: "scheme-456",
      code: "AGRI-CROP-02",
      name: "Agricultural Crop Loan v2",
      status: "DRAFT",
      versions: [],
    } as any);

    const nestedPayload = {
      code: "AGRI-CROP-02",
      name: "Agricultural Crop Loan v2",
      version: {
        minPrincipal: "10000",
        maxPrincipal: "100000",
        termMonths: 12,
        interestRate: "12.0000",
        interestMethod: "REDUCING_BALANCE",
        repaymentFrequency: "MONTHLY",
        gracePeriodDays: 0,
      },
    };

    const req = new NextRequest("http://localhost:3000/api/loans/schemes", {
      method: "POST",
      body: JSON.stringify(nestedPayload),
    });
    const res = await POST(req);

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(createSpy).toHaveBeenCalledWith(
      mockUser,
      expect.objectContaining({
        code: "AGRI-CROP-02",
        name: "Agricultural Crop Loan v2",
        minPrincipal: "10000",
        maxPrincipal: "100000",
        termMonths: 12,
        interestRate: "12.0000",
        interestMethod: "REDUCING_BALANCE",
        repaymentFrequency: "MONTHLY",
        gracePeriodDays: 0,
        organizationId: mockUser.organizationId,
      })
    );
  });

  it("returns 422 when validation error is thrown", async () => {
    vi.spyOn(authGuard, "getCurrentUser").mockResolvedValue(mockUser as any);
    vi.spyOn(schemeService, "createLoanScheme").mockRejectedValue(
      new ValidationError("minPrincipal: Minimum principal must be greater than zero")
    );

    const req = new NextRequest("http://localhost:3000/api/loans/schemes", {
      method: "POST",
      body: JSON.stringify({ code: "BAD" }),
    });
    const res = await POST(req);

    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.code).toBe("UNPROCESSABLE_ENTITY");
    expect(body.error.message).toContain("minPrincipal");
  });
});
