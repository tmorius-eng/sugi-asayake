// Small shared error hierarchy for app-level (non-tRPC) error handling.
// Kept intentionally minimal: nothing else in the codebase currently imports
// from "shared/types", but the file is re-exported from there, so it needs to
// exist and type-check.

export class AppError extends Error {
  constructor(
    message: string,
    public readonly code: string = "APP_ERROR",
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Not found") {
    super(message, "NOT_FOUND");
    this.name = "NotFoundError";
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Please login") {
    super(message, "UNAUTHORIZED");
    this.name = "UnauthorizedError";
  }
}
