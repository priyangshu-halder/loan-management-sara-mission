export type ScopeType = "ORGANIZATION" | "BRANCH";

export interface UserScopeInfo {
  scopeType: ScopeType;
  branchId: string | null;
  branchCode?: string | null;
}

export interface AuthenticatedUser {
  userId: string;
  organizationId: string;
  organizationCode: string;
  username: string;
  email: string;
  fullName: string;
  status: string;
  roles: string[];
  permissions: Set<string>;
  scopes: UserScopeInfo[];
  isSuperAdmin: boolean;
  isOrgAdmin: boolean;
}
