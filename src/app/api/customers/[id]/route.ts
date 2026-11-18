import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/permissions/auth-guard";
import { getCustomerById, updateCustomer } from "@/modules/customers/customer-service";
import { handleApiError } from "@/lib/errors/api-response";

export async function GET(
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

    const customer = await getCustomerById(user, params.id);
    return NextResponse.json({ customer });
  } catch (err: unknown) {
    return handleApiError(err, "Failed to fetch customer");
  }
}

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

    const contentType = req.headers.get("content-type") || "";

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const payload: Record<string, any> = {};

      formData.forEach((value, key) => {
        if (key === "applicationForm") {
          // Processed below
        } else if (key === "removeApplicationForm") {
          payload.removeApplicationForm = value === "true" || value === "1";
        } else if (typeof value === "string") {
          payload[key] = value;
        }
      });

      const fileEntry = formData.get("applicationForm");
      if (fileEntry instanceof File && fileEntry.size > 0) {
        const buffer = Buffer.from(await fileEntry.arrayBuffer());
        payload.applicationFormFile = {
          fileName: fileEntry.name,
          mimeType: fileEntry.type || "application/octet-stream",
          buffer,
        };
      }

      const customer = await updateCustomer(user, params.id, payload as any);
      return NextResponse.json({ success: true, customer });
    }

    const body = await req.json();
    const customer = await updateCustomer(user, params.id, body);

    return NextResponse.json({ success: true, customer });
  } catch (err: unknown) {
    return handleApiError(err, "Failed to update customer");
  }
}
