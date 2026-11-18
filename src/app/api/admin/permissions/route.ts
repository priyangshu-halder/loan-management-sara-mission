import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, requireSuperAdmin } from "@/lib/permissions/auth-guard";
import {
  getStaffPermissionSummary,
  updateStaffPermissions,
} from "@/modules/permissions/permission-management-service";
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

    requireSuperAdmin(user);

    const userId = req.nextUrl.searchParams.get("userId") || undefined;
    const summary = await getStaffPermissionSummary(user, userId);

    return NextResponse.json({
      success: true,
      ...summary,
    });
  } catch (err: unknown) {
    return handleApiError(err, "Failed to load staff permissions summary");
  }
}

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
    if (!body.targetUserId || !body.permissions) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "targetUserId and permissions map are required" } },
        { status: 400 }
      );
    }

    const result = await updateStaffPermissions(user, {
      targetUserId: body.targetUserId,
      permissionProfileId: body.permissionProfileId,
      permissions: body.permissions,
    });

    return NextResponse.json(result);
  } catch (err: unknown) {
    return handleApiError(err, "Failed to update staff permissions");
  }
}
