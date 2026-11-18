import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, requireSuperAdmin } from "@/lib/permissions/auth-guard";
import {
  getCompanySettings,
  updateCompanySettings,
  getGeneralPreferences,
  updateGeneralPreferences,
  getSystemPreferences,
  updateSystemPreferences,
} from "@/modules/settings/settings-service";
import { handleApiError } from "@/lib/errors/api-response";

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { error: { code: "UNAUTHORIZED", message: "Authentication required" } },
        { status: 401 }
      );
    }

    requireSuperAdmin(user);

    const [company, general, system] = await Promise.all([
      getCompanySettings(user.organizationId),
      getGeneralPreferences(user.organizationId),
      getSystemPreferences(user.organizationId),
    ]);

    return NextResponse.json({
      success: true,
      settings: {
        company,
        general,
        system,
      },
    });
  } catch (err: unknown) {
    return handleApiError(err, "Failed to load system settings");
  }
}

export async function PUT(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { error: { code: "UNAUTHORIZED", message: "Authentication required" } },
        { status: 401 }
      );
    }

    requireSuperAdmin(user);

    const body = await req.json();
    const { section, data } = body;

    if (!section || !data) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "Section and data are required" } },
        { status: 400 }
      );
    }

    let result: unknown;

    if (section === "company") {
      result = await updateCompanySettings(user, data);
    } else if (section === "general") {
      result = await updateGeneralPreferences(user, data);
    } else if (section === "system") {
      result = await updateSystemPreferences(user, data);
    } else {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: `Unknown settings section: ${section}` } },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      section,
      data: result,
    });
  } catch (err: unknown) {
    return handleApiError(err, "Failed to update settings");
  }
}
