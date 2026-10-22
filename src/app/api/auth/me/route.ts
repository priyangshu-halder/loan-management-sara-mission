import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/permissions/auth-guard";

export async function GET() {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json(
      {
        error: {
          code: "UNAUTHORIZED",
          message: "Authentication required",
        },
      },
      { status: 401 }
    );
  }

  return NextResponse.json({
    user: {
      userId: user.userId,
      username: user.username,
      email: user.email,
      fullName: user.fullName,
      status: user.status,
      organizationId: user.organizationId,
      organizationCode: user.organizationCode,
      roles: user.roles,
      permissions: Array.from(user.permissions),
      scopes: user.scopes,
      isSuperAdmin: user.isSuperAdmin,
      isOrgAdmin: user.isOrgAdmin,
    },
  });
}
