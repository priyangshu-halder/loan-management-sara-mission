import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/permissions/auth-guard";
import { getDepositMaturitiesReport } from "@/modules/reports/report-service";
import { getTodayBusinessDate } from "@/lib/dates/dates";
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
    const asOfDate = searchParams.get("asOfDate") || getTodayBusinessDate();
    const branchId = searchParams.get("branchId") || undefined;

    const result = await getDepositMaturitiesReport(user, {
      organizationId: user.organizationId,
      asOfDate,
      branchId,
    });

    return NextResponse.json(result);
  } catch (err: unknown) {
    if (err instanceof AppError) {
      return NextResponse.json(err.toJSON(), { status: err.statusCode });
    }
    console.error("Deposit maturities GET error:", err);
    return NextResponse.json(
      { error: { code: "INTERNAL_SERVER_ERROR", message: "Failed to generate deposit report" } },
      { status: 500 }
    );
  }
}

