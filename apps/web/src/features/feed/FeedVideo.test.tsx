// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { requestPlayback, construct, loadSource, attachMedia, destroy } = vi.hoisted(() => ({
  requestPlayback: vi.fn(),
  construct: vi.fn(),
  loadSource: vi.fn(),
  attachMedia: vi.fn(),
  destroy: vi.fn(),
}));
vi.mock("./api", () => ({ feedApi: { requestPlayback } }));
vi.mock("hls.js", () => ({
  default: class FakeHls {
    static isSupported() {
      return true;
    }
    static Events = { ERROR: "hls-error", MANIFEST_PARSED: "manifest-parsed" };
    constructor() {
      construct();
    }
    on() {}
    loadSource(url: string) {
      loadSource(url);
    }
    attachMedia(video: HTMLVideoElement) {
      attachMedia(video);
    }
    destroy() {
      destroy();
    }
  },
}));
import { FeedVideo } from "./FeedVideo";

let root: Root, host: HTMLDivElement;
const manifestUrl = "/api/v1/feed-playback/media1?ticket=valid.ticket";
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      observe() {}
      disconnect() {}
      unobserve() {}
    },
  );
  vi.spyOn(HTMLMediaElement.prototype, "canPlayType").mockReturnValue("maybe");
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
  requestPlayback.mockResolvedValue({ manifestUrl });
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  requestPlayback.mockReset();
  construct.mockReset();
  loadSource.mockReset();
  attachMedia.mockReset();
  destroy.mockReset();
});
describe("FeedVideo HLS engine selection", () => {
  it("uses hls.js even if Chrome claims native HLS maybe support", async () => {
    await act(async () => root.render(<FeedVideo mediaId="media1" poster={null} />));
    await act(async () => {
      (host.querySelector("button") as HTMLButtonElement)?.click();
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
    expect(requestPlayback).toHaveBeenCalledWith("media1");
    expect(construct).toHaveBeenCalledOnce();
    expect(loadSource).toHaveBeenCalledWith(manifestUrl);
    expect(attachMedia).toHaveBeenCalledWith(host.querySelector("video"));
    expect(vi.mocked(HTMLMediaElement.prototype.play)).not.toHaveBeenCalled();
  });
});
