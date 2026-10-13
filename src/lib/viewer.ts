// Who is looking at a page (task T033 of specs/001-self-hosted-club-site; constitution III).
//
// One definition for both programs: the backend's access module takes a `Viewer` on every read (server/src/access/
// entries.ts) and the site's middleware puts one into `Astro.locals` (src/middleware.ts), so a page and the API cannot
// disagree about who a visitor is. The module imports nothing, which is what lets the backend compile it
// (server/test/shared.test.ts).
//
// Until sessions exist (plan phase 2, T052) every visitor is a guest: `guestViewer()` is the one place that changes
// then, into a read of the session through the backend with the request's Cookie header.

export type ViewerStatus =
  "guest" | "student" | "expert" | "master" | "metr" | "admin" | "blocked";

export type Viewer = {
  /** The account id, or null for a visitor with no session. */
  userId: number | null;
  status: ViewerStatus;
};

/** A visitor with no session. A fresh object each time: a page must not be able to change another request's viewer. */
export function guestViewer(): Viewer {
  return { userId: null, status: "guest" };
}
