// @vitest-environment jsdom
/** Real AccordionStep React tree + Zustand timer + v2 queue and readers. Native UI boundaries mocked. */
import { act, createElement, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createNewOnlyV2Queues,
  type NewOnlyV2Dependencies,
  type NewOnlyV2Queues,
} from "@/shared/lib/offline/newOnlyV2Queues";
import { commitVerifiedPractice } from "@/shared/lib/offline/newOnlyV2PracticeCommit";
import { commitVerifiedDailyCompletion } from "@/shared/lib/offline/newOnlyV2DailyCompleteReceipt";
import { readOwnPendingTimers } from "@/shared/lib/offline/newOnlyV2TimerPending";
import { readOwnPendingDailyTimers } from "@/shared/lib/offline/newOnlyV2DailyPending";
import { useTimerStore } from "@/shared/stores/timerStore";
const m = vi.hoisted(() => ({
  queue: null as NewOnlyV2Queues | null,
  confirmed: vi.fn(),
  fail: vi.fn(),
  reported: vi.fn(),
}));
vi.mock("react-native", async () => {
  const React = await import("react");
  const panel = (tag: string) => (p: Record<string, unknown>) =>
    React.createElement(
      tag,
      {
        "data-testid": p.testID as string | undefined,
        "aria-label": p.accessibilityLabel as string | undefined,
        onClick: p.onPress as (() => void) | undefined,
      },
      p.children as React.ReactNode,
    );
  return {
    View: panel("div"),
    Pressable: panel("div"),
    TextInput: panel("textarea"),
    Modal: ({ children, visible }: { children: React.ReactNode; visible: boolean }) =>
      visible ? React.createElement("div", null, children) : null,
    FlatList: panel("div"),
    Platform: { OS: "ios" },
    StyleSheet: { create: (x: unknown) => x, absoluteFillObject: {}, hairlineWidth: 1 },
    useWindowDimensions: () => ({ width: 390, height: 844 }),
  };
});
vi.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, left: 0, right: 0, bottom: 0 }),
}));
vi.mock("react-native-paper", async () => {
  const React = await import("react");
  return {
    Text: ({ children, ...p }: { children: React.ReactNode }) =>
      React.createElement("span", null, children),
    Divider: () => React.createElement("hr"),
    IconButton: ({ icon, onPress }: { icon: string; onPress: () => void }) =>
      React.createElement("button", { "data-icon": icon, onClick: onPress }, icon),
  };
});
vi.mock("@expo/vector-icons", () => ({
  MaterialCommunityIcons: ({ name }: { name: string }) => createElement("i", { "data-icon": name }),
}));
vi.mock("react-native-reanimated", () => {
  const duration = () => ({ duration });
  return {
    default: { View: "div" },
    FadeIn: { duration },
    FadeOut: { duration },
    LinearTransition: { duration },
  };
});
vi.mock("expo-image", () => ({ Image: () => null }));
vi.mock("react-native-webview", () => ({ WebView: () => null }));
vi.mock("@/shared/components/ui", () => ({
  Button: ({ label, onPress }: { label: string; onPress: () => void }) =>
    createElement("button", { "data-label": label, onClick: onPress }, label),
}));
vi.mock("@/shared/components", () => ({ MarkdownText: () => null, VideoPlayer: () => null }));
vi.mock("./TestQuestionsBlock", () => ({ TestQuestionsBlock: () => null }));
vi.mock("./VideoReportBlock", () => ({ VideoReportBlock: () => null }));
vi.mock("./WrittenFeedbackBlock", () => ({ WrittenFeedbackBlock: () => null }));
vi.mock("./SurveyBlock", () => ({ SurveyBlock: () => null }));
vi.mock("@/shared/hooks", () => ({
  useVideoProgress: () => ({
    initialTimeSec: 0,
    isLoading: false,
    saveProgress: vi.fn(),
    saveError: null,
  }),
  useVideoUrl: () => ({
    url: null,
    isLoading: false,
    error: null,
    videoId: null,
    posterUrl: null,
    retry: vi.fn(),
  }),
}));
vi.mock("@/shared/hooks/useNetworkStatus", () => ({ useIsOffline: () => true }));
vi.mock("@/shared/lib/offline/offlineStorage", () => ({
  getOfflineVideoPosterUri: async () => null,
  getOfflineVideoUri: async () => null,
}));
vi.mock("@/shared/lib/utils/videoUrl", () => ({ getVideoIdFromUrl: () => null }));
vi.mock("@/shared/lib/utils/resolveImageUrl", () => ({ resolveImageUrl: () => null }));
vi.mock("@/shared/lib/tracer", () => ({
  reportClientError: (...a: unknown[]) => m.reported(...a),
}));
vi.mock("@/shared/lib/utils/haptics", () => ({
  hapticFeedback: { light: vi.fn(), medium: vi.fn(), success: vi.fn(), selection: vi.fn() },
}));
vi.mock("@/shared/stores", async () => ({
  useTimerStore: (await import("@/shared/stores/timerStore")).useTimerStore,
}));
vi.mock("@/shared/stores/authStore", async () => {
  const { create } = await import("zustand");
  return { useAuthStore: create<{ user: { id: string } | null }>(() => ({ user: { id: "A" } })) };
});
vi.mock("@/shared/lib/offline/newOnlyV2Native", () => ({
  newOnlyV2NativeQueues: {
    getVerifiedBinding: () => m.queue!.getVerifiedBinding(),
    getPending: (kind: "progress" | "prevention") => m.queue!.getPending(kind),
    enqueue: (...args: Parameters<NewOnlyV2Queues["enqueue"]>) => m.queue!.enqueue(...args),
  },
}));
import { useAuthStore } from "@/shared/stores/authStore";
import { AccordionStep } from "./AccordionStep";
import { useVerifiedOnlineCompletion } from "../useVerifiedOnlineCompletion";
const at = 1792252800000;
const regular = { courseId: "course_regular", dayId: "day_regular", stepIndex: 0 };
const daily = { courseId: "daily-course:day_daily", dayId: "day_daily", stepIndex: 0 };
type Occ = typeof regular;
function latch() {
  let release!: () => void;
  const promise = new Promise<void>((r) => {
    release = r;
  });
  return { release, promise };
}
function fixture() {
  const map = new Map<string, string>([
    ["progress-sync-storage", "legacy bytes unchanged"],
    ["prevention-sync-storage", "legacy prevention unchanged"],
  ]);
  const secret = new Map<string, string>();
  const writes: string[] = [];
  let id = 0,
    failWrite = false,
    failRead = false,
    gate: ReturnType<typeof latch> | null = null;
  let writeGate: ReturnType<typeof latch> | null = null;
  let signalWrite!: () => void;
  const writeEntered = new Promise<void>((resolve) => {
    signalWrite = resolve;
  });
  const deps: NewOnlyV2Dependencies = {
    storage: {
      getItem: async (key) => {
        if (gate && key.startsWith("gafus-progress-v2:")) await gate.promise;
        if (failRead && key.startsWith("gafus-progress-v2:") && writes.length > 0)
          throw Error("READ_FAILED");
        return map.get(key) ?? null;
      },
      setItem: async (key, value) => {
        if (failWrite) throw Error("DISK_FULL");
        if (writeGate) {
          signalWrite();
          await writeGate.promise;
        }
        writes.push(key);
        map.set(key, value);
      },
    },
    secure: {
      getItemAsync: async (key) => secret.get(key) ?? null,
      setItemAsync: async (key, v) => {
        secret.set(key, v);
      },
      deleteItemAsync: async (key) => {
        secret.delete(key);
      },
    },
    makeId: () => `00000000-0000-4000-8000-${String(++id).padStart(12, "0")}`,
    now: () => Date.now(),
  };
  const queue = createNewOnlyV2Queues(deps);
  return {
    queue,
    writes,
    map,
    newQueue: () => createNewOnlyV2Queues(deps),
    failWrites: () => {
      failWrite = true;
    },
    failReads: (v: boolean) => {
      failRead = v;
    },
    suspendReads: () => {
      gate = latch();
      return gate;
    },
    suspendWrites: () => {
      writeGate = latch();
      return { gate: writeGate, entered: writeEntered };
    },
    legacy: () => {
      expect(map.get("progress-sync-storage")).toBe("legacy bytes unchanged");
      expect(map.get("prevention-sync-storage")).toBe("legacy prevention unchanged");
      expect(writes.every((k) => k.startsWith("gafus-progress-v2:"))).toBe(true);
    },
  };
}
let f: ReturnType<typeof fixture>, root: Root, host: HTMLDivElement;
let statusText = "NOT_STARTED";
let actualStatus: ((status: string) => void) | null = null;
const callbacks = {
  start: vi.fn(),
  pause: vi.fn(),
  resume: vi.fn(),
  complete: vi.fn(),
  reset: vi.fn(),
};
let scenario: Occ = regular;
let duration = 3;
let confirmed = false;
let onlineGate: ReturnType<typeof latch> | null = null;
const currentOwner = () => useAuthStore.getState().user?.id ?? null;
async function write(kind: "start" | "pause" | "resume" | "reset", timeLeft?: number) {
  const name = scenario.courseId.startsWith("daily-course:") ? "dailyCourse" : "";
  const ordinaryNames = {
    start: "startStep",
    pause: "pauseStep",
    resume: "resumeStep",
    reset: "resetStep",
  };
  const dailyNames = {
    start: "dailyCourseStartStep",
    pause: "dailyCoursePauseStep",
    resume: "dailyCourseResumeStep",
    reset: "dailyCourseResetStep",
  };
  const payload = scenario.courseId.startsWith("daily-course:")
    ? {
        scheduleId: scenario.dayId,
        stepIndex: scenario.stepIndex,
        ...(kind === "start" ? { durationSec: duration } : {}),
        ...(kind === "pause" ? { timeLeftSec: timeLeft } : {}),
      }
    : {
        courseId: scenario.courseId,
        dayOnCourseId: scenario.dayId,
        stepIndex: scenario.stepIndex,
        ...(kind === "start" ? { durationSec: duration } : {}),
        ...(kind === "pause" ? { timeLeftSec: timeLeft } : {}),
      };
  const before = f.queue.getVerifiedBinding();
  const owner = currentOwner();
  if (!before || before.principalId !== owner) throw Error("NOT_ATTESTED");
  const rec = await f.queue.enqueue(
    "progress",
    (scenario.courseId.startsWith("daily-course:") ? dailyNames : ordinaryNames)[kind],
    payload,
  );
  const rows = await f.queue.getPending("progress");
  if (
    !rows.some((r) => r.eventId === rec.eventId) ||
    f.queue.getVerifiedBinding()?.authEpoch !== before.authEpoch ||
    currentOwner() !== owner
  )
    throw Error("READBACK_UNCONFIRMED");
}
function Screen({
  occ = scenario,
  verified = confirmed,
  forcedStatus,
  kind = "TRAINING",
}: {
  occ?: Occ;
  verified?: boolean;
  forcedStatus?: string;
  kind?: "TRAINING" | "PRACTICE";
}) {
  const profile = useAuthStore((state) => state.user);
  const online = useVerifiedOnlineCompletion(
    profile,
    m.queue?.getVerifiedBinding()?.authEpoch ?? null,
    `${occ.courseId}:${occ.dayId}`,
  );
  const [s, setS] = useState(forcedStatus ?? "NOT_STARTED");
  actualStatus = setS;
  statusText = s;
  return createElement(AccordionStep, {
    step: {
      id: "reused-step",
      title: "Timer step",
      type: kind,
      durationSec: duration,
      status: "NOT_STARTED",
    } as never,
    index: occ.stepIndex,
    isOpen: true,
    localState: {
      status: s,
      remainingSec: duration,
      timeLeft: duration,
      updatedAt: Date.now(),
    } as never,
    verifiedLocalCompleted: verified || online.isConfirmed(occ.stepIndex),
    courseId: occ.courseId,
    dayOnCourseId: occ.dayId,
    onToggle: () => {},
    onStart: async () => {
      callbacks.start();
      try {
        await write("start");
        setS("IN_PROGRESS");
        return true;
      } catch (e) {
        m.fail(e);
        return false;
      }
    },
    onPause: async (remainingSec: number) => {
      callbacks.pause(remainingSec);
      try {
        await write("pause", remainingSec);
        setS("PAUSED");
        return true;
      } catch (e) {
        m.fail(e);
        return false;
      }
    },
    onResume: async () => {
      callbacks.resume();
      try {
        await write("resume");
        setS("IN_PROGRESS");
        return true;
      } catch (e) {
        m.fail(e);
        return false;
      }
    },
    onReset: async () => {
      callbacks.reset();
      try {
        await write("reset");
        setS("RESET");
        return true;
      } catch (e) {
        m.fail(e);
        return false;
      }
    },
    onComplete: () => {
      callbacks.complete();
      if (kind === "PRACTICE") {
        const initialProfile = profile;
        const initialEpoch = m.queue?.getVerifiedBinding()?.authEpoch ?? null;
        void (onlineGate?.promise ?? Promise.resolve()).then(() => {
          if (
            useAuthStore.getState().user !== initialProfile ||
            (m.queue?.getVerifiedBinding()?.authEpoch ?? null) !== initialEpoch
          )
            return;
          online.markConfirmed(occ.stepIndex);
        });
        return;
      }
      void (
        scenario.courseId.startsWith("daily-course:")
          ? commitVerifiedDailyCompletion(
              f.queue,
              currentOwner(),
              { scheduleId: scenario.dayId, stepIndex: scenario.stepIndex },
              currentOwner,
            )
          : commitVerifiedPractice(
              f.queue,
              currentOwner(),
              {
                courseId: scenario.courseId,
                dayOnCourseId: scenario.dayId,
                stepIndex: scenario.stepIndex,
              },
              currentOwner,
            )
      )
        .then(() => {
          confirmed = true;
          setS("COMPLETED");
        })
        .catch((e) => m.fail(e));
    },
  });
}
async function mount(occ: Occ = scenario, verified = confirmed, status?: string) {
  await act(async () =>
    root.render(createElement(Screen, { occ, verified, forcedStatus: status })),
  );
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}
async function press(icon: string) {
  const button = host.querySelector<HTMLButtonElement>(`button[data-icon="${icon}"]`);
  expect(button, `missing ${icon}: ${host.textContent}`).not.toBeNull();
  await act(async () => {
    button!.click();
    await Promise.resolve();
    await Promise.resolve();
  });
}
async function tick(ms: number) {
  await act(async () => {
    vi.advanceTimersByTime(ms);
    await Promise.resolve();
    await Promise.resolve();
  });
}
async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("Phase1 full mounted AccordionStep connected timer / v2 writer / reducer", () => {
  beforeEach(async () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.useFakeTimers();
    vi.setSystemTime(at);
    f = fixture();
    m.queue = f.queue;
    await f.queue.beginVerifiedLogin("A");
    useAuthStore.setState({ user: { id: "A" } as never });
    vi.clearAllMocks();
    scenario = regular;
    duration = 3;
    confirmed = false;
    onlineGate = null;
    statusText = "NOT_STARTED";
    useTimerStore.setState({ activeTimer: null });
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    useTimerStore.setState({ activeTimer: null });
    vi.useRealTimers();
  });
  for (const occ of [regular, daily]) {
    it(`${occ === regular ? "ordinary" : "daily"} start → pause → resume → completion → remount never writes duplicate`, async () => {
      scenario = occ;
      await mount();
      await press("play-circle");
      await flush();
      expect(callbacks.start).toHaveBeenCalledTimes(1);
      expect(statusText).toBe("IN_PROGRESS");
      await tick(1000);
      await press("pause-circle");
      await flush();
      expect(callbacks.pause).toHaveBeenCalledTimes(1);
      expect(statusText).toBe("PAUSED");
      await press("play-circle");
      await flush();
      expect(statusText).toBe("IN_PROGRESS");
      await tick(4000);
      await flush();
      expect(callbacks.complete).toHaveBeenCalledTimes(1);
      expect(statusText).toBe("COMPLETED");
      const count = f.writes.length;
      await act(async () => root.unmount());
      useTimerStore.setState({ activeTimer: null });
      root = createRoot(host);
      m.queue = f.newQueue();
      expect(await m.queue.restoreVerifiedSession("A")).toBe(true);
      await mount(occ, true, "COMPLETED");
      await tick(5000);
      expect(callbacks.complete).toHaveBeenCalledTimes(1);
      expect(f.writes).toHaveLength(count);
      f.legacy();
    });
  }
  it("only one timer interval runs, double Start is single v2 write, unmount cancels late tick", async () => {
    await mount();
    const btn = host.querySelector<HTMLButtonElement>('button[data-icon="play-circle"]')!;
    await act(async () => {
      btn.click();
      btn.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    await flush();
    expect(callbacks.start).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(1);
    const writes = f.writes.length;
    await act(async () => root.unmount());
    root = createRoot(host);
    expect(vi.getTimerCount()).toBe(0);
    await tick(15000);
    expect(callbacks.complete).not.toHaveBeenCalled();
    expect(f.writes).toHaveLength(writes);
    f.legacy();
  });
  it("post-write readback failure leaves timer stopped and outcome uncertain; no auto retry", async () => {
    f.failReads(true);
    await mount();
    await press("play-circle");
    await flush();
    expect(m.fail).toHaveBeenCalled();
    expect(useTimerStore.getState().activeTimer).toBeNull();
    expect(f.writes).toHaveLength(1);
    await tick(10000);
    expect(callbacks.complete).not.toHaveBeenCalled();
    expect(f.writes).toHaveLength(1);
    f.legacy();
  });
  it("late successful Start after unmount cannot resurrect timer or send completion", async () => {
    const { gate, entered } = f.suspendWrites();
    await mount();
    await press("play-circle");
    await entered;
    await act(async () => root.unmount());
    root = createRoot(host);
    await act(async () => gate.release());
    await flush();
    expect(useTimerStore.getState().activeTimer).toBeNull();
    expect(callbacks.complete).not.toHaveBeenCalled();
    await tick(8000);
    expect(callbacks.complete).not.toHaveBeenCalled();
    f.legacy();
  });
  it("owner and authEpoch switch while suspended Start and during tick never resumes foreign timer", async () => {
    const { gate, entered } = f.suspendWrites();
    await mount();
    await press("play-circle");
    await entered;
    // Rebinding after async storage is resumed must never attach old owner bytes to the new UI.
    useAuthStore.setState({ user: { id: "B" } as never });
    await act(async () => root.render(createElement(Screen, { occ: regular })));
    await act(async () => gate.release());
    await flush();
    expect(useTimerStore.getState().activeTimer).toBeNull();
    await tick(8000);
    expect(callbacks.complete).not.toHaveBeenCalled();
    f.legacy();
  });
  it("changed day occurrence while asynchronous Start is pending never creates former-day timer", async () => {
    const { gate, entered } = f.suspendWrites();
    await mount();
    await press("play-circle");
    await entered;
    scenario = daily;
    await act(async () => root.render(createElement(Screen, { occ: daily })));
    await act(async () => gate.release());
    await flush();
    expect(useTimerStore.getState().activeTimer).toBeNull();
    expect(callbacks.complete).not.toHaveBeenCalled();
    f.legacy();
  });
  it("same-session UI remains mounted but auth binding changes before timer tick: no foreign completion", async () => {
    await mount();
    await press("play-circle");
    await flush();
    // Queue can rotate without a React-render yet; timer callback must check live attestation.
    await f.queue.endSession();
    await f.queue.beginVerifiedLogin("A");
    await tick(7000);
    expect(callbacks.complete).not.toHaveBeenCalled();
    f.legacy();
  });
  it("running A/E1 tick after fresh epoch and rerender cannot complete in E2", async () => {
    await mount();
    await press("play-circle");
    await flush();
    const e1 = useTimerStore.getState().activeTimer?.authEpoch;
    await f.queue.endSession();
    await f.queue.beginVerifiedLogin("A");
    useAuthStore.setState({ user: { id: "A" } as never });
    await act(async () => root.render(createElement(Screen, { occ: regular })));
    expect(useTimerStore.getState().activeTimer).toBeNull();
    await tick(8000);
    expect(callbacks.complete).not.toHaveBeenCalled();
    expect(f.queue.getVerifiedBinding()?.authEpoch).not.toBe(e1);
    f.legacy();
  });
  it("actual AccordionStep shows confirmed online PRACTICE immediately, without any v2 writer", async () => {
    await act(async () => root.render(createElement(Screen, { kind: "PRACTICE" })));
    const button = host.querySelector<HTMLButtonElement>('button[data-label="Я выполнил"]');
    expect(button).not.toBeNull();
    await act(async () => {
      button!.click();
      await Promise.resolve();
    });
    await flush();
    expect(host.textContent).toContain("Упражнение выполнено");
    expect(f.writes).toHaveLength(0);
    useAuthStore.setState({ user: { id: "B" } as never });
    await act(async () => root.render(createElement(Screen, { kind: "PRACTICE" })));
    expect(host.textContent).not.toContain("Упражнение выполнено");
    f.legacy();
  });
  it("late online completion after new owner/epoch/day does not mark new AccordionStep", async () => {
    onlineGate = latch();
    await act(async () => root.render(createElement(Screen, { kind: "PRACTICE" })));
    const btn = host.querySelector<HTMLButtonElement>('button[data-label="Я выполнил"]')!;
    await act(async () => btn.click());
    await f.queue.endSession();
    await f.queue.beginVerifiedLogin("A");
    useAuthStore.setState({ user: { id: "A" } as never });
    await act(async () => root.render(createElement(Screen, { occ: daily, kind: "PRACTICE" })));
    await act(async () => onlineGate!.release());
    await flush();
    expect(host.textContent).not.toContain("Упражнение выполнено");
    expect(f.writes).toHaveLength(0);
    f.legacy();
  });
  it("failed pause write must not leave a running verified timer paused", async () => {
    await mount();
    await press("play-circle");
    await flush();
    expect(useTimerStore.getState().activeTimer?.isRunning).toBe(true);
    f.failWrites();
    await press("pause-circle");
    await flush();
    expect(m.fail).toHaveBeenCalled();
    expect(useTimerStore.getState().activeTimer?.isRunning).toBe(true);
  });
  it("failed resume write must not start a paused verified timer", async () => {
    await mount();
    await press("play-circle");
    await flush();
    await press("pause-circle");
    await flush();
    expect(useTimerStore.getState().activeTimer?.isRunning).toBe(false);
    f.failWrites();
    await press("play-circle");
    await flush();
    expect(m.fail).toHaveBeenCalled();
    expect(useTimerStore.getState().activeTimer?.isRunning).toBe(false);
  });
  it("failed reset write must not drop the running timer", async () => {
    await mount();
    await press("play-circle");
    await flush();
    f.failWrites();
    await press("replay");
    await flush();
    expect(m.fail).toHaveBeenCalled();
    expect(useTimerStore.getState().activeTimer?.isRunning).toBe(true);
  });
  it("storage write failure after Start cannot leave unconfirmed timer running", async () => {
    f.failWrites();
    await mount();
    await press("play-circle");
    await flush();
    expect(m.fail).toHaveBeenCalled();
    expect(useTimerStore.getState().activeTimer).toBeNull();
  });
});
