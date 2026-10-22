import { z } from "zod";

/**
 * Common string validations
 */
export const codeSchema = z
  .string()
  .min(2, "Code must be at least 2 characters")
  .max(30, "Code must be at most 30 characters")
  .regex(/^[A-Z0-9_-]+$/, "Code must contain only uppercase letters, numbers, underscores, or hyphens");

export const emailSchema = z.string().email("Invalid email address").max(100);

export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(100, "Password cannot exceed 100 characters");

export const uuidSchema = z.string().uuid("Invalid UUID format");

/**
 * Organization validation schemas
 */
export const createOrganizationSchema = z.object({
  code: codeSchema,
  name: z.string().min(2).max(100),
  currency: z.string().length(3).default("INR"),
  timezone: z.string().min(2).max(50).default("Asia/Kolkata"),
});

/**
 * Branch validation schemas
 */
export const createBranchSchema = z.object({
  organizationId: uuidSchema,
  code: codeSchema,
  name: z.string().min(2).max(100),
});

/**
 * Authentication validation schemas
 */
export const loginSchema = z.object({
  organizationCode: codeSchema,
  username: z.string().min(3).max(50),
  password: passwordSchema,
});

export const createUserSchema = z.object({
  organizationId: uuidSchema,
  username: z.string().min(3).max(50).regex(/^[a-zA-Z0-9_.-]+$/, "Username must be alphanumeric with ., -, or _"),
  email: emailSchema,
  fullName: z.string().min(2).max(100),
  password: passwordSchema,
  roleCodes: z.array(z.string()).min(1, "At least one role must be assigned"),
  branchId: uuidSchema.optional().nullable(),
});

