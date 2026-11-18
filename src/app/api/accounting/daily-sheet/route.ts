import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/permissions/auth-guard";
import {
  getDailySheet,
  finalizeDailySheet,
  setInitialDailyOpeningBalance,
} from "@/modules/accounting/ledger-service";
import { getTodayBusinessDate } from "@/lib/dates/dates";
import { AppError } from "@/lib/errors/app-error";

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Authentication required" } }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const businessDate = searchParams.get("businessDate") || getTodayBusinessDate();
    const branchId = searchParams.get("branchId") || undefined;
    const cashAccountId = searchParams.get("cashAccountId") || undefined;

    const result = await getDailySheet(user, {
      organizationId: user.organizationId,
      businessDate,
      branchId,
      cashAccountId,
    });

    return NextResponse.json(result);
  } catch (err: unknown) {
    if (err instanceof AppError) {
      return NextResponse.json(err.toJSON(), { status: err.statusCode });
    }
    console.error("Daily sheet fetch error:", err);
    return NextResponse.json({ error: { code: "INTERNAL_SERVER_ERROR", message: "Failed to fetch daily sheet" } }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Authentication required" } }, { status: 401 });
    }

    const body = await req.json();
    const action = body.action || "finalize";

    if (action === "set-initial-opening") {
      const record = await setInitialDailyOpeningBalance(user, {
        organizationId: user.organizationId,
        cashAccountId: body.cashAccountId,
        businessDate: body.businessDate || getTodayBusinessDate(),
        openingBalance: body.openingBalance,
        notes: body.notes,
      });
      return NextResponse.json({ success: true, record }, { status: 200 });
    }

    // Default action: finalize daily sheet
    const record = await finalizeDailySheet(user, {
      organizationId: user.organizationId,
      cashAccountId: body.cashAccountId,
      businessDate: body.businessDate || getTodayBusinessDate(),
      notes: body.notes,
    });

    return NextResponse.json({ success: true, record }, { status: 200 });
  } catch (err: unknown) {
    if (err instanceof AppError) {
      return NextResponse.json(err.toJSON(), { status: err.statusCode });
    }
    console.error("Daily sheet action error:", err);
    return NextResponse.json({ error: { code: "INTERNAL_SERVER_ERROR", message: "Failed to process daily sheet action" } }, { status: 500 });
  }
}

