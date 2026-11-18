import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/permissions/auth-guard";
import { generateSettlementQuote } from "@/modules/loans/loan-closure-service";
import { getTodayBusinessDate } from "@/lib/dates/dates";
import { AppError } from "@/lib/errors/app-error";

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

    const { searchParams } = new URL(req.url);
    const asOfDate = searchParams.get("asOfDate") || getTodayBusinessDate();
    const waiverAmount = searchParams.get("waiverAmount") || undefined;

    const quote = await generateSettlementQuote(user, {
      organizationId: user.organizationId,
      loanAccountId: params.id,
      asOfDate,
      waiverAmount,
    });

    return NextResponse.json({ quote });
  } catch (err: unknown) {
    if (err instanceof AppError) {
      return NextResponse.json(err.toJSON(), { status: err.statusCode });
    }
    console.error("Settlement quote error:", err);
    return NextResponse.json(
      { error: { code: "INTERNAL_SERVER_ERROR", message: "Failed to generate settlement quote" } },
      { status: 500 }
    );
  }
}

