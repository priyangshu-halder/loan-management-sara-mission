import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/permissions/auth-guard";
import { getCollectionPerformanceReport } from "@/modules/reports/report-service";
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
    const groupId = searchParams.get("groupId") || undefined;
    const collectorId = searchParams.get("collectorId") || undefined;

    const result = await getCollectionPerformanceReport(user, {
      organizationId: user.organizationId,
      startDate,
      endDate,
      branchId,
      groupId,
      collectorId,
    });

    return NextResponse.json(result);
  } catch (err: unknown) {
    if (err instanceof AppError) {
      return NextResponse.json(err.toJSON(), { status: err.statusCode });
    }
    console.error("Collection performance GET error:", err);
    return NextResponse.json(
      { error: { code: "INTERNAL_SERVER_ERROR", message: "Failed to generate collection report" } },
      { status: 500 }
    );
  }
}

