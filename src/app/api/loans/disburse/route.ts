import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/permissions/auth-guard";
import { createLoanDisbursement } from "@/modules/loans/loan-disbursement-service";
import { handleApiError } from "@/lib/errors/api-response";

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
    const result = await createLoanDisbursement(user, {
      ...body,
      organizationId: user.organizationId,
    });

    return NextResponse.json({ success: true, result }, { status: 201 });
  } catch (err: unknown) {
    return handleApiError(err, "Failed to disburse loan");
  }
}

