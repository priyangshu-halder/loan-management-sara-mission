import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/permissions/auth-guard";
import { getLoanSchemes, createLoanScheme } from "@/modules/loans/loan-scheme-service";
import { handleApiError } from "@/lib/errors/api-response";

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Authentication required" } }, { status: 401 });
    }

    const schemes = await getLoanSchemes(user);
    return NextResponse.json({ schemes });
  } catch (err: unknown) {
    return handleApiError(err, "Failed to fetch loan schemes");
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Authentication required" } }, { status: 401 });
    }

    const body = await req.json();
    const { version, ...rest } = body || {};
    const payload = {
      ...rest,
      ...(version && typeof version === "object" ? version : {}),
      organizationId: user.organizationId,
    };

    const scheme = await createLoanScheme(user, payload);

    return NextResponse.json({ success: true, scheme }, { status: 201 });
  } catch (err: unknown) {
    return handleApiError(err, "Failed to create loan scheme");
  }
}

