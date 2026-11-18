import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/permissions/auth-guard";
import {
  getMasterCatalogItems,
  createMasterCatalogItem,
} from "@/modules/master-data/catalog-service";
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

    const { searchParams } = new URL(req.url);
    const category = searchParams.get("category");
    if (!category) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "Query parameter 'category' is required" } },
        { status: 400 }
      );
    }

    const includeInactive = searchParams.get("includeInactive") === "true";
    const items = await getMasterCatalogItems(user, category, includeInactive);

    return NextResponse.json({ items });
  } catch (err: unknown) {
    return handleApiError(err, "Failed to fetch master catalog items");
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { error: { code: "UNAUTHORIZED", message: "Authentication required" } },
        { status: 401 }
      );
    }

    const body = await req.json();
    const item = await createMasterCatalogItem(user, body);

    return NextResponse.json({ success: true, item }, { status: 201 });
  } catch (err: unknown) {
    return handleApiError(err, "Failed to create master catalog item");
  }
}
