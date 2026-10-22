import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db/prisma";
import { NotFoundError, UnauthorizedError, ValidationError } from "@/lib/errors/app-error";
import { recordAuditEvent } from "@/modules/audit/audit-service";

export const RESET_TOKEN_EXPIRY_MS = 60 * 60 * 1000; // 1 hour

export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export async function createPasswordResetToken(userId: string): Promise<string> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    throw new NotFoundError("User", userId);
  }

  // Generate high-entropy token
  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + RESET_TOKEN_EXPIRY_MS);

  // Invalidate any existing unused reset tokens for this user
  await prisma.passwordResetToken.updateMany({
    where: { userId, isUsed: false },
    data: { isUsed: true },
  });

  await prisma.passwordResetToken.create({
    data: {
      userId,
      tokenHash,
      expiresAt,
    },
  });

  await recordAuditEvent({
    organizationId: user.organizationId,
    actorId: user.id,
    action: "user.password_reset.requested",
    entityType: "User",
    entityId: user.id,
  });

  return rawToken;
}

export async function resetPasswordWithToken(rawToken: string, newPassword: string): Promise<void> {
  if (!rawToken || typeof rawToken !== "string") {
    throw new ValidationError("Invalid or missing reset token");
  }

  if (newPassword.length < 8) {
    throw new ValidationError("Password must be at least 8 characters long");
  }

  const tokenHash = hashToken(rawToken);
  const resetRecord = await prisma.passwordResetToken.findUnique({
    where: { tokenHash },
    include: { user: true },
  });

  if (!resetRecord || resetRecord.isUsed) {
    throw new UnauthorizedError("Password reset token is invalid or has already been used");
  }

  if (resetRecord.expiresAt < new Date()) {
    throw new UnauthorizedError("Password reset token has expired");
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);

  await prisma.$transaction(async (tx) => {
    // Mark token as used
    await tx.passwordResetToken.update({
      where: { id: resetRecord.id },
      data: { isUsed: true },
    });

    // Update password
    await tx.user.update({
      where: { id: resetRecord.userId },
      data: { passwordHash, mustChangePassword: false },
    });

    // Invalidate all active user sessions for security
    await tx.session.updateMany({
      where: { userId: resetRecord.userId, isRevoked: false },
      data: { isRevoked: true },
    });

    // Record audit event
    await recordAuditEvent(
      {
        organizationId: resetRecord.user.organizationId,
        actorId: resetRecord.userId,
        action: "user.password_reset.completed",
        entityType: "User",
        entityId: resetRecord.userId,
      },
      tx
    );
  });
}

export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string
): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    throw new NotFoundError("User", userId);
  }

  const isCurrentValid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!isCurrentValid) {
    throw new UnauthorizedError("Current password is incorrect");
  }

  if (newPassword.length < 8) {
    throw new ValidationError("New password must be at least 8 characters long");
  }

  const newPasswordHash = await bcrypt.hash(newPassword, 10);

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: { passwordHash: newPasswordHash, mustChangePassword: false },
    });

    await recordAuditEvent(
      {
        organizationId: user.organizationId,
        actorId: userId,
        action: "user.password.change",
        entityType: "User",
        entityId: userId,
      },
      tx
    );
  });
}
