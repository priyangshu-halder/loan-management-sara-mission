import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, requireSuperAdmin } from "@/lib/permissions/auth-guard";
import { updateAdminAccount } from "@/modules/settings/settings-service";
import { handleApiError } from "@/lib/errors/api-response";

export async function PUT(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { error: { code: "UNAUTHORIZED", message: "Authentication required" } },
        { status: 401 }
      );
    }

    requireSuperAdmin(user);

    const body = await req.json();
    const result = await updateAdminAccount(user, body);

    return NextResponse.json(result);
  } catch (err: unknown) {
    return handleApiError(err, "Failed to update administrator credentials");
  }
}
