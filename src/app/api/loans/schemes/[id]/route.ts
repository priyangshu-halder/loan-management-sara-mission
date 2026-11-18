import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/permissions/auth-guard";
import {
  getLoanSchemeById,
  updateLoanScheme,
  deleteLoanScheme,
} from "@/modules/loans/loan-scheme-service";
import { handleApiError } from "@/lib/errors/api-response";

interface RouteContext {
  params: { id: string } | Promise<{ id: string }>;
}

export async function GET(req: NextRequest, context: RouteContext) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Authentication required" } }, { status: 401 });
    }

    const { id } = await Promise.resolve(context.params);
    const scheme = await getLoanSchemeById(user, id);

    return NextResponse.json({ scheme });
  } catch (err: unknown) {
    return handleApiError(err, "Failed to fetch loan scheme");
  }
}

export async function PUT(req: NextRequest, context: RouteContext) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Authentication required" } }, { status: 401 });
    }

    const { id } = await Promise.resolve(context.params);
    const body = await req.json();

    const scheme = await updateLoanScheme(user, {
      ...body,
      schemeId: id,
      organizationId: user.organizationId,
    });

    return NextResponse.json({ success: true, scheme });
  } catch (err: unknown) {
    return handleApiError(err, "Failed to update loan scheme");
  }
}

export async function PATCH(req: NextRequest, context: RouteContext) {
  return PUT(req, context);
}

export async function DELETE(req: NextRequest, context: RouteContext) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Authentication required" } }, { status: 401 });
    }

    const { id } = await Promise.resolve(context.params);
    const result = await deleteLoanScheme(user, id);

    return NextResponse.json(result);
  } catch (err: unknown) {
    return handleApiError(err, "Failed to delete loan scheme");
  }
}
