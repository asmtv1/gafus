import type { FeedSort } from "@gafus/types";
import { FeedError } from "./errors";
import { feedIdSchema } from "./schemas";

/** A deterministic keyset cursor; never accept a cursor from another ranking mode. */
export interface RankedFeedPosition {
  score: number;
  publishedAt: Date;
  id: string;
}

export function encodeRankedCursor(sort: Exclude<FeedSort, "new" | "smart">, row: RankedFeedPosition): string {
  return Buffer.from(JSON.stringify([sort, row.score, row.publishedAt.toISOString(), row.id])).toString("base64url");
}

export function decodeRankedCursor(sort: Exclude<FeedSort, "new" | "smart">, cursor?: string | null): RankedFeedPosition | null {
  if (!cursor) return null;
  try {
    const fields: unknown = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    if (!Array.isArray(fields) || fields.length !== 4) throw Error("cursor");
    const [mode, score, iso, id] = fields;
    if (mode !== sort || typeof score !== "number" || !Number.isSafeInteger(score) || score < 0 ||
      typeof iso !== "string" || !Number.isFinite(Date.parse(iso)) ||
      typeof id !== "string" || !feedIdSchema.safeParse(id).success) throw Error("cursor");
    return { score, publishedAt: new Date(iso), id };
  } catch {
    throw new FeedError("VALIDATION_ERROR", "Некорректный курсор сортировки", 400);
  }
}
