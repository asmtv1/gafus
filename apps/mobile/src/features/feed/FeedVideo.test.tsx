// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { sources, statusListeners, prefers, fallbackRequest } = vi.hoisted(() => ({
  prefers: vi.fn(), fallbackRequest: vi.fn(),
  sources: [] as { uri: string; contentType: string; useCaching: boolean }[],
  statusListeners: new Map<string, (event: { status: string }) => void>(),
}));
vi.mock("@/shared/stores", () => ({
  useAuthStore: (selector: (state: { user: { id: string } }) => string) =>
    selector({ user: { id: "test-user" } }),
}));
vi.mock("@/shared/lib/api/feed", () => ({
  feedApi: { requestMediaFallback: fallbackRequest },
}));
vi.mock("@/shared/components/media/CdnImage", () => ({
  CdnImage: () => null,
  isSignedCloudruFallback: (raw: string) => raw.startsWith("https://s3.cloud.ru/gafus-feed-private/") && raw.includes("X-Amz-Signature="),
}));
vi.mock("@/shared/lib/media/serverHealth", () => ({ prefersCloudruMedia: prefers }));
vi.mock("expo-router", () => ({ useFocusEffect: () => undefined }));
vi.mock("expo-image", () => ({ Image: () => null }));
vi.mock("react-native", async () => {
  const R = await import("react");
  return {
    AppState: { addEventListener: () => ({ remove() {} }) },
    PixelRatio: { get: () => 2 },
    Modal: ({ children }: { children: React.ReactNode }) => R.createElement("div", null, children),
    useWindowDimensions: () => ({ width: 390 }),
    StyleSheet: { create: (value: object) => value },
    Pressable: ({ onPress, children, disabled }: { onPress: () => void; children: React.ReactNode; disabled: boolean }) =>
      R.createElement("button", { onClick: onPress, disabled }, children),
    View: ({ children }: { children: React.ReactNode }) => R.createElement("div", null, children),
    Text: ({ children, accessibilityRole }: { children: React.ReactNode; accessibilityRole?: string }) =>
      R.createElement("span", accessibilityRole ? { role: accessibilityRole } : null, children),
  };
});
vi.mock("expo-video", async () => {
  const R = await import("react");
  return {
    useVideoPlayer: (source: { uri: string; contentType: string; useCaching: boolean },
      setup?: (player: object) => void) => R.useMemo(() => {
        sources.push(source);
        const player = { uri: source.uri, play: vi.fn(),
          staysActiveInBackground: false, showNowPlayingNotification: false,
          addListener: (_kind: string, listener: (event: { status: string }) => void) => {
            statusListeners.set(source.uri, listener);
            return { remove: () => statusListeners.delete(source.uri) };
          } };
        setup?.(player);
        return player;
      }, [source.uri]),
    VideoView: ({ player, fullscreenOptions }: {
      player: { uri: string }; fullscreenOptions?: { enable: boolean };
    }) => R.createElement("div", {
      "data-testid": "native-video", "data-uri": player.uri,
      "data-fullscreen": String(fullscreenOptions?.enable),
    }),
  };
});
import { FeedVideo } from "./FeedVideo";
const mp4 = "https://media.example.test/media/v2/m/v1/video/360.mp4";
let root: Root; let host: HTMLDivElement;
beforeEach(() => {
  prefers.mockResolvedValue(false);
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement("div"); document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount()); host.remove();
  sources.length = 0; statusListeners.clear(); vi.restoreAllMocks();
  prefers.mockReset(); fallbackRequest.mockReset();
});
describe("Mobile Moments native progressive MP4 cutover", () => {
  it("never requests a ticket, and starts exactly one progressive MP4 on user tap", async () => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    await act(async () => root.render(<FeedVideo postId="p" mediaId="m" poster={null}
      visible mp4Urls={{ 360: mp4 }} />));
    expect(sources).toEqual([]);
    await act(async () => { host.querySelector("button")?.click(); });
    expect(sources).toEqual([{ uri: mp4, contentType: "progressive", useCaching: false }]);
    expect(host.querySelector('[data-testid="native-video"]')?.getAttribute("data-uri")).toBe(mp4);
    expect(host.querySelector('[data-testid="native-video"]')?.getAttribute("data-fullscreen")).toBe("true");
    expect(fetcher).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
  it("preselects a per-object authorized S3 video during a confirmed server CDN outage", async () => {
    const cdn = `https://quepraquiecebquomiel.begetcdn.cloud/media/v2/m/v1/video/360.mp4?md5=${'A'.repeat(22)}&expires=1999999999`;
    const s3 = 'https://s3.cloud.ru/gafus-feed-private/media/v2/m/v1/video/360.mp4?X-Amz-Signature=valid';
    prefers.mockResolvedValue(true);
    fallbackRequest.mockResolvedValue({ url: s3 });
    await act(async () => root.render(<FeedVideo postId="p" mediaId="m" poster={null}
      visible mp4Urls={{ 360: cdn }} />));
    await act(async () => { host.querySelector("button")?.click(); await Promise.resolve(); });
    expect(prefers).toHaveBeenCalledWith("feed");
    expect(fallbackRequest).toHaveBeenCalledWith("m", "video360");
    expect(host.querySelector('[data-testid="native-video"]')?.getAttribute('data-uri')).toBe(s3);
  });
  it("does not turn individual 403 into an S3 bypass, but recovers a 503 without double fallback", async () => {
    const cdn = `https://quepraquiecebquomiel.begetcdn.cloud/media/v2/m/v1/video/360.mp4?md5=${'A'.repeat(22)}&expires=1999999999`;
    const s3 = 'https://s3.cloud.ru/gafus-feed-private/media/v2/m/v1/video/360.mp4?X-Amz-Signature=valid';
    const fetcher = vi.fn(async () => new Response(null, { status: 503 }));
    vi.stubGlobal('fetch', fetcher);
    fallbackRequest.mockResolvedValue({url:s3});
    await act(async () => root.render(<FeedVideo postId="p" mediaId="m" poster={null}
      visible mp4Urls={{ 360: cdn }} />));
    await act(async () => { host.querySelector('button')?.click(); await Promise.resolve(); });
    await act(async () => {
      statusListeners.get(cdn)?.({status:'error'});
      statusListeners.get(cdn)?.({status:'error'});
      await new Promise(resolve => setTimeout(resolve, 0));
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fallbackRequest).toHaveBeenCalledTimes(1);
    expect(host.querySelector('[data-testid="native-video"]')?.getAttribute('data-uri')).toBe(s3);
    vi.unstubAllGlobals();
  });
  it("does not render playable content without a signed MP4", async () => {
    await act(async () => root.render(<FeedVideo postId="p" mediaId="m" poster={null} visible />));
    expect(host.querySelector("button")).toBeNull();
    expect(sources).toHaveLength(0);
  });
  it("releases native player when its post leaves the visible area", async () => {
    await act(async () => root.render(<FeedVideo postId="p" mediaId="m" poster={null}
      visible mp4Urls={{ 360: mp4 }} />));
    await act(async () => host.querySelector("button")?.click());
    await act(async () => root.render(<FeedVideo postId="p" mediaId="m" poster={null}
      visible={false} mp4Urls={{ 360: mp4 }} />));
    expect(host.querySelector('[data-testid="native-video"]')).toBeNull();
  });
});
