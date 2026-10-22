import { Prisma, PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db/prisma";

export interface RecordAuditParams {
  organizationId: string;
  actorId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, unknown> | null;
  ipAddress?: string | null;
}

const REDACTED_KEYS = new Set([
  "password",
  "passwordhash",
  "token",
  "secret",
  "tokenhash",
  "sessionsecret",
  "creditcard",
  "cvv",
]);

/**
 * Sanitizes metadata to prevent secrets from being stored in audit logs.
 */
export function sanitizeAuditMetadata(obj: unknown, depth = 0): unknown {
  if (depth > 5 || obj === null || obj === undefined) {
    return obj;
  }
  if (typeof obj !== "object") {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map((item) => sanitizeAuditMetadata(item, depth + 1));
  }

  const sanitized: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(obj as Record<string, unknown>)) {
    const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (REDACTED_KEYS.has(normalizedKey)) {
      sanitized[key] = "[REDACTED]";
    } else if (typeof val === "object" && val !== null) {
      sanitized[key] = sanitizeAuditMetadata(val, depth + 1);
    } else {
      sanitized[key] = val;
    }
  }
  return sanitized;
}

/**
 * Records an append-only audit event in the database.
 * Accepts an optional Prisma transaction client for atomic mutations.
 */
export async function recordAuditEvent(
  params: RecordAuditParams,
  db: PrismaClient | Prisma.TransactionClient = defaultPrisma
): Promise<void> {
  const sanitized = params.metadata ? sanitizeAuditMetadata(params.metadata) : null;
  const metadataString = sanitized ? JSON.stringify(sanitized) : null;

  await db.auditEvent.create({
    data: {
      organizationId: params.organizationId,
      actorId: params.actorId || null,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId || null,
      metadata: metadataString,
      ipAddress: params.ipAddress || null,
    },
  });
}

