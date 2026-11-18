import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, requirePermission } from "@/lib/permissions/auth-guard";
import { prisma } from "@/lib/db/prisma";
import { handleApiError } from "@/lib/errors/api-response";
import { readStoredFile } from "@/lib/storage/storage-provider";

const DOC_FIELD_MAP: Record<string, "passportPhoto" | "aadhaarFrontDoc" | "aadhaarBackDoc" | "panPhoto"> = {
  passport: "passportPhoto",
  "aadhaar-front": "aadhaarFrontDoc",
  "aadhaar-back": "aadhaarBackDoc",
  pan: "panPhoto",
};

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string; type: string } }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { error: { code: "UNAUTHORIZED", message: "Authentication required" } },
        { status: 401 }
      );
    }

    requirePermission(user, "customer.kyc.view");

    const normalizedType = params.type.toLowerCase();

    // Special handling for application form document stored in CustomerDocument & file storage
    if (normalizedType === "application-form" || normalizedType === "application_form") {
      const customer = await prisma.customer.findUnique({
        where: { id: params.id },
      });

      if (!customer || customer.organizationId !== user.organizationId) {
        return NextResponse.json(
          { error: { code: "NOT_FOUND", message: "Customer not found" } },
          { status: 404 }
        );
      }

      const doc = await prisma.customerDocument.findFirst({
        where: {
          customerId: params.id,
          organizationId: user.organizationId,
          documentType: "APPLICATION_FORM",
        },
      });

      if (!doc) {
        return NextResponse.json(
          { error: { code: "NOT_FOUND", message: "Application form document not uploaded" } },
          { status: 404 }
        );
      }

      const buffer = await readStoredFile(doc.storagePath);
      const isDownload = req.nextUrl.searchParams.get("download") === "true";
      const filename = doc.fileName || `${customer.customerCode}_application_form`;

      return new NextResponse(new Uint8Array(buffer), {
        status: 200,
        headers: {
          "Content-Type": doc.mimeType,
          "Content-Length": buffer.length.toString(),
          "Cache-Control": "private, no-cache, no-store, must-revalidate",
          "X-Content-Type-Options": "nosniff",
          ...(isDownload ? { "Content-Disposition": `attachment; filename="${filename}"` } : { "Content-Disposition": `inline; filename="${filename}"` }),
        },
      });
    }

    const field = DOC_FIELD_MAP[normalizedType];
    if (!field) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: `Unknown document type: ${params.type}` } },
        { status: 404 }
      );
    }

    const customer = await prisma.customer.findUnique({
      where: { id: params.id },
    });

    if (!customer || customer.organizationId !== user.organizationId) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Customer not found" } },
        { status: 404 }
      );
    }

    const docData = (customer as Record<string, unknown>)[field] as string | null | undefined;
    if (!docData) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Document not uploaded" } },
        { status: 404 }
      );
    }

    // Parse data URI if present
    if (docData.startsWith("data:")) {
      const match = docData.match(/^data:([^;]+);base64,(.*)$/);
      if (match) {
        const mimeType = match[1];
        const buffer = Buffer.from(match[2], "base64");
        const isDownload = req.nextUrl.searchParams.get("download") === "true";
        const extension = mimeType === "application/pdf" ? "pdf" : mimeType.split("/")[1] || "bin";
        const filename = `${customer.customerCode}_${params.type}.${extension}`;

        return new NextResponse(new Uint8Array(buffer), {
          status: 200,
          headers: {
            "Content-Type": mimeType,
            "Content-Length": buffer.length.toString(),
            "Cache-Control": "private, no-cache, no-store, must-revalidate",
            "X-Content-Type-Options": "nosniff",
            ...(isDownload ? { "Content-Disposition": `attachment; filename="${filename}"` } : {}),
          },
        });
      }
    }

    // Return reference
    return NextResponse.json({ url: docData });
  } catch (err: unknown) {
    return handleApiError(err, "Failed to retrieve document");
  }
}
