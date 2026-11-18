import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/permissions/auth-guard";
import { reverseCollectionReceipt } from "@/modules/collections/collection-receipt-service";
import { AppError } from "@/lib/errors/app-error";
import { getTodayBusinessDate } from "@/lib/dates/dates";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { error: { code: "UNAUTHORIZED", message: "Authentication required" } },
        { status: 401 }
      );
    }

    const body = await req.json();
    const result = await reverseCollectionReceipt(user, {
      organizationId: user.organizationId,
      receiptId: params.id,
      reversalReason: body.reversalReason,
      businessDate: body.businessDate || getTodayBusinessDate(),
    });

    return NextResponse.json({ success: true, result });
  } catch (err: unknown) {
    if (err instanceof AppError) {
      return NextResponse.json(err.toJSON(), { status: err.statusCode });
    }
    console.error("Receipt reversal error:", err);
    return NextResponse.json(
      { error: { code: "INTERNAL_SERVER_ERROR", message: "Failed to reverse collection receipt" } },
      { status: 500 }
    );
  }
}

