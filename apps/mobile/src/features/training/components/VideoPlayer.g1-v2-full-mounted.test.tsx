// @vitest-environment jsdom
/** Actual VideoPlayer + useVideoProgress + new-only v2 journal. Mock only native AV/UI/secure storage. */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import {
  createNewOnlyV2Queues,
  type NewOnlyV2Dependencies,
  type NewOnlyV2Queues,
} from "@/shared/lib/offline/newOnlyV2Queues";
import { readOwnPendingVideoProgress } from "@/shared/lib/offline/newOnlyV2VideoWriter";
const mock = vi.hoisted(() => ({
  q: null as NewOnlyV2Queues | null,
  offline: true,
  callbacks: new Map<string, Set<(e: any) => void>>(),
  background: new Set<(s: string) => void>(),
  blur: new Set<() => void>(),
  report: vi.fn(),
  getRemote: vi.fn(),
  saveRemote: vi.fn(),
  play: vi.fn(),
  pause: vi.fn(),
  seek: vi.fn(),
  player: null as any,
}));
vi.mock("@/shared/stores/authStore", async () => {
  const { create } = await import("zustand");
  return { useAuthStore: create<{ user: { id: string } | null }>(() => ({ user: { id: "A" } })) };
});
vi.mock("@/shared/hooks/useNetworkStatus", () => ({ useIsOffline: () => mock.offline }));
vi.mock("@/shared/lib/api/training", () => ({
  trainingApi: { getVideoProgress: mock.getRemote, saveVideoProgress: mock.saveRemote },
}));
vi.mock("@/shared/lib/tracer", () => ({
  reportClientError: (...a: unknown[]) => mock.report(...a),
}));
vi.mock("@/shared/lib/offline/newOnlyV2Native", () => ({
  newOnlyV2NativeQueues: {
    getVerifiedBinding: () => mock.q!.getVerifiedBinding(),
    getPending: (k: "progress" | "prevention") => mock.q!.getPending(k),
    enqueue: (...a: Parameters<NewOnlyV2Queues["enqueue"]>) => mock.q!.enqueue(...a),
  },
}));
vi.mock("react-native", async () => {
  const React = await import("react");
  const box = (tag: string) => (p: Record<string, unknown>) =>
    React.createElement(
      tag,
      {
        onClick: p.onPress as (() => void) | undefined,
        "data-label": p.accessibilityLabel as string | undefined,
      },
      p.children as React.ReactNode,
    );
  return {
    Platform: { OS: "ios", select: (v: Record<string, unknown>) => v.ios ?? v.default },
    View: box("div"),
    Linking: { openURL: vi.fn() },
    Pressable: box("div"),
    ActivityIndicator: () => null,
    Modal: ({ visible, children }: { visible: boolean; children: React.ReactNode }) =>
      visible ? React.createElement("div", null, children) : null,
    StyleSheet: { create: (s: unknown) => s, absoluteFillObject: {} },
    AppState: {
      addEventListener: (_name: string, fn: (s: string) => void) => {
        mock.background.add(fn);
        return { remove: () => mock.background.delete(fn) };
      },
    },
  };
});
vi.mock("expo", async () => {
  const { useEffect } = await import("react");
  return {
    useEvent: (_p: unknown, type: string, initial: unknown) => ({
      [type === "statusChange" ? "status" : "isPlaying"]:
        type === "statusChange" ? "readyToPlay" : mock.player.playing,
    }),
    useEventListener: (_p: unknown, type: string, fn: (payload: any) => void) => {
      useEffect(() => {
        let a = mock.callbacks.get(type);
        if (!a) {
          a = new Set();
          mock.callbacks.set(type, a);
        }
        a.add(fn);
        return () => {
          a!.delete(fn);
        };
      }, [type, fn]);
    },
  };
});
vi.mock("expo-video", async () => {
  const React = await import("react");
  return {
    useVideoPlayer: (_src: unknown, setup: (p: unknown) => void) => {
      const p = mock.player;
      React.useEffect(() => {
        setup(p);
      }, [p]);
      return p;
    },
    VideoView: React.forwardRef((_p: unknown, ref) => React.createElement("video", { ref })),
  };
});
// OfflineStorage is exercised only through native filesystem capability
// boundaries in this jsdom scenario; do not evaluate the real Expo native
// module initializer (it requires the native __DEV__ runtime).
vi.mock("expo-file-system/legacy", () => ({
  documentDirectory: "file:///offline-test-device/",
  EncodingType: { Base64: "base64" },
  // The actual offline resolver must find a known downloaded manifest.
  // Only the synthetic QA file exists; no native device/network access.
  getInfoAsync: vi.fn(async (uri: string) => ({
    exists: uri === "file:///offline-test-device/offline/qa-course/videos/videoA/manifest.m3u8",
    isDirectory: false,
  })),
  readAsStringAsync: vi.fn().mockResolvedValue(""),
  makeDirectoryAsync: vi.fn().mockResolvedValue(undefined),
  writeAsStringAsync: vi.fn().mockResolvedValue(undefined),
  deleteAsync: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("expo-image", () => ({ Image: () => null }));
vi.mock("expo-router", () => ({
  useNavigation: () => ({
    addListener: (_type: string, fn: () => void) => {
      mock.blur.add(fn);
      return () => mock.blur.delete(fn);
    },
  }),
}));
vi.mock("expo-screen-orientation", () => ({
  OrientationLock: { PORTRAIT_UP: 1 },
  lockAsync: async () => {},
}));
vi.mock("react-native-paper", async () => {
  const React = await import("react");
  return {
    Text: ({ children }: { children: React.ReactNode }) =>
      React.createElement("span", null, children),
    Surface: ({ children }: { children: React.ReactNode }) =>
      React.createElement("section", null, children),
    IconButton: ({
      onPress,
      accessibilityLabel,
      icon,
    }: {
      onPress: () => void;
      accessibilityLabel?: string;
      icon: string;
    }) =>
      React.createElement(
        "button",
        { "data-label": accessibilityLabel ?? icon, onClick: onPress },
        icon,
      ),
  };
});
vi.mock("@expo/vector-icons", () => ({ MaterialCommunityIcons: () => null }));
vi.mock("@/shared/components", async () => ({
  MarkdownText: () => null,
  VideoPlayer: (await import("@/shared/components/VideoPlayer")).VideoPlayer,
}));
vi.mock("@/shared/hooks", async () => ({
  useVideoProgress: (await import("@/shared/hooks/useVideoProgress")).useVideoProgress,
  useVideoUrl: () => ({
    url: "file:///v/videoA.mp4",
    isLoading: false,
    error: null,
    videoId: "videoA",
    posterUrl: null,
    retry: vi.fn(),
  }),
}));
vi.mock("@/shared/components/ui", async () => {
  const React = await import("react");
  return {
    Button: ({ onPress, label }: { onPress: () => void; label: string }) =>
      React.createElement("button", { onClick: onPress }, label),
  };
});
vi.mock("@/shared/lib/hlsQuality", () => ({
  canLoadHlsQualityVariants: () => false,
  parseHlsQualityVariants: () => [],
}));
vi.mock("@/shared/lib/videoPlaybackCoordinator", () => ({
  activateVideoPlayer: () => {},
  releaseVideoPlayer: () => {},
  pauseVideoPlayerSafely: (p: { pause: () => void }) => {
    p.pause();
    return true;
  },
}));
import { useAuthStore } from "@/shared/stores/authStore";
import { useVideoProgress } from "@/shared/hooks/useVideoProgress";
import { VideoPlayer } from "@/shared/components/VideoPlayer";
import { CourseDescription } from "./CourseDescription";
const now = 1792252800000;
function deferred() {
  let go!: () => void;
  const promise = new Promise<void>((r) => {
    go = r;
  });
  return { go, promise };
}
function fixture() {
  const disk = new Map<string, string>([
    ["progress-sync-storage", "legacy-bytes"],
    ["video-progress-storage", "old-video-bytes"],
  ]);
  const secure = new Map<string, string>();
  const writes: string[] = [];
  let id = 0,
    failWrite = false,
    failRead = false,
    wait: ReturnType<typeof deferred> | null = null;
  let notify!: () => void;
  const entered = new Promise<void>((r) => {
    notify = r;
  });
  const deps: NewOnlyV2Dependencies = {
    storage: {
      getItem: async (key) => {
        if (failRead && key.startsWith("gafus-progress-v2:") && writes.length)
          throw Error("READ_FAULT");
        return disk.get(key) ?? null;
      },
      setItem: async (key, value) => {
        if (failWrite) throw Error("DISK_FULL");
        if (wait) {
          notify();
          await wait.promise;
        }
        writes.push(key);
        disk.set(key, value);
      },
    },
    secure: {
      getItemAsync: async (key) => secure.get(key) ?? null,
      setItemAsync: async (key, value) => {
        secure.set(key, value);
      },
      deleteItemAsync: async (key) => {
        secure.delete(key);
      },
    },
    now: () => Date.now(),
    makeId: () => `00000000-0000-4000-8000-${String(++id).padStart(12, "0")}`,
  };
  return {
    q: createNewOnlyV2Queues(deps),
    fresh: () => createNewOnlyV2Queues(deps),
    disk,
    writes,
    failWrites: () => {
      failWrite = true;
    },
    failReads: (v: boolean) => {
      failRead = v;
    },
    suspend: () => {
      wait = deferred();
      return { gate: wait, entered };
    },
    legacy: () => {
      expect(disk.get("progress-sync-storage")).toBe("legacy-bytes");
      expect(disk.get("video-progress-storage")).toBe("old-video-bytes");
      expect(writes.every((x) => x.startsWith("gafus-progress-v2:"))).toBe(true);
    },
  };
}
let env: ReturnType<typeof fixture>, root: Root, node: HTMLDivElement;
function Screen({
  video = "videoA",
  occurrence = "day1",
  active = true,
}: {
  video?: string;
  occurrence?: string;
  active?: boolean;
}) {
  const progress = useVideoProgress(video, active);
  return createElement(
    "div",
    { "data-occurrence": occurrence },
    active
      ? createElement(VideoPlayer, {
          uri: "file:///v/" + video + ".mp4",
          autoPlay: false,
          nativeControls: false,
          initialTimeSec: progress.initialTimeSec,
          onSaveProgress: progress.saveProgress,
        })
      : null,
    createElement(
      "span",
      { "data-status": "progress" },
      String(progress.initialTimeSec ?? "empty") + "/" + (progress.saveError ?? "ok"),
    ),
  );
}
async function flush() {
  await act(async () => {
    for (let i = 0; i < 10; i++) await Promise.resolve();
  });
}
async function mount(video = "videoA", occurrence = "day1", active = true) {
  await act(async () => root.render(createElement(Screen, { video, occurrence, active })));
  await flush();
}
async function emit(event: string, payload: Record<string, unknown> = {}) {
  await act(async () => {
    for (const fn of mock.callbacks.get(event) ?? []) fn(payload);
    await Promise.resolve();
  });
  await flush();
}
async function position(n: number, advance = 16000) {
  vi.setSystemTime(now + advance);
  mock.player.currentTime = n;
  await emit("timeUpdate", { bufferedPosition: n });
}
async function press(label: string) {
  const el = Array.from(node.querySelectorAll("button")).find(
    (x) => x.getAttribute("data-label") === label,
  );
  expect(el, `missing ${label}`).toBeDefined();
  await act(async () => {
    (el as HTMLButtonElement).click();
  });
  await flush();
}
async function pending() {
  return readOwnPendingVideoProgress(mock.q!, "videoA");
}
describe("OFF022 actual native-mocked VideoPlayer → progress hook → v2 journal → restore", () => {
  beforeEach(async () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.useFakeTimers();
    vi.setSystemTime(now);
    mock.callbacks.clear();
    mock.background.clear();
    mock.blur.clear();
    vi.clearAllMocks();
    mock.offline = true;
    env = fixture();
    mock.q = env.q;
    await env.q.beginVerifiedLogin("A");
    useAuthStore.setState({ user: { id: "A" } as never });
    mock.player = {
      duration: 120,
      status: "readyToPlay",
      playing: false,
      currentTime: 0,
      bufferedPosition: 0,
      playbackRate: 1,
      pause: () => {
        mock.pause();
        mock.player.playing = false;
        for (const cb of mock.callbacks.get("playingChange") ?? []) cb({ isPlaying: false });
      },
      play: () => {
        mock.play();
        mock.player.playing = true;
        for (const cb of mock.callbacks.get("playingChange") ?? []) cb({ isPlaying: true });
      },
      seekBy: (delta: number) => {
        mock.seek(delta);
        mock.player.currentTime = Math.max(0, mock.player.currentTime + delta);
      },
      replaceAsync: async () => {},
    };
    node = document.createElement("div");
    document.body.appendChild(node);
    root = createRoot(node);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    node.remove();
    vi.useRealTimers();
  });
  it("real CourseDescription screen mounts real VideoPlayer + progress hook, restores the same v2 event", async () => {
    await act(async () =>
      root.render(
        createElement(CourseDescription, {
          description: "Details",
          videoUrl: "https://gafus-media.storage.yandexcloud.net/uploads/trainers/qa/videocourses/videoA/original.mp4",
          courseType: "qa-course",
        }),
      ),
    );
    const expand = () =>
      Array.from(node.querySelectorAll("div")).find(
        (x) => x.getAttribute("data-label") === "Подробнее описание курса",
      );
    expect(expand()).toBeDefined();
    await act(async () => {
      (expand() as HTMLElement).click();
    });
    await flush();
    expect(node.querySelector("video")).not.toBeNull();
    await position(63);
    expect((await pending())?.positionSec).toBe(63);
    const before = env.writes.length;
    await act(async () => root.unmount());
    root = createRoot(node);
    mock.q = env.fresh();
    expect(await mock.q.restoreVerifiedSession("A")).toBe(true);
    mock.player.currentTime = 0;
    await act(async () =>
      root.render(
        createElement(CourseDescription, {
          description: "Details",
          videoUrl: "https://gafus-media.storage.yandexcloud.net/uploads/trainers/qa/videocourses/videoA/original.mp4",
          courseType: "qa-course",
        }),
      ),
    );
    await act(async () => {
      (expand() as HTMLElement).click();
    });
    await flush();
    expect(mock.player.currentTime).toBe(63);
    expect(env.writes).toHaveLength(before);
    env.legacy();
  });
  it("video A repeated across separate occurrences uses SAME approved global videoId, backward seek replaces 90 with 20; remount restores latest", async () => {
    await mount();
    await position(90);
    expect((await pending())?.positionSec).toBe(90);
    mock.player.currentTime = 30;
    await press("Назад на 10 секунд");
    expect(mock.player.currentTime).toBe(20);
    await emit("timeUpdate");
    await emit("playingChange", { isPlaying: false });
    expect((await pending())?.positionSec).toBe(20);
    const count = env.writes.length;
    await act(async () => root.unmount());
    root = createRoot(node);
    mock.q = env.fresh();
    expect(await mock.q.restoreVerifiedSession("A")).toBe(true);
    await mount("videoA", "day2");
    expect(node.querySelector('[data-status="progress"]')?.textContent).toContain("20");
    expect(mock.player.currentTime).toBe(20);
    expect(env.writes).toHaveLength(count);
    env.legacy();
  });
  it("seek backward to zero persists zero and never resurrects an old saved 70-second offset", async () => {
    await mount();
    await position(70);
    expect((await pending())?.positionSec).toBe(70);
    mock.player.currentTime = 10;
    await press("Назад на 10 секунд");
    expect(mock.player.currentTime).toBe(0);
    await emit("playingChange", { isPlaying: false });
    expect((await pending())?.positionSec).toBe(0);
    await act(async () => root.unmount());
    root = createRoot(node);
    mock.q = env.fresh();
    expect(await mock.q.restoreVerifiedSession("A")).toBe(true);
    await mount("videoA", "another-occurrence");
    expect(node.querySelector('[data-status="progress"]')?.textContent).toContain("empty");
    expect(mock.player.currentTime).toBe(0);
    env.legacy();
  });
  it("unmount without timeUpdate persists the current native playback clock", async () => {
    await mount();
    await position(21);
    mock.player.currentTime = 47;
    await act(async () => root.unmount());
    expect((await pending())?.positionSec).toBe(47);
    const count = env.writes.length;
    root = createRoot(node);
    mock.q = env.fresh();
    expect(await mock.q.restoreVerifiedSession("A")).toBe(true);
    await mount("videoA", "restart");
    expect(node.querySelector('[data-status="progress"]')?.textContent).toContain("47");
    expect(env.writes).toHaveLength(count);
    env.legacy();
  });
  it("background and navigation blur pause; unmount persists latest playback time once, no late native callback", async () => {
    await mount();
    await position(32);
    mock.player.currentTime = 41;
    await act(async () => {
      for (const cb of mock.background) cb("background");
    });
    await flush();
    expect(mock.pause).toHaveBeenCalled();
    expect((await pending())?.positionSec).toBe(41);
    await act(async () => {
      for (const cb of mock.blur) cb();
    });
    await flush();
    expect(mock.pause.mock.calls.length).toBeGreaterThanOrEqual(2);
    const before = env.writes.length;
    await act(async () => root.unmount());
    await flush();
    expect(env.writes).toHaveLength(before);
    await emit("timeUpdate");
    expect(env.writes).toHaveLength(before);
    env.legacy();
  });
  it("old player callback after same-owner E1→E2 without rerender cannot write E1 seek into fresh E2", async () => {
    await mount();
    await position(24);
    const e1 = mock.q!.getVerifiedBinding()!.authEpoch;
    await mock.q!.endSession();
    await mock.q!.beginVerifiedLogin("A");
    const e2 = mock.q!.getVerifiedBinding()!.authEpoch;
    expect(e2).not.toBe(e1);
    const count = env.writes.length;
    // Existing native player may emit before the React effect reacts to authEpoch.
    await position(64, 34000);
    expect(env.writes).toHaveLength(count);
    expect(await mock.q!.getPending("progress")).toEqual([]);
    env.legacy();
  });
  it("old player's unmount position cannot be inserted into new authEpoch even with same videoId", async () => {
    await mount();
    await position(22);
    const e1 = mock.q!.getVerifiedBinding()!.authEpoch;
    await mock.q!.endSession();
    await mock.q!.beginVerifiedLogin("A");
    mock.player.currentTime = 48;
    const count = env.writes.length;
    await act(async () => root.unmount());
    expect(env.writes).toHaveLength(count);
    expect(mock.q!.getVerifiedBinding()!.authEpoch).not.toBe(e1);
    expect(await mock.q!.getPending("progress")).toEqual([]);
    env.legacy();
    root = createRoot(node);
  });
  it("storage read failure on verified restart shows unknown result, then recovers without rewriting", async () => {
    await mount();
    await position(38);
    const count = env.writes.length;
    await act(async () => root.unmount());
    root = createRoot(node);
    mock.q = env.fresh();
    expect(await mock.q.restoreVerifiedSession("A")).toBe(true);
    // A newly created native player starts at zero until the hook applies restore.
    mock.player.currentTime = 0;
    env.failReads(true);
    await mount("videoA", "restart-unavailable");
    expect(node.textContent).toContain("Не удалось проверить сохранённую позицию видео");
    expect(env.writes).toHaveLength(count);
    env.failReads(false);
    await act(async () => root.unmount());
    root = createRoot(node);
    mock.player.currentTime = 0;
    await mount("videoA", "restart-recovered");
    expect(node.querySelector('[data-status="progress"]')?.textContent).toContain("38");
    expect(env.writes).toHaveLength(count);
    env.legacy();
  });
  it("setItem disk-full fails visibly without a fabricated local receipt or automatic retry", async () => {
    await mount();
    env.failWrites();
    await position(56);
    expect(node.textContent).toContain("Результат сохранения позиции видео не подтверждён");
    expect(env.writes).toHaveLength(0);
    expect(await pending()).toBeNull();
    await flush();
    expect(env.writes).toHaveLength(0);
    env.legacy();
  });
  it("post-write readback error shows UI error instead of false success", async () => {
    await mount();
    env.failReads(true);
    await position(55);
    expect(node.textContent).toContain("Результат сохранения позиции видео не подтверждён");
    expect(env.writes).toHaveLength(1);
    env.failReads(false);
    expect((await pending())?.positionSec).toBe(55);
    env.legacy();
  });
  it("E1 write paused in AsyncStorage during same-owner relogin cannot appear as an E2 video seek", async () => {
    await mount();
    const oldEpoch = mock.q!.getVerifiedBinding()!.authEpoch;
    const { gate, entered } = env.suspend();
    void position(62);
    await entered;
    const logout = mock.q!.endSession();
    await act(async () => gate.go());
    await logout;
    await mock.q!.beginVerifiedLogin("A");
    useAuthStore.setState({ user: { id: "A" } as never });
    await mount();
    await flush();
    expect(mock.q!.getVerifiedBinding()!.authEpoch).not.toBe(oldEpoch);
    expect(await mock.q!.getPending("progress")).toEqual([]);
    expect(node.querySelector('[data-status="progress"]')?.textContent).not.toContain("62");
    env.legacy();
  });
  it("owner changes after player callback while v2 storage write is blocked: no B progress or late status", async () => {
    await mount();
    const { gate, entered } = env.suspend();
    void position(50);
    await entered;
    useAuthStore.setState({ user: { id: "B" } as never });
    await mount();
    await act(async () => gate.go());
    await flush();
    expect(node.querySelector('[data-status="progress"]')?.textContent).not.toContain("50");
    // Old A/E1 in-flight write may commit; quarantine rather than discard it.
    const previousEpoch = mock.q!.getVerifiedBinding()!.authEpoch;
    expect((await mock.q!.getPending("progress")).some((e) => e.payload.positionSec === 50)).toBe(
      true,
    );
    await mock.q!.endSession();
    await mock.q!.beginVerifiedLogin("B");
    expect(await mock.q!.getPending("progress")).toEqual([]);
    expect(env.disk.has(`gafus-progress-v2:A:${previousEpoch}`)).toBe(true);
    env.legacy();
  });
});
