import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/permissions/auth-guard";
import { previewTermDepositMaturity } from "@/modules/term-deposits/term-deposit-service";
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

    const body = await req.json().catch(() => ({}));
    const asOfDate = body.asOfDate || getTodayBusinessDate();

    const preview = await previewTermDepositMaturity(user, {
      organizationId: user.organizationId,
      accountId: params.id,
      asOfDate,
    });

    return NextResponse.json(preview);
  } catch (err: unknown) {
    if (err instanceof AppError) {
      return NextResponse.json(err.toJSON(), { status: err.statusCode });
    }
    console.error("Maturity preview POST error:", err);
    return NextResponse.json(
      { error: { code: "INTERNAL_SERVER_ERROR", message: "Failed to preview term deposit maturity" } },
      { status: 500 }
    );
  }
}

