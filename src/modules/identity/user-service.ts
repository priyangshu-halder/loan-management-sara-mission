import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db/prisma";
import { AuthenticatedUser } from "@/lib/permissions/types";
import { requirePermission, requireOrganizationScope, requireAdminUserAccess } from "@/lib/permissions/auth-guard";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors/app-error";
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
  permissionProfileId?: string | null;
}

export async function createUser(caller: AuthenticatedUser, input: CreateUserInput) {
  requireOrganizationScope(caller, input.organizationId);
  requireAdminUserAccess(caller);

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

  // Branch-scope assignments removed from staff interface per Task 2.2.
  // Existing branch data is preserved; default new staff to ORGANIZATION scope unless explicitly provided in tests.
  const scopeType = input.scopeType || (input.branchId ? "BRANCH" : "ORGANIZATION");
  const passwordHash = await bcrypt.hash(input.password, 10);

  return await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        organizationId: input.organizationId,
        username: input.username,
        email: input.email,
        fullName: input.fullName,
        passwordHash,
        status: "ACTIVE",
        permissionProfileId: input.permissionProfileId || null,
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

export interface UpdateStaffInput {
  fullName?: string;
  email?: string;
  password?: string;
  status?: "ACTIVE" | "SUSPENDED" | "DEACTIVATED";
  roleCodes?: string[];
  permissionProfileId?: string | null;
}

export async function updateStaff(
  caller: AuthenticatedUser,
  targetUserId: string,
  input: UpdateStaffInput
) {
  requireAdminUserAccess(caller);

  const target = await prisma.user.findUnique({
    where: { id: targetUserId },
    include: {
      userRoles: { include: { role: true } },
    },
  });

  if (!target) {
    throw new NotFoundError("User", targetUserId);
  }

  requireOrganizationScope(caller, target.organizationId);

  // Prevent ordinary admin from modifying superadmin account
  const isTargetSuperAdmin =
    target.userRoles.some((ur) => ur.role.code === "SUPER_ADMIN") ||
    target.username === "admin";

  if (isTargetSuperAdmin && !caller.isSuperAdmin) {
    throw new ForbiddenError("Only Superadmin can modify Superadmin credentials or roles");
  }

  // Prevent deactivating the last active Superadmin
  if (isTargetSuperAdmin && input.status && input.status !== "ACTIVE") {
    const activeSuperAdmins = await prisma.user.count({
      where: {
        organizationId: target.organizationId,
        status: "ACTIVE",
        OR: [
          { username: "admin" },
          { userRoles: { some: { role: { code: "SUPER_ADMIN" } } } },
        ],
      },
    });

    if (activeSuperAdmins <= 1) {
      throw new ForbiddenError("Cannot deactivate the last active Superadmin");
    }
  }

  // Check email conflict
  if (input.email && input.email !== target.email) {
    const existing = await prisma.user.findFirst({
      where: {
        organizationId: target.organizationId,
        email: input.email,
        NOT: { id: target.id },
      },
    });
    if (existing) {
      throw new ConflictError(`Email "${input.email}" is already in use`);
    }
  }

  let newPasswordHash: string | undefined = undefined;
  if (input.password && input.password.trim().length > 0) {
    if (input.password.length < 8) {
      throw new ValidationError("Password must be at least 8 characters long");
    }
    newPasswordHash = await bcrypt.hash(input.password, 10);
  }

  return await prisma.$transaction(async (tx) => {
    // If roleCodes supplied, update roles
    if (input.roleCodes && input.roleCodes.length > 0) {
      const roles = await tx.role.findMany({
        where: {
          organizationId: target.organizationId,
          code: { in: input.roleCodes },
        },
      });

      if (roles.length !== input.roleCodes.length) {
        throw new ValidationError("One or more assigned roles do not exist");
      }

      await tx.userRole.deleteMany({
        where: { userId: target.id },
      });

      for (const r of roles) {
        await tx.userRole.create({
          data: {
            userId: target.id,
            roleId: r.id,
          },
        });
      }
    }

    const updated = await tx.user.update({
      where: { id: target.id },
      data: {
        ...(input.fullName ? { fullName: input.fullName } : {}),
        ...(input.email ? { email: input.email } : {}),
        ...(input.status ? { status: input.status } : {}),
        ...(newPasswordHash ? { passwordHash: newPasswordHash } : {}),
        ...(input.permissionProfileId !== undefined ? { permissionProfileId: input.permissionProfileId } : {}),
      },
    });

    // Invalidate sessions if deactivated, suspended, or password changed
    if ((input.status && input.status !== "ACTIVE") || newPasswordHash) {
      await tx.session.updateMany({
        where: { userId: target.id, isRevoked: false },
        data: { isRevoked: true },
      });
    }

    await recordAuditEvent(
      {
        organizationId: target.organizationId,
        actorId: caller.userId,
        action: "user.update",
        entityType: "User",
        entityId: target.id,
        metadata: {
          updatedFields: Object.keys(input),
          status: updated.status,
          roles: input.roleCodes,
        },
      },
      tx
    );

    return {
      id: updated.id,
      fullName: updated.fullName,
      email: updated.email,
      username: updated.username,
      status: updated.status,
    };
  });
}

export async function deleteOrDeactivateStaff(
  caller: AuthenticatedUser,
  targetUserId: string
) {
  requireAdminUserAccess(caller);

  if (caller.userId === targetUserId) {
    throw new ValidationError("You cannot delete or deactivate your own account");
  }

  const target = await prisma.user.findUnique({
    where: { id: targetUserId },
    include: {
      userRoles: { include: { role: true } },
    },
  });

  if (!target) {
    throw new NotFoundError("User", targetUserId);
  }

  requireOrganizationScope(caller, target.organizationId);

  const isTargetSuperAdmin =
    target.userRoles.some((ur) => ur.role.code === "SUPER_ADMIN") ||
    target.username === "admin";

  if (isTargetSuperAdmin) {
    const activeSuperAdmins = await prisma.user.count({
      where: {
        organizationId: target.organizationId,
        status: "ACTIVE",
        OR: [
          { username: "admin" },
          { userRoles: { some: { role: { code: "SUPER_ADMIN" } } } },
        ],
      },
    });

    if (activeSuperAdmins <= 1) {
      throw new ForbiddenError("Cannot delete or deactivate the last active Superadmin account");
    }
  }

  // Deactivate and revoke sessions to preserve historical financial integrity
  return await prisma.$transaction(async (tx) => {
    const deactivated = await tx.user.update({
      where: { id: target.id },
      data: { status: "DEACTIVATED" },
    });

    await tx.session.updateMany({
      where: { userId: target.id, isRevoked: false },
      data: { isRevoked: true },
    });

    await recordAuditEvent(
      {
        organizationId: target.organizationId,
        actorId: caller.userId,
        action: "user.delete",
        entityType: "User",
        entityId: target.id,
        metadata: {
          previousStatus: target.status,
          newStatus: "DEACTIVATED",
          username: target.username,
        },
      },
      tx
    );

    return {
      id: deactivated.id,
      username: deactivated.username,
      status: deactivated.status,
      message: "Staff member deactivated successfully and sessions revoked",
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

