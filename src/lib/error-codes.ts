// The error codes of the HTTP API: the one list (T179 of specs/001-self-hosted-club-site; contracts/http-api.md,
// "Conventions"). The backend's `ErrorCode` type (server/src/http/errors.ts) is derived from it, and the site's texts
// for them (src/i18n/errors.ts) are a record over it, so a code added here without a text in both languages fails
// the type check instead of reaching a visitor as "undefined". A plain module that imports nothing, like the other
// files of src/lib/ the backend compiles.
export const errorCodes = [
  "cross_site",
  "invalid_input",
  "unauthorized",
  "forbidden",
  "not_found",
  "conflict",
  "too_large",
  "unprocessable",
  "rate_limited",
  // The states of a lecture player (T137, T149): the body's `error` of the source route.
  "signed_out",
  "blocked",
  "expired",
  "no_source",
  "unavailable",
  "internal",
] as const;

export type ErrorCode = (typeof errorCodes)[number];

/** Whether a value read from an answer's body is one of the codes above. */
export function isErrorCode(value: unknown): value is ErrorCode {
  return (
    typeof value === "string" &&
    (errorCodes as readonly string[]).includes(value)
  );
}
