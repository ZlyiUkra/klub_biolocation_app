// The pictures of the panel (T143 of specs/001-self-hosted-club-site; contracts/http-api.md, "Pictures"): the upload, the
// list, and the public route that serves them. Added 2026-10-12 at the owner's word: an editor without git adds a
// picture to a post or to a members-only block from the form, up to 5 MiB, and may also link a picture that lives
// elsewhere on the internet (that needs no route: the Markdown renderer already keeps an https image address).
//
// Decisions that would otherwise look like mistakes:
// - The type is read from the content, never from the file name or the header alone: the first bytes must be those of
//   PNG, JPEG, WebP or GIF and must agree with the declared `Content-Type`. SVG is refused on purpose, it can carry a
//   script (OWASP File Upload Cheat Sheet: allow only safe extensions, validate the content, do not trust the type).
// - The stored name is the SHA-256 of the bytes plus the extension the content decided; the client's file name is kept
//   as text for the list and is never part of a path. The same picture twice is one file (addresses never change).
// - The body is held in memory: it is at most the cap (5 MiB), announced in `Content-Length` and refused before a byte
//   is read when it is larger, so the process does not grow with a hostile client. A video is streamed because it is
//   500 MiB; a picture is not.
// - The disk rule is the video's (src/video/space.ts): the cap, then the reserve that must stay free. The pictures
//   live on the same volume (`images/` inside `VIDEO_ROOT`), so the reserve protects the database and the system from
//   both.
// - Public: a picture is a file of the site like the others in `public/images/`; its address is a hash nobody can
//   guess, and "hidden, not secret" is the rule of the members-only block that uses it (PAID-VIDEO.md). The answers
//   carry `nosniff` and a year of caching (an address is content-addressed, so it never changes).
// - Nothing is ever deleted: not by the page, not by a replacement (the owner's rule).

import { createHash, randomBytes } from "node:crypto";
import { mkdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import express, { Router, type Request, type Response } from "express";
import { listImages, recordImage, type ImageExt } from "../access/images.js";
import { addressPrefixOf } from "../auth/session.js";
import type { Pool } from "../db/pool.js";
import { sendError } from "../http/errors.js";
import { writeAudit } from "../users/audit.js";
import { adminActorOf } from "../users/actor.js";
import {
  roomForUpload,
  spaceVerdict,
  volumeSpace as realSpace,
} from "../video/space.js";
import type { VolumeSpace } from "../video/space.js";

/** The folder of the pictures inside the volume, and the public path they are served under. */
export const imagesFolder = "images";
export const imagesPublicPath = "/images/u";

const mediaTypes: Record<string, ImageExt> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

/** The type the first bytes say, or null when they are none of the four. */
export function sniffImage(bytes: Buffer): ImageExt | null {
  if (
    bytes.length >= 8 &&
    bytes
      .subarray(0, 8)
      .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return "png";
  }
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return "jpg";
  }
  if (
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString("latin1") === "RIFF" &&
    bytes.subarray(8, 12).toString("latin1") === "WEBP"
  ) {
    return "webp";
  }
  if (bytes.length >= 6) {
    const head = bytes.subarray(0, 6).toString("latin1");
    if (head === "GIF87a" || head === "GIF89a") return "gif";
  }
  return null;
}

// What of a refused body is read and thrown away so that the client sees the answer (as the video route does).
const lingerBytes = 16 * 1024 * 1024;
const lingerMs = 10_000;

function refuse(
  req: Request,
  res: Response,
  status: number,
  body: Record<string, unknown>,
): void {
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
}

/** The name the editor's file had, as text for the list: control characters out, 100 characters at most. */
function cleanName(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw
    .replace(/[\p{Cc}\p{Zl}\p{Zp}]/gu, " ")
    .trim()
    .slice(0, 100);
}

export const urlOf = (hash: string, ext: ImageExt): string =>
  `${imagesPublicPath}/${hash}.${ext}`;

export function imagesRouter({
  pool,
  videoRoot,
  imageCapBytes,
  freeReserveBytes,
  volumeSpace: readSpace = realSpace,
}: {
  pool: Pool;
  videoRoot?: string;
  imageCapBytes: number;
  freeReserveBytes: number;
  volumeSpace?: (root: string) => Promise<VolumeSpace>;
}): Router {
  const router = Router();
  const notFound = (res: Response) =>
    sendError(res, 404, "not_found", "No such API route.");

  router.use(async (req, res, next) => {
    if (!/^\/images(?:\/|$)/.test(req.path)) return next();
    res.setHeader("Cache-Control", "no-store");
    const actor = await adminActorOf(pool, req);
    if (actor === null) return notFound(res);
    res.locals["actor"] = actor;
    next();
  });

  router.get("/images", async (req, res) => {
    const number = (raw: unknown, fallback: number, max: number) => {
      const n = typeof raw === "string" ? Number(raw) : NaN;
      return Number.isInteger(n) && n >= 1 ? Math.min(n, max) : fallback;
    };
    const page = number(req.query["page"], 1, 1_000_000);
    const limit = number(req.query["limit"], 24, 50);
    const found = await listImages(pool, { page, limit });
    res.json({
      total: found.total,
      capBytes: imageCapBytes,
      items: found.items.map((i) => ({
        url: urlOf(i.hash, i.ext),
        name: i.name,
        sizeBytes: i.sizeBytes,
        uploadedAt: i.uploadedAt,
      })),
    });
  });

  router.put("/images", async (req, res) => {
    const actor = res.locals["actor"] as { id: number };
    if (videoRoot === undefined) {
      return refuse(req, res, 503, {
        error: "unavailable",
        message: "No volume is configured on this server.",
      });
    }
    const declared = (req.headers["content-type"] ?? "")
      .split(";")[0]
      ?.trim()
      .toLowerCase();
    const wanted = declared === undefined ? undefined : mediaTypes[declared];
    if (wanted === undefined) {
      return refuse(req, res, 400, {
        error: "invalid_input",
        message:
          "The picture must be sent as image/png, image/jpeg, image/webp or image/gif.",
        problems: [{ field: "Content-Type", code: "type" }],
      });
    }
    const lengthHeader = req.headers["content-length"];
    if (
      typeof lengthHeader !== "string" ||
      !/^[0-9]{1,15}$/.test(lengthHeader) ||
      Number(lengthHeader) === 0
    ) {
      return refuse(req, res, 400, {
        error: "invalid_input",
        message: "The request must carry the size of the picture.",
        problems: [{ field: "Content-Length", code: "required" }],
      });
    }
    const length = Number(lengthHeader);
    const space = await readSpace(videoRoot);
    const verdict = spaceVerdict({
      fileBytes: length,
      capBytes: imageCapBytes,
      reserveBytes: freeReserveBytes,
      freeBytes: space.freeBytes,
    });
    if (verdict === "over_cap") {
      return refuse(req, res, 413, {
        error: "too_large",
        reason: "over_cap",
        message: `The picture is larger than the limit of ${Math.floor(imageCapBytes / (1024 * 1024))} MiB.`,
        limitBytes: imageCapBytes,
      });
    }
    if (verdict === "no_space") {
      return refuse(req, res, 413, {
        error: "too_large",
        reason: "no_space",
        message:
          "There is not enough free space on the server for this file; the server keeps a reserve free.",
        freeBytes: space.freeBytes,
        reserveBytes: freeReserveBytes,
        roomBytes: roomForUpload({
          capBytes: imageCapBytes,
          reserveBytes: freeReserveBytes,
          freeBytes: space.freeBytes,
        }),
      });
    }

    // The body, held in memory: at most the announced length, which is at most the cap.
    const chunks: Buffer[] = [];
    let received = 0;
    const complete = await new Promise<boolean>((resolve) => {
      req.on("data", (chunk: Buffer) => {
        received += chunk.length;
        if (received > length) {
          resolve(false);
          req.destroy();
          return;
        }
        chunks.push(chunk);
      });
      req.on("end", () => resolve(received === length));
      req.on("error", () => resolve(false));
      req.on("close", () => resolve(received === length));
    });
    if (!complete) return;
    const bytes = Buffer.concat(chunks);
    const kind = sniffImage(bytes);
    if (kind === null || kind !== wanted) {
      res.status(422).json({
        error: "unprocessable",
        reason: "not_an_image",
        message:
          "The file is not a PNG, JPEG, WebP or GIF picture, or it is not the type it was sent as.",
      });
      return;
    }
    const hash = createHash("sha256").update(bytes).digest("hex");
    const folder = join(videoRoot, imagesFolder);
    const final = join(folder, `${hash}.${kind}`);
    try {
      await mkdir(folder, { recursive: true });
      const present = await stat(final).then(
        () => true,
        () => false,
      );
      if (!present) {
        const temporary = join(
          folder,
          `.image-${randomBytes(8).toString("hex")}.part`,
        );
        try {
          await writeFile(temporary, bytes, { flag: "wx", mode: 0o640 });
          await rename(temporary, final);
        } catch (error) {
          await rm(temporary, { force: true });
          throw error;
        }
      }
    } catch (error) {
      if ((error as { code?: string }).code === "ENOSPC") {
        res.status(413).json({
          error: "too_large",
          reason: "no_space",
          message:
            "There is not enough free space on the server for this file; the server keeps a reserve free.",
        });
        return;
      }
      throw error;
    }
    const recorded = await recordImage(pool, {
      hash,
      ext: kind,
      name: cleanName(req.query["name"]),
      sizeBytes: bytes.length,
      uploadedBy: actor.id,
    });
    if (!recorded.existing) {
      await writeAudit(pool, {
        actorId: actor.id,
        action: "image_uploaded",
        targetKind: "system",
        targetId: null,
        detail: { sizeBytes: bytes.length, type: kind },
        addressPrefix: addressPrefixOf(req.ip),
      });
    }
    res.status(recorded.existing ? 200 : 201).json({
      image: {
        url: urlOf(hash, kind),
        name: recorded.image.name,
        sizeBytes: recorded.image.sizeBytes,
        uploadedAt: recorded.image.uploadedAt,
      },
      existing: recorded.existing,
    });
  });

  return router;
}

/** The public route: `/images/u/<sha256>.<ext>`, nothing else under it. */
export function imagesPublicRouter(videoRoot: string): Router {
  const router = Router();
  router.use(
    imagesPublicPath,
    express.static(join(videoRoot, imagesFolder), {
      index: false,
      dotfiles: "deny",
      immutable: true,
      maxAge: "365d",
      setHeaders(res) {
        res.setHeader("X-Content-Type-Options", "nosniff");
        // A picture is shown in a page; if its address is opened on its own it must not run anything.
        res.setHeader(
          "Content-Security-Policy",
          "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
        );
      },
    }),
  );
  return router;
}
