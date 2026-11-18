import { prisma } from "@/lib/db/prisma";
import { AuthenticatedUser } from "@/lib/permissions/types";
import { requireSuperAdmin } from "@/lib/permissions/auth-guard";
import { NotFoundError, ValidationError, ForbiddenError } from "@/lib/errors/app-error";
import { recordAuditEvent } from "@/modules/audit/audit-service";
import {
  SYSTEM_PERMISSIONS,
  REUSABLE_PERMISSION_PROFILES,
  SystemPermissionDef,
} from "@/lib/permissions/permission-registry";

export interface StaffPermissionSummary {
  allPermissions: SystemPermissionDef[];
  profiles: Array<{
    id: string;
    code: string;
    name: string;
    description: string | null;
    permissions: string[];
  }>;
  staffList: Array<{
    id: string;
    username: string;
    fullName: string;
    email: string;
    status: string;
  }>;
  selectedStaff?: {
    id: string;
    username: string;
    fullName: string;
    email: string;
    status: string;
    roles: Array<{ code: string; name: string }>;
    permissionProfileId: string | null;
    directPermissions: Record<string, boolean>; // code -> granted
    rolePermissions: string[];
    effectivePermissions: string[];
  } | null;
}

export interface UpdateStaffPermissionsInput {
  targetUserId: string;
  permissionProfileId?: string | null;
  permissions: Record<string, boolean>; // code -> true (grant) / false (explicitly revoke)
}

/**
 * Loads permission summary, all system permissions, profiles, and optional target staff detail.
 */
export async function getStaffPermissionSummary(
  caller: AuthenticatedUser,
  targetUserId?: string | null
): Promise<StaffPermissionSummary> {
  requireSuperAdmin(caller);

  // 1. Fetch all staff members in the organization for selector
  const staffList = await prisma.user.findMany({
    where: { organizationId: caller.organizationId },
    select: {
      id: true,
      username: true,
      fullName: true,
      email: true,
      status: true,
    },
    orderBy: { fullName: "asc" },
  });

  // 2. Fetch reusable profiles
  const dbProfiles = await prisma.permissionProfile.findMany({
    where: { organizationId: caller.organizationId },
    include: {
      profilePermissions: {
        include: { permission: true },
      },
    },
    orderBy: { name: "asc" },
  });

  const profiles = dbProfiles.map((p) => ({
    id: p.id,
    code: p.code,
    name: p.name,
    description: p.description,
    permissions: p.profilePermissions.map((pp) => pp.permission.code),
  }));

  let selectedStaff: StaffPermissionSummary["selectedStaff"] = null;

  const targetId = targetUserId || (staffList.length > 0 ? staffList[0].id : null);

  if (targetId) {
    const user = await prisma.user.findUnique({
      where: { id: targetId },
      include: {
        userRoles: {
          include: {
            role: {
              include: {
                rolePermissions: {
                  include: { permission: true },
                },
              },
            },
          },
        },
        userPermissions: {
          include: { permission: true },
        },
        permissionProfile: {
          include: {
            profilePermissions: {
              include: { permission: true },
            },
          },
        },
      },
    });

    if (user && user.organizationId === caller.organizationId) {
      const rolePermissions = new Set<string>();
      const roles: Array<{ code: string; name: string }> = [];

      for (const ur of user.userRoles) {
        roles.push({ code: ur.role.code, name: ur.role.name });
        for (const rp of ur.role.rolePermissions) {
          rolePermissions.add(rp.permission.code);
        }
      }

      const effective = new Set<string>(rolePermissions);

      // Add profile permissions if assigned
      if (user.permissionProfile) {
        for (const pp of user.permissionProfile.profilePermissions) {
          effective.add(pp.permission.code);
        }
      }

      // Apply direct user permissions / overrides
      const directPermissions: Record<string, boolean> = {};
      for (const up of user.userPermissions) {
        directPermissions[up.permission.code] = up.granted;
        if (up.granted) {
          effective.add(up.permission.code);
        } else {
          effective.delete(up.permission.code);
        }
      }

      selectedStaff = {
        id: user.id,
        username: user.username,
        fullName: user.fullName,
        email: user.email,
        status: user.status,
        roles,
        permissionProfileId: user.permissionProfileId,
        directPermissions,
        rolePermissions: Array.from(rolePermissions),
        effectivePermissions: Array.from(effective),
      };
    }
  }

  return {
    allPermissions: SYSTEM_PERMISSIONS,
    profiles,
    staffList,
    selectedStaff,
  };
}

/**
 * Updates staff permissions individually or applies a profile template.
 */
export async function updateStaffPermissions(
  caller: AuthenticatedUser,
  input: UpdateStaffPermissionsInput
): Promise<{ success: boolean; effectivePermissions: string[] }> {
  requireSuperAdmin(caller);

  const targetUser = await prisma.user.findUnique({
    where: { id: input.targetUserId },
    include: {
      userRoles: { include: { role: true } },
    },
  });

  if (!targetUser || targetUser.organizationId !== caller.organizationId) {
    throw new NotFoundError("User", input.targetUserId);
  }

  // Prevent modifying other superadmin accounts unless caller is primary admin
  const isTargetSuperAdmin =
    targetUser.username === "admin" ||
    targetUser.userRoles.some((ur) => ur.role.code === "SUPER_ADMIN");

  if (isTargetSuperAdmin && caller.userId !== targetUser.id && caller.username !== "admin") {
    throw new ForbiddenError("Cannot modify permissions of another Superadmin account");
  }

  // Fetch all db permissions to map code to id
  const dbPermissions = await prisma.permission.findMany();
  const permMap = new Map(dbPermissions.map((p) => [p.code, p.id]));

  const grantedCodes: string[] = [];
  const revokedCodes: string[] = [];

  await prisma.$transaction(async (tx) => {
    // 1. Update permission profile id on user
    if (input.permissionProfileId !== undefined) {
      await tx.user.update({
        where: { id: targetUser.id },
        data: { permissionProfileId: input.permissionProfileId || null },
      });
    }

    // 2. Clear existing direct permissions for this user to ensure an exact override state
    await tx.userPermission.deleteMany({
      where: { userId: targetUser.id },
    });

    // 3. Insert newly specified permission overrides
    for (const [code, granted] of Object.entries(input.permissions)) {
      const permId = permMap.get(code);
      if (permId) {
        await tx.userPermission.create({
          data: {
            userId: targetUser.id,
            permissionId: permId,
            granted,
          },
        });

        if (granted) {
          grantedCodes.push(code);
        } else {
          revokedCodes.push(code);
        }
      }
    }

    // 4. Record audit event
    await recordAuditEvent(
      {
        organizationId: caller.organizationId,
        actorId: caller.userId,
        action: "user.permissions.update",
        entityType: "User",
        entityId: targetUser.id,
        metadata: {
          targetUsername: targetUser.username,
          permissionProfileId: input.permissionProfileId,
          grantedCount: grantedCodes.length,
          revokedCount: revokedCodes.length,
          grantedCodes,
          revokedCodes,
        },
      },
      tx
    );
  });

  // Calculate new effective permissions
  const summary = await getStaffPermissionSummary(caller, targetUser.id);
  const effective = summary.selectedStaff?.effectivePermissions || [];

  return {
    success: true,
    effectivePermissions: effective,
  };
}
