// Importing the club's members (T055 of specs/001-self-hosted-club-site; FR-009a, spec clarification of 2026-10-10;
// tests: server/test/import-members.test.ts). Reads a file of the members' addresses and creates one account for each:
// a guest, with no password, so that an administrator can issue a temporary password later (phase 3) and the person
// changes it at the first sign-in (T050). Run through `npm run import:members -- <path> [--dry-run]`
// (import-members-cli.ts); the one-off tool is removed after the switch day (T135).
//
// Two formats, told apart by the first line that is not a comment:
// - a plain list: one address per line; empty lines and lines starting with # are ignored;
// - a CSV with a header row (the previous provider's export): the address is read from `primary_email_address` or
//   `email`, the name from `first_name` and `last_name` (or `name`), the login from `username` (or `login`). Every other
//   column is ignored and only its NAME is reported; a column that looks like a password or its digest is never read.
//
// Decisions that would otherwise look like mistakes:
// - The file is accepted whole or refused whole (the owner's choice of 2026-10-11): one line that is not a usable
//   address, or an address that appears twice, and nothing is written. The refusal lists line numbers and a reason code
//   per line, never the line's text: the file holds people's addresses and the output may be copied into a chat.
// - Every account is a guest. The owner could not get the old statuses out of the previous provider's export and chose
//   on 2026-10-11 that everyone starts as a guest, to be given a status by an administrator. No status or superuser
//   column is ever read, so a file cannot grant a right.
// - An address that already has an account is left exactly as it is: no name, login, status or password is changed, and
//   a second run creates nothing. Matching is case-insensitive, as the unique index of migration 012 is.
// - A login from the file is a courtesy: it is set only when it is a valid login name and neither another row nor
//   another account has it; otherwise the account is created without one and the summary says how many were left out.
//   That is the one soft rule in an otherwise strict file, because a login is optional and not worth refusing 400
//   people for.
// - One transaction. A dry run does all the work, including the conflict checks, and rolls back, so what it reports is
//   what the real run will do.
// - The audit row of a run carries counts and column names, never an address.
//
// Added 2026-10-11 (T152, the owner's choice 4-A of that day): two optional columns of the previous provider's export,
// `member` and `memberUntil` (also `member_until`). An account made from a row that says `member` is true (or has no
// `member` column) and carries a real `YYYY-MM-DD` gets that day as its lecture date and STAYS a guest: the date lets
// it in, as it did on the old site, and no status is given by a file. A value that is not a real day refuses the
// whole file, like any other bad line. An account that already exists is left as it is, the date included.

import type { Pool } from "../db/pool.js";
import { isRealDay } from "../../../src/lib/lecture-rules.js";

/** One member as the file describes them. */
export type MemberRow = {
  line: number;
  email: string;
  displayName: string;
  login: string | null;
  /** The last UTC day the old record paid for (`YYYY-MM-DD`), or null; added 2026-10-11 (T152). */
  accessUntil: string | null;
};

export type ParsedMembers = {
  members: MemberRow[];
  /** Header names of the columns that were not used (CSV only); names only, never values. */
  ignoredColumns: string[];
  /** Why the file is refused: a line number and a reason code each, in file order. Empty when the file is usable. */
  problems: { line: number; reason: ProblemReason }[];
};

export type ProblemReason =
  | "not_an_address"
  | "duplicate_address"
  | "name_too_long"
  | "wrong_number_of_fields"
  | "no_address_column"
  | "unterminated_quote"
  | "not_a_date";

const emailShape = /^[^@\s]+@[^@\s]+$/;
const loginShape = /^[a-z0-9._-]{3,32}$/;
const nameMax = 80;
const addressColumns = ["primary_email_address", "email"];
const firstNameColumns = ["first_name", "firstname"];
const lastNameColumns = ["last_name", "lastname"];
const fullNameColumns = ["name", "display_name"];
const loginColumns = ["username", "login"];
const memberColumns = ["member"];
const memberUntilColumns = ["memberuntil", "member_until"];
// Nothing here picks a column by a pattern: a column is used only when its name is one of the lists above, so a column
// holding a password digest, a hasher name or a two-factor secret can never be read by mistake.

/** Splits CSV text into records (RFC 4180 quoting) with the line each starts on. */
function csvRecords(
  text: string,
  delimiter: string,
): { line: number; fields: string[]; open: boolean }[] {
  const records: { line: number; fields: string[]; open: boolean }[] = [];
  let fields: string[] = [];
  let field = "";
  let quoted = false;
  let line = 1;
  let start = 1;
  let sawAny = false;
  const endRecord = (open: boolean) => {
    fields.push(field);
    if (sawAny || fields.length > 1 || fields[0] !== "") {
      records.push({ line: start, fields, open });
    }
    fields = [];
    field = "";
    sawAny = false;
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i] as string;
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        if (ch === "\n") line++;
        field += ch;
      }
      continue;
    }
    if (ch === '"' && field === "") {
      quoted = true;
      sawAny = true;
    } else if (ch === delimiter) {
      fields.push(field);
      field = "";
      sawAny = true;
    } else if (ch === "\r") {
      // swallowed: a CRLF ends the record at the LF
    } else if (ch === "\n") {
      endRecord(false);
      line++;
      start = line;
    } else {
      field += ch;
      sawAny = true;
    }
  }
  if (quoted) {
    records.push({ line: start, fields: [...fields, field], open: true });
  } else if (field !== "" || fields.length > 0) {
    endRecord(false);
  }
  return records;
}

/** The pure part: text in, rows and problems out. Never throws on a bad file. */
export function parseMembers(input: string): ParsedMembers {
  const text = input.replace(/^﻿/, "");
  const problems: ParsedMembers["problems"] = [];
  const members: MemberRow[] = [];
  const ignoredColumns: string[] = [];
  const seen = new Map<string, number>();

  const add = (
    line: number,
    email: string,
    displayName: string,
    login: string | null,
    accessUntil: string | null = null,
  ) => {
    const address = email.trim();
    if (address === "" || address.length > 254 || !emailShape.test(address)) {
      problems.push({ line, reason: "not_an_address" });
      return;
    }
    const key = address.toLowerCase();
    if (seen.has(key)) {
      problems.push({ line, reason: "duplicate_address" });
      return;
    }
    seen.set(key, line);
    const name = displayName.trim().replace(/\s+/g, " ");
    if ([...name].length > nameMax) {
      problems.push({ line, reason: "name_too_long" });
      return;
    }
    members.push({
      line,
      email: address,
      displayName: name,
      login,
      accessUntil,
    });
  };

  // The first line that is not an empty line or a comment decides the format.
  const lines = text.split("\n");
  const firstReal = lines.findIndex((l) => {
    const t = l.trim();
    return t !== "" && !t.startsWith("#");
  });
  if (firstReal === -1) return { members, ignoredColumns, problems };
  const head = (lines[firstReal] as string).replace(/\r$/, "");
  const delimiter = head.includes(",") ? "," : head.includes(";") ? ";" : null;
  const headerCells =
    delimiter === null
      ? []
      : head
          .split(delimiter)
          .map((c) => c.replace(/"/g, "").trim().toLowerCase());
  const isCsv = headerCells.some((c) => addressColumns.includes(c));

  if (!isCsv) {
    lines.forEach((raw, index) => {
      const t = raw.trim();
      if (t === "" || t.startsWith("#")) return;
      // A line with a delimiter in a list that has no header is a CSV row with no header: refused, not guessed at.
      if (t.includes(",") || t.includes(";")) {
        problems.push({ line: index + 1, reason: "no_address_column" });
        return;
      }
      add(index + 1, t, "", null);
    });
    return { members, ignoredColumns, problems };
  }

  // The comment lines above the header are dropped before the quoting is parsed (a quote in a comment must not swallow
  // the file), and the line numbers are shifted back to the file's own.
  const records = csvRecords(
    lines.slice(firstReal).join("\n"),
    delimiter as string,
  )
    .map((r) => ({ ...r, line: r.line + firstReal }))
    .filter(
      (r) => !(r.fields.length === 1 && (r.fields[0] ?? "").trim() === ""),
    );
  const startIndex = 0;
  const header = (records[startIndex]?.fields ?? []).map((c) =>
    c.trim().toLowerCase(),
  );
  const at = (names: string[]) => header.findIndex((c) => names.includes(c));
  const emailAt = at(addressColumns);
  const firstAt = at(firstNameColumns);
  const lastAt = at(lastNameColumns);
  const fullAt = at(fullNameColumns);
  const loginAt = at(loginColumns);
  const memberAt = at(memberColumns);
  const untilAt = at(memberUntilColumns);
  const used = new Set([
    emailAt,
    firstAt,
    lastAt,
    fullAt,
    loginAt,
    memberAt,
    untilAt,
  ]);
  header.forEach((name, index) => {
    if (!used.has(index) && name !== "") ignoredColumns.push(name);
  });

  for (const record of records.slice(startIndex + 1)) {
    if ((record.fields[0] ?? "").trim().startsWith("#")) continue;
    if (record.open) {
      problems.push({ line: record.line, reason: "unterminated_quote" });
      continue;
    }
    if (record.fields.length !== header.length) {
      problems.push({ line: record.line, reason: "wrong_number_of_fields" });
      continue;
    }
    const cell = (i: number) => (i >= 0 ? (record.fields[i] ?? "") : "");
    const given = `${cell(firstAt)} ${cell(lastAt)}`.trim();
    const name = given !== "" ? given : cell(fullAt);
    const login = cell(loginAt).trim().toLowerCase();
    // The old rule: `member` exactly true and a real date; anything else was no access. A bad date refuses the file.
    const until = cell(untilAt).trim();
    let accessUntil: string | null = null;
    if (until !== "") {
      if (!isRealDay(until)) {
        problems.push({ line: record.line, reason: "not_a_date" });
        continue;
      }
      const flag = cell(memberAt).trim().toLowerCase();
      const isMember = memberAt < 0 || flag === "true" || flag === "1";
      accessUntil = isMember ? until : null;
    }
    add(
      record.line,
      cell(emailAt),
      name,
      login === "" ? null : login,
      accessUntil,
    );
  }
  return { members, ignoredColumns, problems };
}

export type ImportReport = {
  created: number;
  existed: number;
  withoutName: number;
  loginsSet: number;
  loginsLeftOut: number;
  /** How many created accounts came with a lecture date from the file (T152). */
  withAccessDate: number;
  ignoredColumns: string[];
  dryRun: boolean;
};

/**
 * Creates the accounts in one transaction. `dryRun` does the same work and rolls back. The caller has already refused a
 * file with problems; this function trusts `members` to be valid and unique by address.
 */
export async function importMembers(
  pool: Pool,
  parsed: Pick<ParsedMembers, "members" | "ignoredColumns">,
  options: { dryRun?: boolean } = {},
): Promise<ImportReport> {
  const dryRun = options.dryRun ?? false;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const emails = parsed.members.map((m) => m.email.toLowerCase());
    const existingRows = await client.query<{ e: string }>(
      "select lower(email) as e from users where lower(email) = any($1::text[])",
      [emails],
    );
    const existing = new Set(existingRows.rows.map((r) => r.e));
    const fresh = parsed.members.filter(
      (m) => !existing.has(m.email.toLowerCase()),
    );

    // A login is set only when it is valid, held by no existing account and by no earlier row of this file.
    const wanted = fresh
      .map((m) => m.login)
      .filter((l): l is string => l !== null && loginShape.test(l));
    const takenRows = wanted.length
      ? await client.query<{ l: string }>(
          "select lower(login) as l from users where lower(login) = any($1::text[])",
          [wanted],
        )
      : { rows: [] as { l: string }[] };
    const taken = new Set(takenRows.rows.map((r) => r.l));
    const claimed = new Set<string>();
    let loginsSet = 0;
    let loginsLeftOut = 0;
    const rows = fresh.map((m) => {
      let login: string | null = null;
      if (m.login !== null) {
        if (
          loginShape.test(m.login) &&
          !taken.has(m.login) &&
          !claimed.has(m.login)
        ) {
          login = m.login;
          claimed.add(m.login);
          loginsSet++;
        } else {
          loginsLeftOut++;
        }
      }
      return {
        email: m.email,
        name: m.displayName,
        login,
        accessUntil: m.accessUntil,
      };
    });

    if (rows.length > 0) {
      await client.query(
        `insert into users (email, display_name, login, access_until)
         select * from unnest($1::text[], $2::text[], $3::text[], $4::date[])`,
        [
          rows.map((r) => r.email),
          rows.map((r) => r.name),
          rows.map((r) => r.login),
          rows.map((r) => r.accessUntil),
        ],
      );
    }
    const report: ImportReport = {
      created: rows.length,
      existed: parsed.members.length - rows.length,
      withoutName: rows.filter((r) => r.name === "").length,
      loginsSet,
      loginsLeftOut,
      withAccessDate: rows.filter((r) => r.accessUntil !== null).length,
      ignoredColumns: parsed.ignoredColumns,
      dryRun,
    };
    if (!dryRun) {
      // Counts and column names only: no address, no name, no login ever enters the audit log.
      await client.query(
        `insert into audit_log (actor_id, action, target_kind, target_id, detail)
         values (null, 'members_imported', 'system', null, $1::jsonb)`,
        [
          JSON.stringify({
            created: report.created,
            existed: report.existed,
            withoutName: report.withoutName,
            loginsSet: report.loginsSet,
            loginsLeftOut: report.loginsLeftOut,
            ignoredColumns: report.ignoredColumns,
          }),
        ],
      );
    }
    await client.query(dryRun ? "ROLLBACK" : "COMMIT");
    return report;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}
