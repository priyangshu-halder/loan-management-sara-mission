import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/permissions/auth-guard";
import { getChartOfAccounts } from "@/modules/accounting/ledger-service";
import { AppError } from "@/lib/errors/app-error";

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Authentication required" } }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const accountType = searchParams.get("accountType") || undefined;

    const accounts = await getChartOfAccounts(user, accountType);
    return NextResponse.json({ accounts });
  } catch (err: unknown) {
    if (err instanceof AppError) {
      return NextResponse.json(err.toJSON(), { status: err.statusCode });
    }
    console.error("Chart of accounts fetch error:", err);
    return NextResponse.json({ error: { code: "INTERNAL_SERVER_ERROR", message: "Failed to fetch accounts" } }, { status: 500 });
  }
}

