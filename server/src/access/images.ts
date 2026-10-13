// The rows of the pictures an editor uploaded (T143 of specs/001-self-hosted-club-site; migration 020). The route and
// the bytes are in server/src/content/images.ts; this file is the table's only reader and writer.

import type pg from "pg";

export type ImageExt = "png" | "jpg" | "webp" | "gif";

export type ImageRow = {
  hash: string;
  ext: ImageExt;
  name: string;
  sizeBytes: number;
  uploadedAt: string;
};

type Row = {
  hash: string;
  ext: ImageExt;
  original_name: string;
  size_bytes: number;
  uploaded_at: Date;
};

const describe = (row: Row): ImageRow => ({
  hash: row.hash,
  ext: row.ext,
  name: row.original_name,
  sizeBytes: row.size_bytes,
  uploadedAt: row.uploaded_at.toISOString(),
});

type Db = Pick<pg.Pool, "query">;

/** Records a picture; one that is already there (the same bytes) is left as it was and reported as existing. */
export async function recordImage(
  db: Db,
  image: {
    hash: string;
    ext: ImageExt;
    name: string;
    sizeBytes: number;
    uploadedBy: number;
  },
): Promise<{ image: ImageRow; existing: boolean }> {
  const inserted = await db.query<Row>(
    `insert into images (hash, ext, original_name, size_bytes, uploaded_by)
     values ($1, $2, $3, $4, $5)
     on conflict (hash) do nothing
     returning hash, ext, original_name, size_bytes, uploaded_at`,
    [image.hash, image.ext, image.name, image.sizeBytes, image.uploadedBy],
  );
  const created = inserted.rows[0];
  if (created !== undefined)
    return { image: describe(created), existing: false };
  const found = await db.query<Row>(
    "select hash, ext, original_name, size_bytes, uploaded_at from images where hash = $1",
    [image.hash],
  );
  return { image: describe(found.rows[0] as Row), existing: true };
}

/** The pictures, newest first. */
export async function listImages(
  db: Db,
  query: { page: number; limit: number },
): Promise<{ items: ImageRow[]; total: number }> {
  const total = await db.query<{ n: number }>(
    "select count(*)::int as n from images",
  );
  const rows = await db.query<Row>(
    `select hash, ext, original_name, size_bytes, uploaded_at from images
      order by uploaded_at desc, hash limit $1 offset $2`,
    [query.limit, (query.page - 1) * query.limit],
  );
  return { total: total.rows[0]?.n ?? 0, items: rows.rows.map(describe) };
}
