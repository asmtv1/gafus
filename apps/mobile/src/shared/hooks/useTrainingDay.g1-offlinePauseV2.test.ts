import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  enqueue: vi.fn(),
  server: vi.fn(),
  legacy: vi.fn(),
  local: vi.fn(),
  offline: true,
}));
vi.mock("react", () => ({ useCallback: (fn: unknown) => fn }));
vi.mock("@tanstack/react-query", () => ({
  useQuery: vi.fn(),
  useQueryClient: () => ({}),
  useMutation: (options: unknown) => options,
}));
vi.mock("@/shared/lib/api", () => ({ trainingApi: { pauseStep: m.server } }));
vi.mock("@/shared/stores", () => ({
  useProgressSyncStore: (fn: (s: unknown) => unknown) => fn({ add: m.legacy }),
  useStepStore: (fn: (s: unknown) => unknown) => fn({ pauseStep: m.local }),
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
import { usePauseStep } from "./useTrainingDay";
const args = {
  courseId: "clg0v5dte000008mf2dkq239x",
  dayOnCourseId: "clg0v5dte000108mf8bgq229x",
  stepIndex: 1,
  timeLeftSec: 30,
};
type Hook = {
  mutationFn(v: typeof args): Promise<{ success: boolean; code?: string }>;
  onSuccess(result: { success: boolean; code?: string }, v: typeof args): void;
};
function useSubject(): Hook {
  return usePauseStep() as unknown as Hook;
}
describe("AG3 OFF021 pause v2 Phase1", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.offline = true;
    m.enqueue.mockResolvedValue({ eventId: "e" });
    m.server.mockResolvedValue({ success: true });
  });
  it("awaits durable write before local state and never touches legacy or server", async () => {
    const hook = useSubject();
    let finish!: (v: unknown) => void;
    m.enqueue.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const pending = hook.mutationFn(args);
    expect(m.local).not.toHaveBeenCalled();
    expect(m.legacy).not.toHaveBeenCalled();
    expect(m.server).not.toHaveBeenCalled();
    finish({ eventId: "e" });
    const result = await pending;
    expect(result.code).toBe("OFFLINE_QUEUED");
    expect(m.enqueue).toHaveBeenCalledWith("progress", "pauseStep", args);
    hook.onSuccess(result, args);
    expect(m.local).toHaveBeenCalledOnce();
  });
  it("does not change local state when durable storage fails", async () => {
    const hook = useSubject();
    m.enqueue.mockRejectedValueOnce(new Error("disk full"));
    await expect(hook.mutationFn(args)).rejects.toThrow("disk full");
    expect(m.local).not.toHaveBeenCalled();
    expect(m.legacy).not.toHaveBeenCalled();
  });
  it("blocks malformed or negative times before IO", async () => {
    await expect(useSubject().mutationFn({ ...args, timeLeftSec: -1 })).rejects.toThrow(
      "OFFLINE_PAUSE_UNSUPPORTED_PAYLOAD",
    );
    expect(m.enqueue).not.toHaveBeenCalled();
  });
  it("preserves online call and only applies successful state", async () => {
    m.offline = false;
    const hook = useSubject();
    const result = await hook.mutationFn(args);
    expect(m.server).toHaveBeenCalledWith(args);
    expect(m.enqueue).not.toHaveBeenCalled();
    hook.onSuccess(result, args);
    expect(m.local).toHaveBeenCalledOnce();
    hook.onSuccess({ success: false }, args);
    expect(m.local).toHaveBeenCalledOnce();
  });
});
