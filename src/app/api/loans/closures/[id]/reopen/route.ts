import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/permissions/auth-guard";
import { reopenLoanClosure } from "@/modules/loans/loan-closure-service";
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

    const reopenedClosure = await reopenLoanClosure(user, {
      organizationId: user.organizationId,
      closureId: params.id,
      reason: body.reason,
      businessDate: body.businessDate || getTodayBusinessDate(),
    });

    return NextResponse.json({ closure: reopenedClosure });
  } catch (err: unknown) {
    if (err instanceof AppError) {
      return NextResponse.json(err.toJSON(), { status: err.statusCode });
    }
    console.error("Loan closure reopen error:", err);
    return NextResponse.json(
      { error: { code: "INTERNAL_SERVER_ERROR", message: "Failed to reopen loan closure" } },
      { status: 500 }
    );
  }
}

