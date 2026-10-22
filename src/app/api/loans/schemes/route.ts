import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/permissions/auth-guard";
import { getLoanSchemes, createLoanScheme } from "@/modules/loans/loan-scheme-service";
import { AppError } from "@/lib/errors/app-error";

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Authentication required" } }, { status: 401 });
    }

    const schemes = await getLoanSchemes(user);
    return NextResponse.json({ schemes });
  } catch (err: unknown) {
    if (err instanceof AppError) {
      return NextResponse.json(err.toJSON(), { status: err.statusCode });
    }
    console.error("Loan schemes fetch error:", err);
    return NextResponse.json({ error: { code: "INTERNAL_SERVER_ERROR", message: "Failed to fetch loan schemes" } }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Authentication required" } }, { status: 401 });
    }

    const body = await req.json();
    const scheme = await createLoanScheme(user, {
      ...body,
      organizationId: user.organizationId,
    });

    return NextResponse.json({ success: true, scheme }, { status: 201 });
  } catch (err: unknown) {
    if (err instanceof AppError) {
      return NextResponse.json(err.toJSON(), { status: err.statusCode });
    }
    console.error("Loan scheme create error:", err);
    return NextResponse.json({ error: { code: "INTERNAL_SERVER_ERROR", message: "Failed to create loan scheme" } }, { status: 500 });
  }
}
