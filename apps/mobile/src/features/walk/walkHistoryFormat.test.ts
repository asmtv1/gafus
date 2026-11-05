import { describe, expect, it } from "vitest";
import { finishWalk, pauseWalk, resumeWalk, startWalk } from "./walkModel";
import { formatWalkLength, toWalkHistoryRows } from "./walkHistoryFormat";

describe("walks menu: departure, elapsed time and return", () => {
  it("uses departure and return timestamps but excludes a pause from duration", () => {
    const from = Date.parse("2026-11-05T09:00:00Z");
    const paused = pauseWalk(startWalk("stopwatch", from), from + 15 * 60_000);
    const resumed = resumeWalk(paused, from + 45 * 60_000);
    const finished = finishWalk(resumed, from + 60 * 60_000);
    const [row] = toWalkHistoryRows([finished]);
    expect(row?.duration).toBe("30 мин");
    const date = new Date(from);
    const end = new Date(from + 60 * 60_000);
    expect(row?.departedAt).toBe(
      date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }),
    );
    expect(row?.returnedAt).toBe(
      end.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }),
    );
    expect(row?.day).toBe(
      date.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" }),
    );
  });

  it("excludes unfinished walking sessions and orders latest departure first", () => {
    const a = finishWalk(startWalk("stopwatch", 1000), 3000);
    const b = finishWalk(startWalk("stopwatch", 4000), 5000);
    expect(toWalkHistoryRows([a, startWalk("stopwatch", 8000), b]).map((row) => row.id)).toEqual([
      "4000",
      "1000",
    ]);
    expect(formatWalkLength(65)).toBe("1 мин 5 сек");
  });
});
