import { NextRequest, NextResponse } from "next/server";
import { loginSchema } from "@/lib/validation/schemas";
import { login } from "@/modules/identity/auth-service";
import { sessionCookieOptions } from "@/lib/auth/session";
import { AppError } from "@/lib/errors/app-error";
import { enforceRateLimit, clearRateLimit } from "@/lib/security/rate-limiter";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = loginSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid login payload",
            details: parsed.error.errors,
          },
        },
        { status: 400 }
      );
    }

    const ipAddress = req.headers.get("x-forwarded-for") || req.ip || undefined;
    const userAgent = req.headers.get("user-agent") || undefined;

    // Defense-in-depth: Rate limit login attempts to 5 requests per minute per IP + username
    const rateLimitKey = `auth_login:${ipAddress || "client"}:${parsed.data.username}`;
    enforceRateLimit(rateLimitKey, { windowMs: 60_000, maxRequests: 5 });

    const result = await login({
      organizationCode: parsed.data.organizationCode,
      username: parsed.data.username,
      password: parsed.data.password,
      ipAddress,
      userAgent,
    });

    // Clear rate limiter tracking on successful authentication
    clearRateLimit(rateLimitKey);

    const response = NextResponse.json({
      success: true,
      user: {
        userId: result.user.userId,
        username: result.user.username,
        email: result.user.email,
        fullName: result.user.fullName,
        organizationId: result.user.organizationId,
        organizationCode: result.user.organizationCode,
        roles: result.user.roles,
        permissions: Array.from(result.user.permissions),
        scopes: result.user.scopes,
      },
    });

    response.cookies.set({
      ...sessionCookieOptions,
      value: result.token,
    });

    return response;
  } catch (err: unknown) {
    if (err instanceof AppError) {
      return NextResponse.json(err.toJSON(), { status: err.statusCode });
    }

    console.error("Login unexpected error:", err);
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "An unexpected error occurred during authentication",
        },
      },
      { status: 500 }
    );
  }
}

