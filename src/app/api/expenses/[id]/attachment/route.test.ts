import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";
import * as authGuard from "@/lib/permissions/auth-guard";
import { prisma } from "@/lib/db/prisma";
import * as storageProvider from "@/lib/storage/storage-provider";

describe("Expense Attachment API (/api/expenses/[id]/attachment)", () => {
  const mockUser = {
    userId: "user-uuid-1",
    organizationId: "11111111-1111-1111-1111-111111111111",
    organizationCode: "RAYHAN-MFI",
    username: "admin",
    email: "admin@rayhan.org",
    fullName: "System Admin",
    roles: ["ORG_ADMIN"],
    permissions: new Set(["expense.submit"]),
    scopeType: "ORGANIZATION" as const,
    branchId: null,
    isSuperAdmin: false,
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    vi.spyOn(authGuard, "getCurrentUser").mockResolvedValue(null);

    const req = new NextRequest("http://localhost:3000/api/expenses/exp-123/attachment");
    const res = await GET(req, { params: { id: "exp-123" } });

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  it("returns 403 Forbidden when user lacks expense.submit permission", async () => {
    const userWithoutPerm = {
      ...mockUser,
      permissions: new Set(["unrelated.permission"]),
    };
    vi.spyOn(authGuard, "getCurrentUser").mockResolvedValue(userWithoutPerm as unknown as authGuard.AuthenticatedUser);

    const req = new NextRequest("http://localhost:3000/api/expenses/exp-123/attachment");
    const res = await GET(req, { params: { id: "exp-123" } });

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe("FORBIDDEN");
  });

  it("returns 404 when expense belongs to another organization", async () => {
    vi.spyOn(authGuard, "getCurrentUser").mockResolvedValue(mockUser as unknown as authGuard.AuthenticatedUser);
    vi.spyOn(prisma.expense, "findUnique").mockResolvedValue({
      id: "exp-123",
      organizationId: "other-org-id",
    } as unknown as Awaited<ReturnType<typeof prisma.expense.findUnique>>);

    const req = new NextRequest("http://localhost:3000/api/expenses/exp-123/attachment");
    const res = await GET(req, { params: { id: "exp-123" } });

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe("NOT_FOUND");
    expect(body.error.message).toBe("Expense not found");
  });

  it("returns 404 when expense has no attachment uploaded", async () => {
    vi.spyOn(authGuard, "getCurrentUser").mockResolvedValue(mockUser as unknown as authGuard.AuthenticatedUser);
    vi.spyOn(prisma.expense, "findUnique").mockResolvedValue({
      id: "exp-123",
      organizationId: mockUser.organizationId,
      attachmentStoragePath: null,
    } as unknown as Awaited<ReturnType<typeof prisma.expense.findUnique>>);

    const req = new NextRequest("http://localhost:3000/api/expenses/exp-123/attachment");
    const res = await GET(req, { params: { id: "exp-123" } });

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe("NOT_FOUND");
    expect(body.error.message).toContain("No voucher or bill attachment uploaded");
  });

  it("returns attachment binary file with inline disposition and security headers", async () => {
    vi.spyOn(authGuard, "getCurrentUser").mockResolvedValue(mockUser as unknown as authGuard.AuthenticatedUser);
    vi.spyOn(prisma.expense, "findUnique").mockResolvedValue({
      id: "exp-123",
      organizationId: mockUser.organizationId,
      voucherNumber: "EXP-20261023-001",
      attachmentFileName: "office_rent_invoice.pdf",
      attachmentStoragePath: "org/expenses/voucher_123.pdf",
      attachmentMimeType: "application/pdf",
      attachmentFileSize: 25,
    } as unknown as Awaited<ReturnType<typeof prisma.expense.findUnique>>);

    const mockBuffer = Buffer.from("PDF-DUMMY-BINARY-CONTENT");
    vi.spyOn(storageProvider, "readStoredFile").mockResolvedValue(mockBuffer);

    const req = new NextRequest("http://localhost:3000/api/expenses/exp-123/attachment");
    const res = await GET(req, { params: { id: "exp-123" } });

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect(res.headers.get("Content-Disposition")).toBe('inline; filename="office_rent_invoice.pdf"');
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(res.headers.get("Cache-Control")).toContain("no-store");

    const arrayBuf = await res.arrayBuffer();
    expect(Buffer.from(arrayBuf).toString()).toBe("PDF-DUMMY-BINARY-CONTENT");
  });

  it("sets attachment disposition when download=true query param is provided", async () => {
    vi.spyOn(authGuard, "getCurrentUser").mockResolvedValue(mockUser as unknown as authGuard.AuthenticatedUser);
    vi.spyOn(prisma.expense, "findUnique").mockResolvedValue({
      id: "exp-123",
      organizationId: mockUser.organizationId,
      voucherNumber: "EXP-20261023-001",
      attachmentFileName: "bill_receipt.png",
      attachmentStoragePath: "org/expenses/voucher_123.png",
      attachmentMimeType: "image/png",
      attachmentFileSize: 20,
    } as unknown as Awaited<ReturnType<typeof prisma.expense.findUnique>>);

    const mockBuffer = Buffer.from("PNG-DUMMY-BINARY-DATA");
    vi.spyOn(storageProvider, "readStoredFile").mockResolvedValue(mockBuffer);

    const req = new NextRequest("http://localhost:3000/api/expenses/exp-123/attachment?download=true");
    const res = await GET(req, { params: { id: "exp-123" } });

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/png");
    expect(res.headers.get("Content-Disposition")).toBe('attachment; filename="bill_receipt.png"');
  });
});
