import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/permissions/auth-guard";
import { getCashbook } from "@/modules/accounting/ledger-service";
import { AppError } from "@/lib/errors/app-error";

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Authentication required" } }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const cashAccountId = searchParams.get("cashAccountId");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    if (!cashAccountId || !startDate || !endDate) {
      return NextResponse.json(
        { error: { code: "BAD_REQUEST", message: "cashAccountId, startDate, and endDate parameters are required" } },
        { status: 400 }
      );
    }

    const result = await getCashbook(user, {
      organizationId: user.organizationId,
      cashAccountId,
      startDate,
      endDate,
    });

    return NextResponse.json(result);
  } catch (err: unknown) {
    if (err instanceof AppError) {
      return NextResponse.json(err.toJSON(), { status: err.statusCode });
    }
    console.error("Cashbook fetch error:", err);
    return NextResponse.json({ error: { code: "INTERNAL_SERVER_ERROR", message: "Failed to fetch cashbook" } }, { status: 500 });
  }
}

