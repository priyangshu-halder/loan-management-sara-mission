import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, requirePermission } from "@/lib/permissions/auth-guard";
import { prisma } from "@/lib/db/prisma";
import { handleApiError } from "@/lib/errors/api-response";
import { readStoredFile } from "@/lib/storage/storage-provider";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { error: { code: "UNAUTHORIZED", message: "Authentication required" } },
        { status: 401 }
      );
    }

    requirePermission(user, "expense.submit");

    const expense = await prisma.expense.findUnique({
      where: { id: params.id },
    });

    if (!expense || expense.organizationId !== user.organizationId) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Expense not found" } },
        { status: 404 }
      );
    }

    if (!expense.attachmentStoragePath) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "No voucher or bill attachment uploaded for this expense" } },
        { status: 404 }
      );
    }

    const buffer = await readStoredFile(expense.attachmentStoragePath);
    const isDownload = req.nextUrl.searchParams.get("download") === "true";
    const filename = expense.attachmentFileName || `voucher_${expense.voucherNumber || expense.id}`;

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": expense.attachmentMimeType || "application/octet-stream",
        "Content-Length": buffer.length.toString(),
        "Cache-Control": "private, no-cache, no-store, must-revalidate",
        "X-Content-Type-Options": "nosniff",
        "Content-Disposition": isDownload
          ? `attachment; filename="${filename}"`
          : `inline; filename="${filename}"`,
      },
    });
  } catch (err: unknown) {
    return handleApiError(err, "Failed to retrieve expense attachment");
  }
}
