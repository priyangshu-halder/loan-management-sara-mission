import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/permissions/auth-guard";
import { reverseJournalEntry } from "@/modules/accounting/posting-service";
import { getTodayBusinessDate } from "@/lib/dates/dates";
import { AppError } from "@/lib/errors/app-error";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Authentication required" } }, { status: 401 });
    }

    const body = await req.json();
    const reversalReason = body.reversalReason;
    const businessDate = body.businessDate || getTodayBusinessDate();

    const reversal = await reverseJournalEntry(user, {
      organizationId: user.organizationId,
      journalEntryId: params.id,
      reversalReason,
      businessDate,
      idempotencyKey: body.idempotencyKey,
    });

    return NextResponse.json({ success: true, reversal });
  } catch (err: unknown) {
    if (err instanceof AppError) {
      return NextResponse.json(err.toJSON(), { status: err.statusCode });
    }
    console.error("Journal entry reversal error:", err);
    return NextResponse.json({ error: { code: "INTERNAL_SERVER_ERROR", message: "Failed to reverse journal entry" } }, { status: 500 });
  }
}

