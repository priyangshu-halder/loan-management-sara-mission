import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, requirePermission } from "@/lib/permissions/auth-guard";
import { createUser } from "@/modules/identity/user-service";
import { prisma } from "@/lib/db/prisma";
import { handleApiError } from "@/lib/errors/api-response";
import { createUserSchema } from "@/lib/validation/schemas";

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { error: { code: "UNAUTHORIZED", message: "Authentication required" } },
        { status: 401 }
      );
    }

    requirePermission(user, "user.manage");

    const users = await prisma.user.findMany({
      where: { organizationId: user.organizationId },
      include: {
        userRoles: { include: { role: true } },
        userScopes: { include: { branch: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    const sanitizedUsers = users.map((u) => ({
      id: u.id,
      organizationId: u.organizationId,
      username: u.username,
      email: u.email,
      fullName: u.fullName,
      status: u.status,
      createdAt: u.createdAt,
      roles: u.userRoles.map((ur) => ({ id: ur.role.id, code: ur.role.code, name: ur.role.name })),
      scopes: u.userScopes.map((us) => ({
        id: us.id,
        scopeType: us.scopeType,
        branchId: us.branchId,
        branchName: us.branch?.name,
      })),
    }));

    return NextResponse.json({ success: true, users: sanitizedUsers });
  } catch (err: unknown) {
    return handleApiError(err, "Failed to fetch users");
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { error: { code: "UNAUTHORIZED", message: "Authentication required" } },
        { status: 401 }
      );
    }

    requirePermission(user, "user.manage");

    const body = await req.json();
    const payload = {
      ...body,
      organizationId: user.organizationId,
    };

    const parsed = createUserSchema.parse(payload);
    const newUser = await createUser(user, parsed);

    return NextResponse.json({ success: true, user: newUser }, { status: 201 });
  } catch (err: unknown) {
    return handleApiError(err, "Failed to create user");
  }
}

