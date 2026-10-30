// @vitest-environment jsdom
/** The actual DailyCourseDayScreen handler hook + actual ReactQuery daily mutation,
 * through real owner/epoch v2 queue and pending UI (native storage boundary mocked). */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import {
  createNewOnlyV2Queues,
  type NewOnlyV2Dependencies,
  type NewOnlyV2Queues,
} from "@/shared/lib/offline/newOnlyV2Queues";
const m = vi.hoisted(() => ({
  owner: "A",
  offline: true,
  queue: null as NewOnlyV2Queues | null,
  serverComplete: vi.fn(),
  completed: vi.fn(),
  failed: vi.fn(),
  occurrences: ["same-reused-step-id", "same-reused-step-id"],
  schedule: "clg0v5dte000008mf2dkq239x",
}));
vi.mock("@/shared/stores/authStore", () => ({
  useAuthStore: Object.assign(
    (sel: (s: { user: { id: string } }) => unknown) => sel({ user: { id: m.owner } }),
    { getState: () => ({ user: { id: m.owner } }) },
  ),
}));
vi.mock("@/shared/lib/api", () => ({
  dailyCourseApi: { completeStep: m.serverComplete },
  getDailyCourseStoreCourseId: (s: string) => `daily-course:${s}`,
}));
vi.mock("@/shared/stores", () => ({ useStepStore: () => null }));
vi.mock("@/shared/stores/networkStatusStore", () => ({ getIsOffline: () => m.offline }));
vi.mock("@/shared/lib/offline/newOnlyV2Native", () => ({
  newOnlyV2NativeQueues: {
    enqueue: (...args: Parameters<NewOnlyV2Queues["enqueue"]>) => m.queue!.enqueue(...args),
    getVerifiedBinding: () => m.queue!.getVerifiedBinding(),
    getPending: (kind: "progress" | "prevention") => m.queue!.getPending(kind),
  },
}));
vi.mock("react-native", async () => {
  const React = await import("react");
  return {
    View: ({ children }: { children?: React.ReactNode }) =>
      React.createElement("div", null, children),
  };
});
vi.mock("react-native-paper", () => ({ Text: "span" }));
import { useDailyCourseCompleteStep } from "@/shared/hooks/useDailyCourse";
import { useDailyCompletionLifecycle } from "./useDailyCompletionLifecycle";
import { PendingDailyNotice } from "./PendingDailyNotice";
const otherSchedule = "clg0v5dte000108mf8bgq229x";
const old = {
  "progress-sync-storage": "{old queue untouched}",
  "prevention-sync-storage": "{old queue untouched}",
};
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { resolve, promise };
}
function fixture() {
  const data = new Map(Object.entries(old));
  const secure = new Map<string, string>();
  const writes: string[] = [];
  let id = 0;
  let failWrite = false,
    failRead = false;
  let suspended: ReturnType<typeof deferred> | null = null;
  let entering!: () => void;
  const entered = new Promise<void>((r) => {
    entering = r;
  });
  const deps: NewOnlyV2Dependencies = {
    storage: {
      getItem: async (key) => {
        if (failRead && key.startsWith("gafus-progress-v2:") && writes.length)
          throw Error("STORAGE_READ_FAILED");
        return data.get(key) ?? null;
      },
      setItem: async (key, value) => {
        if (failWrite) throw Error("DISK_FULL");
        if (suspended) {
          entering();
          await suspended.promise;
        }
        writes.push(key);
        data.set(key, value);
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
    makeId: () => `00000000-0000-4000-8000-${String(++id).padStart(12, "0")}`,
    now: () => 1792252800000,
  };
  const queue = createNewOnlyV2Queues(deps);
  return {
    queue,
    data,
    writes,
    entered,
    newQueue: () => createNewOnlyV2Queues(deps),
    failWrites: () => {
      failWrite = true;
    },
    failReads: (v: boolean) => {
      failRead = v;
    },
    suspend: () => {
      suspended = deferred();
      return suspended;
    },
    verifyLegacy: () => {
      for (const [k, v] of Object.entries(old)) expect(data.get(k)).toBe(v);
      expect(writes.every((k) => k.startsWith("gafus-progress-v2:"))).toBe(true);
    },
  };
}
let root: Root, host: HTMLDivElement, query: QueryClient, env: ReturnType<typeof fixture>;
let handler: ReturnType<typeof useDailyCompletionLifecycle>;
function Mounted({ schedule = m.schedule }: { schedule?: string }) {
  const mutation = useDailyCourseCompleteStep();
  handler = useDailyCompletionLifecycle(
    schedule,
    m.owner,
    (vars) => mutation.mutateAsync(vars),
    m.completed,
    m.failed,
    (index) => m.occurrences[index] ?? null,
  );
  return createElement(PendingDailyNotice, {
    rows: handler.pendingDaily,
    status: handler.readStatus,
  });
}
async function mount(schedule = m.schedule) {
  await act(async () =>
    root.render(
      createElement(QueryClientProvider, { client: query }, createElement(Mounted, { schedule })),
    ),
  );
}
async function read() {
  await act(async () => {
    await handler.refreshPending();
  });
}
async function complete(index: number) {
  await act(async () => {
    await handler.complete(index);
  });
}
describe("AG3 OFF021 daily-course actual practice complete handler -> exact v2 receipt -> pending UI", () => {
  beforeEach(async () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    m.owner = "A";
    m.offline = true;
    m.schedule = "clg0v5dte000008mf2dkq239x";
    m.occurrences = ["shared-step-X", "shared-step-X"];
    vi.clearAllMocks();
    env = fixture();
    m.queue = env.queue;
    await env.queue.beginVerifiedLogin("A");
    query = new QueryClient({
      defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
    });
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    await mount();
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    query.clear();
    m.queue = null;
  });
  it("success requires exact durable eventId; remount/restart restores only this schedule/step occurrence", async () => {
    await complete(0);
    expect(m.completed).toHaveBeenCalledWith(0, true);
    expect(m.failed).not.toHaveBeenCalled();
    expect(handler.pendingDaily).toHaveLength(1);
    expect(handler.pendingDaily[0].status).toBe("COMPLETED");
    const key = handler.pendingDaily[0].eventId;
    expect(host.textContent).toContain("Шаг 1: Завершён локально");
    await act(async () => root.unmount());
    root = createRoot(host);
    const reopened = env.newQueue();
    expect(await reopened.restoreVerifiedSession("A")).toBe(true);
    m.queue = reopened;
    await mount();
    await read();
    expect(handler.pendingDaily.map((x) => x.eventId)).toEqual([key]);
    expect(env.writes).toHaveLength(1);
    expect(m.serverComplete).not.toHaveBeenCalled();
    env.verifyLegacy();
  });
  it("identical reused stepId in another schedule or another position never shares occurrence", async () => {
    await complete(0);
    await complete(1);
    expect(handler.pendingDaily.map((x) => x.stepIndex)).toEqual([0, 1]);
    await mount(otherSchedule);
    await read();
    expect(handler.pendingDaily).toEqual([]);
    await complete(0);
    expect(handler.pendingDaily).toHaveLength(1);
    expect(handler.pendingDaily[0].stepIndex).toBe(0);
    expect(env.writes).toHaveLength(3);
    await mount(m.schedule);
    await read();
    expect(handler.pendingDaily).toHaveLength(2);
    env.verifyLegacy();
  });
  it("failed setItem cannot report success, advance a step or create a pending preview", async () => {
    env.failWrites();
    await complete(0);
    expect(m.completed).not.toHaveBeenCalled();
    expect(m.failed).toHaveBeenCalledTimes(1);
    expect(handler.pendingDaily).toEqual([]);
    expect(env.writes).toHaveLength(0);
    env.verifyLegacy();
  });
  it("committed write but failed exact readback is uncertain, then restart preview recovers without another write", async () => {
    env.failReads(true);
    await complete(0);
    expect(m.completed).not.toHaveBeenCalled();
    expect(m.failed).toHaveBeenCalledTimes(1);
    expect(host.textContent).toContain("Результат может быть неопределённым");
    expect(env.writes).toHaveLength(1);
    env.failReads(false);
    await read();
    expect(handler.pendingDaily).toHaveLength(1);
    expect(m.completed).not.toHaveBeenCalled();
    expect(env.writes).toHaveLength(1);
    env.verifyLegacy();
  });
  it("logout and new same-owner epoch quarantine E1 bytes; B sees neither A epoch", async () => {
    await complete(0);
    const oldEpoch = env.queue.getVerifiedBinding()!.authEpoch;
    const oldKey = `gafus-progress-v2:A:${oldEpoch}`,
      oldBytes = env.data.get(oldKey);
    await env.queue.endSession();
    await env.queue.beginVerifiedLogin("A");
    await mount();
    await read();
    expect(handler.pendingDaily).toEqual([]);
    expect(env.data.get(oldKey)).toBe(oldBytes);
    await env.queue.endSession();
    m.owner = "B";
    await env.queue.beginVerifiedLogin("B");
    await mount();
    await read();
    expect(handler.pendingDaily).toEqual([]);
    expect(env.data.get(oldKey)).toBe(oldBytes);
    env.verifyLegacy();
  });
  it("owner switch to B during suspended setItem never completes A or leaks its pending entry", async () => {
    const gate = env.suspend();
    let pending!: Promise<void>;
    await act(async () => {
      pending = handler.complete(0);
    });
    await env.entered;
    m.owner = "B";
    const logout = env.queue.endSession();
    await mount();
    await act(async () => {
      gate.resolve();
      await pending;
      await logout;
    });
    expect(m.completed).not.toHaveBeenCalled();
    expect(m.failed).not.toHaveBeenCalled();
    expect(handler.pendingDaily).toEqual([]);
    await env.queue.beginVerifiedLogin("B");
    await mount();
    await read();
    expect(handler.pendingDaily).toEqual([]);
    env.verifyLegacy();
  });
  it("same A relogin with fresh epoch during delayed durable write cannot complete or read E1", async () => {
    const gate = env.suspend();
    let pending!: Promise<void>;
    await act(async () => {
      pending = handler.complete(0);
    });
    await env.entered;
    const logout = env.queue.endSession();
    await act(async () => {
      gate.resolve();
      await pending;
      await logout;
    });
    await env.queue.beginVerifiedLogin("A");
    await mount();
    await read();
    expect(m.completed).not.toHaveBeenCalled();
    expect(handler.pendingDaily).toEqual([]);
    expect(m.failed).not.toHaveBeenCalled();
    env.verifyLegacy();
  });
  it("changed step occurrence during delayed completion cannot advance a now-different step", async () => {
    const gate = env.suspend();
    let pending!: Promise<void>;
    await act(async () => {
      pending = handler.complete(0);
    });
    await env.entered;
    m.occurrences[0] = "new-bundle-occurrence-for-this-index";
    await act(async () => {
      gate.resolve();
      await pending;
    });
    expect(m.completed).not.toHaveBeenCalled();
    expect(m.failed).not.toHaveBeenCalled();
    await read();
    expect(handler.pendingDaily).toHaveLength(1);
    // It belongs to the original persisted schedule/index only, never silently changes the active UI step.
    env.verifyLegacy();
  });
  it("no occurrence identity or invalid step index never sends a request", async () => {
    await complete(55);
    await complete(-1);
    expect(m.completed).not.toHaveBeenCalled();
    expect(m.failed).toHaveBeenCalledTimes(2);
    expect(env.writes).toHaveLength(0);
    expect(m.serverComplete).not.toHaveBeenCalled();
    env.verifyLegacy();
  });
  it("cancel/focus exit while write is suspended, or owner rotates: late ACK cannot complete", async () => {
    const gate = env.suspend();
    let pending!: Promise<void>;
    await act(async () => {
      pending = handler.complete(0);
    });
    await env.entered;
    await act(async () => handler.deactivate());
    await act(async () => {
      gate.resolve();
      await pending;
    });
    expect(m.completed).not.toHaveBeenCalled();
    expect(m.failed).not.toHaveBeenCalled();
    expect(handler.pendingDaily).toEqual([]);
    await act(async () => handler.activate());
    await read();
    expect(handler.pendingDaily).toHaveLength(1);
    env.verifyLegacy();
  });
});
