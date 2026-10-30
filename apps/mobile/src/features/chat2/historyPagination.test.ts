import { describe, expect, it } from "vitest";
import { mergeHistory, shouldFetchOlderAtTop } from "./historyPagination";
import type { Message } from "./api";

const message = (id: string, sequence: string) => ({ id, sequence } as Message);
describe("Chat2 mobile scroll-up pagination", () => {
  it("never prefetches before first positioning or during downward scrolling", () => {
    const base = { initialReady: true, movingUp: true, offsetY: 95,
      contentHeight: 2000, viewportHeight: 500 };
    expect(shouldFetchOlderAtTop(base)).toBe(true);
    expect(shouldFetchOlderAtTop({ ...base, initialReady: false })).toBe(false);
    expect(shouldFetchOlderAtTop({ ...base, movingUp: false })).toBe(false);
    expect(shouldFetchOlderAtTop({ ...base, offsetY: 151 })).toBe(false);
    expect(shouldFetchOlderAtTop({ ...base, contentHeight: 520 })).toBe(false);
    expect(shouldFetchOlderAtTop({ ...base, offsetY: 0 })).toBe(true);
  });
  it("keeps newest live messages when prepending earlier pages and deduplicates replays", () => {
    const live = [message("61", "61"), message("62", "62")];
    const older = [message("59", "59"), message("60", "60"), message("61", "61")];
    const rows = mergeHistory(live, older);
    expect(rows.map((item) => item.sequence)).toEqual(["59", "60", "61", "62"]);
    expect(mergeHistory(rows, older).map((item) => item.id)).toEqual(rows.map((item) => item.id));
    const next = mergeHistory(rows, [message("63", "63")]);
    expect(next.map((item) => item.sequence)).toEqual(["59", "60", "61", "62", "63"]);
  });
  it("compares large bigint cursor sequences exactly", () => {
    expect(mergeHistory([message("new", "9007199254740995")],
      [message("old", "9007199254740993")]).map((item) => item.id)).toEqual(["old", "new"]);
  });
});
