import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET, POST } from "./route";
import * as authGuard from "@/lib/permissions/auth-guard";
import * as expenseService from "@/modules/expenses/expense-service";

describe("Expenses API (/api/expenses)", () => {
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

  it("returns 401 on GET when unauthenticated", async () => {
    vi.spyOn(authGuard, "getCurrentUser").mockResolvedValue(null);
    const req = new NextRequest("http://localhost:3000/api/expenses");
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("returns 401 on POST when unauthenticated", async () => {
    vi.spyOn(authGuard, "getCurrentUser").mockResolvedValue(null);
    const req = new NextRequest("http://localhost:3000/api/expenses", {
      method: "POST",
      body: JSON.stringify({}),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("handles POST with JSON body and base64 attachment", async () => {
    vi.spyOn(authGuard, "getCurrentUser").mockResolvedValue(mockUser as unknown as authGuard.AuthenticatedUser);
    const createSpy = vi.spyOn(expenseService, "createExpense").mockResolvedValue({
      id: "exp-1",
      voucherNumber: "EXP-001",
      amount: "1500.0000",
      attachmentFileName: "bill.pdf",
    } as unknown as Awaited<ReturnType<typeof expenseService.createExpense>>);

    const base64Data = Buffer.from("PDF-DATA").toString("base64");
    const req = new NextRequest("http://localhost:3000/api/expenses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        category: "Office Rent",
        amount: "1500.00",
        expenseDate: "2026-10-23",
        payee: "Landlord",
        paymentMethod: "CASH",
        attachmentFile: {
          fileName: "bill.pdf",
          mimeType: "application/pdf",
          base64: base64Data,
        },
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(201);
    expect(createSpy).toHaveBeenCalledWith(
      mockUser,
      expect.objectContaining({
        category: "Office Rent",
        attachmentFile: expect.objectContaining({
          fileName: "bill.pdf",
          mimeType: "application/pdf",
        }),
      })
    );
  });

  it("handles POST with multipart/form-data upload", async () => {
    vi.spyOn(authGuard, "getCurrentUser").mockResolvedValue(mockUser as unknown as authGuard.AuthenticatedUser);
    const createSpy = vi.spyOn(expenseService, "createExpense").mockResolvedValue({
      id: "exp-2",
      voucherNumber: "EXP-002",
      amount: "500.0000",
      attachmentFileName: "receipt.png",
    } as unknown as Awaited<ReturnType<typeof expenseService.createExpense>>);

    const formData = new FormData();
    formData.append("category", "Office Supplies");
    formData.append("amount", "500.00");
    formData.append("expenseDate", "2026-10-23");
    formData.append("payee", "Stationery Store");
    formData.append("paymentMethod", "CASH");
    formData.append("autoSubmit", "true");
    const file = new File(["fake-png-binary"], "receipt.png", { type: "image/png" });
    formData.append("attachment", file);

    const req = new NextRequest("http://localhost:3000/api/expenses", {
      method: "POST",
      body: formData,
    });

    const res = await POST(req);
    expect(res.status).toBe(201);
    expect(createSpy).toHaveBeenCalledWith(
      mockUser,
      expect.objectContaining({
        category: "Office Supplies",
        autoSubmit: true,
        attachmentFile: expect.objectContaining({
          fileName: "receipt.png",
          mimeType: "image/png",
        }),
      })
    );
  });
});
