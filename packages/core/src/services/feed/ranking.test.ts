import { describe, expect, it } from "vitest";
import { decodeRankedCursor, encodeRankedCursor } from "./ranking";

describe("ranked feed cursors", () => {
  const row = { score: 12, publishedAt: new Date("2026-10-09T12:00:00.000Z"), id: "post_123" };
  it("roundtrips ranked positions exactly", () => {
    const encoded = encodeRankedCursor("popular", row);
    expect(decodeRankedCursor("popular", encoded)).toEqual(row);
    expect(decodeRankedCursor("popular", null)).toBeNull();
  });
  it("rejects cross-sort, legacy, malformed and invalid-score cursors", () => {
    const encoded = encodeRankedCursor("popular", row);
    expect(() => decodeRankedCursor("discussed", encoded)).toThrow();
    for (const values of [
      ["2026-10-09T12:00:00.000Z", row.id],
      ["popular", -1, row.publishedAt.toISOString(), row.id],
      ["popular", 5.1, row.publishedAt.toISOString(), row.id],
      ["popular", 12, "invalid", row.id],
    ]) {
      expect(() => decodeRankedCursor("popular", Buffer.from(JSON.stringify(values)).toString("base64url"))).toThrow();
    }
  });
});
