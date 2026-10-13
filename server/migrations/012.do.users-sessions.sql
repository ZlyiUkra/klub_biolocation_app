-- Accounts, sessions, failed sign-in attempts and the audit log (task T046 of specs/001-self-hosted-club-site; data-model
-- "Accounts"; plan phase 2, own sign-in). Decisions of the owner on 2026-10-11: the audit log is protected by a trigger
-- in the database (variant A), and a failed attempt is kept 30 days.
--
-- Nothing in the site reads these tables until the modules of T047 to T056 exist, so no page changes with this file.
--
-- Existing data: there is none to move. The accounts of the old site live in the previous sign-in provider, and
-- bringing them across is the import command of T055 from the owner's list of addresses; `entries.created_by` is null on
-- every row (checked 2026-10-11: 0 of 45) and `entry_audience_users` is empty, so the two foreign keys added below
-- constrain nothing that exists. Migration 002 said they would arrive with this one.
--
-- Decisions that would otherwise look like mistakes:
-- - Case-insensitive uniqueness is an index on lower(email) and lower(login), not the `citext` type: PostgreSQL's own
--   documentation names the functional index as the standard approach, and it needs no extension. The address is stored
--   as typed so the account page can show it as the member wrote it.
-- - The login name is stored lower-case (a check, so no writer can forget) and holds no `@`: that is what lets the
--   sign-in form tell an address from a login by the presence of `@` alone (research.md section 5).
-- - `is_superuser` and `blocked_by`, `blocked_at` are columns from the start; the rule "at most one superuser" is a
--   partial unique index that arrives with migration 013 (T062), as the plan has it, and the rules about who may set
--   either column are code of phase 3.
-- - Nothing here has `on delete cascade`: accounts are never deleted (FR-018a), so a stray DELETE must fail instead of
--   taking sessions, attempts or the audit trail with it. Sessions are removed by explicit statements.
-- - `login_attempts` keeps the failures of an unknown identifier too, under a hash of the normalised text and never the
--   text itself, because people type other people's addresses and sometimes their passwords into the wrong field. That
--   record is what lets an unknown identifier be paused exactly like a real one (the pause must not tell them apart).
-- - The audit log is append-only by a trigger that refuses UPDATE, DELETE and TRUNCATE for every role, so a bug in
--   application code cannot rewrite history; only a person with the database owner's rights, who could drop the
--   trigger, can. The statuses are a literal list, as in migration 002, and a test fails if the status rules module
--   (T063) and this list differ.

create table users (
  id                  bigint generated always as identity primary key,
  email               text        not null,
  login               text,
  display_name        text        not null default '',
  status              text        not null default 'guest'
                                  check (status in ('guest', 'student', 'expert', 'master', 'metr', 'admin', 'blocked')),
  blocked_by          bigint      references users (id),
  blocked_at          timestamptz,
  is_superuser        boolean     not null default false,
  -- A scrypt string with its parameters (server/src/auth/password.ts); null means "cannot sign in until a
  -- password is issued", which is how an imported account starts.
  password_hash       text        check (password_hash is null or length(password_hash) between 20 and 512),
  must_change         boolean     not null default false,
  password_expires_at timestamptz,
  password_changed_at timestamptz,
  failed_count        integer     not null default 0 check (failed_count >= 0),
  locked_until        timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default clock_timestamp(),
  constraint users_email_shape check (email <> '' and length(email) <= 254 and email ~ '^[^@[:space:]]+@[^@[:space:]]+$'),
  constraint users_login_shape check (login is null or (login ~ '^[a-z0-9._-]{3,32}$' and login = lower(login))),
  -- A blocked account says when it was blocked, and only a blocked one does.
  constraint users_blocked_pair check ((status = 'blocked') = (blocked_at is not null)),
  -- A temporary password has a password to change.
  constraint users_must_change_has_password check (not must_change or password_hash is not null)
);

create unique index users_email_lower on users (lower(email));
create unique index users_login_lower on users (lower(login)) where login is not null;

create function users_touch() returns trigger language plpgsql as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end
$$;

create trigger users_touch_trg before update on users
  for each row execute function users_touch();

-- The two columns of migration 002 that were waiting for this table.
alter table entries
  add constraint entries_created_by_fkey foreign key (created_by) references users (id);
alter table entry_audience_users
  add constraint entry_audience_users_user_fkey foreign key (user_id) references users (id);

create table sessions (
  -- SHA-256 of the 256-bit random id that the browser holds; the id itself is never stored.
  id_hash             bytea       primary key check (octet_length(id_hash) = 32),
  user_id             bigint      not null references users (id),
  created_at          timestamptz not null default now(),
  last_seen_at        timestamptz not null default now(),
  idle_expires_at     timestamptz not null,
  absolute_expires_at timestamptz not null,
  user_agent_summary  text        not null default '' check (length(user_agent_summary) <= 200),
  -- A network prefix only, for the account's list of sessions; never the full address.
  address_prefix      text        not null default '' check (length(address_prefix) <= 64),
  -- True while the account must change its password: only the change-password route works.
  limited             boolean     not null default false,
  -- The idle clock can be pushed forward by use, never past the absolute one.
  constraint sessions_clocks_ordered check (idle_expires_at <= absolute_expires_at and absolute_expires_at > created_at)
);

create index sessions_user_idx on sessions (user_id);
create index sessions_absolute_idx on sessions (absolute_expires_at);

create table login_attempts (
  id   bigint generated always as identity primary key,
  -- `account`: the id of a real account; `identifier`: a SHA-256 hex of the normalised text of an unknown one;
  -- `address`: a network prefix. The limiter reads them by (kind, key) and a time window.
  kind text        not null check (kind in ('account', 'identifier', 'address')),
  key  text        not null check (key <> '' and length(key) <= 128),
  at   timestamptz not null default now()
);

-- Rows older than 30 days are deleted by the periodic job (owner's word, 2026-10-11, as in the plan).
create index login_attempts_key_at_idx on login_attempts (kind, key, at);
create index login_attempts_at_idx on login_attempts (at);

create table audit_log (
  id             bigint generated always as identity primary key,
  at             timestamptz not null default now(),
  -- null when the server command acted (there is no signed-in person then).
  actor_id       bigint      references users (id),
  action         text        not null check (action <> ''),
  target_kind    text        not null check (target_kind in ('account', 'entry', 'setting', 'system')),
  target_id      bigint,
  -- The from and to values and whatever else the action needs, as data; never a secret.
  detail         jsonb       not null default '{}',
  address_prefix text        not null default '' check (length(address_prefix) <= 64)
);

create index audit_log_target_idx on audit_log (target_kind, target_id, at);

create function audit_log_append_only() returns trigger language plpgsql as $$
begin
  raise exception 'audit_log is append-only: % is not allowed', tg_op
    using errcode = 'insufficient_privilege';
end
$$;

create trigger audit_log_no_change_trg before update or delete on audit_log
  for each row execute function audit_log_append_only();
create trigger audit_log_no_truncate_trg before truncate on audit_log
  for each statement execute function audit_log_append_only();
