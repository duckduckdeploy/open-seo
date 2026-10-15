import type { z } from "zod";

export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const notFound = (what = "Resource") => new AppError(404, "not_found", `${what} not found`);
export const badRequest = (message: string, details?: unknown) => new AppError(400, "bad_request", message, details);
export const unauthorized = () => new AppError(401, "unauthorized", "Sign in or send a valid API key");
export const conflict = (message: string) => new AppError(409, "conflict", message);
/** 409 when the tracker or project already has a queued or running run. `details.reason` lets callers tell it apart. */
export const runInProgress = (message: string) => new AppError(409, "conflict", message, { reason: "run_in_progress" });
export const isRunInProgress = (error: unknown) =>
  error instanceof AppError && (error.details as { reason?: string } | undefined)?.reason === "run_in_progress";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A route parameter that must be a row ID. Anything else cannot exist, so it is a 404. */
export function uuidParam(value: string, what: string): string {
  if (!UUID.test(value)) throw notFound(what);
  return value;
}

// Postgres invalid_text_representation, e.g. a malformed UUID that reached a query.
export function isInvalidInput(error: unknown): boolean {
  const e = error as { code?: string; cause?: { code?: string } };
  return e?.code === "22P02" || e?.cause?.code === "22P02";
}

export function parse<T extends z.ZodType>(schema: T, input: unknown): z.infer<T> {
  const result = schema.safeParse(input);
  if (!result.success) {
    const details = result.error.issues.map((i) => ({ path: i.path.join("."), message: i.message }));
    const first = details[0];
    throw new AppError(400, "validation_error", first ? `${first.path || "body"}: ${first.message}` : "Invalid input", details);
  }
  return result.data;
}

// Postgres unique_violation, whether thrown directly or wrapped by the query builder.
export function isUniqueViolation(error: unknown): boolean {
  const e = error as { code?: string; cause?: { code?: string } };
  return e?.code === "23505" || e?.cause?.code === "23505";
}
