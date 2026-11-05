import { describe, expect, it } from "vitest";
import { mediaTime, safeVideoDuration, videoProgress, videoSeekForTouch } from "./socialVideoTimeline";

describe("native Moments/Chat2 timeline", () => {
  it("formats short and long durations", () => {
    expect(mediaTime(0)).toBe("0:00");
    expect(mediaTime(9.9)).toBe("0:09");
    expect(mediaTime(61.8)).toBe("1:01");
    expect(mediaTime(3650)).toBe("1:00:50");
    expect(mediaTime(NaN)).toBe("0:00");
  });
  it("clamps progress, including initially unknown duration", () => {
    expect(safeVideoDuration(Infinity)).toBe(0);
    expect(videoProgress(40, 80)).toBe(0.5);
    expect(videoProgress(-2, 80)).toBe(0);
    expect(videoProgress(100, 80)).toBe(1);
    expect(videoProgress(80, 0)).toBe(0);
  });
  it("uses the actual touch position and track width for seeking", () => {
    expect(videoSeekForTouch(100, 200, 120)).toBe(60);
    expect(videoSeekForTouch(-40, 200, 120)).toBe(0);
    expect(videoSeekForTouch(300, 200, 120)).toBe(120);
    expect(videoSeekForTouch(100, 0, 120)).toBe(0);
  });
});
