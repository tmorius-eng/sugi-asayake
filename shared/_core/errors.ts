// Апп түвшний (tRPC бус) алдааны боловсруулалтын жижиг хуваалцсан алдааны шатлал.
// Санаатайгаар хамгийн бага: кодын өөр юу ч одоогоор "shared/types"-оос import
// хийдэггүй ч тэндээс re-export хийгддэг тул байж, type-check хийгдэх ёстой.

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
