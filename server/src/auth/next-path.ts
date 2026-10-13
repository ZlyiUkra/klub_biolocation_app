// Where a visitor is sent after signing in (T051 of specs/001-self-hosted-club-site; tests: server/test/next-path.test.ts).
//
// Moved on 2026-10-11 (T056) to src/lib/next-path.ts, because the site's middleware needs the same rule to send a
// signed-in visitor of the sign-in page on to `next`, and a second copy of a rule that guards against an open redirect is
// exactly what must not exist. The module imports nothing, so the backend compiles it from there (server/test/
// shared.test.ts lists it); this file only keeps the old import path of the routes and of the tests working.
export { nextPath } from "../../../src/lib/next-path.js";
