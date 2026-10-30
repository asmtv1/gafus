// @vitest-environment jsdom
/** Phase1 mounted training practice pending UI -> real new-v2 writer -> restart restore. */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import {
  createNewOnlyV2Queues,
  type NewOnlyV2Dependencies,
} from "@/shared/lib/offline/newOnlyV2Queues";
import { commitVerifiedPractice } from "@/shared/lib/offline/newOnlyV2PracticeCommit";
import {
  usePracticePendingScreen,
  type PracticePendingDependencies,
} from "./usePracticePendingScreen";
import { PendingPracticeNotice } from "./PendingPracticeNotice";
vi.mock("@/shared/stores/authStore", () => ({
  useAuthStore: { getState: () => ({ user: null }) },
}));
vi.mock("@/shared/lib/offline/newOnlyV2Native", () => ({ newOnlyV2NativeQueues: {} }));
vi.mock("react-native", async () => {
  const React = await import("react");
  return {
    View: ({ children }: { children?: React.ReactNode }) =>
      React.createElement("div", null, children),
  };
});
vi.mock("react-native-paper", () => ({ Text: "span" }));
const payload = {
  courseId: "clg0v5dte000008mf2dkq239x",
  dayOnCourseId: "clg0v5dte000108mf8bgq229x",
  stepIndex: 1,
};
const LEGACY = {
  "progress-sync-storage": "{old-unowned-dont-touch}",
  "prevention-sync-storage": "{old-unowned-dont-touch}",
};
const deferred = () => {
  let release!: () => void;
  const promise = new Promise<void>((r) => {
    release = r;
  });
  return { release, promise };
};
function fixture() {
  const values = new Map(Object.entries(LEGACY));
  const secrets = new Map<string, string>();
  const writes: string[] = [];
  let counter = 0;
  let actor = "A";
  let failWrite = false;
  let failRead = false;
  let hold: ReturnType<typeof deferred> | null = null;
  let entering: (() => void) | null = null;
  let readHold: ReturnType<typeof deferred> | null = null;
  let enteringRead: (() => void) | null = null;
  const enteredRead = new Promise<void>((done) => {
    enteringRead = done;
  });
  const entered = new Promise<void>((r) => {
    entering = r;
  });
  const dependencies: NewOnlyV2Dependencies = {
    storage: {
      getItem: async (key) => {
        if (readHold && key.startsWith("gafus-progress-v2:")) {
          enteringRead?.();
          await readHold.promise;
        }
        if (failRead && key.startsWith("gafus-progress-v2:") && writes.length > 0)
          throw Error("STORAGE_READ_FAULT");
        return values.get(key) ?? null;
      },
      setItem: async (key, value) => {
        if (failWrite) throw Error("STORAGE_FULL");
        if (hold) {
          entering?.();
          await hold.promise;
        }
        writes.push(key);
        values.set(key, value);
      },
    },
    secure: {
      getItemAsync: async (key) => secrets.get(key) ?? null,
      setItemAsync: async (key, value) => {
        secrets.set(key, value);
      },
      deleteItemAsync: async (key) => {
        secrets.delete(key);
      },
    },
    makeId: () => `00000000-0000-4000-8000-${String(++counter).padStart(12, "0")}`,
    now: () => 1792252800000,
  };
  const queue = createNewOnlyV2Queues(dependencies);
  const injected: PracticePendingDependencies = { queue, currentOwner: () => actor };
  const checkLegacy = () => {
    for (const [k, v] of Object.entries(LEGACY)) expect(values.get(k)).toBe(v);
    expect(writes.every((k) => k.startsWith("gafus-progress-v2:"))).toBe(true);
  };
  return {
    queue,
    injected,
    values,
    writes,
    entered,
    checkLegacy,
    newQueue: () => createNewOnlyV2Queues(dependencies),
    setOwner: (o: string) => {
      actor = o;
    },
    owner: () => actor,
    failWrites: () => {
      failWrite = true;
    },
    failReads: (v: boolean) => {
      failRead = v;
    },
    suspend: () => {
      hold = deferred();
      return hold;
    },
    suspendRead: () => {
      readHold = deferred();
      return { gate: readHold, entered: enteredRead };
    },
  };
}
let env: ReturnType<typeof fixture>;
let root: Root;
let el: HTMLDivElement;
let current: ReturnType<typeof usePracticePendingScreen>;
function Screen({ owner = "A" }: { owner?: string }) {
  current = usePracticePendingScreen(owner, payload.courseId, payload.dayOnCourseId, env.injected);
  return createElement(PendingPracticeNotice, {
    entries: current.pendingPractice,
    status: current.pendingReadStatus,
  });
}
async function mount(owner = "A") {
  await act(async () => {
    root.render(createElement(Screen, { owner }));
  });
}
async function refresh() {
  await act(async () => {
    await current.refreshPendingPractice();
  });
}
async function save() {
  return commitVerifiedPractice(env.injected.queue as typeof env.queue, "A", payload, env.owner);
}
describe("OFF021 practice training-screen Phase1 durable pending path", () => {
  beforeEach(async () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    env = fixture();
    await env.queue.beginVerifiedLogin("A");
    el = document.createElement("div");
    document.body.appendChild(el);
    root = createRoot(el);
    await mount();
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    el.remove();
  });
  it("writer confirms exact event; remounted E1 screen restores visible pending without any second write", async () => {
    const id = await save();
    await refresh();
    expect(current.pendingPractice.map((row) => row.eventId)).toEqual([id]);
    expect(el.textContent).toContain("Практика сохранена только на устройстве");
    await act(async () => root.unmount());
    root = createRoot(el);
    const restart = env.newQueue();
    expect(await restart.restoreVerifiedSession("A")).toBe(true);
    env.injected.queue = restart;
    await mount();
    expect(el.textContent).not.toContain("Шаг 2");
    await refresh();
    expect(current.pendingPractice.map((row) => row.eventId)).toEqual([id]);
    expect(el.textContent).toContain("Шаг 2");
    expect(env.writes).toHaveLength(1);
    env.checkLegacy();
  });
  it("disk-full cannot become committed success or visible pending", async () => {
    env.failWrites();
    await expect(save()).rejects.toThrow("STORAGE_FULL");
    await refresh();
    expect(current.pendingPractice).toEqual([]);
    expect(el.textContent).not.toContain("Шаг 2");
    expect(env.writes).toHaveLength(0);
    env.checkLegacy();
  });
  it("writer persisted bytes but readback fails: uncertainty, not claimed absence or successful completion", async () => {
    env.failReads(true);
    await expect(save()).rejects.toThrow("STORAGE_READ_FAULT");
    await refresh();
    expect(current.pendingReadStatus).toBe("UNAVAILABLE");
    expect(el.textContent).toContain("Результат неизвестен");
    env.failReads(false);
    await refresh();
    expect(current.pendingReadStatus).toBe("READY");
    expect(current.pendingPractice).toHaveLength(1);
    expect(env.writes).toHaveLength(1);
    env.checkLegacy();
  });
  it("screen cancellation during delayed storage read never displays stale late preview", async () => {
    await save();
    const hold = env.suspend();
    // Storage suspension affects writes; test a concurrent write and focus cancellation.
    let pending!: Promise<string>;
    await act(async () => {
      pending = save();
    });
    await env.entered;
    await act(async () => current.deactivate());
    await act(async () => {
      hold.release();
      await pending;
    });
    expect(current.pendingPractice).toEqual([]);
    expect(el.textContent).not.toContain("Шаг 2");
    await act(async () => current.activate());
    await refresh();
    expect(current.pendingPractice).toHaveLength(2);
    env.checkLegacy();
  });
  it("closing screen during slow pending read discards late private preview", async () => {
    await save();
    const { gate, entered } = env.suspendRead();
    let reading!: Promise<void>;
    await act(async () => {
      reading = current.refreshPendingPractice();
    });
    await entered;
    await act(async () => current.deactivate());
    expect(el.textContent).not.toContain("Шаг 2");
    await act(async () => {
      gate.release();
      await reading;
    });
    expect(current.pendingPractice).toEqual([]);
    expect(el.textContent).not.toContain("Шаг 2");
    await act(async () => current.activate());
    await refresh();
    expect(current.pendingPractice).toHaveLength(1);
    env.checkLegacy();
  });
  it("same user E2 and foreign B never see E1; E1 durable bytes stay untouched", async () => {
    await save();
    await refresh();
    expect(el.textContent).toContain("Шаг 2");
    const e1 = env.queue.getVerifiedBinding()!.authEpoch;
    const k = `gafus-progress-v2:A:${e1}`;
    const raw = env.values.get(k);
    await env.queue.endSession();
    await env.queue.beginVerifiedLogin("A");
    await mount();
    expect(current.pendingPractice).toEqual([]);
    await refresh();
    expect(el.textContent).not.toContain("Шаг 2");
    expect(env.values.get(k)).toBe(raw);
    await env.queue.endSession();
    env.setOwner("B");
    await env.queue.beginVerifiedLogin("B");
    await mount("B");
    await refresh();
    expect(current.pendingPractice).toEqual([]);
    expect(el.textContent).not.toContain("Шаг 2");
    expect(env.values.get(k)).toBe(raw);
    env.checkLegacy();
  });
  it("owner switch during suspended writer fences success even if durable I/O races signout", async () => {
    const hold = env.suspend();
    let pending!: Promise<string>;
    await act(async () => {
      pending = save();
    });
    await env.entered;
    env.setOwner("B");
    const ending = env.queue.endSession();
    await mount("B");
    await act(async () => {
      hold.release();
      await expect(pending).rejects.toThrow();
      await ending;
    });
    expect(current.pendingPractice).toEqual([]);
    expect(el.textContent).not.toContain("Шаг 2");
    await env.queue.beginVerifiedLogin("B");
    await refresh();
    expect(current.pendingPractice).toEqual([]);
    env.checkLegacy();
  });
});
