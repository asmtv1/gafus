// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TrainingIndex } from "./TrainingIndex";
import { TrainingDayViewer } from "./TrainingDayViewer";
import type { TrainingDaysOverview, TrainingDaySummary } from "./trainingDaysApi";
import type { TrainingDayDetail } from "./trainingDayApi";
import { ApiError } from "../../shared/api/client";

const day: TrainingDaySummary = {
  trainingDayId: "day_01",
  dayOnCourseId: "link_day_01",
  courseId: "course_01",
  title: "Старый приватный блок",
  type: "practice",
  userStatus: "COMPLETED",
  estimatedDuration: 9,
  theoryMinutes: 1,
  equipment: "Игрушка",
  isLocked: false,
};
const overview = (name = day.title): TrainingDaysOverview => ({
  courseId: "course_01",
  courseDescription: "PRIVATE_COURSE_DESCRIPTION",
  courseEquipment: null,
  courseTrainingLevel: "BEGINNER",
  requiresPersonalization: false,
  days: [{ ...day, title: name }],
});
const detail = (): TrainingDayDetail => ({
  trainingDayId: day.trainingDayId,
  dayOnCourseId: day.dayOnCourseId,
  courseId: day.courseId,
  title: day.title,
  description: "PRIVATE_DAY_DESCRIPTION",
  type: "practice",
  userStatus: "COMPLETED",
  steps: [
    {
      id: "step_01",
      title: "PRIVATE_STEP_TITLE",
      description: "PRIVATE_STEP_BODY",
      type: "PRACTICE",
      status: "COMPLETED",
      order: 0,
      durationSec: 60,
      locked: false,
      imageUrls: [],
      videoUrl: "https://example.invalid/private.mp4",
    },
  ],
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
let host: HTMLDivElement, root: Root, cache: QueryClient;
async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 35));
  });
}
async function mount(element: React.ReactNode) {
  await act(async () =>
    root.render(<QueryClientProvider client={cache}>{element}</QueryClientProvider>),
  );
  await act(async () => {
    await new Promise((r) => setTimeout(r, 20));
  });
}
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw Error("UNEXPECTED_FETCH");
    }),
  );
});
afterEach(async () => {
  await act(async () => root.unmount());
  cache.clear();
  host.remove();
  vi.unstubAllGlobals();
});
describe("AG2 TrainingIndex and DayViewer current-read access", () => {
  it("T-R01 cached days/entitlement are not visible while GET is revalidating", async () => {
    const request = deferred<TrainingDaysOverview>();
    cache.setQueryData(["training", "days", "A", "IMPULSE_CONTROL"], overview());
    const loadDays = vi.fn().mockReturnValue(request.promise);
    await mount(
      <TrainingIndex
        userId="A"
        courseType="IMPULSE_CONTROL"
        courseName="Самоконтроль"
        loadDays={loadDays}
      />,
    );
    expect(loadDays).toHaveBeenCalledTimes(1);
    expect(host.textContent).toContain("Перепроверяем доступ");
    expect(host.textContent).not.toContain(day.title);
    expect(host.textContent).not.toContain("PRIVATE_COURSE_DESCRIPTION");
    await act(async () => request.resolve(overview("Проверенный блок")));
    await settle();
    expect(host.textContent).toContain("Проверенный блок");
  });
  it("T-R02 revoked 403 after cached days leaves no private list or old status", async () => {
    const request = deferred<TrainingDaysOverview>();
    cache.setQueryData(["training", "days", "A", "IMPULSE_CONTROL"], overview());
    await mount(
      <TrainingIndex
        userId="A"
        courseType="IMPULSE_CONTROL"
        courseName="Самоконтроль"
        loadDays={() => request.promise}
      />,
    );
    await act(async () => request.reject(new ApiError(403, "PRIVATE_SERVER_STACK")));
    await settle();
    expect(host.textContent).toContain("Нет доступа к этому курсу");
    expect(host.querySelectorAll(".training-day-card")).toHaveLength(0);
    expect(host.textContent).not.toContain("PRIVATE_SERVER_STACK");
    expect(host.textContent).not.toContain(day.title);
  });
  it("T-R03 deep-link day does not open with cached days pending verification", async () => {
    const request = deferred<TrainingDaysOverview>();
    const loadDay = vi.fn().mockResolvedValue(detail());
    cache.setQueryData(["training", "days", "A", "IMPULSE_CONTROL"], overview());
    await mount(
      <TrainingIndex
        userId="A"
        courseType="IMPULSE_CONTROL"
        courseName="Самоконтроль"
        loadDays={() => request.promise}
        loadDay={loadDay}
        routeMode
        routeDayId={day.dayOnCourseId}
      />,
    );
    expect(host.textContent).not.toContain(day.title);
    expect(host.textContent).toContain("Перепроверяем доступ");
    expect(loadDay).not.toHaveBeenCalled();
    await act(async () => request.resolve(overview()));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(loadDay).toHaveBeenCalledTimes(1);
  });
  it("T-R04 cached unlocked step details/media hidden while revalidating", async () => {
    const request = deferred<TrainingDayDetail>();
    cache.setQueryData(["training", "day", "A", "IMPULSE_CONTROL", day.dayOnCourseId], detail());
    const loadDay = vi.fn().mockReturnValue(request.promise);
    await mount(
      <TrainingDayViewer
        userId="A"
        courseType="IMPULSE_CONTROL"
        day={day}
        loadDay={loadDay}
        onBack={vi.fn()}
      />,
    );
    expect(loadDay).toHaveBeenCalledTimes(1);
    expect(host.textContent).toContain("Перепроверяем доступ");
    expect(host.textContent).not.toContain("PRIVATE_STEP_TITLE");
    expect(host.textContent).not.toContain("PRIVATE_DAY_DESCRIPTION");
    expect(host.querySelector("video")).toBeNull();
    await act(async () => request.resolve(detail()));
    await settle();
    expect(host.textContent).toContain("PRIVATE_STEP_TITLE");
  });
  it("T-R05 revoked step 403/401 hides old media, shows safe state", async () => {
    const request = deferred<TrainingDayDetail>();
    cache.setQueryData(["training", "day", "A", "IMPULSE_CONTROL", day.dayOnCourseId], detail());
    await mount(
      <TrainingDayViewer
        userId="A"
        courseType="IMPULSE_CONTROL"
        day={day}
        loadDay={() => request.promise}
        onBack={vi.fn()}
      />,
    );
    await act(async () => request.reject(new ApiError(401, "PRIVATE_AUTH_STACK")));
    await settle();
    expect(host.textContent).toContain("Сессия завершена");
    expect(host.querySelector("video")).toBeNull();
    expect(host.textContent).not.toContain("PRIVATE_STEP_TITLE");
    expect(host.textContent).not.toContain("PRIVATE_AUTH_STACK");
  });
  it("T-R06 switching owner after opening a day resets local selection", async () => {
    const loadDay = vi.fn().mockResolvedValue(detail());
    await mount(
      <TrainingIndex
        userId="A"
        courseType="IMPULSE_CONTROL"
        courseName="Самоконтроль"
        showStepsOptIn
        loadDays={async () => overview("День владельца A")}
        loadDay={loadDay}
      />,
    );
    const open = [...host.querySelectorAll<HTMLButtonElement>("button")].find((button) =>
      button.textContent?.includes("Открыть шаги блока"),
    );
    expect(open).toBeDefined();
    await act(async () => open?.click());
    await settle();
    expect(loadDay).toHaveBeenCalledTimes(1);
    await mount(
      <TrainingIndex
        userId="B"
        courseType="IMPULSE_CONTROL"
        courseName="Самоконтроль"
        showStepsOptIn
        loadDays={async () => overview("День владельца B")}
        loadDay={loadDay}
      />,
    );
    expect(host.textContent).toContain("День владельца B");
    expect(host.textContent).not.toContain("День владельца A");
    expect(host.querySelector(".training-day-viewer")).toBeNull();
    expect(loadDay).toHaveBeenCalledTimes(1);
  });
});
