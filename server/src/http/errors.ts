// Error shape and handler (T011 of specs/001-self-hosted-club-site).
//
// Source: contracts/http-api.md, "Conventions": every error body is {"error": "<code>", "message": "<text>"}, the
// codes are stable and the messages are not, and an entry a viewer may not see is always 404.
//
// Decisions that would otherwise look like mistakes:
// - The handler is the last middleware and has four parameters on purpose: Express 5 identifies an error handler by
//   that signature (express-docs, "Error handling"). A rejected promise from an async route reaches it without a
//   try/catch in the route.
// - An unexpected error answers 500 "internal" with a fixed message and never the error's own text; the real error
//   goes to the log. Stack traces and driver messages are information a visitor must not receive.
// - Errors raised by the body parser carry their own status and type; the two that matter (too large, malformed
//   JSON) are mapped to the contract's codes instead of leaking as generic 500s.

import type { ErrorRequestHandler, Response } from "express";

// Changed 2026-10-12 (T179): the list of codes is src/lib/error-codes.ts, shared with the site, whose pages print a
// text for each of them in both languages (src/i18n/errors.ts). Added 2026-10-11 (T137) to it: the states of a lecture
// player (T149), the body's `error` of the source route.
import type { ErrorCode } from "../../../src/lib/error-codes.js";
export type { ErrorCode };

export class HttpError extends Error {
  readonly status: number;
  readonly code: ErrorCode;
  constructor(status: number, code: ErrorCode, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

// Changed 2026-10-11 (T050): an optional `field` names the form field a 400 or 409 is about, so a sign-up form can
// put the message next to it; the contract allows extra members, and the code and message are unchanged.
export function sendError(
  res: Response,
  status: number,
  code: ErrorCode,
  message: string,
  field?: string,
): void {
  res
    .status(status)
    .json(
      field === undefined
        ? { error: code, message }
        : { error: code, message, field },
    );
}

type BodyParserError = { status?: number; type?: string };

export const errorHandler: ErrorRequestHandler = (
  error: unknown,
  _req,
  res,
  next,
) => {
  if (res.headersSent) {
    next(error);
    return;
  }
  if (error instanceof HttpError) {
    sendError(res, error.status, error.code, error.message);
    return;
  }
  const parser = error as BodyParserError;
  if (parser.type === "entity.too.large") {
    sendError(res, 413, "too_large", "The request body is too large.");
    return;
  }
  if (parser.type === "entity.parse.failed") {
    sendError(res, 400, "invalid_input", "The request body is not valid JSON.");
    return;
  }
  console.error("Unhandled error:", error);
  sendError(res, 500, "internal", "Something went wrong on the server.");
};
