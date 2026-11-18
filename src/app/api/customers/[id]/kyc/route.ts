import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/permissions/auth-guard";
import { verifyCustomerKyc } from "@/modules/customers/customer-service";
import { handleApiError } from "@/lib/errors/api-response";

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
    const { status, reason } = body;

    if (status !== "VERIFIED" && status !== "REJECTED") {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: 'Status must be "VERIFIED" or "REJECTED"' } },
        { status: 400 }
      );
    }

    const updated = await verifyCustomerKyc(user, params.id, status, reason);

    return NextResponse.json({
      success: true,
      customer: updated,
    });
  } catch (err: unknown) {
    return handleApiError(err, "Failed to update customer KYC status");
  }
}
