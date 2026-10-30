import type { ContentfulStatusCode } from "hono/utils/http-status";

/**
 * An error whose message is safe to show to a person. Anything else that
 * reaches the error handler is logged and replaced with a generic message.
 */
export class AppError extends Error {
  constructor(
    public status: ContentfulStatusCode,
    public code: string,
    message: string,
    public details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

export const badRequest = (message: string, details?: Record<string, unknown>) =>
  new AppError(400, "invalid_request", message, details);
export const unauthorised = (message = "Sign in to continue.") => new AppError(401, "unauthorised", message);
export const forbidden = (message = "You don't have access to this.") => new AppError(403, "forbidden", message);
export const notFound = (thing = "That") => new AppError(404, "not_found", `${thing} could not be found.`);
export const conflict = (message: string) => new AppError(409, "conflict", message);
export const tooMany = (message = "Too many requests. Try again in a minute.") =>
  new AppError(429, "rate_limited", message);
