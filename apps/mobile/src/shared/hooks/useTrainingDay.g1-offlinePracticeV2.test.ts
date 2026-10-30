import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  enqueue: vi.fn(),
  getPending: vi.fn(),
  serverComplete: vi.fn(),
  legacyAdd: vi.fn(),
  completeLocal: vi.fn(),
  invalidate: vi.fn(),
  offline: true,
}));
vi.mock("react", () => ({ useCallback: (fn: unknown) => fn }));
vi.mock("@tanstack/react-query", () => ({
  useQuery: vi.fn(),
  useQueryClient: () => ({ invalidateQueries: mocks.invalidate }),
  useMutation: (options: unknown) => options,
}));
vi.mock("@/shared/lib/api", () => ({
  trainingApi: { completePracticeStep: mocks.serverComplete },
}));
vi.mock("@/shared/stores", () => ({
  useProgressSyncStore: (pick: (s: { add: typeof mocks.legacyAdd }) => unknown) =>
    pick({ add: mocks.legacyAdd }),
  useStepStore: (pick: (s: { completeStep: typeof mocks.completeLocal }) => unknown) =>
    pick({ completeStep: mocks.completeLocal }),
}));
vi.mock("@/shared/stores/networkStatusStore", () => ({
  getIsOffline: () => mocks.offline,
}));
vi.mock("@/shared/lib/offline/offlineStorage", () => ({ getCourseMeta: vi.fn() }));
vi.mock("@/shared/lib/offline/mapOfflineMetaToTraining", () => ({
  mapMetaToTrainingDayResponse: vi.fn(),
}));
vi.mock("@/shared/lib/tracer", () => ({ reportClientError: vi.fn() }));
vi.mock("@/shared/lib/offline/newOnlyV2Native", () => ({
  newOnlyV2NativeQueues: {
    enqueue: mocks.enqueue,
    getPending: mocks.getPending,
    getVerifiedBinding: () => ({
      schemaVersion: 2,
      principalId: "USER_A",
      authEpoch: "51e35071-0752-4f22-b3aa-23f8844c8931",
    }),
  },
}));
vi.mock("@/shared/stores/authStore", () => ({
  useAuthStore: { getState: () => ({ user: { id: "USER_A" } }) },
}));

import { useCompletePracticeStep } from "./useTrainingDay";
import type { CompleteStepParams } from "@/shared/lib/api/training";

const args: CompleteStepParams = {
  courseId: "clg0v5dte000008mf2dkq239x",
  dayOnCourseId: "clg0v5dte000108mf8bgq229x",
  stepIndex: 1,
  stepTitle: "Not in immutable server event fingerprint",
};
type Hook = ReturnType<typeof useCompletePracticeStep> & {
  mutationFn: (variables: CompleteStepParams) => Promise<unknown>;
  onMutate: (variables: CompleteStepParams) => Promise<unknown>;
  onSuccess: (response: unknown, variables: CompleteStepParams) => void;
};

function options(): Hook {
  // This unit test replaces React hooks with pure deterministic mocks.
  // eslint-disable-next-line react-hooks/rules-of-hooks
  return useCompletePracticeStep() as Hook;
}

describe("AG3 P1 offline practice completion uses awaited NEW-only durable storage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.offline = true;
    mocks.enqueue.mockResolvedValue({
      ownerId: "USER_A",
      authEpoch: "51e35071-0752-4f22-b3aa-23f8844c8931",
      eventId: "8ae52e9a-580f-4ab8-9545-397973bc32f5",
    });
    mocks.getPending.mockResolvedValue([
      {
        eventId: "8ae52e9a-580f-4ab8-9545-397973bc32f5",
        kind: "completePracticeStep",
        payload: {
          courseId: args.courseId,
          dayOnCourseId: args.dayOnCourseId,
          stepIndex: args.stepIndex,
        },
      },
    ]);
    mocks.serverComplete.mockResolvedValue({ success: true });
  });

  it("writes ONLY the exact server practice fields to v2, awaits persistence before optimistic success", async () => {
    const op = options();
    await op.onMutate(args);
    expect(mocks.completeLocal).not.toHaveBeenCalled();
    let done!: (v: unknown) => void;
    mocks.enqueue.mockReturnValueOnce(
      new Promise((resolve) => {
        done = resolve;
      }),
    );
    const inFlight = op.mutationFn(args);
    expect(mocks.enqueue).toHaveBeenCalledWith("progress", "completePracticeStep", {
      courseId: args.courseId,
      dayOnCourseId: args.dayOnCourseId,
      stepIndex: args.stepIndex,
    });
    expect(mocks.legacyAdd).not.toHaveBeenCalled();
    expect(mocks.serverComplete).not.toHaveBeenCalled();
    expect(mocks.completeLocal).not.toHaveBeenCalled();
    done({
      eventId: "8ae52e9a-580f-4ab8-9545-397973bc32f5",
      ownerId: "USER_A",
      authEpoch: "51e35071-0752-4f22-b3aa-23f8844c8931",
    });
    const response = await inFlight;
    expect(response).toEqual({ success: true, code: "OFFLINE_QUEUED" });
    op.onSuccess(response, args);
    expect(mocks.completeLocal).toHaveBeenCalledOnce();
    expect(mocks.completeLocal).toHaveBeenCalledWith(
      args.courseId,
      args.dayOnCourseId,
      args.stepIndex,
    );
    expect(mocks.legacyAdd).not.toHaveBeenCalled();
  });

  it("rejects v2 disk failure and missing verified session without false success or historical write", async () => {
    const op = options();
    for (const code of ["V2_SESSION_UNVERIFIED", "disk-full"]) {
      mocks.enqueue.mockRejectedValueOnce(new Error(code));
      await op.onMutate(args);
      await expect(op.mutationFn(args)).rejects.toThrow(code);
      expect(mocks.completeLocal).not.toHaveBeenCalled();
      expect(mocks.legacyAdd).not.toHaveBeenCalled();
      expect(mocks.serverComplete).not.toHaveBeenCalled();
    }
  });

  it("rejects unsupported route params before writing either queue", async () => {
    const op = options();
    await expect(op.mutationFn({ ...args, courseId: "OLD_UNVERIFIED" })).rejects.toThrow();
    await expect(op.mutationFn({ ...args, stepIndex: -1 })).rejects.toThrow();
    expect(mocks.enqueue).not.toHaveBeenCalled();
    expect(mocks.legacyAdd).not.toHaveBeenCalled();
  });

  it("keeps unchanged online behavior and does not create v2 events when online", async () => {
    mocks.offline = false;
    const op = options();
    await op.onMutate(args);
    expect(mocks.completeLocal).toHaveBeenCalledOnce();
    expect(await op.mutationFn(args)).toEqual({ success: true });
    expect(mocks.serverComplete).toHaveBeenCalledWith(args);
    expect(mocks.enqueue).not.toHaveBeenCalled();
    expect(mocks.legacyAdd).not.toHaveBeenCalled();
  });
});
