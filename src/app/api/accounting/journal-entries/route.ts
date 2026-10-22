import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/permissions/auth-guard";
import { postJournalEntry } from "@/modules/accounting/posting-service";
import { AppError } from "@/lib/errors/app-error";

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Authentication required" } }, { status: 401 });
    }

    const body = await req.json();
    const idempotencyKey = req.headers.get("x-idempotency-key") || body.idempotencyKey || undefined;

    const entry = await postJournalEntry(user, {
      organizationId: user.organizationId,
      branchId: body.branchId,
      businessDate: body.businessDate,
      sourceModule: body.sourceModule || "MANUAL",
      sourceType: body.sourceType || "ADJUSTMENT",
      sourceId: body.sourceId,
      description: body.description,
      lines: body.lines,
      idempotencyKey,
    });

    return NextResponse.json({ success: true, entry }, { status: 201 });
  } catch (err: unknown) {
    if (err instanceof AppError) {
      return NextResponse.json(err.toJSON(), { status: err.statusCode });
    }
    console.error("Journal entry post error:", err);
    return NextResponse.json({ error: { code: "INTERNAL_SERVER_ERROR", message: "Failed to post journal entry" } }, { status: 500 });
  }
}

