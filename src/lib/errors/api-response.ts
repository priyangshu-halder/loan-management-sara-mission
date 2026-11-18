import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AppError, ConflictError, NotFoundError } from "./app-error";

export function handleApiError(err: unknown, defaultMessage = "An unexpected error occurred"): NextResponse {
  if (err instanceof AppError) {
    return NextResponse.json(err.toJSON(), { status: err.statusCode });
  }

  // Zod Validation Error
  if (err instanceof ZodError) {
    const message = err.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join("; ");
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message,
          details: err.errors,
        },
      },
      { status: 400 }
    );
  }

  // Prisma Unique Constraint Violation (P2002)
  if (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: unknown }).code === "P2002"
  ) {
    const target = (err as { meta?: { target?: string[] | string } }).meta?.target;
    const fieldName = Array.isArray(target) ? target.join(", ") : target ? String(target) : "unique field";
    const conflict = new ConflictError(`A record with this ${fieldName} already exists.`);
    return NextResponse.json(conflict.toJSON(), { status: 409 });
  }

  // Prisma Record Not Found (P2025)
  if (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: unknown }).code === "P2025"
  ) {
    const notFound = new NotFoundError("Requested record not found");
    return NextResponse.json(notFound.toJSON(), { status: 404 });
  }

  console.error("Unhandled API error:", err);
  return NextResponse.json(
    {
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: defaultMessage,
      },
    },
    { status: 500 }
  );
}

