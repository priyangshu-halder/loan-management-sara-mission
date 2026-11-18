import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/permissions/auth-guard";
import { getCashbook, getEarliestCashbookDate } from "@/modules/accounting/ledger-service";
import { getTodayBusinessDate } from "@/lib/dates/dates";
import { prisma } from "@/lib/db/prisma";
import { AppError } from "@/lib/errors/app-error";

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Authentication required" } }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    let cashAccountId = searchParams.get("cashAccountId");
    let startDate = searchParams.get("startDate");
    let endDate = searchParams.get("endDate");

    if (!cashAccountId) {
      const defaultAcc = await prisma.cashAccount.findFirst({
        where: { organizationId: user.organizationId, isActive: true },
        orderBy: [{ accountType: "asc" }, { code: "asc" }],
      });
      if (!defaultAcc) {
        return NextResponse.json(
          { error: { code: "NOT_FOUND", message: "No active cash or bank accounts found." } },
          { status: 404 }
        );
      }
      cashAccountId = defaultAcc.id;
    }

    if (!startDate) {
      startDate = await getEarliestCashbookDate(user, user.organizationId, cashAccountId);
    }

    if (!endDate) {
      endDate = getTodayBusinessDate();
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

