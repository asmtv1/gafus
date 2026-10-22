// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const { prefers } = vi.hoisted(()=>({prefers:vi.fn()}));
vi.mock("@/shared/lib/media/serverHealth",()=>({ prefersCloudruMedia: prefers }));

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
import { probeCdnOutage } from '@gafus/core/services/mediaDelivery';

let root: Root, host: HTMLDivElement;
const manifestUrl = "/api/v1/feed-playback/media1?ticket=valid.ticket";
beforeEach(() => {
  prefers.mockResolvedValue(false);
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
  prefers.mockReset();
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
  it("shows a centered play action on top of the poster and reveals the player on demand", async () => {
    await act(async () => root.render(<FeedVideo mediaId="media1" poster="https://example.test/poster.jpg" />));
    const player = host.querySelector("video");
    const button = host.querySelector<HTMLButtonElement>('button[class*="videoPlayButton"]');
    expect(player?.hidden).toBe(true);
    expect(host.querySelector("img")).not.toBeNull();
    expect(button?.textContent).toContain("Смотреть видео");

    await act(async () => {
      button?.click();
      await vi.waitFor(() => expect(attachMedia).toHaveBeenCalledOnce());
    });
    expect(player?.hidden).toBe(false);
    expect(host.querySelector("img")).toBeNull();
    expect(host.querySelector('button[class*="videoPlayButton"]')).toBeNull();
  });

  it("starts HLS on S3 immediately when server marks Feed down", async () => {
    prefers.mockResolvedValue(true);
    await act(async () => root.render(<FeedVideo mediaId="media1" poster={null} />));
    await act(async () => { (host.querySelector("button") as HTMLButtonElement)?.click(); });
    await vi.waitFor(() => expect(loadSource).toHaveBeenCalledOnce());
    expect(prefers).toHaveBeenCalledWith("feed");
    expect(loadSource).toHaveBeenCalledWith(manifestUrl + "&source=cloudru");
  });


  it("uses hls.js even if Chrome claims native HLS maybe support", async () => {
    await act(async () => root.render(<FeedVideo mediaId="media1" poster={null} />));
    await act(async () => {
      (host.querySelector("button") as HTMLButtonElement)?.click();
    });
    expect(requestPlayback).toHaveBeenCalledWith("media1");
    // Dynamic HLS import can take longer on busy CI runners; do not assert
    // against an arbitrary 10ms timer.
    await vi.waitFor(() => expect(construct).toHaveBeenCalledOnce(), {
      timeout: 10_000,
    });
    expect(loadSource).toHaveBeenCalledWith(manifestUrl);
    expect(attachMedia).toHaveBeenCalledWith(host.querySelector("video"));
    expect(vi.mocked(HTMLMediaElement.prototype.play)).not.toHaveBeenCalled();
  });
  it("starts a new video using Cloud.ru HLS when Feed is in a confirmed 504 cooldown", async () => {
    const source = `https://garaquachegasourn.begetcdn.cloud/md5(${'A'.repeat(22)},1999999999)/posts/owner/post/attachments/media/hls/segment-000.ts`;
    expect(await probeCdnOutage(source, { fetcher: async () => new Response(null, { status: 504 }) })).toBe(true);
    await act(async () => root.render(<FeedVideo mediaId="media1" poster={null} />));
    await act(async () => {
      (host.querySelector('button') as HTMLButtonElement)?.click();
    });
    await vi.waitFor(() => expect(loadSource).toHaveBeenCalledOnce());
    expect(loadSource).toHaveBeenCalledWith(manifestUrl + '&source=cloudru');
  });

});
