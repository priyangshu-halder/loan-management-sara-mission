import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db/prisma";
import { AuthenticatedUser } from "@/lib/permissions/types";
import { requirePermission, requireOrganizationScope } from "@/lib/permissions/auth-guard";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors/app-error";
import { recordAuditEvent } from "@/modules/audit/audit-service";

export interface CreateUserInput {
  organizationId: string;
  username: string;
  email: string;
  password: string;
  fullName: string;
  roleCodes: string[];
  branchId?: string | null;
  scopeType?: "ORGANIZATION" | "BRANCH";
}

export async function createUser(caller: AuthenticatedUser, input: CreateUserInput) {
  requireOrganizationScope(caller, input.organizationId);
  requirePermission(caller, "user.manage");

  // Check unique constraints within tenant
  const existingUser = await prisma.user.findFirst({
    where: {
      organizationId: input.organizationId,
      OR: [{ username: input.username }, { email: input.email }],
    },
  });

  if (existingUser) {
    throw new ConflictError(
      existingUser.username === input.username
        ? `Username "${input.username}" is already in use in this organization`
        : `Email "${input.email}" is already in use in this organization`
    );
  }

  // Validate roles exist in organization
  const roles = await prisma.role.findMany({
    where: {
      organizationId: input.organizationId,
      code: { in: input.roleCodes },
    },
  });

  if (roles.length !== input.roleCodes.length) {
    throw new ValidationError("One or more assigned roles do not exist in this organization");
  }

  // If branch assigned, validate branch exists in organization
  if (input.branchId) {
    const branch = await prisma.branch.findUnique({
      where: { id: input.branchId },
    });
    if (!branch || branch.organizationId !== input.organizationId) {
      throw new ValidationError("Assigned branch does not exist in this organization");
    }
  }

  const passwordHash = await bcrypt.hash(input.password, 10);
  const scopeType = input.scopeType || (input.branchId ? "BRANCH" : "ORGANIZATION");

  return await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        organizationId: input.organizationId,
        username: input.username,
        email: input.email,
        fullName: input.fullName,
        passwordHash,
        status: "ACTIVE",
      },
    });

    // Create user roles
    for (const role of roles) {
      await tx.userRole.create({
        data: {
          userId: user.id,
          roleId: role.id,
        },
      });
    }

    // Create user scope
    await tx.userScope.create({
      data: {
        userId: user.id,
        branchId: input.branchId || null,
        scopeType,
      },
    });

    // Emit audit event
    await recordAuditEvent(
      {
        organizationId: input.organizationId,
        actorId: caller.userId,
        action: "user.create",
        entityType: "User",
        entityId: user.id,
        metadata: {
          username: user.username,
          roles: input.roleCodes,
          scopeType,
          branchId: input.branchId,
        },
      },
      tx
    );

    return {
      id: user.id,
      organizationId: user.organizationId,
      username: user.username,
      email: user.email,
      fullName: user.fullName,
      status: user.status,
    };
  });
}

export async function updateUserStatus(
  caller: AuthenticatedUser,
  targetUserId: string,
  newStatus: "ACTIVE" | "SUSPENDED" | "DEACTIVATED"
) {
  requirePermission(caller, "user.manage");

  if (caller.userId === targetUserId) {
    throw new ValidationError("Users cannot change their own account status");
  }

  const target = await prisma.user.findUnique({
    where: { id: targetUserId },
  });

  if (!target) {
    throw new NotFoundError("User", targetUserId);
  }

  requireOrganizationScope(caller, target.organizationId);

  return await prisma.$transaction(async (tx) => {
    const updated = await tx.user.update({
      where: { id: targetUserId },
      data: { status: newStatus },
    });

    // If deactivated or suspended, revoke all active sessions immediately
    if (newStatus !== "ACTIVE") {
      await tx.session.updateMany({
        where: { userId: targetUserId, isRevoked: false },
        data: { isRevoked: true },
      });
    }

    await recordAuditEvent(
      {
        organizationId: target.organizationId,
        actorId: caller.userId,
        action: "user.status.update",
        entityType: "User",
        entityId: target.id,
        metadata: {
          previousStatus: target.status,
          newStatus,
        },
      },
      tx
    );

    return { id: updated.id, status: updated.status };
  });
}
