# security briefing

lastActualized: 2026-10-10
sources: local (constitution IV; migrations 006-008; access/entries.ts; access-boundary and video-sources tests;
PAID-VIDEO.md; RISKS.md); postgresql-docs 16; see _common-facts.md

## The asset and the paths to it

- [2026-10-10] The asset: the reference of a paid lecture (public link of one file on Yandex Disk, or an unlisted
  YouTube id). Whoever holds it watches or downloads the lecture without membership. The old site kept it only in a
  git-ignored Worker file and the Worker's environment; it is nowhere in this repository.
- [2026-10-10] Paths from untrusted input to it: (1) an API answer or page that selects the reference (guarded by the
  boundary test, by `externalId` null when paid, and by the test "the API never shows a source"); (2) an error message
  that names it (the Yandex adapter must answer a 503 that names the status and never the link); (3) the text of a
  paid entry or its description containing a link (T150 refuses it at import and save); (4) logs; (5) the database role
  used by the app (one role reads everything; the dev role is a superuser); (6) backups (pg_dump holds it: the backup
  is secret); (7) SSRF when the adapter fetches the reference (owasp-docs).
- [2026-10-10] What separation buys: a second table is a structural barrier for `select *` and for list code paths; it
  is NOT a privilege barrier unless the app uses two roles. Column grants, RLS and views do not change that while one
  role connects. Whichever option is chosen, the real controls are the access module, the boundary test and the
  adapter that is the only consumer.
- [2026-10-10] A public video's id is public by design (it is in the page's embed); putting it into the same table as
  secrets is safe only if the code path decides publicity from `videos.paid`, one boolean that an editor's save can
  change: public -> paid leaves the old public id as the row's reference (already exposed); paid -> public must
  require a new id (store_video does).
