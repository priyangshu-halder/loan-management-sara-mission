import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";
import * as authGuard from "@/lib/permissions/auth-guard";
import { prisma } from "@/lib/db/prisma";

describe("Collections Report CSV Export API (/api/collections/reports/export)", () => {
  const mockUser = {
    userId: "user-uuid-1",
    organizationId: "11111111-1111-1111-1111-111111111111",
    organizationCode: "RAYHAN-MFI",
    username: "admin",
    email: "admin@rayhan.org",
    fullName: "System Admin",
    roles: ["ORG_ADMIN"],
    permissions: new Set(["collection.receipt.create"]),
    scopeType: "ORGANIZATION" as const,
    branchId: null,
    isSuperAdmin: false,
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    vi.spyOn(authGuard, "getCurrentUser").mockResolvedValue(null);

    const req = new NextRequest("http://localhost:3000/api/collections/reports/export");
    const res = await GET(req);

    expect(res.status).toBe(401);
  });

  it("exports collections and dues report in CSV format", async () => {
    vi.spyOn(authGuard, "getCurrentUser").mockResolvedValue(mockUser as any);
    vi.spyOn(prisma.collectionReceipt, "findMany").mockResolvedValue([
      {
        id: "rcp-1",
        receiptNumber: "RCP-01-26000001",
        businessDate: "2026-10-25",
        amount: "680.7700",
        paymentMethod: "CASH",
        loanAccount: {
          loanAccountNumber: "LN-2026-0001",
          customer: {
            customerCode: "CUST-001",
            fullName: "MITHU MONDAL",
            guardianName: "MITHU",
            phone: "1234567890",
            customerGroups: [{ group: { name: "Bidhannagar Mahila Center" } }],
          },
          scheme: { name: "Micro Enterprise Loan" },
        },
        cashAccount: { name: "Cash in Hand" },
        allocations: [
          {
            principalAmount: "576.9200",
            interestAmount: "103.8500",
          },
        ],
      },
    ] as any);

    vi.spyOn(prisma.repaymentInstallment, "findMany").mockResolvedValue([
      {
        id: "inst-1",
        installmentNumber: 1,
        dueDate: new Date("2026-10-25"),
        totalDue: "680.77",
        totalPaid: "0.00",
        principalDue: "576.92",
        principalPaid: "0.00",
        interestDue: "103.85",
        interestPaid: "0.00",
        loanAccount: {
          loanAccountNumber: "LN-2026-0002",
          customer: {
            customerCode: "CUST-002",
            fullName: "DEMO DEMO",
            guardianName: "DEMO",
            phone: "1234567891",
            customerGroups: [{ group: { name: "Bidhannagar Mahila Center" } }],
          },
          scheme: { name: "Micro Enterprise Loan" },
        },
      },
    ] as any);

    const req = new NextRequest(
      "http://localhost:3000/api/collections/reports/export?startDate=2026-10-25&endDate=2026-10-25&type=ALL"
    );
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/csv");
    expect(res.headers.get("Content-Disposition")).toContain("collection_report_2026-10-25_to_2026-10-25.csv");

    const text = await res.text();
    expect(text).toContain('"Record Type"');
    expect(text).toContain('"Receipt / Ref No"');
    expect(text).toContain('"RCP-01-26000001"');
    expect(text).toContain('"MITHU MONDAL"');
    expect(text).toContain('"680.7700"');
    expect(text).toContain('"DEMO DEMO"');
  });
});
