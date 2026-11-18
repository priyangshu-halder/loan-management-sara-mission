import { describe, it, expect } from "vitest";
import { handleApiError } from "./api-response";
import { ConflictError, ValidationError, NotFoundError } from "./app-error";

describe("API Error Handler & Prisma Error Mapping (SEC-02)", () => {
  it("translates AppError instances into JSON responses with exact status code", async () => {
    const err = new ConflictError("Receipt number already exists");
    const response = handleApiError(err);

    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error.code).toBe("CONFLICT");
    expect(body.error.message).toBe("Receipt number already exists");
  });

  it("maps Prisma P2002 unique constraint violations to 409 Conflict", async () => {
    const prismaError = {
      code: "P2002",
      meta: { target: ["receiptNumber"] },
      message: "Unique constraint failed on the constraint: `receiptNumber`",
    };

    const response = handleApiError(prismaError);
    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error.code).toBe("CONFLICT");
    expect(body.error.message).toContain("receiptNumber");
  });

  it("maps Prisma P2025 record not found to 404 Not Found", async () => {
    const prismaError = {
      code: "P2025",
      message: "Record to update not found.",
    };

    const response = handleApiError(prismaError);
    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("NOT_FOUND");
  });

  it("sanitizes unexpected internal exceptions and returns 500 without leaking stack traces", async () => {
    const unhandledError = new Error("Database password in /etc/secret leaked");
    const response = handleApiError(unhandledError, "Custom failure message");

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error.code).toBe("INTERNAL_SERVER_ERROR");
    expect(body.error.message).toBe("Custom failure message");
    expect(JSON.stringify(body)).not.toContain("password");
  });
});

