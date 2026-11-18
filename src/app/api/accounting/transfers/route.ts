import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/permissions/auth-guard";
import { recordInternalTransfer } from "@/modules/accounting/ledger-service";
import { getTodayBusinessDate } from "@/lib/dates/dates";
import { AppError } from "@/lib/errors/app-error";

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Authentication required" } }, { status: 401 });
    }

    const body = await req.json();
    const idempotencyKey = req.headers.get("x-idempotency-key") || body.idempotencyKey || undefined;

    const journal = await recordInternalTransfer(user, {
      organizationId: user.organizationId,
      fromCashAccountId: body.fromCashAccountId,
      toCashAccountId: body.toCashAccountId,
      amount: body.amount,
      businessDate: body.businessDate || getTodayBusinessDate(),
      description: body.description,
      idempotencyKey,
    });

    return NextResponse.json({ success: true, journal }, { status: 201 });
  } catch (err: unknown) {
    if (err instanceof AppError) {
      return NextResponse.json(err.toJSON(), { status: err.statusCode });
    }
    console.error("Internal transfer error:", err);
    return NextResponse.json({ error: { code: "INTERNAL_SERVER_ERROR", message: "Failed to process internal transfer" } }, { status: 500 });
  }
}
