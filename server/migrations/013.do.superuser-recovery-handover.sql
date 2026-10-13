-- The one superuser, its recovery codes and the handover of the role (task T062 of specs/001-self-hosted-club-site;
-- data-model.md "recovery_codes" and "handover_requests"; security-review-superuser.md; plan phase 3).
--
-- Existing data: none to move. `users.is_superuser` exists since migration 012 and no row has it set (the only
-- accounts that exist are the ones the site's own sign-up created; the superuser is made by `npm run superuser create`
-- after this file). The two tables are new and empty.
--
-- Decisions that would otherwise look like mistakes:
-- - "At most one superuser" is a partial unique index over a constant expression: every row with the flag has the same
--   key, so a second one cannot exist whatever the code does. A handover clears the old flag and sets the new one in one
--   transaction, so the index is never violated and never leaves the site with none.
-- - A recovery code is stored as the SHA-256 of a code of 80 random bits, not slowly hashed: a high-entropy secret needs
--   no slow function (the OWASP password storage notes make the same exception for random credentials), and the code
--   is looked up by its digest, so a slow hash would make the lookup impossible. The `unique` on the digest means two
--   sets cannot share a code even by accident.
-- - A set is a `set_id`; a code is spent by `used_at` and voided by `voided_at`, never deleted, so the log of what
--   happened to the codes is the table itself. A code is usable when both are null.
-- - A handover request is open while neither `cancelled_at` nor `completed_at` is set; the second partial unique index
--   allows one open request at a time, whoever it is between. `to_user` has no check of its own for "is an admin": the
--   module checks that when it starts the request and again when it completes it, because the status can change in
--   between and a check constraint cannot see another row.
-- - Nothing here has `on delete cascade`, for the reason of migration 012: accounts are never deleted.

create unique index users_one_superuser on users ((true)) where is_superuser;

create table recovery_codes (
  id        bigint generated always as identity primary key,
  user_id   bigint      not null references users (id),
  code_hash bytea       not null unique check (length(code_hash) = 32),
  set_id    uuid        not null,
  created_at timestamptz not null default now(),
  used_at   timestamptz,
  voided_at timestamptz,
  -- A code is spent or voided, never both: whichever came first is the end of it.
  constraint recovery_codes_one_end check (used_at is null or voided_at is null)
);

create index recovery_codes_user_set_idx on recovery_codes (user_id, set_id);

create table handover_requests (
  id           bigint generated always as identity primary key,
  from_user    bigint      not null references users (id),
  to_user      bigint      not null references users (id),
  created_at   timestamptz not null default now(),
  -- A request nobody accepts lapses (7 days, src/lib/handover-rules.ts).
  expires_at   timestamptz not null,
  accepted_at  timestamptz,
  -- accepted_at plus the cooling period; equal to accepted_at when the period is zero.
  effective_at timestamptz,
  cancelled_at timestamptz,
  completed_at timestamptz,
  constraint handover_requests_not_self check (from_user <> to_user),
  constraint handover_requests_effective_after_accept
    check ((accepted_at is null) = (effective_at is null)),
  constraint handover_requests_one_end check (cancelled_at is null or completed_at is null)
);

create unique index handover_requests_one_open on handover_requests ((true))
  where completed_at is null and cancelled_at is null;
create index handover_requests_users_idx on handover_requests (from_user, to_user);
