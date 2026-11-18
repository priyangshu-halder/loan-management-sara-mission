import { NextRequest, NextResponse } from "next/server";
import { getPublicSettings } from "@/modules/settings/settings-service";
import { handleApiError } from "@/lib/errors/api-response";

export async function GET(req: NextRequest) {
  try {
    const orgCode = req.nextUrl.searchParams.get("organizationCode") || undefined;
    const settings = await getPublicSettings(orgCode);

    return NextResponse.json({
      success: true,
      settings,
    });
  } catch (err: unknown) {
    return handleApiError(err, "Failed to load public branding settings");
  }
}
