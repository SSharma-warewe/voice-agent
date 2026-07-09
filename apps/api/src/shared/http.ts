import type { NextFunction, Request, RequestHandler, Response } from "express";
import { AppError } from "./errors.ts";

type AsyncRequestHandler = (
  req: Request,
  res: Response,
  next: NextFunction,
) => Promise<void>;

/** Wrap async route handlers so rejections reach the error middleware. */
export function asyncHandler(fn: AsyncRequestHandler): RequestHandler {
  return (req, res, next) => {
    void fn(req, res, next).catch(next);
  };
}

function describeError(err: unknown): string {
  if (err instanceof Error) {
    const cause =
      "cause" in err && err.cause instanceof Error
        ? ` (cause: ${err.cause.message})`
        : "";
    return `${err.name}: ${err.message}${cause}`;
  }
  return String(err);
}

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({ errorMessage: err.errorMessage });
    return;
  }

  console.error(
    `Unhandled API error ${req.method} ${req.originalUrl || req.url}:`,
    describeError(err),
  );
  if (err instanceof Error && err.stack) {
    console.error(err.stack);
  }

  res.status(500).json({ errorMessage: "Internal server error" });
}
