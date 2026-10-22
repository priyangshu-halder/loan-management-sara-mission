export type ErrorCode =
  | "BAD_REQUEST"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "UNPROCESSABLE_ENTITY"
  | "INVARIANT_VIOLATION"
  | "INTERNAL_SERVER_ERROR";

export interface ErrorDetails {
  field?: string;
  message: string;
  code?: string;
}

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly statusCode: number;
  readonly details?: ErrorDetails[];

  constructor(message: string, code: ErrorCode = "INTERNAL_SERVER_ERROR", statusCode = 500, details?: ErrorDetails[]) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    Object.setPrototypeOf(this, new.target.prototype);
  }

  toJSON() {
    return {
      error: {
        code: this.code,
        message: this.message,
        details: this.details,
      },
    };
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Authentication required") {
    super(message, "UNAUTHORIZED", 401);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Access denied: insufficient permissions or scope") {
    super(message, "FORBIDDEN", 403);
  }
}

export class NotFoundError extends AppError {
  constructor(resource = "Resource", identifier?: string) {
    const msg = identifier ? `${resource} (${identifier}) not found` : `${resource} not found`;
    super(msg, "NOT_FOUND", 404);
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, "CONFLICT", 409);
  }
}

export class ValidationError extends AppError {
  constructor(message = "Validation failed", details?: ErrorDetails[]) {
    super(message, "UNPROCESSABLE_ENTITY", 422, details);
  }
}

export class InvariantViolationError extends AppError {
  constructor(message: string) {
    super(`Accounting/Financial invariant violated: ${message}`, "INVARIANT_VIOLATION", 500);
  }
}
