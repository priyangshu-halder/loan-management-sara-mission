import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/permissions/auth-guard";
import { previewLoanScheme } from "@/modules/loans/loan-scheme-service";
import { AppError } from "@/lib/errors/app-error";

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Authentication required" } }, { status: 401 });
    }

    const body = await req.json();
    const preview = await previewLoanScheme(user, {
      ...body,
      organizationId: user.organizationId,
    });

    return NextResponse.json({ preview });
  } catch (err: unknown) {
    if (err instanceof AppError) {
      return NextResponse.json(err.toJSON(), { status: err.statusCode });
    }
    console.error("Loan scheme preview error:", err);
    return NextResponse.json({ error: { code: "INTERNAL_SERVER_ERROR", message: "Failed to generate loan preview" } }, { status: 500 });
  }
}
