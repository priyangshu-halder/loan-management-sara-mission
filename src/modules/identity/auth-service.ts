import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db/prisma";
import { UnauthorizedError } from "@/lib/errors/app-error";
import {
  generateSessionToken,
  hashSessionToken,
  SESSION_DURATION_MS,
} from "@/lib/auth/session";
import { recordAuditEvent } from "@/modules/audit/audit-service";
import { AuthenticatedUser } from "@/lib/permissions/types";

import { Prisma } from "@prisma/client";

export type UserWithAuthRelations = Prisma.UserGetPayload<{
  include: {
    organization: true;
    userRoles: {
      include: {
        role: {
          include: {
            rolePermissions: {
              include: { permission: true };
            };
          };
        };
      };
    };
    userScopes: {
      include: { branch: true };
    };
  };
}>;

export interface LoginParams {
  organizationCode: string;
  username: string;
  password: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface LoginResult {
  token: string;
  user: AuthenticatedUser;
}

/**
 * Builds an AuthenticatedUser context from a raw user database record with relations.
 */
export function buildAuthenticatedUserContext(userRecord: UserWithAuthRelations): AuthenticatedUser {
  const roles: string[] = [];
  const permissions = new Set<string>();

  for (const ur of userRecord.userRoles || []) {
    if (ur.role) {
      roles.push(ur.role.code);
      for (const rp of ur.role.rolePermissions || []) {
        if (rp.permission?.code) {
          permissions.add(rp.permission.code);
        }
      }
    }
  }

  const scopes = (userRecord.userScopes || []).map((s) => ({
    scopeType: s.scopeType as "ORGANIZATION" | "BRANCH",
    branchId: s.branchId || null,
    branchCode: s.branch?.code || null,
  }));

  const isSuperAdmin = roles.includes("SUPER_ADMIN");
  const isOrgAdmin = roles.includes("ORG_ADMIN") || isSuperAdmin;

  return {
    userId: userRecord.id,
    organizationId: userRecord.organizationId,
    organizationCode: userRecord.organization.code,
    username: userRecord.username,
    email: userRecord.email,
    fullName: userRecord.fullName,
    status: userRecord.status,
    roles,
    permissions,
    scopes,
    isSuperAdmin,
    isOrgAdmin,
  };
}

/**
 * Authenticates a user against their organization credentials.
 */
export async function login(params: LoginParams): Promise<LoginResult> {
  const org = await prisma.organization.findUnique({
    where: { code: params.organizationCode },
  });

  if (!org) {
    throw new UnauthorizedError("Invalid credentials");
  }

  if (org.status !== "ACTIVE") {
    throw new UnauthorizedError("Organization account is suspended or inactive");
  }

  const user = await prisma.user.findUnique({
    where: {
      organizationId_username: {
        organizationId: org.id,
        username: params.username,
      },
    },
    include: {
      organization: true,
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
      userScopes: {
        include: { branch: true },
      },
    },
  });

  if (!user) {
    throw new UnauthorizedError("Invalid credentials");
  }

  if (user.status !== "ACTIVE") {
    throw new UnauthorizedError("Account is suspended or deactivated");
  }

  const isPasswordValid = await bcrypt.compare(params.password, user.passwordHash);
  if (!isPasswordValid) {
    throw new UnauthorizedError("Invalid credentials");
  }

  // Generate session token and store hash
  const rawToken = generateSessionToken();
  const tokenHash = hashSessionToken(rawToken);
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

  await prisma.$transaction([
    prisma.session.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt,
        ipAddress: params.ipAddress,
        userAgent: params.userAgent,
      },
    }),
    prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    }),
  ]);

  // Record login audit event
  await recordAuditEvent({
    organizationId: org.id,
    actorId: user.id,
    action: "user.login",
    entityType: "User",
    entityId: user.id,
    metadata: { username: user.username },
    ipAddress: params.ipAddress,
  });

  const authUser = buildAuthenticatedUserContext(user);

  return {
    token: rawToken,
    user: authUser,
  };
}

/**
 * Validates a session token and retrieves the active AuthenticatedUser.
 */
export async function validateSession(rawToken: string): Promise<AuthenticatedUser | null> {
  if (!rawToken || typeof rawToken !== "string") {
    return null;
  }

  const tokenHash = hashSessionToken(rawToken);

  const session = await prisma.session.findUnique({
    where: { tokenHash },
    include: {
      user: {
        include: {
          organization: true,
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
          userScopes: {
            include: { branch: true },
          },
        },
      },
    },
  });

  if (!session) {
    return null;
  }

  if (session.isRevoked || session.expiresAt < new Date()) {
    return null;
  }

  if (session.user.status !== "ACTIVE" || session.user.organization.status !== "ACTIVE") {
    return null;
  }

  return buildAuthenticatedUserContext(session.user);
}

/**
 * Revokes a session, logging the user out.
 */
export async function logout(rawToken: string, ipAddress?: string): Promise<void> {
  if (!rawToken) return;

  const tokenHash = hashSessionToken(rawToken);
  const session = await prisma.session.findUnique({
    where: { tokenHash },
    include: { user: true },
  });

  if (session && !session.isRevoked) {
    await prisma.session.update({
      where: { id: session.id },
      data: { isRevoked: true },
    });

    await recordAuditEvent({
      organizationId: session.user.organizationId,
      actorId: session.user.id,
      action: "user.logout",
      entityType: "Session",
      entityId: session.id,
      metadata: { sessionId: session.id },
      ipAddress,
    });
  }
}
