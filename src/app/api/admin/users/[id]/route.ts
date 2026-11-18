import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, requireAdminUserAccess } from "@/lib/permissions/auth-guard";
import { updateStaff, deleteOrDeactivateStaff } from "@/modules/identity/user-service";
import { prisma } from "@/lib/db/prisma";
import { handleApiError } from "@/lib/errors/api-response";

export async function GET(
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

    requireAdminUserAccess(user);

    const targetUser = await prisma.user.findUnique({
      where: { id: params.id },
      include: {
        userRoles: { include: { role: true } },
        userPermissions: { include: { permission: true } },
        permissionProfile: true,
      },
    });

    if (!targetUser || targetUser.organizationId !== user.organizationId) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Staff member not found" } },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      user: {
        id: targetUser.id,
        username: targetUser.username,
        email: targetUser.email,
        fullName: targetUser.fullName,
        status: targetUser.status,
        permissionProfileId: targetUser.permissionProfileId,
        roles: targetUser.userRoles.map((ur) => ({ id: ur.role.id, code: ur.role.code, name: ur.role.name })),
        directPermissions: targetUser.userPermissions.map((up) => ({
          code: up.permission.code,
          granted: up.granted,
        })),
      },
    });
  } catch (err: unknown) {
    return handleApiError(err, "Failed to load staff member details");
  }
}

export async function PUT(
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

    requireAdminUserAccess(user);

    const body = await req.json();
    const updated = await updateStaff(user, params.id, body);

    return NextResponse.json({
      success: true,
      user: updated,
    });
  } catch (err: unknown) {
    return handleApiError(err, "Failed to update staff member");
  }
}

export async function DELETE(
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

    requireAdminUserAccess(user);

    const result = await deleteOrDeactivateStaff(user, params.id);

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (err: unknown) {
    return handleApiError(err, "Failed to deactivate staff member");
  }
}
