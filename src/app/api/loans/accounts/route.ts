import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/permissions/auth-guard";
import {
  getLoanAccounts,
  getLoanPortfolioSummary,
} from "@/modules/loans/loan-account-service";
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
    const status = searchParams.get("status") || undefined;
    const customerId = searchParams.get("customerId") || undefined;
    const search = searchParams.get("search") || undefined;
    const limit = parseInt(searchParams.get("limit") || "50", 10);
    const offset = parseInt(searchParams.get("offset") || "0", 10);

    const [accountsResult, summary] = await Promise.all([
      getLoanAccounts(user, {
        status,
        customerId,
        search,
        limit,
        offset,
      }),
      getLoanPortfolioSummary(user),
    ]);

    return NextResponse.json({
      ...accountsResult,
      summary,
    });
  } catch (err: unknown) {
    if (err instanceof AppError) {
      return NextResponse.json(err.toJSON(), { status: err.statusCode });
    }
    console.error("Loan accounts fetch error:", err);
    return NextResponse.json(
      { error: { code: "INTERNAL_SERVER_ERROR", message: "Failed to fetch loan accounts" } },
      { status: 500 }
    );
  }
}

