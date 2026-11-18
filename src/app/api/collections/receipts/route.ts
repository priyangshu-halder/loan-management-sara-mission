import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/permissions/auth-guard";
import {
  createCollectionReceipt,
  getCollectionReceipts,
} from "@/modules/collections/collection-receipt-service";
import { handleApiError } from "@/lib/errors/api-response";

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
    const loanAccountId = searchParams.get("loanAccountId") || undefined;
    const status = searchParams.get("status") || undefined;
    const businessDate = searchParams.get("businessDate") || undefined;
    const search = searchParams.get("search") || undefined;
    const limit = parseInt(searchParams.get("limit") || "50", 10);
    const offset = parseInt(searchParams.get("offset") || "0", 10);

    const result = await getCollectionReceipts(user, {
      loanAccountId,
      status,
      businessDate,
      search,
      limit,
      offset,
    });

    return NextResponse.json(result);
  } catch (err: unknown) {
    return handleApiError(err, "Failed to fetch collection receipts");
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { error: { code: "UNAUTHORIZED", message: "Authentication required" } },
        { status: 401 }
      );
    }

    const body = await req.json();
    const result = await createCollectionReceipt(user, {
      ...body,
      organizationId: user.organizationId,
    });

    return NextResponse.json({ success: true, result }, { status: 201 });
  } catch (err: unknown) {
    return handleApiError(err, "Failed to record collection receipt");
  }
}

