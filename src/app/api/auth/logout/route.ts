import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, sessionCookieOptions } from "@/lib/auth/session";
import { logout } from "@/modules/identity/auth-service";

export async function POST(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  const ipAddress = req.headers.get("x-forwarded-for") || req.ip || undefined;

  if (token) {
    await logout(token, ipAddress);
  }

  const response = NextResponse.json({ success: true, message: "Logged out successfully" });

  response.cookies.set({
    ...sessionCookieOptions,
    value: "",
    maxAge: 0,
  });

  return response;
}
