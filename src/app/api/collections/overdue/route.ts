import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/permissions/auth-guard";
import { getOverdueQueue } from "@/modules/collections/overdue-service";
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
    const asOfDate = searchParams.get("asOfDate") || undefined;
    const branchId = searchParams.get("branchId") || undefined;
    const groupId = searchParams.get("groupId") || undefined;
    const agingBucket = (searchParams.get("agingBucket") || "ALL") as "1-30" | "31-60" | "61-90" | "90+" | "ALL";

    const result = await getOverdueQueue(user, {
      asOfDate,
      branchId,
      groupId,
      agingBucket,
    });

    return NextResponse.json(result);
  } catch (err: unknown) {
    if (err instanceof AppError) {
      return NextResponse.json(err.toJSON(), { status: err.statusCode });
    }
    console.error("Overdue fetch error:", err);
    return NextResponse.json(
      { error: { code: "INTERNAL_SERVER_ERROR", message: "Failed to fetch overdue queue" } },
      { status: 500 }
    );
  }
}

