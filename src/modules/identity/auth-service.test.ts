import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { login, logout, validateSession } from "./auth-service";
import { createUser, updateUserStatus } from "./user-service";
import { UnauthorizedError, ConflictError } from "@/lib/errors/app-error";

describe("Authentication and Identity Services", () => {
  beforeAll(async () => {
    // Ensure clean state for test user if exists
    await prisma.session.deleteMany({
      where: { user: { username: "test_branch_manager" } },
    });
    await prisma.userRole.deleteMany({
      where: { user: { username: "test_branch_manager" } },
    });
    await prisma.userScope.deleteMany({
      where: { user: { username: "test_branch_manager" } },
    });
    await prisma.user.deleteMany({
      where: { username: "test_branch_manager" },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe("login and session management", () => {
    it("successfully logs in with valid credentials and issues a session", async () => {
      const result = await login({
        organizationCode: "RAYHAN-MFI",
        username: "admin",
        password: "Admin@12345",
      });

      expect(result.token).toBeDefined();
      expect(result.user.username).toBe("admin");
      expect(result.user.organizationCode).toBe("RAYHAN-MFI");
      expect(result.user.roles).toContain("ORG_ADMIN");
      expect(result.user.permissions.has("user.manage")).toBe(true);

      // Validate session retrieval using the token
      const sessionUser = await validateSession(result.token);
      expect(sessionUser).not.toBeNull();
      expect(sessionUser?.userId).toBe(result.user.userId);
      expect(sessionUser?.permissions.has("org.manage")).toBe(true);

      // Verify audit log entry was created
      const auditLog = await prisma.auditEvent.findFirst({
        where: {
          organizationId: result.user.organizationId,
          action: "user.login",
          actorId: result.user.userId,
        },
        orderBy: { createdAt: "desc" },
      });
      expect(auditLog).not.toBeNull();
      expect(auditLog?.action).toBe("user.login");
    });

    it("rejects login with incorrect password", async () => {
      await expect(
        login({
          organizationCode: "RAYHAN-MFI",
          username: "admin",
          password: "WrongPassword123!",
        })
      ).rejects.toThrow(UnauthorizedError);
    });

    it("rejects login for non-existent username", async () => {
      await expect(
        login({
          organizationCode: "RAYHAN-MFI",
          username: "non_existent_user",
          password: "Password123!",
        })
      ).rejects.toThrow(UnauthorizedError);
    });

    it("rejects login for non-existent organization", async () => {
      await expect(
        login({
          organizationCode: "NON_EXISTENT_ORG",
          username: "admin",
          password: "Admin@12345",
        })
      ).rejects.toThrow(UnauthorizedError);
    });

    it("successfully logs out and invalidates the session", async () => {
      const loginRes = await login({
        organizationCode: "RAYHAN-MFI",
        username: "admin",
        password: "Admin@12345",
      });

      expect(await validateSession(loginRes.token)).not.toBeNull();

      await logout(loginRes.token);

      // Validating revoked session returns null
      expect(await validateSession(loginRes.token)).toBeNull();
    });
  });

  describe("user lifecycle and status enforcement", () => {
    it("creates a new user with branch scope and enforces permissions and status", async () => {
      const adminLogin = await login({
        organizationCode: "RAYHAN-MFI",
        username: "admin",
        password: "Admin@12345",
      });

      const branch = await prisma.branch.findFirst({
        where: { organizationId: adminLogin.user.organizationId },
      });
      expect(branch).not.toBeNull();

      // Create new user
      const newUser = await createUser(adminLogin.user, {
        organizationId: adminLogin.user.organizationId,
        username: "test_branch_manager",
        email: "bm_test@rayhan-mfi.local",
        password: "SecurePassword@123",
        fullName: "Test Branch Manager",
        roleCodes: ["ORG_ADMIN"],
        branchId: branch!.id,
        scopeType: "BRANCH",
      });

      expect(newUser.username).toBe("test_branch_manager");

      // Verify new user can log in
      const bmLogin = await login({
        organizationCode: "RAYHAN-MFI",
        username: "test_branch_manager",
        password: "SecurePassword@123",
      });
      expect(bmLogin.user.username).toBe("test_branch_manager");
      expect(bmLogin.user.scopes[0].scopeType).toBe("BRANCH");
      expect(bmLogin.user.scopes[0].branchId).toBe(branch!.id);

      // Now suspend the user
      await updateUserStatus(adminLogin.user, newUser.id, "SUSPENDED");

      // Verify active session was revoked on suspension
      expect(await validateSession(bmLogin.token)).toBeNull();

      // Verify suspended user cannot initiate a new session
      await expect(
        login({
          organizationCode: "RAYHAN-MFI",
          username: "test_branch_manager",
          password: "SecurePassword@123",
        })
      ).rejects.toThrow(/Account is suspended or deactivated/);
    });

    it("prevents duplicate username creation within the same organization", async () => {
      const adminLogin = await login({
        organizationCode: "RAYHAN-MFI",
        username: "admin",
        password: "Admin@12345",
      });

      await expect(
        createUser(adminLogin.user, {
          organizationId: adminLogin.user.organizationId,
          username: "admin", // Already exists
          email: "another_email@rayhan-mfi.local",
          password: "SecurePassword@123",
          fullName: "Another Admin",
          roleCodes: ["ORG_ADMIN"],
        })
      ).rejects.toThrow(ConflictError);
    });
  });
});

