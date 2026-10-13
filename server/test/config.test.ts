// Configuration rules (T014 of specs/001-self-hosted-club-site). No database needed.

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ConfigError,
  loadConfig,
  loadDatabaseUrl,
  loadUploadCapBytes,
  originWarnings,
} from "../src/config.js";

const valid = {
  PORT: "3000",
  DATABASE_URL: "postgres://u:p@localhost:5433/db",
  SITE_ORIGIN: "http://localhost:4321",
};

test("a complete environment loads", () => {
  assert.deepEqual(loadConfig(valid), {
    port: 3000,
    databaseUrl: valid.DATABASE_URL,
    siteOrigin: valid.SITE_ORIGIN,
    siteOrigins: [valid.SITE_ORIGIN],
  });
});

// Added 2026-10-12 (T098): the upload cap comes from VIDEO_UPLOAD_CAP_MB, 500 MiB when it is unset or empty.
test("the upload cap is 500 MiB by default, set in MiB, and a bad value stops the start", () => {
  const MiB = 1024 * 1024;
  assert.equal(loadUploadCapBytes({}), 500 * MiB);
  assert.equal(loadUploadCapBytes({ VIDEO_UPLOAD_CAP_MB: "" }), 500 * MiB);
  assert.equal(loadUploadCapBytes({ VIDEO_UPLOAD_CAP_MB: "1200" }), 1200 * MiB);
  for (const bad of ["0", "-5", "1.5", "500MB", "abc", "100001"]) {
    assert.throws(
      () => loadUploadCapBytes({ VIDEO_UPLOAD_CAP_MB: bad }),
      ConfigError,
      bad,
    );
  }
});

// Added 2026-10-11: SITE_ORIGIN may list several origins; the first is the canonical one.
test("SITE_ORIGIN may list several origins, each one checked, the first canonical", () => {
  const config = loadConfig({
    ...valid,
    SITE_ORIGIN: "http://localhost:3000, http://127.0.0.1:3000",
  });
  assert.deepEqual(config.siteOrigins, [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
  ]);
  assert.equal(config.siteOrigin, "http://localhost:3000");
  // One bad entry, an empty entry (a trailing comma) and an entry with a path are refused.
  for (const bad of [
    "http://localhost:3000,http://127.0.0.1:3000/",
    "http://localhost:3000,",
    "http://localhost:3000,not a url",
  ]) {
    assert.throws(
      () => loadConfig({ ...valid, SITE_ORIGIN: bad }),
      ConfigError,
      bad,
    );
  }
});

test("a loopback origin on another port than the server's is warned about; a proxied origin is not", () => {
  const warn = (origins: string[], port = 3000) =>
    originWarnings({ port, siteOrigins: origins });
  assert.deepEqual(
    warn(["http://localhost:3000", "http://127.0.0.1:3000"]),
    [],
  );
  const mismatch = warn(["http://localhost:4321"]);
  assert.equal(mismatch.length, 1);
  assert.match(mismatch[0] ?? "", /4321/);
  assert.match(mismatch[0] ?? "", /3000/);
  // Behind a proxy the public origin is some other host and the ports legitimately differ.
  assert.deepEqual(warn(["https://club.example.test"]), []);
  // A loopback origin with no port names 80 or 443.
  assert.equal(warn(["http://localhost"]).length, 1);
});

test("every missing variable is named in one error", () => {
  assert.throws(
    () => loadConfig({}),
    (error: unknown) =>
      error instanceof ConfigError &&
      error.message.includes("PORT") &&
      error.message.includes("DATABASE_URL") &&
      error.message.includes("SITE_ORIGIN"),
  );
});

test("an empty value counts as missing", () => {
  assert.throws(() => loadConfig({ ...valid, PORT: "" }), ConfigError);
});

test("the port must be an integer from 1 to 65535", () => {
  for (const port of ["0", "65536", "abc", "30.5", "-1"]) {
    assert.throws(
      () => loadConfig({ ...valid, PORT: port }),
      ConfigError,
      `PORT=${port}`,
    );
  }
});

test("the site origin must round-trip: no path, no trailing slash", () => {
  assert.throws(
    () => loadConfig({ ...valid, SITE_ORIGIN: "http://localhost:4321/" }),
    ConfigError,
  );
  assert.throws(
    () => loadConfig({ ...valid, SITE_ORIGIN: "http://localhost:4321/path" }),
    ConfigError,
  );
  assert.throws(
    () => loadConfig({ ...valid, SITE_ORIGIN: "not a url" }),
    ConfigError,
  );
});

test("the migration command needs the database URL only", () => {
  assert.equal(
    loadDatabaseUrl({ DATABASE_URL: "postgres://x" }),
    "postgres://x",
  );
  assert.throws(() => loadDatabaseUrl({}), ConfigError);
});
