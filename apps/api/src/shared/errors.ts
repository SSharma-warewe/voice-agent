export class AppError extends Error {
  readonly statusCode: number;
  readonly errorMessage: string;

  constructor(statusCode: number, errorMessage: string) {
    super(errorMessage);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.errorMessage = errorMessage;
  }
}

export function isPgUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "23505"
  );
}
