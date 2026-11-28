import { beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  resetSteps: vi.fn(),
  resetTrainings: vi.fn(),
  clearFilters: vi.fn(),
  clearVideo: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/shared/providers/QueryProvider", async () => {
  const { QueryClient } = await import("@tanstack/react-query");
  return { queryClient: new QueryClient() };
});
vi.mock("@/shared/lib/videoProgressStorage", () => ({
  clearLocalVideoProgress: mocked.clearVideo,
}));
vi.mock("./courseStore", () => ({
  useCourseStore: { setState: vi.fn(), getState: () => ({ clearFilters: mocked.clearFilters }) },
}));
vi.mock("./stepStore", () => ({
  useStepStore: { getState: () => ({ reset: mocked.resetSteps }) },
}));
vi.mock("./trainingStore", () => ({
  useTrainingStore: { getState: () => ({ reset: mocked.resetTrainings }) },
}));
vi.mock("./timerStore", () => ({ useTimerStore: { setState: vi.fn() } }));

import { queryClient } from "@/shared/providers/QueryProvider";
import { resetUserStores } from "./resetAll";

describe("AG3 G1 native principal memory cache isolation", () => {
  beforeEach(() => {
    queryClient.clear();
    vi.clearAllMocks();
  });

  it("does not show USER-A private pets or chat data after logout and USER-B login", () => {
    queryClient.setQueryData(["pets", "USER_A"], [{ id: "private-pet-A" }]);
    queryClient.setQueryData(["chat", "USER_A"], [{ id: "private-chat-A" }]);

    resetUserStores();

    expect(queryClient.getQueryData(["pets", "USER_A"])).toBeUndefined();
    expect(queryClient.getQueryData(["chat", "USER_A"])).toBeUndefined();
    expect(queryClient.getQueryData(["pets", "USER_B"])).toBeUndefined();
    // Old video-progress-storage is unknown-owner; logout must not delete it.
    expect(mocked.clearVideo).not.toHaveBeenCalled();
  });
});
