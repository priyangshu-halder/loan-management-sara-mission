import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/permissions/auth-guard";
import { getFinancialStatementsReport } from "@/modules/reports/report-service";
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
    const today = getTodayBusinessDate();
    const startDate = searchParams.get("startDate") || `${today.slice(0, 7)}-01`;
    const endDate = searchParams.get("endDate") || today;
    const branchId = searchParams.get("branchId") || undefined;

    const result = await getFinancialStatementsReport(user, {
      organizationId: user.organizationId,
      startDate,
      endDate,
      branchId,
    });

    return NextResponse.json(result);
  } catch (err: unknown) {
    if (err instanceof AppError) {
      return NextResponse.json(err.toJSON(), { status: err.statusCode });
    }
    console.error("Financial statements GET error:", err);
    return NextResponse.json(
      { error: { code: "INTERNAL_SERVER_ERROR", message: "Failed to generate financial statements" } },
      { status: 500 }
    );
  }
}

