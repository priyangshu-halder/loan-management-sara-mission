import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/permissions/auth-guard";
import { getDaybook } from "@/modules/accounting/ledger-service";
import { AppError } from "@/lib/errors/app-error";

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Authentication required" } }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const businessDate = searchParams.get("businessDate") || undefined;
    const startDate = searchParams.get("startDate") || undefined;
    const endDate = searchParams.get("endDate") || undefined;
    const branchId = searchParams.get("branchId") || undefined;
    const page = parseInt(searchParams.get("page") || "1", 10);
    const pageSize = parseInt(searchParams.get("pageSize") || "20", 10);

    const result = await getDaybook(user, {
      organizationId: user.organizationId,
      branchId,
      businessDate,
      startDate,
      endDate,
      page,
      pageSize,
    });

    return NextResponse.json(result);
  } catch (err: unknown) {
    if (err instanceof AppError) {
      return NextResponse.json(err.toJSON(), { status: err.statusCode });
    }
    console.error("Daybook fetch error:", err);
    return NextResponse.json({ error: { code: "INTERNAL_SERVER_ERROR", message: "Failed to fetch daybook" } }, { status: 500 });
  }
}

