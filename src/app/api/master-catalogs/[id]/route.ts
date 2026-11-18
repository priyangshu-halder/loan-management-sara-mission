import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/permissions/auth-guard";
import {
  updateMasterCatalogItem,
  deleteMasterCatalogItem,
} from "@/modules/master-data/catalog-service";
import { handleApiError } from "@/lib/errors/api-response";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { error: { code: "UNAUTHORIZED", message: "Authentication required" } },
        { status: 401 }
      );
    }

    const body = await req.json();
    const item = await updateMasterCatalogItem(user, params.id, body);

    return NextResponse.json({ success: true, item });
  } catch (err: unknown) {
    return handleApiError(err, "Failed to update master catalog item");
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { error: { code: "UNAUTHORIZED", message: "Authentication required" } },
        { status: 401 }
      );
    }

    await deleteMasterCatalogItem(user, params.id);
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    return handleApiError(err, "Failed to delete master catalog item");
  }
}
