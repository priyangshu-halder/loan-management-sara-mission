import { describe, it, expect, beforeAll, afterAll } from "vitest";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db/prisma";
import {
  createPasswordResetToken,
  resetPasswordWithToken,
  changePassword,
  hashToken,
} from "./password-service";
import { login } from "./auth-service";
import { UnauthorizedError } from "@/lib/errors/app-error";

describe("Password Management Service", () => {
  let testUserId: string;

  beforeAll(async () => {
    // Find organization
    const org = await prisma.organization.findFirst({
      where: { code: "RAYHAN-MFI" },
    });

    // Clean up if exists
    await prisma.passwordResetToken.deleteMany({
      where: { user: { username: "pwd_test_user" } },
    });
    await prisma.session.deleteMany({
      where: { user: { username: "pwd_test_user" } },
    });
    await prisma.user.deleteMany({
      where: { username: "pwd_test_user" },
    });

    const initialHash = await bcrypt.hash("InitialPassword@123", 10);
    const user = await prisma.user.create({
      data: {
        organizationId: org!.id,
        username: "pwd_test_user",
        email: "pwd_test@rayhan-mfi.local",
        fullName: "Password Test User",
        passwordHash: initialHash,
        status: "ACTIVE",
      },
    });
    testUserId = user.id;
  });

  afterAll(async () => {
    await prisma.passwordResetToken.deleteMany({
      where: { userId: testUserId },
    });
    await prisma.session.deleteMany({
      where: { userId: testUserId },
    });
    await prisma.user.deleteMany({
      where: { id: testUserId },
    });
    await prisma.$disconnect();
  });

  it("creates a password reset token and resets password successfully", async () => {
    const rawToken = await createPasswordResetToken(testUserId);
    expect(rawToken).toBeDefined();
    expect(typeof rawToken).toBe("string");

    // Reset password
    await resetPasswordWithToken(rawToken, "NewPassword@123");

    // Verify user can log in with new password
    const loginRes = await login({
      organizationCode: "RAYHAN-MFI",
      username: "pwd_test_user",
      password: "NewPassword@123",
    });
    expect(loginRes.token).toBeDefined();

    // Verify token cannot be reused
    await expect(resetPasswordWithToken(rawToken, "AnotherPassword@123")).rejects.toThrow(
      UnauthorizedError
    );
  });

  it("rejects expired password reset token", async () => {
    const rawToken = await createPasswordResetToken(testUserId);

    // Manually expire the token in database
    const tokenHash = hashToken(rawToken);
    await prisma.passwordResetToken.update({
      where: { tokenHash },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    await expect(resetPasswordWithToken(rawToken, "ExpiredPassword@123")).rejects.toThrow(
      /expired/
    );
  });

  it("changes password with valid current password", async () => {
    await changePassword(testUserId, "NewPassword@123", "RestoredPassword@123");

    // Verify login with updated password
    const res = await login({
      organizationCode: "RAYHAN-MFI",
      username: "pwd_test_user",
      password: "RestoredPassword@123",
    });
    expect(res.token).toBeDefined();

    // Verify wrong current password is rejected
    await expect(
      changePassword(testUserId, "WrongPassword@123", "AnotherNewPassword@123")
    ).rejects.toThrow(UnauthorizedError);
  });
});
