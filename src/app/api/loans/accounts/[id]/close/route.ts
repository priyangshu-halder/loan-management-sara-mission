import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/permissions/auth-guard";
import { postLoanClosure } from "@/modules/loans/loan-closure-service";
import { getTodayBusinessDate } from "@/lib/dates/dates";
import { AppError } from "@/lib/errors/app-error";

export async function POST(
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

    const body = await req.json();

    const closure = await postLoanClosure(user, {
      organizationId: user.organizationId,
      loanAccountId: params.id,
      asOfDate: body.asOfDate || getTodayBusinessDate(),
      settlementPaymentAmount: body.settlementPaymentAmount,
      cashAccountId: body.cashAccountId,
      paymentMethod: body.paymentMethod || "CASH",
      waiverAmount: body.waiverAmount || "0.0000",
      waiverReason: body.waiverReason,
      reason: body.reason,
      idempotencyKey: body.idempotencyKey || req.headers.get("x-idempotency-key") || undefined,
    });

    return NextResponse.json({ closure }, { status: 201 });
  } catch (err: unknown) {
    if (err instanceof AppError) {
      return NextResponse.json(err.toJSON(), { status: err.statusCode });
    }
    console.error("Loan closure error:", err);
    return NextResponse.json(
      { error: { code: "INTERNAL_SERVER_ERROR", message: "Failed to post loan closure" } },
      { status: 500 }
    );
  }
}

