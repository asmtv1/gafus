// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { sources, statusListeners, endListeners, prefers, fallbackRequest, players } = vi.hoisted(() => ({
  prefers: vi.fn(), fallbackRequest: vi.fn(),
  sources: [] as { uri: string; contentType: string; useCaching: boolean }[],
  statusListeners: new Map<string, (event: { status: string }) => void>(),
  endListeners: new Map<string, () => void>(),
  players: [] as { play: ReturnType<typeof vi.fn>; pause: ReturnType<typeof vi.fn>;
    replaceAsync: ReturnType<typeof vi.fn>; replay: ReturnType<typeof vi.fn>;
    currentTime: number; playing: boolean }[],
}));
vi.mock("@expo/vector-icons", async () => {
  const R = await import("react");
  return { MaterialCommunityIcons: ({ name }: { name: string }) =>
    R.createElement("span", { "data-icon": name }) };
});
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
vi.mock("react-native-gesture-handler", async () => {
  const R = await import("react");
  return { GestureHandlerRootView: ({ children }: { children: React.ReactNode }) =>
    R.createElement("div", null, children) };
});
vi.mock("@/shared/components/media/SwipeDismissMedia", async () => {
  const R = await import("react");
  return { SwipeDismissMedia: ({ children }: { children: React.ReactNode }) =>
    R.createElement("div", null, children) };
});
vi.mock("expo-router", () => ({ useFocusEffect: () => undefined }));
vi.mock("expo-image", () => ({ Image: () => null }));
vi.mock("@/shared/lib/media/videoQualityTelemetry", () => ({ reportNativeVideoStarted: vi.fn() }));
vi.mock("react-native", async () => {
  const R = await import("react");
  return {
    AppState: { addEventListener: () => ({ remove() {} }) },
    PixelRatio: { get: () => 2 },
    Platform: { OS: "ios" },
    Modal: ({ children }: { children: React.ReactNode }) => R.createElement("div", null, children),
    useWindowDimensions: () => ({ width: 390 }),
    StyleSheet: { create: (value: object) => value },
    Pressable: ({ onPress, children, disabled, accessibilityLabel }: {
      onPress: (event: { stopPropagation: () => void }) => void; children: React.ReactNode;
      disabled?: boolean; accessibilityLabel?: string;
    }) => R.createElement("button", { onClick: onPress, disabled, "aria-label": accessibilityLabel }, children),
    View: ({ children, accessibilityLabel }: { children: React.ReactNode; accessibilityLabel?: string }) =>
      R.createElement("div", { "aria-label": accessibilityLabel }, children),
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
        const listeners = new Set<() => void>();
        const player = { uri: source.uri, currentTime: 0, duration: 120, playing: false,
          play: vi.fn(), pause: vi.fn(),
          replay: vi.fn(() => { player.currentTime = 0; player.playing = true; }),
          replaceAsync: vi.fn(async (next: {uri: string}) => { player.uri = next.uri;
            listeners.forEach(listener => listener()); }),
          onReplace: (fn: () => void) => { listeners.add(fn); return () => listeners.delete(fn); },
          staysActiveInBackground: false, showNowPlayingNotification: false,
          addListener: (kind: string, listener: (event: { status: string }) => void) => {
            if (kind === "statusChange") statusListeners.set(source.uri, listener);
            if (kind === "playToEnd") endListeners.set(source.uri, listener as () => void);
            return { remove: () => {
              if (kind === "statusChange") statusListeners.delete(source.uri);
              if (kind === "playToEnd") endListeners.delete(source.uri);
            } };
          } };
        players.push(player);
        setup?.(player);
        return player;
      }, [source.uri]),
    VideoView: ({ player, fullscreenOptions }: {
      player: { uri: string; onReplace: (fn: () => void) => () => void }; fullscreenOptions?: { enable: boolean };
    }) => {
      const [uri, setUri] = R.useState(player.uri);
      R.useEffect(() => player.onReplace(() => setUri(player.uri)), [player]);
      return R.createElement("div", {
        "data-testid": "native-video", "data-uri": uri,
        "data-fullscreen": String(fullscreenOptions?.enable),
      });
    },
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
  sources.length = 0; players.length = 0; statusListeners.clear(); endListeners.clear(); vi.restoreAllMocks();
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
    expect(host.querySelector('[data-testid="native-video"]')?.getAttribute("data-fullscreen")).toBe("false");
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
  it("toggles play/pause by tapping the video without opening the parent feed card", async () => {
    const navigate = vi.fn();
    await act(async () => root.render(
      <div onClick={navigate}>
        <FeedVideo postId="p" mediaId="m" poster={null} visible mp4Urls={{ 360: mp4 }} />
      </div>,
    ));
    await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="Воспроизвести видео"]')?.click());
    expect(navigate).not.toHaveBeenCalled();
    expect(host.querySelector('[aria-label="Пауза"]')).not.toBeNull();
    expect(host.querySelector('[aria-label="Перемотка видео"]')).not.toBeNull();
    expect(host.querySelector('[data-icon="pause"]')).toBeNull(); // no floating pause button
    await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="Пауза"]')?.click());
    expect(players[0]?.pause).toHaveBeenCalledOnce();
    expect(host.querySelector('[aria-label="Продолжить видео"]')).not.toBeNull();
    expect(host.querySelector('[data-icon="play"]')).not.toBeNull();
    await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="Продолжить видео"]')?.click());
    expect(players[0]?.play).toHaveBeenCalledTimes(2); // initial start + resume
    expect(host.querySelector('[aria-label="Пауза"]')).not.toBeNull();
    expect(navigate).not.toHaveBeenCalled();
  });
  it("plays a completed Moments MP4 again from zero after native playToEnd", async () => {
    await act(async () => root.render(<FeedVideo postId="p" mediaId="m" poster={null}
      visible mp4Urls={{360:mp4}} />));
    await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="Воспроизвести видео"]')?.click());
    expect(players[0]?.play).toHaveBeenCalledOnce();
    players[0]!.currentTime=120;
    await act(async () => endListeners.get(mp4)?.());
    expect(host.querySelector('[aria-label="Продолжить видео"]')).not.toBeNull();
    await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="Продолжить видео"]')?.click());
    expect(players[0]?.currentTime).toBe(0);
    expect(players[0]?.replay).toHaveBeenCalledOnce();
    expect(players[0]?.play).toHaveBeenCalledOnce();
  });
  it("reveals 360 / auto / 720 behind the same in-player gear without restarting the native player", async () => {
    const mp4High="https://media.example.test/media/v2/m/v1/video/720.mp4";
    await act(async()=>root.render(<FeedVideo postId="p" mediaId="m" poster={null}
      visible mp4Urls={{360:mp4,720:mp4High}} />));
    expect(host.querySelector('[aria-label="Настройки качества видео"]')).toBeNull(); // before playback
    await act(async()=>host.querySelector<HTMLButtonElement>('[aria-label="Воспроизвести видео"]')?.click());
    expect(players).toHaveLength(1);
    const settings=()=>host.querySelector<HTMLButtonElement>('[aria-label="Настройки качества видео"]');
    expect(settings()).not.toBeNull();
    expect(host.querySelector('[aria-label="720p"]')).toBeNull();
    await act(async()=>settings()?.click());
    expect(host.querySelector('[aria-label="720p"]')).not.toBeNull();
    expect(host.querySelector('[aria-label="360p"]')).not.toBeNull();
    expect(host.querySelector('[aria-label="Авто"]')).not.toBeNull();
    // On retina displays Auto may already choose 720p, so force a different
    // source first to prove the manual switch retains the same player.
    await act(async()=>{host.querySelector<HTMLButtonElement>('[aria-label="360p"]')?.click();await Promise.resolve();});
    await act(async()=>settings()?.click());
    players[0]!.currentTime=22;
    players[0]!.playing=true;
    await act(async()=>{host.querySelector<HTMLButtonElement>('[aria-label="720p"]')?.click();await Promise.resolve();});
    expect(players).toHaveLength(1); // replaceAsync reuses same native decoder
    expect(players[0]?.replaceAsync).toHaveBeenCalledWith({
      uri:mp4High,contentType:"progressive",useCaching:false,
    });
    expect(players[0]?.currentTime).toBe(22);
    expect(host.querySelector('[aria-label="720p"]')).toBeNull(); // menu closes
  });
  it("opens inline MP4 in a swipe-dismissable modal without resetting its player", async () => {
    await act(async () => root.render(<FeedVideo postId="p" mediaId="m" poster={null}
      visible mp4Urls={{ 360: mp4 }} />));
    await act(async () => host.querySelector<HTMLButtonElement>(
      '[aria-label="Воспроизвести видео"]')?.click());
    expect(players).toHaveLength(1);
    expect(host.querySelector('[aria-label="Развернуть видео"]')).not.toBeNull();
    await act(async () => host.querySelector<HTMLButtonElement>(
      '[aria-label="Развернуть видео"]')?.click());
    expect(host.querySelector('[aria-label="Закрыть видео"]')).not.toBeNull();
    expect(host.querySelector('[data-testid="native-video"]')).not.toBeNull();
    expect(players).toHaveLength(1); // same progressive MP4 player, no duplicate load
    await act(async () => host.querySelector<HTMLButtonElement>(
      '[aria-label="Закрыть видео"]')?.click());
    expect(host.querySelector('[aria-label="Развернуть видео"]')).not.toBeNull();
    expect(players).toHaveLength(1);
  });
  it("keeps the same tap and timeline controls on fullscreen Moments", async () => {
    const { FeedV2Video } = await import("./FeedV2Media");
    await act(async () => root.render(<FeedV2Video postId="p" media={{
      id: "m", kind: "video", status: "ready", width: 720, height: 1280,
      durationSeconds: 12, access: "viewer", expiresAt: null, placeholder: null,
      posterUrl: "", mp4: { 360: mp4 },
    }} visible fullscreen />));
    await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="Воспроизвести видео"]')?.click());
    expect(host.querySelector('[data-testid="native-video"]')).not.toBeNull();
    expect(host.querySelector('[aria-label="Пауза"]')).not.toBeNull();
    expect(host.querySelector('[aria-label="Перемотка видео"]')).not.toBeNull();
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
