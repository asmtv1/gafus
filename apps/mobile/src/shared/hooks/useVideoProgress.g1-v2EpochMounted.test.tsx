// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import {
  createNewOnlyV2Queues,
  type NewOnlyV2Dependencies,
  type NewOnlyV2Queues,
} from "@/shared/lib/offline/newOnlyV2Queues";
const mocks = vi.hoisted(() => ({
  queue: null as NewOnlyV2Queues | null,
  get: vi.fn(),
  save: vi.fn(),
  report: vi.fn(),
}));
vi.mock("@/shared/stores/authStore", async () => {
  const { create } = await import("zustand");
  return { useAuthStore: create<{ user: { id: string } | null }>(() => ({ user: { id: "A" } })) };
});
vi.mock("./useNetworkStatus", () => ({ useIsOffline: () => true }));
vi.mock("@/shared/lib/api/training", () => ({
  trainingApi: { getVideoProgress: mocks.get, saveVideoProgress: mocks.save },
}));
vi.mock("@/shared/lib/tracer", () => ({
  reportClientError: (...a: unknown[]) => mocks.report(...a),
}));
vi.mock("@/shared/lib/offline/newOnlyV2Native", () => ({
  newOnlyV2NativeQueues: {
    getVerifiedBinding: () => mocks.queue!.getVerifiedBinding(),
    getPending: (kind: "progress" | "prevention") => mocks.queue!.getPending(kind),
    enqueue: (...a: Parameters<NewOnlyV2Queues["enqueue"]>) => mocks.queue!.enqueue(...a),
  },
}));
import { useAuthStore } from "@/shared/stores/authStore";
import { useVideoProgress } from "./useVideoProgress";
function fixture() {
  const disk = new Map([
    ["progress-sync-storage", "old"],
    ["video-progress-storage", "old-video"],
  ]);
  const sec = new Map<string, string>();
  let id = 0,
    readFault = false;
  const writes: string[] = [];
  const deps: NewOnlyV2Dependencies = {
    storage: {
      getItem: async (k) => {
        if (readFault && k.startsWith("gafus-progress-v2:") && writes.length)
          throw Error("READ_FAILED");
        return disk.get(k) ?? null;
      },
      setItem: async (k, v) => {
        writes.push(k);
        disk.set(k, v);
      },
    },
    secure: {
      getItemAsync: async (k) => sec.get(k) ?? null,
      setItemAsync: async (k, v) => {
        sec.set(k, v);
      },
      deleteItemAsync: async (k) => {
        sec.delete(k);
      },
    },
    makeId: () => `00000000-0000-4000-8000-${String(++id).padStart(12, "0")}`,
    now: () => 1792252800000,
  };
  return {
    q: createNewOnlyV2Queues(deps),
    fresh: () => createNewOnlyV2Queues(deps),
    disk,
    writes,
    setReadFault: (v: boolean) => {
      readFault = v;
    },
    check: () => {
      expect(disk.get("progress-sync-storage")).toBe("old");
      expect(disk.get("video-progress-storage")).toBe("old-video");
    },
  };
}
let env: ReturnType<typeof fixture>,
  root: Root,
  dom: HTMLDivElement,
  current: ReturnType<typeof useVideoProgress>;
function Screen() {
  current = useVideoProgress("videoA");
  return createElement(
    "span",
    null,
    `${current.initialTimeSec ?? "empty"}/${current.saveError ?? "ok"}`,
  );
}
async function flush() {
  await act(async () => {
    for (let i = 0; i < 8; i++) await Promise.resolve();
  });
}
async function mount() {
  await act(async () => root.render(createElement(Screen)));
  await flush();
}
async function save(n: number) {
  await act(async () => {
    current.saveProgress(n);
    for (let i = 0; i < 8; i++) await Promise.resolve();
  });
}
describe("OFF022 actual video hook v2 owner epoch durable readback", () => {
  beforeEach(async () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.clearAllMocks();
    env = fixture();
    mocks.queue = env.q;
    await env.q.beginVerifiedLogin("A");
    useAuthStore.setState({ user: { id: "A" } as never });
    dom = document.createElement("div");
    document.body.appendChild(dom);
    root = createRoot(dom);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    dom.remove();
  });
  it("durable position restarts same verified session without HTTP or legacy read", async () => {
    await mount();
    await save(37);
    expect(current.saveError).toBeNull();
    await act(async () => root.unmount());
    root = createRoot(dom);
    mocks.queue = env.fresh();
    expect(await mocks.queue.restoreVerifiedSession("A")).toBe(true);
    await mount();
    expect(current.initialTimeSec).toBe(37);
    expect(mocks.get).not.toHaveBeenCalled();
    expect(mocks.save).not.toHaveBeenCalled();
    env.check();
  });
  it("post-write read failure is uncertain, not silently successful", async () => {
    await mount();
    env.setReadFault(true);
    await save(54);
    expect(current.saveError).toMatch(/Результат сохранения позиции видео не подтверждён/);
    expect(env.writes).toHaveLength(1);
    env.check();
  });
  it("B profile cannot read A current journal during asynchronous auth rebinding", async () => {
    await mount();
    await save(23);
    const get = vi.spyOn(env.q, "getPending");
    get.mockClear();
    // Auth profile may change before the verified v2 binding rotates.
    useAuthStore.setState({ user: { id: "B" } as never });
    await flush();
    expect(current.initialTimeSec).toBeUndefined();
    expect(get).not.toHaveBeenCalled();
    expect(mocks.get).not.toHaveBeenCalled();
    expect(env.writes).toHaveLength(1);
    env.check();
    get.mockRestore();
  });
  it("same A fresh epoch hides prior E1 position on the still mounted screen", async () => {
    await mount();
    await save(82);
    await act(async () => root.unmount());
    root = createRoot(dom);
    mocks.queue = env.fresh();
    expect(await mocks.queue.restoreVerifiedSession("A")).toBe(true);
    await mount();
    expect(current.initialTimeSec).toBe(82);
    const old = mocks.queue.getVerifiedBinding()!.authEpoch,
      bytes = env.disk.get(`gafus-progress-v2:A:${old}`);
    await mocks.queue.endSession();
    await mocks.queue.beginVerifiedLogin("A");
    useAuthStore.setState({ user: { id: "A" } as never });
    await flush();
    expect(current.initialTimeSec).toBeUndefined();
    expect(env.disk.get(`gafus-progress-v2:A:${old}`)).toBe(bytes);
    env.check();
  });
});
