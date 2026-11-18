import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";
import * as authGuard from "@/lib/permissions/auth-guard";
import { prisma } from "@/lib/db/prisma";
import * as storageProvider from "@/lib/storage/storage-provider";

describe("Customer Documents API (/api/customers/[id]/documents/[type])", () => {
  const mockUser = {
    userId: "user-uuid-1",
    organizationId: "11111111-1111-1111-1111-111111111111",
    organizationCode: "RAYHAN-MFI",
    username: "admin",
    email: "admin@rayhan.org",
    fullName: "System Admin",
    roles: ["ORG_ADMIN"],
    permissions: new Set(["loan.application.create", "customer.kyc.view"]),
    scopeType: "ORGANIZATION" as const,
    branchId: null,
    isSuperAdmin: false,
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    vi.spyOn(authGuard, "getCurrentUser").mockResolvedValue(null);

    const req = new NextRequest("http://localhost:3000/api/customers/cust-123/documents/application-form");
    const res = await GET(req, { params: { id: "cust-123", type: "application-form" } });

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  it("returns 403 Forbidden when user has view KYC permission but lacks customer.kyc.view document permission", async () => {
    const userWithoutDocPerm = {
      ...mockUser,
      permissions: new Set(["customer.detail.view"]), // Can view KYC details, but NOT confidential documents
    };
    vi.spyOn(authGuard, "getCurrentUser").mockResolvedValue(userWithoutDocPerm as any);

    const req = new NextRequest("http://localhost:3000/api/customers/cust-123/documents/application-form");
    const res = await GET(req, { params: { id: "cust-123", type: "application-form" } });

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe("FORBIDDEN");
  });

  it("returns 404 for unknown document type", async () => {
    vi.spyOn(authGuard, "getCurrentUser").mockResolvedValue(mockUser as any);

    const req = new NextRequest("http://localhost:3000/api/customers/cust-123/documents/unknown-type");
    const res = await GET(req, { params: { id: "cust-123", type: "unknown-type" } });

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe("NOT_FOUND");
    expect(body.error.message).toContain("Unknown document type");
  });

  it("returns 404 when customer does not exist or belongs to another organization", async () => {
    vi.spyOn(authGuard, "getCurrentUser").mockResolvedValue(mockUser as any);
    vi.spyOn(prisma.customer, "findUnique").mockResolvedValue({
      id: "cust-123",
      organizationId: "other-org-id",
    } as any);

    const req = new NextRequest("http://localhost:3000/api/customers/cust-123/documents/application-form");
    const res = await GET(req, { params: { id: "cust-123", type: "application-form" } });

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.message).toBe("Customer not found");
  });

  it("returns 404 when customer has not uploaded the requested document", async () => {
    vi.spyOn(authGuard, "getCurrentUser").mockResolvedValue(mockUser as any);
    vi.spyOn(prisma.customer, "findUnique").mockResolvedValue({
      id: "cust-123",
      organizationId: mockUser.organizationId,
      customerCode: "CUST-001",
      panPhoto: null,
    } as any);

    const req = new NextRequest("http://localhost:3000/api/customers/cust-123/documents/pan");
    const res = await GET(req, { params: { id: "cust-123", type: "pan" } });

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.message).toBe("Document not uploaded");
  });

  it("returns binary content with security headers for valid base64 data URI (e.g. pan)", async () => {
    vi.spyOn(authGuard, "getCurrentUser").mockResolvedValue(mockUser as any);
    const mockBase64 = Buffer.from("mock image content").toString("base64");
    vi.spyOn(prisma.customer, "findUnique").mockResolvedValue({
      id: "cust-123",
      organizationId: mockUser.organizationId,
      customerCode: "CUST-001",
      panPhoto: `data:image/jpeg;base64,${mockBase64}`,
    } as any);

    const req = new NextRequest("http://localhost:3000/api/customers/cust-123/documents/pan?download=true");
    const res = await GET(req, { params: { id: "cust-123", type: "pan" } });

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/jpeg");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(res.headers.get("Cache-Control")).toBe("private, no-cache, no-store, must-revalidate");
    expect(res.headers.get("Content-Disposition")).toContain('attachment; filename="CUST-001_pan.jpeg"');
  });

  it("streams application form document from storage provider with secure headers", async () => {
    vi.spyOn(authGuard, "getCurrentUser").mockResolvedValue(mockUser as any);
    vi.spyOn(prisma.customer, "findUnique").mockResolvedValue({
      id: "cust-123",
      organizationId: mockUser.organizationId,
      customerCode: "CUST-001",
    } as any);

    vi.spyOn(prisma.customerDocument, "findFirst").mockResolvedValue({
      id: "doc-1",
      organizationId: mockUser.organizationId,
      customerId: "cust-123",
      documentType: "APPLICATION_FORM",
      fileName: "app_form.pdf",
      storagePath: "cust-123/safe_app_form.pdf",
      mimeType: "application/pdf",
      fileSize: 1024,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any);

    vi.spyOn(storageProvider, "readStoredFile").mockResolvedValue(
      Buffer.from("%PDF-1.4 mock pdf content")
    );

    const req = new NextRequest("http://localhost:3000/api/customers/cust-123/documents/application-form?download=true");
    const res = await GET(req, { params: { id: "cust-123", type: "application-form" } });

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(res.headers.get("Cache-Control")).toBe("private, no-cache, no-store, must-revalidate");
    expect(res.headers.get("Content-Disposition")).toContain('attachment; filename="app_form.pdf"');
  });
});
