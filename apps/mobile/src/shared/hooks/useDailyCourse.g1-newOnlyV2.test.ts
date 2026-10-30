import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  enqueue: vi.fn(),
  getPending: vi.fn(),
  old: vi.fn(),
  start: vi.fn(),
  pause: vi.fn(),
  resume: vi.fn(),
  reset: vi.fn(),
  complete: vi.fn(),
  offline: true,
  invalidate: vi.fn(),
}));
vi.mock("react", () => ({ useCallback: (f: unknown) => f }));
vi.mock("@tanstack/react-query", () => ({
  useQuery: vi.fn(),
  useQueryClient: () => ({ invalidateQueries: m.invalidate }),
  useMutation: (options: unknown) => options,
}));
vi.mock("@/shared/lib/api", () => ({
  dailyCourseApi: {
    startStep: m.start,
    pauseStep: m.pause,
    resumeStep: m.resume,
    resetStep: m.reset,
    completeStep: m.complete,
  },
  getDailyCourseStoreCourseId: vi.fn(),
}));
vi.mock("@/shared/stores", () => ({
  useProgressSyncStore: (selector: (s: unknown) => unknown) => selector({ add: m.old }),
  useStepStore: vi.fn(),
}));
vi.mock("@/shared/stores/networkStatusStore", () => ({ getIsOffline: () => m.offline }));
vi.mock("@/shared/lib/offline/newOnlyV2Native", () => ({
  newOnlyV2NativeQueues: {
    enqueue: m.enqueue,
    getPending: m.getPending,
    getVerifiedBinding: () => ({
      schemaVersion: 2,
      principalId: "A",
      authEpoch: "51e35071-0752-4f22-b3aa-23f8844c8931",
    }),
  },
}));
vi.mock("@/shared/stores/authStore", () => ({
  useAuthStore: { getState: () => ({ user: { id: "A" } }) },
}));
import {
  useDailyCourseStartStep,
  useDailyCoursePauseStep,
  useDailyCourseResumeStep,
  useDailyCourseResetStep,
  useDailyCourseCompleteStep,
} from "./useDailyCourse";
const base = { scheduleId: "clg0v5dte000008mf2dkq239x", stepIndex: 2 };
type Subject = {
  mutationFn: (
    arg: typeof base & { status?: string; durationSec?: number; timeLeftSec?: number },
  ) => Promise<{ success: boolean; code?: string }>;
};
/* eslint-disable react-hooks/rules-of-hooks -- test-only hook mocks return pure option objects */
function useSubject(kind: string): Subject {
  return (kind === "dailyCourseStartStep"
    ? useDailyCourseStartStep()
    : kind === "dailyCoursePauseStep"
      ? useDailyCoursePauseStep()
      : kind === "dailyCourseResumeStep"
        ? useDailyCourseResumeStep()
        : kind === "dailyCourseResetStep"
          ? useDailyCourseResetStep()
          : useDailyCourseCompleteStep()) as unknown as Subject;
}
const actions = [
  {
    kind: "dailyCourseStartStep",
    send: "start",
    args: { ...base, status: "IN_PROGRESS", durationSec: 120 },
  },
  { kind: "dailyCoursePauseStep", send: "pause", args: { ...base, timeLeftSec: 50 } },
  { kind: "dailyCourseResumeStep", send: "resume", args: base },
  { kind: "dailyCourseResetStep", send: "reset", args: base },
  { kind: "dailyCourseCompleteStep", send: "complete", args: base },
] as const;
describe("AG3 daily course new-only durable Phase1", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.offline = true;
    m.enqueue.mockResolvedValue({
      eventId: "id",
      ownerId: "A",
      authEpoch: "51e35071-0752-4f22-b3aa-23f8844c8931",
    });
    m.getPending.mockResolvedValue([
      {
        eventId: "id",
        kind: "dailyCourseCompleteStep",
        payload: { scheduleId: base.scheduleId, stepIndex: base.stepIndex },
      },
    ]);
    for (const op of [m.start, m.pause, m.resume, m.reset, m.complete])
      op.mockResolvedValue({ success: true });
  });
  for (const c of actions) {
    it(c.kind + " persists to v2, not legacy or HTTP", async () => {
      const result = await useSubject(c.kind).mutationFn(c.args);
      expect(result.code).toBe("OFFLINE_QUEUED");
      expect(m.enqueue).toHaveBeenCalledWith("progress", c.kind, c.args);
      expect(m.old).not.toHaveBeenCalled();
      expect(m[c.send]).not.toHaveBeenCalled();
    });
    it(c.kind + " rejects failed owner/epoch-bound durable write", async () => {
      m.enqueue.mockRejectedValueOnce(new Error("V2_SESSION_CHANGED"));
      await expect(useSubject(c.kind).mutationFn(c.args)).rejects.toThrow("V2_SESSION_CHANGED");
      expect(m.old).not.toHaveBeenCalled();
    });
    it(c.kind + " retains original online transport", async () => {
      m.offline = false;
      expect((await useSubject(c.kind).mutationFn(c.args)).success).toBe(true);
      expect(m[c.send]).toHaveBeenCalledWith(c.args);
      expect(m.enqueue).not.toHaveBeenCalled();
    });
  }
  it("invalid schedule rejects before writing", async () => {
    await expect(
      useSubject("dailyCourseResumeStep").mutationFn({ ...base, scheduleId: "../wrong" }),
    ).rejects.toThrow("OFFLINE_DAILY_INVALID_PAYLOAD");
    expect(m.enqueue).not.toHaveBeenCalled();
  });
  it("rejects invalid timer values", async () => {
    await expect(
      useSubject("dailyCoursePauseStep").mutationFn({ ...base, timeLeftSec: -1 }),
    ).rejects.toThrow("OFFLINE_DAILY_INVALID_TIME");
    expect(m.enqueue).not.toHaveBeenCalled();
  });
});
