import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/permissions/auth-guard";
import { getExpenses, createExpense } from "@/modules/expenses/expense-service";
import { AppError } from "@/lib/errors/app-error";

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
    const status = searchParams.get("status") || undefined;
    const category = searchParams.get("category") || undefined;
    const startDate = searchParams.get("startDate") || undefined;
    const endDate = searchParams.get("endDate") || undefined;
    const search = searchParams.get("search") || undefined;
    const limit = parseInt(searchParams.get("limit") || "50", 10);
    const offset = parseInt(searchParams.get("offset") || "0", 10);

    const result = await getExpenses(user, {
      status,
      category,
      startDate,
      endDate,
      search,
      limit,
      offset,
    });

    return NextResponse.json(result);
  } catch (err: unknown) {
    if (err instanceof AppError) {
      return NextResponse.json(err.toJSON(), { status: err.statusCode });
    }
    console.error("Expenses GET error:", err);
    return NextResponse.json(
      { error: { code: "INTERNAL_SERVER_ERROR", message: "Failed to fetch expenses" } },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { error: { code: "UNAUTHORIZED", message: "Authentication required" } },
        { status: 401 }
      );
    }

    const contentType = req.headers.get("content-type") || "";

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const payload: Record<string, unknown> = {
        organizationId: user.organizationId,
      };

      formData.forEach((value, key) => {
        if (
          (key === "attachment" || key === "voucher" || key === "file") &&
          value instanceof File
        ) {
          // Processed below
        } else if (typeof value === "string") {
          if (key === "autoSubmit") {
            payload[key] = value === "true";
          } else if (value.trim() !== "") {
            payload[key] = value;
          }
        }
      });

      const fileEntry =
        formData.get("attachment") ||
        formData.get("voucher") ||
        formData.get("file");

      if (fileEntry instanceof File && fileEntry.size > 0) {
        const buffer = Buffer.from(await fileEntry.arrayBuffer());
        payload.attachmentFile = {
          fileName: fileEntry.name,
          mimeType: fileEntry.type || "application/octet-stream",
          buffer,
        };
      }

      const expense = await createExpense(user, payload as Parameters<typeof createExpense>[1]);
      return NextResponse.json(expense, { status: 201 });
    }

    const body = await req.json();
    let attachmentFile = undefined;
    if (body.attachmentFile) {
      if (typeof body.attachmentFile.base64 === "string") {
        attachmentFile = {
          fileName: body.attachmentFile.fileName,
          mimeType: body.attachmentFile.mimeType,
          buffer: Buffer.from(body.attachmentFile.base64, "base64"),
        };
      } else if (Buffer.isBuffer(body.attachmentFile.buffer)) {
        attachmentFile = body.attachmentFile;
      }
    }

    const expense = await createExpense(user, {
      ...body,
      organizationId: user.organizationId,
      ...(attachmentFile ? { attachmentFile } : {}),
    });

    return NextResponse.json(expense, { status: 201 });
  } catch (err: unknown) {
    if (err instanceof AppError) {
      return NextResponse.json(err.toJSON(), { status: err.statusCode });
    }
    console.error("Create expense POST error:", err);
    return NextResponse.json(
      { error: { code: "INTERNAL_SERVER_ERROR", message: "Failed to record expense voucher" } },
      { status: 500 }
    );
  }
}

