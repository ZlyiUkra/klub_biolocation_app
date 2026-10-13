// Server configuration (T008 of specs/001-self-hosted-club-site).
//
// Source: the names listed in .env.example; Node loads that file with --env-file (Node 20.6 and later, the real
// environment wins over the file). Only the server's own variables are read here; nothing prefixed PUBLIC_ is ever
// read, because such a value would be inlined into the browser bundle.
//
// Decisions that would otherwise look like mistakes:
// - Every variable is required. A missing one stops the process at start with a message naming it, instead of
//   surfacing later as a request that fails for a reason nobody can see.
// - SITE_ORIGIN must be an origin exactly as the browser sends it in the Origin header (no path, no trailing
//   slash), because the cross-site guard compares the two strings. A value that does not round-trip through
//   `new URL(...).origin` is refused here, once, not on every request.
// - Changed 2026-10-11: SITE_ORIGIN may list several origins, comma separated ("http://localhost:3000,http://127.0.0.1:3000").
//   A browser sends the origin it was opened on, and `localhost` and `127.0.0.1` are two different origins for it, so a
//   developer who types the other one was refused by the cross-site guard with no hint why (found by the owner on
//   2026-10-11, when SITE_ORIGIN still held the dev server's port). Each entry must round-trip as above; the first is
//   the canonical one, the one the server writes into anything absolute. Production lists one.
// - Also 2026-10-11: `originWarnings` names a loopback origin whose port is not the port the server listens on; main.ts
//   prints it at start. It is a warning and not an error, because behind a proxy the two legitimately differ.
// - The migration command needs the database URL only, so `loadDatabaseUrl` is separate: running a migration must
//   not require the port or the origin of a server that is not being started.

export type ServerConfig = {
  port: number;
  databaseUrl: string;
  /** The canonical origin: the first of the list. */
  siteOrigin: string;
  /** Every origin a browser may send as `Origin` for this site; the cross-site guard accepts any of them. */
  siteOrigins: string[];
};

export class ConfigError extends Error {}

function required(
  env: NodeJS.ProcessEnv,
  names: string[],
): Record<string, string> {
  const values: Record<string, string> = {};
  const missing: string[] = [];
  for (const name of names) {
    const value = env[name];
    if (value === undefined || value === "") missing.push(name);
    else values[name] = value;
  }
  if (missing.length > 0) {
    throw new ConfigError(
      `Missing environment variables: ${missing.join(", ")} (see .env.example)`,
    );
  }
  return values;
}

export function loadDatabaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  return required(env, ["DATABASE_URL"])["DATABASE_URL"] as string;
}

// Added 2026-10-11 (T079): the folder that holds the video files (the video volume). Read by the register command and
// by the stream route (T080); a command that does not touch video needs neither it nor the port.
export function loadVideoRoot(env: NodeJS.ProcessEnv = process.env): string {
  return required(env, ["VIDEO_ROOT"])["VIDEO_ROOT"] as string;
}

// Added 2026-10-12 (T098, the owner's word: the limit is an environment variable, not a database setting): the size cap
// of one video upload, in MiB in `VIDEO_UPLOAD_CAP_MB`. Optional, unlike the names above: left empty it is 500, the
// size the plan promises. A value that is not a whole number from 1 to 100000 stops the start with the reason, because
// an upload limit that silently fell back to the default would be a limit nobody chose.
export const defaultUploadCapMiB = 500;
export function loadUploadCapBytes(
  env: NodeJS.ProcessEnv = process.env,
): number {
  const raw = env["VIDEO_UPLOAD_CAP_MB"];
  if (raw === undefined || raw.trim() === "") {
    return defaultUploadCapMiB * 1024 * 1024;
  }
  const mib = Number(raw);
  if (!/^[0-9]+$/.test(raw.trim()) || mib < 1 || mib > 100_000) {
    throw new ConfigError(
      `VIDEO_UPLOAD_CAP_MB must be a whole number of MiB from 1 to 100000, got "${raw}"`,
    );
  }
  return mib * 1024 * 1024;
}

// Added 2026-10-12 (T143, the owner's word: 5 MB a picture): the size cap of one picture uploaded for a post, in MiB in
// `IMAGE_UPLOAD_CAP_MB`. Optional, default 5, from 1 to 100; anything else stops the start, as for the video cap.
export const defaultImageCapMiB = 5;
export function loadImageCapBytes(
  env: NodeJS.ProcessEnv = process.env,
): number {
  const raw = env["IMAGE_UPLOAD_CAP_MB"];
  if (raw === undefined || raw.trim() === "") {
    return defaultImageCapMiB * 1024 * 1024;
  }
  const mib = Number(raw);
  if (!/^[0-9]+$/.test(raw.trim()) || mib < 1 || mib > 100) {
    throw new ConfigError(
      `IMAGE_UPLOAD_CAP_MB must be a whole number of MiB from 1 to 100, got "${raw}"`,
    );
  }
  return mib * 1024 * 1024;
}

// Added 2026-10-12 (T138, the owner's word: an environment variable): the room that must stay free on the video volume
// after an upload, in MiB in `VIDEO_FREE_RESERVE_MB`. Optional, default 2048 (2 GiB); 0 switches the reserve off. Same
// strictness as the cap: a value that is not a whole number stops the start.
export const defaultFreeReserveMiB = 2048;
export function loadFreeReserveBytes(
  env: NodeJS.ProcessEnv = process.env,
): number {
  const raw = env["VIDEO_FREE_RESERVE_MB"];
  if (raw === undefined || raw.trim() === "") {
    return defaultFreeReserveMiB * 1024 * 1024;
  }
  const mib = Number(raw);
  if (!/^[0-9]+$/.test(raw.trim()) || mib > 10_000_000) {
    throw new ConfigError(
      `VIDEO_FREE_RESERVE_MB must be a whole number of MiB from 0 to 10000000, got "${raw}"`,
    );
  }
  return mib * 1024 * 1024;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const values = required(env, ["PORT", "DATABASE_URL", "SITE_ORIGIN"]);
  const port = Number(values["PORT"]);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new ConfigError(
      `PORT must be an integer from 1 to 65535, got "${values["PORT"]}"`,
    );
  }
  const siteOrigins = (values["SITE_ORIGIN"] as string)
    .split(",")
    .map((entry) => entry.trim());
  for (const siteOrigin of siteOrigins) {
    let normalized: string;
    try {
      normalized = new URL(siteOrigin).origin;
    } catch {
      throw new ConfigError(`SITE_ORIGIN is not a URL: "${siteOrigin}"`);
    }
    if (normalized !== siteOrigin) {
      throw new ConfigError(
        `SITE_ORIGIN must be an origin without a path or trailing slash, e.g. "${normalized}"`,
      );
    }
  }
  return {
    port,
    databaseUrl: values["DATABASE_URL"] as string,
    siteOrigin: siteOrigins[0] as string,
    siteOrigins,
  };
}

/**
 * One line for every loopback origin whose port is not the port the server listens on: the usual cause of a browser
 * form refused as "cross site" on a developer's machine. Not an error: behind a proxy the two legitimately differ.
 */
export function originWarnings(
  config: Pick<ServerConfig, "port" | "siteOrigins">,
): string[] {
  const loopback = new Set(["localhost", "127.0.0.1", "[::1]"]);
  const warnings: string[] = [];
  for (const origin of config.siteOrigins) {
    const url = new URL(origin);
    if (!loopback.has(url.hostname)) continue;
    const shown =
      url.port !== "" ? Number(url.port) : url.protocol === "https:" ? 443 : 80;
    if (shown !== config.port) {
      warnings.push(
        `SITE_ORIGIN lists ${origin}, but the server listens on port ${config.port}: a form opened on ${origin} is not served by this process, and one opened on port ${config.port} is refused as cross-site unless that origin is listed too.`,
      );
    }
  }
  return warnings;
}
