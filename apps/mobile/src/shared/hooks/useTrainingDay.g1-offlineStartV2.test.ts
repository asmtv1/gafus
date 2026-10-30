import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ enqueue: vi.fn(), send: vi.fn(), old: vi.fn(), offline: true }));
vi.mock("react", () => ({ useCallback: (fn: unknown) => fn }));
vi.mock("@tanstack/react-query", () => ({
  useQuery: vi.fn(),
  useQueryClient: () => ({}),
  useMutation: (options: unknown) => options,
}));
vi.mock("@/shared/lib/api", () => ({ trainingApi: { startStep: m.send } }));
vi.mock("@/shared/stores", () => ({
  useProgressSyncStore: (fn: (s: unknown) => unknown) => fn({ add: m.old }),
  useStepStore: () => vi.fn(),
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
import { useStartStep } from "./useTrainingDay";
const input = {
  courseId: "clg0v5dte000008mf2dkq239x",
  dayOnCourseId: "clg0v5dte000108mf8bgq229x",
  stepIndex: 1,
  durationSec: 60,
  status: "IN_PROGRESS" as const,
};
function useTestAction() {
  return useStartStep() as unknown as { mutationFn: (v: typeof input) => Promise<unknown> };
}
describe("AG3 OFF021 startStep Phase1 new-only", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.offline = true;
    m.enqueue.mockResolvedValue({ eventId: "event" });
    m.send.mockResolvedValue({ success: true });
  });
  it("durably persists exact v2 event without v1 or server HTTP", async () => {
    expect(await useTestAction().mutationFn(input)).toEqual({
      success: true,
      code: "OFFLINE_QUEUED",
    });
    expect(m.enqueue).toHaveBeenCalledWith("progress", "startStep", input);
    expect(m.old).not.toHaveBeenCalled();
    expect(m.send).not.toHaveBeenCalled();
  });
  it("does not falsely succeed when storage rejects", async () => {
    m.enqueue.mockRejectedValueOnce(new Error("disk full"));
    await expect(useTestAction().mutationFn(input)).rejects.toThrow("disk full");
    expect(m.old).not.toHaveBeenCalled();
  });
  it("rejects invalid payload before writing", async () => {
    await expect(useTestAction().mutationFn({ ...input, courseId: "../bad" })).rejects.toThrow(
      "OFFLINE_START_UNSUPPORTED_PAYLOAD",
    );
    expect(m.enqueue).not.toHaveBeenCalled();
  });
  it("retains original online API", async () => {
    m.offline = false;
    expect(await useTestAction().mutationFn(input)).toEqual({ success: true });
    expect(m.send).toHaveBeenCalledWith(input);
    expect(m.enqueue).not.toHaveBeenCalled();
  });
});
