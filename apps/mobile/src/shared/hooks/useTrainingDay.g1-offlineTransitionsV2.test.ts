/* eslint-disable react-hooks/rules-of-hooks -- deterministic test mocks replace React hooks with pure option factories */
import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  enqueue: vi.fn(),
  resume: vi.fn(),
  reset: vi.fn(),
  theory: vi.fn(),
  old: vi.fn(),
  localResume: vi.fn(),
  localReset: vi.fn(),
  localComplete: vi.fn(),
  invalidate: vi.fn(),
  offline: true,
}));
vi.mock("react", () => ({ useCallback: (f: unknown) => f }));
vi.mock("@tanstack/react-query", () => ({
  useQuery: vi.fn(),
  useQueryClient: () => ({ invalidateQueries: m.invalidate }),
  useMutation: (o: unknown) => o,
}));
vi.mock("@/shared/lib/api", () => ({
  trainingApi: { resumeStep: m.resume, resetStep: m.reset, completeTheoryStep: m.theory },
}));
vi.mock("@/shared/stores", () => ({
  useProgressSyncStore: (fn: (s: unknown) => unknown) => fn({ add: m.old }),
  useStepStore: (fn: (s: unknown) => unknown) =>
    fn({ resumeStep: m.localResume, resetStep: m.localReset, completeStep: m.localComplete }),
}));
vi.mock("@/shared/stores/authStore", () => ({
  useAuthStore: { getState: () => ({ user: null }) },
}));
vi.mock("@/shared/stores/networkStatusStore", () => ({ getIsOffline: () => m.offline }));
vi.mock("@/shared/lib/offline/newOnlyV2Native", () => ({
  newOnlyV2NativeQueues: { enqueue: m.enqueue },
}));
vi.mock("@/shared/lib/offline/offlineStorage", () => ({ getCourseMeta: vi.fn() }));
vi.mock("@/shared/lib/offline/mapOfflineMetaToTraining", () => ({
  mapMetaToTrainingDayResponse: vi.fn(),
}));
vi.mock("@/shared/lib/tracer", () => ({ reportClientError: vi.fn() }));
import { useResumeStep, useResetStep, useCompleteTheoryStep } from "./useTrainingDay";
const args = {
  courseId: "clg0v5dte000008mf2dkq239x",
  dayOnCourseId: "clg0v5dte000108mf8bgq229x",
  stepIndex: 1,
};
type Mutation = {
  mutationFn: (
    v: typeof args & { durationSec?: number },
  ) => Promise<{ success: boolean; code?: string }>;
  onSuccess: (
    r: { success: boolean; code?: string },
    v: typeof args & { durationSec?: number },
  ) => void;
};
function useSubject(kind: "resumeStep" | "resetStep" | "completeTheoryStep"): Mutation {
  return (kind === "resumeStep"
    ? useResumeStep()
    : kind === "resetStep"
      ? useResetStep()
      : useCompleteTheoryStep()) as unknown as Mutation;
}
const cases = [
  { kind: "resumeStep", local: "localResume", server: "resume" },
  { kind: "resetStep", local: "localReset", server: "reset" },
  { kind: "completeTheoryStep", local: "localComplete", server: "theory" },
] as const;
describe("AG3 OFF021 owner-epoch-bound fresh offline transitions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.offline = true;
    m.enqueue.mockResolvedValue({ eventId: "e" });
    for (const method of [m.resume, m.reset, m.theory]) method.mockResolvedValue({ success: true });
  });
  for (const c of cases) {
    it(
      c.kind + " awaits persistence before local state and never writes ownerless or network",
      async () => {
        const hook = useSubject(c.kind);
        let release!: (v: unknown) => void;
        m.enqueue.mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              release = resolve;
            }),
        );
        const pending = hook.mutationFn(args);
        expect(m[c.local]).not.toHaveBeenCalled();
        expect(m.old).not.toHaveBeenCalled();
        expect(m[c.server]).not.toHaveBeenCalled();
        release({ eventId: "e" });
        const result = await pending;
        expect(result.code).toBe("OFFLINE_QUEUED");
        expect(m.enqueue).toHaveBeenCalledWith("progress", c.kind, args);
        hook.onSuccess(result, args);
        expect(m[c.local]).toHaveBeenCalledOnce();
      },
    );
    it(c.kind + " fail closes bad owner-bound storage and leaves local state intact", async () => {
      m.enqueue.mockRejectedValueOnce(new Error("V2_SESSION_CHANGED"));
      const hook = useSubject(c.kind);
      await expect(hook.mutationFn(args)).rejects.toThrow("V2_SESSION_CHANGED");
      expect(m[c.local]).not.toHaveBeenCalled();
      expect(m.old).not.toHaveBeenCalled();
    });
    it(c.kind + " rejects invalid principal-independent identifiers before enqueue", async () => {
      await expect(useSubject(c.kind).mutationFn({ ...args, courseId: "INVALID" })).rejects.toThrow(
        "UNSUPPORTED_PAYLOAD",
      );
      expect(m.enqueue).not.toHaveBeenCalled();
    });
    it(c.kind + " preserves online adapter and only success changes state", async () => {
      m.offline = false;
      const hook = useSubject(c.kind);
      const result = await hook.mutationFn(args);
      expect(m[c.server]).toHaveBeenCalledWith(args);
      hook.onSuccess(result, args);
      expect(m[c.local]).toHaveBeenCalledOnce();
      hook.onSuccess({ success: false }, args);
      expect(m[c.local]).toHaveBeenCalledOnce();
    });
  }
  it("reset rejects invalid optional negative duration before persistence", async () => {
    await expect(useSubject("resetStep").mutationFn({ ...args, durationSec: -1 })).rejects.toThrow(
      "OFFLINE_RESET_UNSUPPORTED_PAYLOAD",
    );
    expect(m.enqueue).not.toHaveBeenCalled();
  });
  it("ordered pause→resume→reset→complete payloads retain distinct event kinds", async () => {
    const timeline = ["resumeStep", "resetStep", "completeTheoryStep"] as const;
    for (const kind of timeline) {
      const h = useSubject(kind);
      const result = await h.mutationFn(args);
      h.onSuccess(result, args);
    }
    expect(m.enqueue.mock.calls.map(([, kind]) => kind)).toEqual(timeline);
    expect(m.localResume).toHaveBeenCalledOnce();
    expect(m.localReset).toHaveBeenCalledOnce();
    expect(m.localComplete).toHaveBeenCalledOnce();
  });
});
