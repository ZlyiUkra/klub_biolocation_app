// The panel's routes for posts and videos (T097 of specs/001-self-hosted-club-site; shapes and codes in
// contracts/http-api.md, "Posts and videos in the panel"; tests: server/test/content-admin.test.ts). The upload of a
// video file is here since T098 (the file work in `upload.ts`); the disk rule is T138; the rest is the CRUD, the
// preview and the source link.
//
// Decisions that would otherwise look like mistakes:
// - Everything answers 404 to anyone who is not a metr or an admin with a full session (`adminActorOf`), a missing
//   entry and a wrong kind included, so no answer of this router tells a stranger it exists.
// - A save is checked by the one rules module (`rules.ts`), then the texts that changed are rendered, and only then is
//   the row locked and written: a request's cost is paid before the lock is taken.
// - `If-Match` is required on an update and carries the entry's `updatedAt` exactly as a read returned it, quoted or
//   not. A missing one is a 400 and not a 428, because 428 is not in the list of codes the site has texts for.
// - A write and its audit row are one transaction. The audit detail names the fields that changed, never a text, a
//   path or a reference (data-model.md, "audit_log": "Never a secret").
// - The JSON limit of these routes is 512 KiB (`contentLimits.request`), a body of 200 000 Cyrillic characters; every
//   other route keeps 100 KiB (app.ts), which is what "the raised limit belongs to the admin content routes only" means.

import { rm } from "node:fs/promises";
import { join } from "node:path";
import express, { Router, type Request, type Response } from "express";
import { attachUploadedFile } from "../access/video-files.js";
import { faststartMessage } from "../video/faststart.js";
import {
  roomForUpload,
  spaceVerdict,
  volumeSpace,
  type VolumeSpace,
} from "../video/space.js";
import { streamToVolume } from "./upload.js";
import { normalizeReference } from "../video/providers/index.js";
import {
  copyVideoFile,
  readVideoLink,
  insertAdminEntry,
  listAdminEntries,
  patchAdminEntry,
  readAdminEntry,
  setAdminDeleted,
  setVideoLink,
  SlugTaken,
  type AdminEntry,
  type EntryPatch,
  type NewEntry,
  type Rendered,
} from "../access/admin-entries.js";
import type { EntryKind } from "../access/entries.js";
import { addressPrefixOf } from "../auth/session.js";
import { withTransaction, type Pool } from "../db/pool.js";
import { HttpError, sendError } from "../http/errors.js";
import { writeAudit } from "../users/audit.js";
import { adminActorOf } from "../users/actor.js";
import type { Actor } from "../users/status-rules.js";
import { renderMarkdown } from "./render.js";
import {
  contentLimits,
  postSaveProblems,
  videoSaveProblems,
  type ContentProblem,
} from "./rules.js";
import { renderVersion } from "../../../src/markdown/options.js";

// Changed 2026-10-13: the two numbers and `positiveInt` are http/paging.ts now, shared with the people's list and the
// feedback list; this file kept its own copy until the third list needed it.
import { defaultPageSize, maxPageSize, positiveInt } from "../http/paging.js";

const notFound = (res: Response): void =>
  sendError(res, 404, "not_found", "No such API route.");

function invalid(res: Response, problems: ContentProblem[]): void {
  res.status(400).json({
    error: "invalid_input",
    message: "The entry breaks the content rules.",
    problems,
  });
}

// Removed 2026-10-13: `positiveInt` lived here; it is imported from ../http/paging.js (see the imports).

/** The entry id of a path; anything that is not a positive integer is a missing entry. */
function idOf(req: Request): number | null {
  const raw = req.params["id"];
  const n =
    typeof raw === "string" && /^[0-9]{1,15}$/.test(raw) ? Number(raw) : NaN;
  return Number.isSafeInteger(n) && n >= 1 ? n : null;
}

/** `If-Match` as the panel gives it back: the stamp, quoted or not, a weak validator's prefix tolerated. */
function ifMatchOf(req: Request): string | null {
  const raw = req.headers["if-match"];
  if (typeof raw !== "string") return null;
  const text = raw.trim().replace(/^W\//, "");
  const quoted = /^"(.*)"$/.exec(text);
  const value = quoted ? (quoted[1] ?? "") : text;
  return value === "" ? null : value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function render(markdown: string): Promise<Rendered> {
  const r = await renderMarkdown(markdown);
  return {
    markdown,
    html: r.html,
    headings: r.headings,
    plainText: r.plainText,
    summary: r.summary,
  };
}

const lower = (terms: unknown): string[] =>
  (terms as string[]).map((t) => t.toLowerCase());

const keyOf = (kind: EntryKind) => (kind === "post" ? "post" : "video");

// Added 2026-10-12 (T098): the default cap of one upload, 500 MiB; `main.ts` passes the value of VIDEO_UPLOAD_CAP_MB.
const defaultUploadCap = 500 * 1024 * 1024;
// How much of a refused upload's body is read and discarded so that the client sees the answer, and for how long.
const lingerBytes = 64 * 1024 * 1024;
const lingerMs = 15_000;

// Added 2026-10-12 (T138): the default reserve that must stay free on the volume after an upload, 2 GiB.
const defaultFreeReserve = 2048 * 1024 * 1024;

export function contentAdminRouter({
  pool,
  videoRoot,
  uploadCapBytes = defaultUploadCap,
  freeReserveBytes = defaultFreeReserve,
  volumeSpace: readSpace = volumeSpace,
}: {
  pool: Pool;
  videoRoot?: string;
  uploadCapBytes?: number;
  freeReserveBytes?: number;
  volumeSpace?: (root: string) => Promise<VolumeSpace>;
}): Router {
  const router = Router();
  // 512 KiB: the route's own JSON limit, so the 100 KiB of the rest does not apply (app.ts steps aside for these paths).
  const json = express.json({ limit: contentLimits.request });
  const mine = /^\/(?:posts|videos|preview)(?:\/|$)/;

  router.use(async (req, res, next) => {
    if (!mine.test(req.path)) return next();
    res.setHeader("Cache-Control", "no-store");
    const actor = await adminActorOf(pool, req);
    if (actor === null) return notFound(res);
    res.locals["actor"] = actor;
    json(req, res, next);
  });

  const actorOf = (res: Response) => res.locals["actor"] as Actor;

  const audit = (
    client: Pick<Pool, "query">,
    req: Request,
    actor: Actor,
    action: string,
    id: number,
    detail: Record<string, unknown>,
  ) =>
    writeAudit(client, {
      actorId: actor.id,
      action,
      targetKind: "entry",
      targetId: id,
      detail,
      addressPrefix: addressPrefixOf(req.ip),
    });

  function send(res: Response, status: number, entry: AdminEntry): void {
    res.setHeader("ETag", `"${entry.updatedAt}"`);
    res.status(status).json({ [keyOf(entry.kind)]: entry });
  }

  // Added 2026-10-12 (T175): a copy of a saved video, made on the server. The page cannot do it as it does for a post,
  // because a paid lecture's reference is write-only and never leaves the database: the copy takes the link row (or the
  // file row, which points at the same bytes) from the original inside the transaction and the answer carries no
  // reference. The copy starts as a draft (audience hidden), so nothing is public until the editor looks at it.
  router.post("/videos/:id/copy", async (req, res) => {
    const actor = actorOf(res);
    const id = idOf(req);
    const original =
      id === null ? null : await readAdminEntry(pool, "video", id);
    if (id === null || original === null) return notFound(res);
    const slug = isRecord(req.body) ? req.body["slug"] : undefined;
    const link = (await readVideoLink(pool, id)) ?? undefined;
    const input = {
      slug,
      title: original.title,
      description: original.description,
      // The rules' own shape: whole seconds and an explicit offset, not toISOString()'s milliseconds and "Z".
      publishedAt: `${new Date().toISOString().slice(0, 19)}+00:00`,
      audience: "hidden",
      statuses: original.statuses,
      userIds: original.userIds,
      teaser: original.teaser,
      tags: original.tags,
      categories: original.categories,
      body: original.body,
      paid: original.paid === true,
      availableUntil:
        original.availableUntil === undefined || original.availableUntil === ""
          ? null
          : original.availableUntil,
      membersOnly: original.membersOnly ?? null,
      ...(link === undefined ? {} : { source: link }),
    };
    // A video that lives in a file has no link to hand over; the file row is copied below, so "source required" is moot.
    const problems = (await videoSaveProblems(input)).filter(
      (p) => !(p.field === "source" && original.source?.kind === "file"),
    );
    if (problems.length > 0) return invalid(res, problems);

    const entry: NewEntry = {
      kind: "video",
      slug: input.slug as string,
      title: input.title,
      description: input.description,
      publishedAt: input.publishedAt,
      audience: "hidden",
      statuses: input.statuses,
      userIds: input.userIds,
      teaser: input.teaser,
      tags: input.tags,
      categories: input.categories,
      body: await render(input.body),
      createdBy: actor.id,
      video: {
        paid: input.paid,
        availableUntil: input.availableUntil,
        membersOnly:
          input.membersOnly === null || input.membersOnly.trim() === ""
            ? null
            : await render(input.membersOnly),
        source: link ?? null,
      },
    };
    try {
      const created = await withTransaction(pool, async (client) => {
        const newId = await insertAdminEntry(client, entry, renderVersion);
        if (original.source?.kind === "file") {
          await copyVideoFile(client, newId, id);
        }
        await audit(client, req, actor, "entry_created", newId, {
          kind: "video",
          slug: entry.slug,
          copiedFrom: id,
        });
        return (await readAdminEntry(client, "video", newId)) as AdminEntry;
      });
      send(res, 201, created);
    } catch (error) {
      if (error instanceof SlugTaken) {
        res.status(409).json({
          error: "conflict",
          reason: "exists",
          message: "An entry with this address already exists.",
        });
        return;
      }
      throw error;
    }
  });

  // Added 2026-10-12 (T138): what the video page shows before an upload: the free space of the volume, the reserve, the
  // cap and the largest file that would be taken now. Registered before `/videos/:id`, which would read "space" as an id.
  router.get("/videos/space", async (_req, res) => {
    if (videoRoot === undefined) {
      return sendError(
        res,
        503,
        "unavailable",
        "No video volume is configured on this server.",
      );
    }
    const space = await readSpace(videoRoot);
    res.json({
      freeBytes: space.freeBytes,
      totalBytes: space.totalBytes,
      reserveBytes: freeReserveBytes,
      capBytes: uploadCapBytes,
      roomBytes: roomForUpload({
        capBytes: uploadCapBytes,
        reserveBytes: freeReserveBytes,
        freeBytes: space.freeBytes,
      }),
    });
  });

  for (const kind of ["post", "video"] as const satisfies EntryKind[]) {
    const base = kind === "post" ? "/posts" : "/videos";

    router.get(base, async (req, res) => {
      const q =
        typeof req.query["q"] === "string"
          ? req.query["q"].trim().slice(0, 100)
          : "";
      res.json(
        await listAdminEntries(pool, kind, {
          q,
          deleted: req.query["deleted"] === "1",
          page: positiveInt(req.query["page"], 1, 1_000_000),
          limit: positiveInt(req.query["limit"], defaultPageSize, maxPageSize),
        }),
      );
    });

    router.get(`${base}/:id`, async (req, res) => {
      const id = idOf(req);
      const entry = id === null ? null : await readAdminEntry(pool, kind, id);
      if (entry === null) return notFound(res);
      send(res, 200, entry);
    });

    router.post(base, async (req, res) => {
      const actor = actorOf(res);
      const input = req.body as unknown;
      const problems =
        kind === "post"
          ? await postSaveProblems(input)
          : await videoSaveProblems(input);
      if (problems.length > 0 || !isRecord(input))
        return invalid(res, problems);

      const body = await render(input["body"] as string);
      const membersOnly =
        typeof input["membersOnly"] === "string" &&
        input["membersOnly"].trim() !== ""
          ? await render(input["membersOnly"])
          : null;
      // Changed 2026-10-12 (T175): the reference is stored in its canonical form; the rules have already checked that
      // the pasted text is one of this provider's addresses.
      const source = isRecord(input["source"])
        ? {
            provider: input["source"]["provider"] as string,
            reference:
              normalizeReference(
                input["source"]["provider"] as string,
                input["source"]["reference"] as string,
              ) ?? (input["source"]["reference"] as string),
          }
        : null;
      const entry: NewEntry = {
        kind,
        slug: input["slug"] as string,
        title: input["title"] as string,
        description: (input["description"] as string | undefined) ?? "",
        publishedAt: input["publishedAt"] as string,
        audience: (input["audience"] as string | undefined) ?? "everyone",
        statuses: (input["statuses"] as string[] | undefined) ?? [],
        userIds: (input["userIds"] as number[] | undefined) ?? [],
        teaser: (input["teaser"] as boolean | undefined) ?? false,
        tags: lower(input["tags"] ?? []),
        categories: (input["categories"] as string[] | undefined) ?? [],
        body,
        createdBy: actor.id,
        ...(kind === "video" && {
          video: {
            paid: input["paid"] === true,
            availableUntil:
              (input["availableUntil"] as string | null | undefined) ?? null,
            membersOnly,
            source,
          },
        }),
      };
      try {
        const created = await withTransaction(pool, async (client) => {
          const id = await insertAdminEntry(client, entry, renderVersion);
          await audit(client, req, actor, "entry_created", id, {
            kind,
            slug: entry.slug,
            fields: Object.keys(input).filter((k) => k !== "slug"),
          });
          return (await readAdminEntry(client, kind, id)) as AdminEntry;
        });
        send(res, 201, created);
      } catch (error) {
        if (error instanceof SlugTaken) {
          res.status(409).json({
            error: "conflict",
            reason: "exists",
            message: "An entry with this address already exists.",
          });
          return;
        }
        if ((error as { code?: string }).code === "23514") {
          return invalid(res, [{ field: "source", code: "required" }]);
        }
        throw error;
      }
    });

    router.patch(`${base}/:id`, async (req, res) => {
      const actor = actorOf(res);
      const id = idOf(req);
      const current = id === null ? null : await readAdminEntry(pool, kind, id);
      if (id === null || current === null) return notFound(res);
      const match = ifMatchOf(req);
      if (match === null) {
        return invalid(res, [{ field: "If-Match", code: "required" }]);
      }
      const input = req.body as unknown;
      const problems =
        kind === "post"
          ? await postSaveProblems(input, { partial: true })
          : await videoSaveProblems(input, {
              partial: true,
              current: { paid: current.paid === true },
            });
      if (problems.length > 0 || !isRecord(input))
        return invalid(res, problems);

      const patch: EntryPatch = {};
      if (typeof input["title"] === "string") patch.title = input["title"];
      if (typeof input["description"] === "string")
        patch.description = input["description"];
      if (typeof input["publishedAt"] === "string")
        patch.publishedAt = input["publishedAt"];
      if (typeof input["audience"] === "string")
        patch.audience = input["audience"];
      if (Array.isArray(input["statuses"]))
        patch.statuses = input["statuses"] as string[];
      if (Array.isArray(input["userIds"]))
        patch.userIds = input["userIds"] as number[];
      if (typeof input["teaser"] === "boolean") patch.teaser = input["teaser"];
      if (Array.isArray(input["tags"])) patch.tags = lower(input["tags"]);
      if (Array.isArray(input["categories"]))
        patch.categories = input["categories"] as string[];
      if (typeof input["body"] === "string")
        patch.body = await render(input["body"]);
      if (kind === "video") {
        if (typeof input["paid"] === "boolean") patch.paid = input["paid"];
        if (
          input["availableUntil"] === null ||
          typeof input["availableUntil"] === "string"
        ) {
          patch.availableUntil = input["availableUntil"];
        }
        if (input["membersOnly"] === null) patch.membersOnly = null;
        else if (typeof input["membersOnly"] === "string") {
          patch.membersOnly =
            input["membersOnly"].trim() === ""
              ? null
              : await render(input["membersOnly"]);
        }
      }

      try {
        const outcome = await withTransaction(pool, async (client) => {
          const locked = await readAdminEntry(client, kind, id, { lock: true });
          if (locked === null) return { kind: "missing" as const };
          if (locked.updatedAt !== match) {
            return { kind: "stale" as const, updatedAt: locked.updatedAt };
          }
          const touched = await patchAdminEntry(
            client,
            kind,
            id,
            patch,
            renderVersion,
          );
          await audit(client, req, actor, "entry_updated", id, {
            kind,
            slug: locked.slug,
            fields: touched,
          });
          return {
            kind: "saved" as const,
            entry: (await readAdminEntry(client, kind, id)) as AdminEntry,
          };
        });
        if (outcome.kind === "missing") return notFound(res);
        if (outcome.kind === "stale") {
          res.status(409).json({
            error: "conflict",
            reason: "stale",
            message: "The entry was saved by someone else after it was read.",
            current: { updatedAt: outcome.updatedAt },
          });
          return;
        }
        send(res, 200, outcome.entry);
      } catch (error) {
        if ((error as { code?: string }).code === "23514") {
          return invalid(res, [{ field: "source", code: "required" }]);
        }
        throw error;
      }
    });

    for (const [verb, path, deleted, action] of [
      ["delete", `${base}/:id`, true, "entry_deleted"],
      ["post", `${base}/:id/restore`, false, "entry_restored"],
    ] as const) {
      router[verb](path, async (req, res) => {
        const actor = actorOf(res);
        const id = idOf(req);
        if (id === null) return notFound(res);
        const entry = await withTransaction(pool, async (client) => {
          const locked = await readAdminEntry(client, kind, id, { lock: true });
          if (locked === null) return null;
          const changed = await setAdminDeleted(client, id, deleted);
          if (changed) {
            await audit(client, req, actor, action, id, {
              kind,
              slug: locked.slug,
            });
          }
          return (await readAdminEntry(client, kind, id)) as AdminEntry;
        });
        if (entry === null) return notFound(res);
        send(res, 200, entry);
      });
    }
  }

  router.put("/videos/:id/source", async (req, res) => {
    const actor = actorOf(res);
    const id = idOf(req);
    const current =
      id === null ? null : await readAdminEntry(pool, "video", id);
    if (id === null || current === null) return notFound(res);
    const input = req.body as unknown;
    if (!isRecord(input))
      return invalid(res, [{ field: "request", code: "type" }]);
    const problems = await videoSaveProblems(
      {
        source: { provider: input["provider"], reference: input["reference"] },
      },
      { partial: true, current: { paid: current.paid === true } },
    );
    if (problems.length > 0) return invalid(res, problems);
    // Changed 2026-10-12 (T175): stored in the canonical form (an address pasted whole is reduced to its id).
    const source = {
      provider: input["provider"] as string,
      reference:
        normalizeReference(
          input["provider"] as string,
          input["reference"] as string,
        ) ?? (input["reference"] as string),
    };
    try {
      const outcome = await withTransaction(pool, async (client) => {
        const locked = await readAdminEntry(client, "video", id, {
          lock: true,
        });
        if (locked === null) return "missing" as const;
        const result = await setVideoLink(
          client,
          id,
          source,
          input["replace"] === true,
        );
        if (result === "has_file") return "has_file" as const;
        await audit(client, req, actor, "video_source_set", id, {
          kind: "video",
          slug: locked.slug,
          provider: source.provider,
          replacedFile: locked.source?.kind === "file",
        });
        return (await readAdminEntry(client, "video", id)) as AdminEntry;
      });
      if (outcome === "missing") return notFound(res);
      if (outcome === "has_file") {
        res.status(409).json({
          error: "conflict",
          reason: "has_file",
          message:
            "A file is registered for this video; confirm to replace it with a link.",
        });
        return;
      }
      send(res, 200, outcome);
    } catch (error) {
      if ((error as { code?: string }).code === "23514") {
        return invalid(res, [{ field: "source", code: "format" }]);
      }
      throw error;
    }
  });

  // Added 2026-10-12 (T098): the upload of a video file. Every refusal that can be decided from the headers or the row is
  // sent before a byte of the body is stored; the order is the cheapest check first (the contract: 413 "decided from
  // Content-Length before a byte is read").
  router.put("/videos/:id/file", async (req, res) => {
    const actor = actorOf(res);
    const id = idOf(req);
    const current =
      id === null ? null : await readAdminEntry(pool, "video", id);
    if (id === null || current === null) return notFound(res);
    // The answer goes out first; the body that is still arriving is read and thrown away, up to a bound, the way nginx
    // does with `lingering_close`. Closing the connection at once would make the client's own write fail, and a browser
    // then reports a network error instead of the 413 or 409 that explains what to do. Past the bound (an absurd
    // Content-Length) or the time, the connection is cut.
    const refuse = (status: number, body: Record<string, unknown>) => {
      res.status(status).json(body);
      let discarded = 0;
      const timer = setTimeout(() => req.destroy(), lingerMs);
      timer.unref();
      req.on("data", (chunk: Buffer) => {
        discarded += chunk.length;
        if (discarded > lingerBytes) req.destroy();
      });
      req.on("close", () => clearTimeout(timer));
      req.resume();
    };
    if (videoRoot === undefined) {
      return refuse(503, {
        error: "unavailable",
        message: "No video volume is configured on this server.",
      });
    }
    const mediaType = (req.headers["content-type"] ?? "")
      .split(";")[0]
      ?.trim()
      .toLowerCase();
    if (mediaType !== "video/mp4") {
      return refuse(400, {
        error: "invalid_input",
        message: "The file must be sent as video/mp4.",
        problems: [{ field: "Content-Type", code: "type" }],
      });
    }
    const noSpace = (space: VolumeSpace) => ({
      error: "too_large",
      reason: "no_space",
      message:
        "There is not enough free space on the server for this file; the server keeps a reserve free.",
      freeBytes: space.freeBytes,
      reserveBytes: freeReserveBytes,
    });
    const replace = req.query["replace"] === "1";
    if (!replace && current.source?.kind !== "none") {
      return refuse(409, {
        error: "conflict",
        reason: "has_source",
        message:
          "This video already has a file or a link; confirm to replace it.",
      });
    }
    const lengthHeader = req.headers["content-length"];
    if (
      typeof lengthHeader !== "string" ||
      !/^[0-9]{1,15}$/.test(lengthHeader) ||
      Number(lengthHeader) === 0
    ) {
      return refuse(400, {
        error: "invalid_input",
        message: "The request must carry the size of the file.",
        problems: [{ field: "Content-Length", code: "required" }],
      });
    }
    const declaredLength = Number(lengthHeader);
    // T138: the cap, then the room. Both are read here, from the announced length, before a byte is stored.
    const space = await readSpace(videoRoot);
    const verdict = spaceVerdict({
      fileBytes: declaredLength,
      capBytes: uploadCapBytes,
      reserveBytes: freeReserveBytes,
      freeBytes: space.freeBytes,
    });
    if (verdict === "over_cap") {
      return refuse(413, {
        error: "too_large",
        reason: "over_cap",
        message: `The file is larger than the upload limit of ${Math.floor(uploadCapBytes / (1024 * 1024))} MiB.`,
        limitBytes: uploadCapBytes,
      });
    }
    if (verdict === "no_space") return refuse(413, noSpace(space));

    let streamed;
    try {
      streamed = await streamToVolume(req, {
        root: videoRoot,
        entryId: id,
        declaredLength,
      });
    } catch (error) {
      // The disk filled up while the file was arriving (another write, a backup): the same answer as the check above.
      if ((error as { code?: string }).code === "ENOSPC") {
        return refuse(413, noSpace(await readSpace(videoRoot)));
      }
      throw error;
    }
    if (streamed.kind === "aborted") return;
    if (streamed.kind === "not_faststart") {
      res.status(422).json({
        error: "unprocessable",
        reason: "not_faststart",
        check: streamed.reason,
        message: faststartMessage(streamed.reason),
      });
      return;
    }

    const forget = () =>
      rm(join(videoRoot, streamed.volumePath), { force: true });
    try {
      const outcome = await withTransaction(pool, async (client) => {
        const locked = await readAdminEntry(client, "video", id, {
          lock: true,
        });
        if (locked === null) return "missing" as const;
        const attached = await attachUploadedFile(
          client,
          id,
          { volumePath: streamed.volumePath, sizeBytes: streamed.sizeBytes },
          replace,
        );
        if (!attached.ok) return "has_source" as const;
        await audit(client, req, actor, "video_file_uploaded", id, {
          kind: "video",
          slug: locked.slug,
          sizeBytes: streamed.sizeBytes,
          replacedSource: attached.replacedSource,
          replacedFile: attached.replacedFile,
        });
        return (await readAdminEntry(client, "video", id)) as AdminEntry;
      });
      if (outcome === "missing") {
        await forget();
        return notFound(res);
      }
      if (outcome === "has_source") {
        // Another request gave the video a source while this body was arriving: this file is not registered.
        await forget();
        res.status(409).json({
          error: "conflict",
          reason: "has_source",
          message:
            "This video already has a file or a link; confirm to replace it.",
        });
        return;
      }
      send(res, 200, outcome);
    } catch (error) {
      await forget();
      throw error;
    }
  });

  router.post("/preview", async (req, res) => {
    const input = req.body as unknown;
    if (!isRecord(input) || typeof input["markdown"] !== "string") {
      return invalid(res, [{ field: "markdown", code: "type" }]);
    }
    if (input["markdown"].length > contentLimits.body) {
      throw new HttpError(413, "too_large", "The text is too large.");
    }
    const rendered = await renderMarkdown(input["markdown"]);
    res.json({ html: rendered.html });
  });

  return router;
}
