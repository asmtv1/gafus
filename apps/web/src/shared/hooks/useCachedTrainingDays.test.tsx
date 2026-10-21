// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useCachedTrainingDays } from "./useCachedTrainingDays";

const mocks = vi.hoisted(() => ({
  cached: null as unknown,
  setCached: vi.fn(),
  clearCached: vi.fn(),
  currentUserId: vi.fn(),
  getDays: vi.fn(),
}));

vi.mock("@shared/stores/trainingStore", () => {
  const getCachedTrainingDays = () => ({ data: mocks.cached, isExpired: false });
  const setCachedTrainingDays = (...args: unknown[]) => {
    mocks.cached = args[1];
    mocks.setCached(...args);
  };
  const store = () => ({ getCachedTrainingDays, setCachedTrainingDays });
  return {
    useTrainingStore: Object.assign(store, {
      getState: () => ({
        clearCachedTrainingDays: (...args: unknown[]) => {
          mocks.cached = null;
          mocks.clearCached(...args);
        },
      }),
    }),
  };
});
vi.mock("@shared/lib/training/getTrainingDays", () => ({
  getTrainingDays: (...args: unknown[]) => mocks.getDays(...args),
}));
vi.mock("@shared/utils/getCurrentUserId", () => ({
  getCurrentUserId: (...args: unknown[]) => mocks.currentUserId(...args),
}));
vi.mock("@gafus/logger", () => ({
  createWebLogger: () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn() }),
}));
vi.mock("@gafus/error-handling", () => ({ reportClientError: vi.fn() }));

let root: Root;
let host: HTMLDivElement;
let latest: ReturnType<typeof useCachedTrainingDays>;

const serverOutline = {
  trainingDays: [{
    trainingDayId: "day-on-course", dayOnCourseId: "day-on-course",
    title: "Блок 1", type: "regular", courseId: "paid-course-id",
    userStatus: "NOT_STARTED",
  }],
  courseId: "paid-course-id", courseDescription: "Описание",
  courseVideoUrl: null, userCoursePersonalization: null,
};

function Harness({ initialError, noServerData = false }: {
  initialError?: string;
  noServerData?: boolean;
}) {
  latest = useCachedTrainingDays("paid-course", {
    initialData: noServerData ? null : serverOutline,
    initialError,
  });
  return null;
}

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  mocks.cached = null;
  mocks.setCached.mockClear();
  mocks.clearCached.mockClear();
  mocks.getDays.mockReset();
  mocks.currentUserId.mockReset();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

it("keeps the server-approved Paid course outline visible without subscription recheck", async () => {
  await act(async () => root.render(<Harness />));
  expect(latest.error).toBeNull();
  expect(latest.data?.trainingDays[0].title).toBe("Блок 1");
  expect(mocks.setCached).toHaveBeenCalledOnce();
  expect(mocks.clearCached).not.toHaveBeenCalled();
  expect(mocks.currentUserId).not.toHaveBeenCalled();
});

it("does not expose a previously cached outline when private assignment is denied", async () => {
  await act(async () => root.render(<Harness initialError="COURSE_ACCESS_DENIED" />));
  expect(latest.data).toBeNull();
  expect(latest.error).toBe("COURSE_ACCESS_DENIED");
  expect(mocks.setCached).not.toHaveBeenCalled();
  expect(mocks.clearCached).toHaveBeenCalledOnce();
});

it("clears a previous session's cached training days instead of showing them to a guest", async () => {
  mocks.cached = serverOutline;
  mocks.currentUserId.mockRejectedValue(new Error("Пользователь не авторизован"));
  await act(async () => root.render(<Harness noServerData />));
  expect(mocks.clearCached).toHaveBeenCalled();
  expect(mocks.getDays).not.toHaveBeenCalled();
  expect(latest.data).toBeNull();
  expect(latest.error).toContain("Пользователь не авторизован");
});
