-- The feedback form's messages and the mail queue (T107 of specs/001-self-hosted-club-site; data-model.md "feedback"
-- and "mail_queue", FR-033 to FR-036, T104, T144; tests: server/test/feedback.test.ts). The worker that sends the queue
-- is T108; the settings flow that writes more kinds of mail is T110.
--
-- Decisions that would otherwise look like mistakes:
-- - The message is stored first and the mail is a row of its own. The request writes both in one transaction and sends
--   nothing; a mail provider that is down costs the club a delayed mail and never a lost message. `mailed_at` and
--   `mail_error` on the message are the worker's report, so the admin list can show a message that never left.
-- - The numbers of the form (5000 characters, 100, 200) are `feedbackLimits` in server/src/feedback/routes.ts and
--   nowhere else, so a change needs no migration. The checks here are safety nets of the shape of the data, in the
--   spirit of migration 021: not empty, no line break where a header could ever be built from the value, and wide
--   enough that a rule of the route is always the one that answers first.
-- - `subject` is a code ("signin_problem"), never visitor text, and it has no list in the database: the list is
--   `feedbackSubjects` in the route's module, which is also where the mail module takes the subject line from. A new
--   code is added there and needs no migration; the check only keeps the shape of a code.
-- - `address_prefix` is the network part of the address (three groups of an IPv4 address, the first four of an IPv6
--   one), for abuse review; the full address is never stored.
-- - `to_address` is the recipient AT THE TIME the row was written, so a change of the recipient does not redirect what
--   is already queued; the kinds are the four the plan names, a fifth is a migration of its own.
-- - `next_attempt_at` defaults to the actual current time (`clock_timestamp()`, not the start of the transaction), so
--   a row is due the moment it exists. The partial index holds only unsent rows: the worker's query is "not sent and
--   due", and sent rows, which are the large majority after a few weeks, are not in it.
-- - Rows are never deleted by the application. The queue and the messages are small, and the retention of old rows is
--   a decision for the owner (research.md section 11), not a side effect of sending.

create table feedback (
  id             bigint      generated always as identity primary key,
  body           text        not null check (char_length(body) between 1 and 20000),
  name           text        check (name is null or (char_length(name) <= 1000 and name !~ '[\r\n]')),
  contact        text        check (contact is null or (char_length(contact) <= 1000 and contact !~ '[\r\n]')),
  subject        text        check (subject is null or subject ~ '^[a-z][a-z0-9_]{0,63}$'),
  received_at    timestamptz not null default clock_timestamp(),
  address_prefix text        not null default '',
  mailed_at      timestamptz,
  mail_error     text,
  -- A message that was mailed carries no error: the worker clears it on success (data-model.md).
  check (mailed_at is null or mail_error is null)
);

-- The admin list: newest first.
create index feedback_received_idx on feedback (received_at desc, id desc);

comment on table feedback is 'Messages of the feedback form, stored before any mail is sent (T107)';

create table mail_queue (
  id              bigint      generated always as identity primary key,
  kind            text        not null check (kind in (
                    'feedback_notice', 'recipient_code', 'recipient_change_requested', 'recipient_changed')),
  to_address      text        not null check (char_length(to_address) between 3 and 254 and to_address !~ '[\r\n]'),
  subject         text        not null check (char_length(subject) between 1 and 200 and subject !~ '[\r\n]'),
  body            text        not null check (char_length(body) >= 1),
  feedback_id     bigint      references feedback (id),
  attempts        integer     not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz not null default clock_timestamp(),
  sent_at         timestamptz,
  last_error      text,
  created_at      timestamptz not null default clock_timestamp(),
  -- A feedback notice belongs to its message and no other kind does.
  check ((kind = 'feedback_notice') = (feedback_id is not null))
);

-- What the worker asks for: the rows that are not sent, the soonest due first.
create index mail_queue_due_idx on mail_queue (next_attempt_at, id) where sent_at is null;
-- The message's own row, for the worker's report back to `feedback`.
create index mail_queue_feedback_idx on mail_queue (feedback_id) where feedback_id is not null;

comment on table mail_queue is 'Mail waiting to be sent by the worker (T108); a request only writes rows, never sends (T107)';
