import { describe, it, expect } from "vitest";
import {
  requirePermission,
  requireOrganizationScope,
  requireBranchScope,
  requireRecordScope,
  assertMakerCheckerSeparation,
} from "./auth-guard";
import { AuthenticatedUser } from "./types";
import { ForbiddenError } from "@/lib/errors/app-error";

describe("Authorization and Scope Guard", () => {
  const baseUser: AuthenticatedUser = {
    userId: "user-1",
    organizationId: "org-1",
    organizationCode: "ORG1",
    username: "john_officer",
    email: "john@org1.local",
    fullName: "John Officer",
    status: "ACTIVE",
    roles: ["LOAN_OFFICER"],
    permissions: new Set(["loan.application.create", "loan.application.submit"]),
    scopes: [{ scopeType: "BRANCH", branchId: "branch-north", branchCode: "NORTH" }],
    isSuperAdmin: false,
    isOrgAdmin: false,
  };

  describe("requirePermission", () => {
    it("allows execution when user has the required permission", () => {
      expect(() => requirePermission(baseUser, "loan.application.create")).not.toThrow();
    });

    it("throws ForbiddenError when user lacks the required permission", () => {
      expect(() => requirePermission(baseUser, "loan.application.approve")).toThrow(ForbiddenError);
    });

    it("allows Super Admin to bypass permission checks", () => {
      const superAdmin: AuthenticatedUser = {
        ...baseUser,
        isSuperAdmin: true,
        permissions: new Set(),
      };
      expect(() => requirePermission(superAdmin, "loan.application.approve")).not.toThrow();
    });
  });

  describe("requireOrganizationScope", () => {
    it("allows access when tenant organization matches", () => {
      expect(() => requireOrganizationScope(baseUser, "org-1")).not.toThrow();
    });

    it("strictly blocks cross-organization access with ForbiddenError", () => {
      expect(() => requireOrganizationScope(baseUser, "org-2")).toThrow(ForbiddenError);
      expect(() => requireOrganizationScope(baseUser, "org-attacker")).toThrow(
        /cross-organization access is strictly prohibited/
      );
    });

    it("allows Super Admin across organizations", () => {
      const superAdmin: AuthenticatedUser = {
        ...baseUser,
        isSuperAdmin: true,
      };
      expect(() => requireOrganizationScope(superAdmin, "org-other")).not.toThrow();
    });
  });

  describe("requireBranchScope", () => {
    it("allows branch-scoped user access to their assigned branch", () => {
      expect(() => requireBranchScope(baseUser, "branch-north")).not.toThrow();
    });

    it("strictly blocks branch-scoped user from accessing other branches", () => {
      expect(() => requireBranchScope(baseUser, "branch-south")).toThrow(ForbiddenError);
    });

    it("allows organization-scoped user to access any branch", () => {
      const orgWideUser: AuthenticatedUser = {
        ...baseUser,
        scopes: [{ scopeType: "ORGANIZATION", branchId: null }],
      };
      expect(() => requireBranchScope(orgWideUser, "branch-south")).not.toThrow();
      expect(() => requireBranchScope(orgWideUser, "branch-north")).not.toThrow();
    });
  });

  describe("requireRecordScope", () => {
    it("allows access to permitted record", () => {
      expect(() =>
        requireRecordScope(baseUser, {
          organizationId: "org-1",
          branchId: "branch-north",
        })
      ).not.toThrow();
    });

    it("blocks cross-organization record access", () => {
      expect(() =>
        requireRecordScope(baseUser, {
          organizationId: "org-2",
          branchId: "branch-north",
        })
      ).toThrow(ForbiddenError);
    });

    it("blocks out-of-branch record access", () => {
      expect(() =>
        requireRecordScope(baseUser, {
          organizationId: "org-1",
          branchId: "branch-south",
        })
      ).toThrow(ForbiddenError);
    });
  });

  describe("assertMakerCheckerSeparation", () => {
    it("allows checker when maker and checker are different users", () => {
      expect(() => assertMakerCheckerSeparation("user-maker", "user-checker")).not.toThrow();
    });

    it("strictly rejects when maker attempts to approve own action", () => {
      expect(() =>
        assertMakerCheckerSeparation("user-same", "user-same", "loan disbursement")
      ).toThrow(ForbiddenError);
    });
  });
});

