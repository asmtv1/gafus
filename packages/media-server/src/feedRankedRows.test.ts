import { describe, expect, it, vi } from "vitest";
import { readRankedFeedRows } from "./feedRankedRows";
import type { FeedDb } from "./mediaDbPorts";

function dbWithQuery(output: unknown[] = []) {
  const query = vi.fn().mockResolvedValue(output);
  return {
    db: { $queryRaw: query } as unknown as FeedDb,
    query,
  };
}
describe("database-ranked feed query", () => {
  it("popular sorts in PostgreSQL before pagination and scopes hidden authors", async () => {
    const { db, query } = dbWithQuery([{ id: "p1", publishedAt: new Date(), score: 3 }]);
    const rows = await readRankedFeedRows(db, "owner", "popular", null, 10);
    expect(rows).toHaveLength(1);
    const sql = query.mock.calls[0][0];
    expect(sql.sql).toContain('FROM "FeedPostReaction"');
    expect(sql.sql).toContain('pref."userId"');
    expect(sql.sql).toContain('pref."hidden" = true');
    expect(sql.sql).toContain(
      'ORDER BY ranked.score DESC, ranked."publishedAt" DESC, ranked.id DESC',
    );
    expect(sql.values).toContain("owner");
    expect(sql.values).toContain(11);
  });
  it("discussed counts only visible comments and keeps composite keyset", async () => {
    const { db, query } = dbWithQuery();
    const cursor = {
      score: 7,
      publishedAt: new Date("2026-11-10T12:34:56.123Z"),
      id: "post-id",
    };
    await readRankedFeedRows(db, "owner", "discussed", cursor, 20);
    const sql = query.mock.calls[0][0];
    expect(sql.sql).toContain('FROM "FeedComment"');
    expect(sql.sql).toContain('"moderationState" =');
    expect(sql.sql).toContain('ranked."publishedAt" <');
    expect(sql.sql).toContain("::timestamp(3)");
    expect(sql.values).toContain("2026-11-10 12:34:56.123");
    expect(sql.values).toContain("post-id");
    expect(sql.values).toContain(21);
  });
});
