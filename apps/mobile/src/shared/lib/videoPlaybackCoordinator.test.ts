import { afterEach, describe, expect, it, vi } from "vitest";

import {
  activateVideoPlayer,
  pauseVideoPlayerSafely,
  releaseVideoPlayer,
  resetVideoPlaybackCoordinator,
} from "./videoPlaybackCoordinator";

describe("videoPlaybackCoordinator", () => {
  afterEach(resetVideoPlaybackCoordinator);

  it("ставит предыдущий плеер на паузу", () => {
    const first = { pause: vi.fn() };
    const second = { pause: vi.fn() };

    activateVideoPlayer(first);
    activateVideoPlayer(second);

    expect(first.pause).toHaveBeenCalledOnce();
    expect(second.pause).not.toHaveBeenCalled();
  });

  it("не трогает освобождённый плеер", () => {
    const first = { pause: vi.fn() };
    const second = { pause: vi.fn() };

    activateVideoPlayer(first);
    releaseVideoPlayer(first);
    activateVideoPlayer(second);

    expect(first.pause).not.toHaveBeenCalled();
  });

  it("не падает, если expo-video уже освободил нативный объект", () => {
    const released = {
      pause: vi.fn(() => {
        throw new Error("NativeSharedObjectNotFoundException");
      }),
    };
    const next = { pause: vi.fn() };

    activateVideoPlayer(released);

    expect(() => activateVideoPlayer(next)).not.toThrow();
    expect(released.pause).toHaveBeenCalledOnce();
  });

  it("возвращает false при попытке поставить освобождённый плеер на паузу", () => {
    const released = {
      pause: vi.fn(() => {
        throw new Error("NativeSharedObjectNotFoundException");
      }),
    };

    expect(pauseVideoPlayerSafely(released)).toBe(false);
  });
});
