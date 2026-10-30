// @vitest-environment jsdom
/** Actual AccordionStep timer-restore hook with real v2 queue and immutable event writers. */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import {
  createNewOnlyV2Queues,
  type NewOnlyV2Dependencies,
  type NewOnlyV2Queues,
} from "@/shared/lib/offline/newOnlyV2Queues";
import { commitVerifiedPractice } from "@/shared/lib/offline/newOnlyV2PracticeCommit";
import { commitVerifiedDailyCompletion } from "@/shared/lib/offline/newOnlyV2DailyCompleteReceipt";
import { readOwnPendingPractice } from "@/shared/lib/offline/newOnlyV2PracticePending";
import { readOwnPendingDailyTimers } from "@/shared/lib/offline/newOnlyV2DailyPending";
import { useTimerStore } from "@/shared/stores/timerStore";
import {
  useVerifiedV2StepTimerRestore,
  type StepTimerRestoreDependencies,
} from "./useVerifiedV2StepTimerRestore";
vi.mock("@/shared/lib/offline/newOnlyV2Native", () => ({ newOnlyV2NativeQueues: {} }));
vi.mock("@/shared/stores/authStore", () => ({
  useAuthStore: { getState: () => ({ user: null }) },
}));
vi.mock("@/shared/lib/tracer", () => ({ reportClientError: vi.fn() }));
const base = 1792252800000;
const C1 = "clg0v5dte000008mf2dkq239x",
  D1 = "clg0v5dte000108mf8bgq229x",
  D2 = "clg0v5dte000208mf8bgq229x";
const S1 = "clg0v5dte000308mf8bgq229x",
  S2 = "clg0v5dte000408mf8bgq229x";
const legacy = {
  "progress-sync-storage": "historic-ownerless-unchanged",
  "prevention-sync-storage": "historic-ownerless-unchanged",
};
function latch() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { release, promise };
}
function fixture() {
  const values = new Map(Object.entries(legacy)),
    secrets = new Map<string, string>();
  let i = 0,
    owner = "A",
    failWrite = false,
    failRead = false,
    readGate: ReturnType<typeof latch> | null = null;
  let readStarted!: () => void;
  const enteredRead = new Promise<void>((yes) => {
    readStarted = yes;
  });
  const writes: string[] = [];
  const deps: NewOnlyV2Dependencies = {
    storage: {
      getItem: async (key) => {
        if (readGate && key.startsWith("gafus-progress-v2:")) {
          readStarted();
          await readGate.promise;
        }
        if (failRead && key.startsWith("gafus-progress-v2:") && writes.length > 0)
          throw Error("READ_FAILED");
        return values.get(key) ?? null;
      },
      setItem: async (key, bytes) => {
        if (failWrite) throw Error("DISK_FULL");
        writes.push(key);
        values.set(key, bytes);
      },
    },
    secure: {
      getItemAsync: async (key) => secrets.get(key) ?? null,
      setItemAsync: async (key, raw) => {
        secrets.set(key, raw);
      },
      deleteItemAsync: async (key) => {
        secrets.delete(key);
      },
    },
    makeId: () => `00000000-0000-4000-8000-${String(++i).padStart(12, "0")}`,
    now: () => base,
  };
  const q = createNewOnlyV2Queues(deps);
  const injected: StepTimerRestoreDependencies = {
    queue: q,
    currentOwner: () => owner,
    now: () => base + 1000,
  };
  return {
    q,
    injected,
    values,
    writes,
    newQueue: () => createNewOnlyV2Queues(deps),
    owner: () => owner,
    setOwner: (s: string) => {
      owner = s;
    },
    failWrites: () => {
      failWrite = true;
    },
    failReads: (s: boolean) => {
      failRead = s;
    },
    suspendRead: () => {
      readGate = latch();
      return { gate: readGate, entered: enteredRead };
    },
    checkLegacy: () => {
      for (const [k, v] of Object.entries(legacy)) expect(values.get(k)).toBe(v);
      expect(writes.every((key) => key.startsWith("gafus-progress-v2:"))).toBe(true);
    },
  };
}
let env: ReturnType<typeof fixture>, root: Root, el: HTMLDivElement;
const normal = { courseId: C1, dayId: D1, stepIndex: 0, daily: false };
const daily = { courseId: `daily-course:${S1}`, dayId: S1, stepIndex: 0, daily: true };
function Screen({
  s = normal,
  owner = "A",
  status = "IN_PROGRESS",
}: {
  s?: typeof normal;
  owner?: string;
  status?: string;
}) {
  useVerifiedV2StepTimerRestore(
    s.courseId,
    s.dayId,
    s.stepIndex,
    status,
    true,
    owner,
    env.injected.queue.getVerifiedBinding()?.authEpoch ?? null,
    env.injected,
  );
  const state = useTimerStore((x) => x.activeTimer);
  return createElement(
    "span",
    null,
    state
      ? `${state.ownerId}/${state.authEpoch} ${state.dayOnCourseId} ${state.remainingSec}`
      : "timer stopped",
  );
}
async function mount(s: typeof normal = normal, owner = "A", status = "IN_PROGRESS") {
  await act(async () => root.render(createElement(Screen, { s, owner, status })));
  // flush the async verified v2 read, not a network call
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}
async function start(s: typeof normal) {
  await env.q.enqueue(
    "progress",
    s.daily ? "dailyCourseStartStep" : "startStep",
    s.daily
      ? { scheduleId: s.dayId, stepIndex: s.stepIndex, status: "IN_PROGRESS", durationSec: 120 }
      : {
          courseId: s.courseId,
          dayOnCourseId: s.dayId,
          stepIndex: s.stepIndex,
          status: "IN_PROGRESS",
          durationSec: 120,
        },
  );
}
async function finish(s: typeof normal) {
  return s.daily
    ? commitVerifiedDailyCompletion(
        env.q,
        "A",
        { scheduleId: s.dayId, stepIndex: s.stepIndex },
        env.owner,
      )
    : commitVerifiedPractice(
        env.q,
        "A",
        { courseId: s.courseId, dayOnCourseId: s.dayId, stepIndex: s.stepIndex },
        env.owner,
      );
}
describe("OFF021 actual AccordionStep v2 timer restore after durable completion", () => {
  beforeEach(async () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.useFakeTimers();
    vi.setSystemTime(base + 1000);
    env = fixture();
    await env.q.beginVerifiedLogin("A");
    el = document.createElement("div");
    document.body.appendChild(el);
    root = createRoot(el);
    useTimerStore.setState({ activeTimer: null });
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    el.remove();
    useTimerStore.setState({ activeTimer: null });
    vi.useRealTimers();
  });
  for (const s of [normal, daily]) {
    const name = s.daily ? "daily" : "ordinary";
    it(`${name}: durable completion exact occurrence never hydrates/restarts timer or adds a second event on remount`, async () => {
      await start(s);
      const event = await finish(s);
      expect(event).toMatch(/^00000000-/);
      const before = env.writes.length;
      const fresh = env.newQueue();
      expect(await fresh.restoreVerifiedSession("A")).toBe(true);
      env.injected.queue = fresh;
      await mount(s);
      expect(useTimerStore.getState().activeTimer).toBeNull();
      expect(el.textContent).toContain("timer stopped");
      expect(env.writes).toHaveLength(before);
      const rows = s.daily
        ? await readOwnPendingDailyTimers(fresh, "A", s.dayId)
        : await readOwnPendingPractice(fresh, "A", s.courseId, s.dayId);
      expect(rows.some((x) => x.eventId === event && x.stepIndex === s.stepIndex)).toBe(true);
      env.checkLegacy();
    });
    it(`${name}: failed complete setItem keeps preceding start non-completed and does not fabricate completion`, async () => {
      await start(s);
      env.failWrites();
      await expect(finish(s)).rejects.toThrow("DISK_FULL");
      const fresh = env.newQueue();
      expect(await fresh.restoreVerifiedSession("A")).toBe(true);
      env.injected.queue = fresh;
      await mount(s);
      expect(useTimerStore.getState().activeTimer).toMatchObject({
        ownerId: "A",
        dayOnCourseId: s.dayId,
        isRunning: true,
      });
      // Restoration cannot assert completed when no confirmed complete receipt exists.
      expect(el.textContent).not.toContain("timer stopped");
      env.checkLegacy();
    });
  }
  for (const s of [normal, daily]) {
    it(`${s.daily ? "daily" : "ordinary"}: a late durable completion stops an existing running timer and never writes again on restart`, async () => {
      await start(s);
      await mount(s);
      expect(useTimerStore.getState().activeTimer?.isRunning).toBe(true);
      const id = await finish(s);
      expect(id).toMatch(/^00000000-/);
      const before = env.writes.length;
      await mount(s, "A", "COMPLETED");
      expect(useTimerStore.getState().activeTimer).toBeNull();
      await act(async () => root.unmount());
      root = createRoot(el);
      await mount(s, "A", "IN_PROGRESS");
      expect(useTimerStore.getState().activeTimer).toBeNull();
      expect(env.writes).toHaveLength(before);
      env.checkLegacy();
    });
    it(`${s.daily ? "daily" : "ordinary"}: explicit later start supersedes prior completed occurrence in ordered v2 timeline`, async () => {
      await start(s);
      await finish(s);
      await start(s);
      await mount(s);
      expect(useTimerStore.getState().activeTimer).toMatchObject({
        ownerId: "A",
        dayOnCourseId: s.dayId,
        stepIndex: s.stepIndex,
        isRunning: true,
      });
      expect(env.writes).toHaveLength(3);
      env.checkLegacy();
    });
  }
  for (const s of [normal, daily]) {
    it(`${s.daily ? "daily" : "ordinary"}: committed completion under storage-read fault does not restart; recovery stays STOPPED`, async () => {
      await start(s);
      const receipt = await finish(s);
      const writes = env.writes.length;
      const restored = env.newQueue();
      expect(await restored.restoreVerifiedSession("A")).toBe(true);
      env.injected.queue = restored;
      env.failReads(true);
      await mount(s);
      expect(useTimerStore.getState().activeTimer).toBeNull();
      env.failReads(false);
      await act(async () => root.unmount());
      root = createRoot(el);
      await mount(s);
      expect(useTimerStore.getState().activeTimer).toBeNull();
      expect(env.writes).toHaveLength(writes);
      const rows = s.daily
        ? await readOwnPendingDailyTimers(restored, "A", s.dayId)
        : await readOwnPendingPractice(restored, "A", s.courseId, s.dayId);
      expect(rows.some((row) => row.eventId === receipt)).toBe(true);
      env.checkLegacy();
    });
  }
  it("ordinary course/day/index occurrence rejects identical reused content on other day/step", async () => {
    await start(normal);
    await finish(normal);
    const before = env.writes.length;
    await mount({ ...normal, dayId: D2 });
    expect(useTimerStore.getState().activeTimer).toBeNull();
    await mount({ ...normal, stepIndex: 1 });
    expect(useTimerStore.getState().activeTimer).toBeNull();
    await mount({ ...normal, courseId: D2 });
    expect(useTimerStore.getState().activeTimer).toBeNull();
    expect(env.writes).toHaveLength(before);
    env.checkLegacy();
  });
  it("a running A/E1 memory timer is quarantined immediately on owner B even for identical day/step", async () => {
    await start(normal);
    await mount(normal);
    const active = useTimerStore.getState().activeTimer;
    expect(active?.ownerId).toBe("A");
    const oldEpoch = active!.authEpoch;
    await env.q.endSession();
    env.setOwner("B");
    await env.q.beginVerifiedLogin("B");
    await mount(normal, "B");
    expect(useTimerStore.getState().activeTimer).toBeNull();
    expect(el.textContent).toContain("timer stopped");
    expect(oldEpoch).not.toBe(env.q.getVerifiedBinding()?.authEpoch);
    env.checkLegacy();
  });
  it("same A new E2 and another day/schedule cannot restore A/E1 timer, E1 bytes retained", async () => {
    await start(daily);
    await mount(daily);
    expect(useTimerStore.getState().activeTimer?.dayOnCourseId).toBe(S1);
    const oldEpoch = env.q.getVerifiedBinding()!.authEpoch;
    const key = `gafus-progress-v2:A:${oldEpoch}`,
      oldBytes = env.values.get(key);
    await env.q.endSession();
    await env.q.beginVerifiedLogin("A");
    await mount(daily);
    expect(useTimerStore.getState().activeTimer).toBeNull();
    await mount({ ...daily, courseId: `daily-course:${S2}`, dayId: S2 });
    expect(useTimerStore.getState().activeTimer).toBeNull();
    expect(env.values.get(key)).toBe(oldBytes);
    env.checkLegacy();
  });
  it("storage read fault cannot mark any timer complete or trigger an unverified completion", async () => {
    await start(normal);
    env.failReads(true);
    await mount(normal);
    expect(useTimerStore.getState().activeTimer).toBeNull();
    env.failReads(false);
    await mount({ ...normal, stepIndex: 1 });
    expect(useTimerStore.getState().activeTimer).toBeNull();
    env.checkLegacy();
  });
  it("late read after focus unmount, owner switch, or day change never rehydrates a foreign timer", async () => {
    await start(normal);
    const { gate, entered } = env.suspendRead();
    await act(async () => {
      root.render(createElement(Screen, { s: normal, owner: "A" }));
    });
    await entered;
    env.setOwner("B");
    await act(async () =>
      root.render(createElement(Screen, { s: { ...normal, dayId: D2 }, owner: "B" })),
    );
    await act(async () => gate.release());
    expect(useTimerStore.getState().activeTimer).toBeNull();
    env.checkLegacy();
  });
});
