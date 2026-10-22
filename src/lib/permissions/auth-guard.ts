import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { validateSession } from "@/modules/identity/auth-service";
import { AuthenticatedUser } from "./types";
import { ForbiddenError, UnauthorizedError } from "@/lib/errors/app-error";

/**
 * Retrieves the current authenticated user context from incoming Next.js request cookies.
 * Returns null if not authenticated or session is invalid/expired.
 */
export async function getCurrentUser(): Promise<AuthenticatedUser | null> {
  try {
    const cookieStore = cookies();
    const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
    if (!token) {
      return null;
    }
    return await validateSession(token);
  } catch {
    return null;
  }
}

/**
 * Enforces that a request has a valid, active authenticated session.
 * Throws UnauthorizedError if unauthenticated.
 */
export async function requireAuth(): Promise<AuthenticatedUser> {
  const user = await getCurrentUser();
  if (!user) {
    throw new UnauthorizedError("Authentication required to access this resource");
  }
  return user;
}

/**
 * Enforces that the user has a specific permission code.
 * Platform Super Admin bypasses domain permission checks.
 * Throws ForbiddenError if permission is missing.
 */
export function requirePermission(user: AuthenticatedUser, permissionCode: string): void {
  if (user.isSuperAdmin) {
    return;
  }

  if (!user.permissions.has(permissionCode)) {
    throw new ForbiddenError(`Missing required permission: ${permissionCode}`);
  }
}

/**
 * Strictly enforces organization tenant boundary.
 * Throws ForbiddenError if user attempts cross-organization data access.
 */
export function requireOrganizationScope(user: AuthenticatedUser, targetOrganizationId: string): void {
  if (user.isSuperAdmin) {
    return;
  }

  if (user.organizationId !== targetOrganizationId) {
    throw new ForbiddenError(
      "Access denied: cross-organization access is strictly prohibited"
    );
  }
}

/**
 * Enforces branch boundary based on user's assigned scope.
 * If user has ORGANIZATION scope, they may access any branch within their tenant.
 * If user has only BRANCH scope, targetBranchId must match one of their permitted branches.
 */
export function requireBranchScope(user: AuthenticatedUser, targetBranchId?: string | null): void {
  if (user.isSuperAdmin) {
    return;
  }

  const hasOrgScope = user.scopes.some((s) => s.scopeType === "ORGANIZATION");
  if (hasOrgScope) {
    return;
  }

  if (!targetBranchId) {
    throw new ForbiddenError("Access denied: branch-scoped users require an explicit permitted branch target");
  }

  const permittedBranchIds = new Set(
    user.scopes.filter((s) => s.scopeType === "BRANCH" && s.branchId).map((s) => s.branchId)
  );

  if (!permittedBranchIds.has(targetBranchId)) {
    throw new ForbiddenError(`Access denied: branch ${targetBranchId} is out of user's permitted scope`);
  }
}

/**
 * Combined record-level scope check for both organization and branch boundaries.
 */
export function requireRecordScope(
  user: AuthenticatedUser,
  record: { organizationId: string; branchId?: string | null }
): void {
  requireOrganizationScope(user, record.organizationId);
  if (record.branchId) {
    requireBranchScope(user, record.branchId);
  }
}

/**
 * Enforces maker-checker separation of duties.
 * Prevents a user from approving, sanctioning, or posting their own submission.
 */
export function assertMakerCheckerSeparation(
  makerId: string,
  checkerId: string,
  operationName = "action"
): void {
  if (makerId === checkerId) {
    throw new ForbiddenError(
      `Maker-checker separation violation: you cannot perform ${operationName} on your own transaction`
    );
  }
}

