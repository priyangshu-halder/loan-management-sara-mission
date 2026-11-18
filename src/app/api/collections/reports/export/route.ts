import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/permissions/auth-guard";
import { prisma } from "@/lib/db/prisma";
import { handleApiError } from "@/lib/errors/api-response";

function escapeCsvCell(val: unknown): string {
  if (val === null || val === undefined) return '""';
  let str = String(val);
  if (/^[=+\-@\t\r]/.test(str)) {
    str = "'" + str;
  }
  return `"${str.replace(/"/g, '""')}"`;
}

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { error: { code: "UNAUTHORIZED", message: "Authentication required" } },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(req.url);
    const todayStr = new Date().toISOString().slice(0, 10);
    const startDate = searchParams.get("startDate") || todayStr;
    const endDate = searchParams.get("endDate") || todayStr;
    const type = searchParams.get("type") || "ALL"; // "ALL" | "PAID" | "DUE"
    const groupId = searchParams.get("groupId") || undefined;

    const startDateTime = new Date(`${startDate}T00:00:00.000Z`);
    const endDateTime = new Date(`${endDate}T23:59:59.999Z`);

    const headers = [
      "Record Type",
      "Receipt / Ref No",
      "Date",
      "Member ID",
      "Member Name",
      "Guardian / Spouse",
      "Phone",
      "Group / Center",
      "Loan Account No",
      "Scheme Name",
      "Total Amount",
      "Principal",
      "Interest",
      "Payment Mode",
      "Account Credited",
      "Status",
    ];

    const rows: string[] = [];

    // 1. Fetch Paid Receipts in date range
    if (type === "ALL" || type === "PAID") {
      const receipts = await prisma.collectionReceipt.findMany({
        where: {
          organizationId: user.organizationId,
          businessDate: {
            gte: startDate,
            lte: endDate,
          },
          isReversed: false,
          ...(groupId
            ? {
                loanAccount: {
                  customer: {
                    customerGroups: {
                      some: { groupId },
                    },
                  },
                },
              }
            : {}),
        },
        include: {
          loanAccount: {
            include: {
              customer: {
                include: {
                  customerGroups: {
                    include: { group: true },
                  },
                },
              },
              scheme: true,
            },
          },
          cashAccount: true,
          allocations: true,
        },
        orderBy: { createdAt: "desc" },
      });

      for (const r of receipts) {
        const groupName =
          r.loanAccount.customer.customerGroups[0]?.group?.name || "Independent";
        const alloc = r.allocations[0];
        const pAmt = alloc ? alloc.principalAmount.toString() : "0.00";
        const iAmt = alloc ? alloc.interestAmount.toString() : "0.00";
        const mode = r.paymentMethod === "BANK_TRANSFER" ? "NETBANKING" : r.paymentMethod;

        rows.push(
          [
            escapeCsvCell("PAID"),
            escapeCsvCell(r.receiptNumber),
            escapeCsvCell(r.businessDate),
            escapeCsvCell(r.loanAccount.customer.customerCode),
            escapeCsvCell(r.loanAccount.customer.fullName),
            escapeCsvCell(r.loanAccount.customer.guardianName || ""),
            escapeCsvCell(r.loanAccount.customer.phone),
            escapeCsvCell(groupName),
            escapeCsvCell(r.loanAccount.loanAccountNumber),
            escapeCsvCell(r.loanAccount.scheme.name),
            escapeCsvCell(r.amount.toString()),
            escapeCsvCell(pAmt),
            escapeCsvCell(iAmt),
            escapeCsvCell(mode),
            escapeCsvCell(r.cashAccount.name),
            escapeCsvCell("COLLECTED"),
          ].join(",")
        );
      }
    }

    // 2. Fetch Due & Overdue Installments
    if (type === "ALL" || type === "DUE") {
      const installments = await prisma.repaymentInstallment.findMany({
        where: {
          organizationId: user.organizationId,
          status: { in: ["PENDING", "PARTIALLY_PAID"] },
          dueDate: {
            gte: startDateTime,
            lte: endDateTime,
          },
          ...(groupId
            ? {
                loanAccount: {
                  customer: {
                    customerGroups: {
                      some: { groupId },
                    },
                  },
                },
              }
            : {}),
        },
        include: {
          loanAccount: {
            include: {
              customer: {
                include: {
                  customerGroups: {
                    include: { group: true },
                  },
                },
              },
              scheme: true,
            },
          },
        },
        orderBy: { dueDate: "asc" },
      });

      for (const inst of installments) {
        const groupName =
          inst.loanAccount.customer.customerGroups[0]?.group?.name || "Independent";
        const remainingDue = (
          Number(inst.totalDue) - Number(inst.totalPaid)
        ).toFixed(2);
        const remainingP = (
          Number(inst.principalDue) - Number(inst.principalPaid)
        ).toFixed(2);
        const remainingI = (
          Number(inst.interestDue) - Number(inst.interestPaid)
        ).toFixed(2);
        const dueDateFormatted = inst.dueDate.toISOString().slice(0, 10);
        const isOverdue = inst.dueDate < new Date();

        rows.push(
          [
            escapeCsvCell(isOverdue ? "OVERDUE" : "DUE"),
            escapeCsvCell(`INST-${inst.installmentNumber}`),
            escapeCsvCell(dueDateFormatted),
            escapeCsvCell(inst.loanAccount.customer.customerCode),
            escapeCsvCell(inst.loanAccount.customer.fullName),
            escapeCsvCell(inst.loanAccount.customer.guardianName || ""),
            escapeCsvCell(inst.loanAccount.customer.phone),
            escapeCsvCell(groupName),
            escapeCsvCell(inst.loanAccount.loanAccountNumber),
            escapeCsvCell(inst.loanAccount.scheme.name),
            escapeCsvCell(remainingDue),
            escapeCsvCell(remainingP),
            escapeCsvCell(remainingI),
            escapeCsvCell("-"),
            escapeCsvCell("-"),
            escapeCsvCell(isOverdue ? "OVERDUE" : "PENDING"),
          ].join(",")
        );
      }
    }

    const csvContent =
      "\uFEFF" + [headers.map((h) => `"${h}"`).join(","), ...rows].join("\r\n");

    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="collection_report_${startDate}_to_${endDate}.csv"`,
      },
    });
  } catch (err: unknown) {
    return handleApiError(err, "Failed to export collections report");
  }
}
