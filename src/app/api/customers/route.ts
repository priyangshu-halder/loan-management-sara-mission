import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/permissions/auth-guard";
import { getCustomers, createCustomer } from "@/modules/customers/customer-service";
import { AppError } from "@/lib/errors/app-error";

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
    const page = parseInt(searchParams.get("page") || "1", 10);
    const pageSize = parseInt(searchParams.get("pageSize") || "20", 10);

    const result = await getCustomers(user, { search, branchId, status, page, pageSize });
    return NextResponse.json(result);
  } catch (err: unknown) {
    if (err instanceof AppError) {
      return NextResponse.json(err.toJSON(), { status: err.statusCode });
    }
    console.error("Customers fetch error:", err);
    return NextResponse.json({ error: { code: "INTERNAL_SERVER_ERROR", message: "Failed to fetch customers" } }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Authentication required" } }, { status: 401 });
    }

    const body = await req.json();
    const customer = await createCustomer(user, {
      ...body,
      organizationId: user.organizationId,
    });

    return NextResponse.json({ success: true, customer }, { status: 201 });
  } catch (err: unknown) {
    if (err instanceof AppError) {
      return NextResponse.json(err.toJSON(), { status: err.statusCode });
    }
    console.error("Customer create error:", err);
    return NextResponse.json({ error: { code: "INTERNAL_SERVER_ERROR", message: "Failed to create customer" } }, { status: 500 });
  }
}
