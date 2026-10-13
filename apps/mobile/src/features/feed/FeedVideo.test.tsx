// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const { prefers } = vi.hoisted(()=>({prefers:vi.fn()}));
vi.mock("@/shared/lib/media/serverHealth",()=>({ prefersCloudruMedia: prefers }));
const { playback, probe, listeners, sources } = vi.hoisted(() => ({
  playback: vi.fn(),
  probe: vi.fn(),
  listeners: new Map<string, (event: { status: string }) => void>(),
  sources: [] as string[],
}));
vi.mock("@/shared/lib/api/feed", () => ({ feedApi: { requestPlayback: playback } }));
vi.mock("@/shared/config", () => ({
  API_BASE_URL: "https://api.gafus.test",
  COLORS: {},
  FONTS: {},
}));
vi.mock("@/shared/stores", () => ({
  useAuthStore: (selector: (state: { user: { id: string } }) => string) =>
    selector({ user: { id: "test-user" } }),
}));
vi.mock("@/shared/components/media/CdnImage", () => ({ CdnImage: () => null }));
vi.mock("expo-router", () => ({ useFocusEffect: () => {} }));
vi.mock("@gafus/core/services/mediaDelivery", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  probeHlsCdnOutage: probe,
}));
vi.mock("react-native", async () => {
  const R = await import("react");
  return {
    AppState: { addEventListener: () => ({ remove() {} }) },
    StyleSheet: { create: (x: object) => x },
    Pressable: ({
      onPress,
      children,
      disabled,
      ...rest
    }: {
      onPress: () => void;
      children: React.ReactNode;
      disabled: boolean;
    }) => R.createElement("button", { onClick: onPress, disabled }, children),
    View: ({ children }: { children: React.ReactNode }) => R.createElement("div", null, children),
    Text: ({
      children,
      accessibilityRole,
    }: {
      children: React.ReactNode;
      accessibilityRole?: string;
    }) => R.createElement("span", accessibilityRole ? { role: accessibilityRole } : null, children),
  };
});
vi.mock("expo-video", async () => {
  const R = await import("react");
  return {
    useVideoPlayer: (source: { uri: string }, setup?: (p: object) => void) => {
      return R.useMemo(() => {
        const player = {
          uri: source.uri,
          play: () => {},
          staysActiveInBackground: false,
          showNowPlayingNotification: false,
          addListener: (_event: string, cb: (event: { status: string }) => void) => {
            listeners.set(source.uri, cb);
            return { remove: () => listeners.delete(source.uri) };
          },
        };
        sources.push(source.uri);
        setup?.(player);
        return player;
      }, [source.uri]);
    },
    VideoView: ({ player }: { player: { uri: string } }) =>
      R.createElement("div", { "data-testid": "native-video", "data-uri": player.uri }),
  };
});
import { FeedVideo } from "./FeedVideo";
import { probeCdnOutage } from '@gafus/core/services/mediaDelivery';
const base = "https://api.gafus.test";
const manifest = "/api/v1/feed-playback/video1?ticket=abc.def";
let root: Root, host: HTMLDivElement;
beforeEach(() => {
  prefers.mockResolvedValue(false);
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  playback.mockResolvedValue({ manifestUrl: manifest });
  probe.mockResolvedValue(true);
});
afterEach(async () => {
  prefers.mockReset();
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  listeners.clear();
  sources.length = 0;
  playback.mockReset();
  probe.mockReset();
});
describe("Mobile FeedVideo native source fallback", () => {
  it("starts HLS on S3 immediately when server marks Feed down", async () => {
    prefers.mockResolvedValue(true);
    await act(async () => root.render(<FeedVideo postId="p1" mediaId="video1" poster={null} visible />));
    await act(async () => {
      (host.querySelector("button") as HTMLButtonElement).click();
      await new Promise(resolve => setTimeout(resolve, 0));
    });
    expect(prefers).toHaveBeenCalledWith("feed");
    expect(sources).toEqual([base + manifest + "&source=cloudru"]);
    expect(probe).not.toHaveBeenCalled();
  });


  it("reinitializes expo-video with Cloud.ru fallback manifest after an outage", async () => {
    await act(async () =>
      root.render(<FeedVideo postId="p1" mediaId="video1" poster={null} visible />),
    );
    await act(async () => {
      (host.querySelector("button") as HTMLButtonElement).click();
      await new Promise((r) => setTimeout(r, 0));
    });
    const original = base + manifest;
    expect(host.querySelector('[data-testid="native-video"]')?.getAttribute("data-uri")).toBe(
      original,
    );
    const failure = listeners.get(original);
    expect(failure).toBeTypeOf("function");
    await act(async () => {
      failure?.({ status: "error" });
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(probe).toHaveBeenCalledWith(original, { nativeNetwork: true });
    expect(host.querySelector('[data-testid="native-video"]')?.getAttribute("data-uri")).toBe(
      original + "&source=cloudru",
    );
    expect(sources).toEqual([original, original + "&source=cloudru"]);
  });
  it("does not request alternate source when outage is unconfirmed (403 or 404)", async () => {
    probe.mockResolvedValue(false);
    await act(async () =>
      root.render(<FeedVideo postId="p1" mediaId="video1" poster={null} visible />),
    );
    await act(async () => {
      (host.querySelector("button") as HTMLButtonElement).click();
      await new Promise((r) => setTimeout(r, 0));
    });
    const original = base + manifest;
    await act(async () => {
      listeners.get(original)?.({ status: "error" });
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(sources).toEqual([original]);
    expect(host.querySelector('[data-testid="native-video"]')).toBeNull();
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("Видео не загрузилось");
  });
  it("starts a new video directly on Cloud.ru HLS during a confirmed Feed outage", async () => {
    const source = `https://feed.gafus.ru/posts/owner/post/attachments/media/hls/segment-000.ts?md5=${'A'.repeat(22)}&expires=1999999999`;
    expect(await probeCdnOutage(source, { fetcher: async () => new Response(null, { status: 504 }) })).toBe(true);
    await act(async () =>
      root.render(<FeedVideo postId="p1" mediaId="video1" poster={null} visible />),
    );
    await act(async () => {
      (host.querySelector('button') as HTMLButtonElement).click();
      await new Promise(resolve => setTimeout(resolve, 0));
    });
    expect(sources).toEqual([base + manifest + '&source=cloudru']);
    expect(probe).not.toHaveBeenCalled();
  });

});
