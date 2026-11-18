import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/permissions/auth-guard";
import { getBranches } from "@/modules/customers/customer-service";
import { handleApiError } from "@/lib/errors/api-response";

export async function GET(_req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { error: { code: "UNAUTHORIZED", message: "Authentication required" } },
        { status: 401 }
      );
    }

    const branches = await getBranches(user);
    return NextResponse.json({ branches });
  } catch (err: unknown) {
    return handleApiError(err, "Failed to fetch branches");
  }
}
