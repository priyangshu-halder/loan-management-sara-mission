import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/permissions/auth-guard";
import { getCustomers, createCustomer } from "@/modules/customers/customer-service";
import { handleApiError } from "@/lib/errors/api-response";

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Authentication required" } }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search") || undefined;
    const branchId = searchParams.get("branchId") || undefined;
    const status = searchParams.get("status") || undefined;
    const kycStatus = searchParams.get("kycStatus") || undefined;
    const page = parseInt(searchParams.get("page") || "1", 10);
    const pageSize = parseInt(searchParams.get("pageSize") || "20", 10);

    const result = await getCustomers(user, { search, branchId, status, kycStatus, page, pageSize });
    return NextResponse.json(result);
  } catch (err: unknown) {
    return handleApiError(err, "Failed to fetch customers");
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Authentication required" } }, { status: 401 });
    }

    const contentType = req.headers.get("content-type") || "";

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const payload: Record<string, any> = {
        organizationId: user.organizationId,
      };

      formData.forEach((value, key) => {
        if (key === "applicationForm" && value instanceof File && value.size > 0) {
          // File will be read asynchronously after loop or directly
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

      const customer = await createCustomer(user, payload as any);
      return NextResponse.json({ success: true, customer }, { status: 201 });
    }

    const body = await req.json();
    const customer = await createCustomer(user, {
      ...body,
      organizationId: user.organizationId,
    });

    return NextResponse.json({ success: true, customer }, { status: 201 });
  } catch (err: unknown) {
    return handleApiError(err, "Failed to create customer");
  }
}
