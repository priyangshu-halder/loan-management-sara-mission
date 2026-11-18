import { prisma } from "@/lib/db/prisma";
import { SYSTEM_PERMISSIONS, REUSABLE_PERMISSION_PROFILES } from "./permission-registry";

export async function seedPermissionsAndProfiles(organizationId?: string) {
  // 1. Upsert all granular system permissions
  for (const perm of SYSTEM_PERMISSIONS) {
    await prisma.permission.upsert({
      where: { code: perm.code },
      update: {
        description: perm.description,
        module: perm.module,
      },
      create: {
        code: perm.code,
        module: perm.module,
        description: perm.description,
      },
    });
  }

  // Fetch all permissions indexed by code
  const dbPermissions = await prisma.permission.findMany();
  const permMap = new Map(dbPermissions.map((p) => [p.code, p.id]));

  // If organizationId provided, or for all active organizations:
  const orgs = organizationId
    ? await prisma.organization.findMany({ where: { id: organizationId } })
    : await prisma.organization.findMany();

  for (const org of orgs) {
    // 2. Ensure SUPER_ADMIN role exists
    const superAdminRole = await prisma.role.upsert({
      where: {
        organizationId_code: {
          organizationId: org.id,
          code: "SUPER_ADMIN",
        },
      },
      update: {},
      create: {
        organizationId: org.id,
        code: "SUPER_ADMIN",
        name: "Super Administrator",
        description: "Full, unrestricted system control and configuration authorization.",
        isSystem: true,
      },
    });

    // Ensure all permissions are linked to SUPER_ADMIN role
    for (const perm of dbPermissions) {
      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: {
            roleId: superAdminRole.id,
            permissionId: perm.id,
          },
        },
        update: {},
        create: {
          roleId: superAdminRole.id,
          permissionId: perm.id,
        },
      });
    }

    // Also ensure ORG_ADMIN has all permissions
    const orgAdminRole = await prisma.role.findFirst({
      where: {
        organizationId: org.id,
        code: "ORG_ADMIN",
      },
    });

    if (orgAdminRole) {
      for (const perm of dbPermissions) {
        await prisma.rolePermission.upsert({
          where: {
            roleId_permissionId: {
              roleId: orgAdminRole.id,
              permissionId: perm.id,
            },
          },
          update: {},
          create: {
            roleId: orgAdminRole.id,
            permissionId: perm.id,
          },
        });
      }
    }

    // Ensure standard operational staff role LOAN_OFFICER exists
    await prisma.role.upsert({
      where: {
        organizationId_code: {
          organizationId: org.id,
          code: "LOAN_OFFICER",
        },
      },
      update: {},
      create: {
        organizationId: org.id,
        code: "LOAN_OFFICER",
        name: "Loan Officer",
        description: "Operational field staff without administrative access",
        isSystem: false,
      },
    });

    // 3. Upsert Reusable Permission Profiles
    for (const profileDef of REUSABLE_PERMISSION_PROFILES) {
      const profile = await prisma.permissionProfile.upsert({
        where: {
          organizationId_code: {
            organizationId: org.id,
            code: profileDef.code,
          },
        },
        update: {
          name: profileDef.name,
          description: profileDef.description,
        },
        create: {
          organizationId: org.id,
          code: profileDef.code,
          name: profileDef.name,
          description: profileDef.description,
          isSystem: true,
        },
      });

      // Link permissions to profile
      for (const pCode of profileDef.permissions) {
        const permId = permMap.get(pCode);
        if (permId) {
          await prisma.permissionProfilePermission.upsert({
            where: {
              profileId_permissionId: {
                profileId: profile.id,
                permissionId: permId,
              },
            },
            update: {},
            create: {
              profileId: profile.id,
              permissionId: permId,
            },
          });
        }
      }
    }
  }
}
