// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CourseCatalog } from "../courses/CourseCatalog";
import { DailyCourseOptInHarness } from "./DailyCourseOptInHarness";
import { getTodayDailyCourse, sourceOnlyDailyDayGet } from "./dailyCourseApi";
import { CURRENT_USER_QUERY_KEY } from "../../shared/auth/useAuth";

const today = {
  mskDate: "2026-10-25", scheduleId: "schedule_01", userStatus: "NOT_STARTED",
  day: { id: "bundle_01", title: "Курс дня", description: "Занятие с собакой",
    type: "training", estimatedDuration: 12, theoryMinutes: 2, stepsCount: 1 },
  stepsSummary: { total: 1, completed: 0 },
};
const detail = {
  scheduleId: "schedule_01", mskDate: "2026-10-25",
  trainingDayId: "bundle_01", bundleId: "bundle_01", title: "Курс дня",
  description: "Занятие с собакой", type: "training", userStatus: "NOT_STARTED",
  steps: [{ id: "userstep_01", stepId: "step_01", stepIndex: 0,
    status: "NOT_STARTED", remainingSec: null, completedAt: null,
    isPausedOnServer: false, step: { id: "step_01", title: "Потренировать выдержку",
      description: "Начать с простого", type: "PRACTICE", order: 0,
      durationSec: 60, imageUrls: [], videoUrl: null },
    hiddenOwnerId: "SECRET_OWNER" }],
};
let node: HTMLDivElement;
let root: Root;
let cache: QueryClient;
let fetcher: ReturnType<typeof vi.fn>;
async function flush() {
  await act(async () => new Promise(resolve => setTimeout(resolve, 30)));
}
async function render(ui: React.ReactNode) {
  await act(async () => root.render(
    <QueryClientProvider client={cache}>{ui}</QueryClientProvider>,
  ));
  await flush();
}
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  window.history.replaceState(null, "", "/courses");
  fetcher = vi.fn(async (path: string, req: RequestInit) => {
    expect(req.method).toBe("GET");
    if (path === "/api/v1/courses") return new Response(JSON.stringify({
      success: true, data: [],
    }), { status: 200 });
    if (path === "/api/v1/daily-course/today") return new Response(JSON.stringify({
      success: true, data: today,
    }), { status: 200 });
    if (path === "/api/v1/daily-course/day?scheduleId=schedule_01&createIfMissing=false")
      return new Response(JSON.stringify({ success: true, data: detail }), { status: 200 });
    throw Error("UNEXPECTED_REQUEST_" + path);
  });
  vi.stubGlobal("fetch", fetcher);
  cache = new QueryClient({ defaultOptions: {
    queries: { retry: false, refetchOnWindowFocus: false },
  } });
  cache.setQueryData(CURRENT_USER_QUERY_KEY,
    { id: "owner_A", username: "user_A", role: "USER" });
  node = document.createElement("div"); document.body.append(node); root = createRoot(node);
});
afterEach(async () => {
  await act(async () => root.unmount()); cache.clear(); node.remove(); vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});
describe("normal course catalog → daily direct deep link using signed Hono GET", () => {
  it("owner sees latest Moscow today and links actual /daily-course/schedule_01", async () => {
    await render(<CourseCatalog userId="owner_A" showDailyCourseOptIn
      dailyTodayLoader={getTodayDailyCourse} dailyDayLoader={sourceOnlyDailyDayGet}
      dailyRouteMode/>);
    expect(node.querySelector("[data-next-daily-course-card]")).not.toBeNull();
    expect(node.querySelector('img[alt="Курс дня"]')).not.toBeNull();
    expect(node.querySelector('a[href="/daily-course/schedule_01"]')).not.toBeNull();
    expect(fetcher.mock.calls.map(([path]) => path).sort()).toEqual([
      "/api/v1/daily-course/today", "/api/v1/courses",
    ].sort());
  });
  it("owner direct deep link reads only own matching schedule and private step projection", async () => {
    await render(<DailyCourseOptInHarness enabled userId="owner_A" routeMode
      routeScheduleId="schedule_01" loadToday={getTodayDailyCourse}
      loadDay={sourceOnlyDailyDayGet}/>);
    expect(node.textContent).toContain("Потренировать выдержку");
    expect(node.textContent).not.toContain("SECRET_OWNER");
    // Unlike the former two stacked read-only/progress lists, Next mounts
    // only the Course Day title, one description accordion and step accordions.
    expect(node.querySelector("[data-next-daily-course-day]")).not.toBeNull();
    expect(node.querySelector(".daily-next-title")?.textContent).toBe("Курс дня");
    expect(node.textContent).not.toContain("Упражнения курса дня");
    expect(node.textContent).not.toContain("Мой прогресс за день");
    expect(node.querySelectorAll(".training-next-step-card")).toHaveLength(1);
    expect(node.querySelector(".daily-next-description-header")?.getAttribute("aria-expanded"))
      .toBe("false");
    expect(node.querySelector(".daily-next-description-body")).toBeNull();
    const stepToggle=node.querySelector<HTMLButtonElement>(".training-next-step-header");
    expect(stepToggle?.getAttribute("aria-expanded")).toBe("false");
    await act(async()=>stepToggle?.click());
    expect(stepToggle?.getAttribute("aria-expanded")).toBe("true");
    expect(node.textContent).toContain("Начать с простого");
    const calls = fetcher.mock.calls.map(([path]) => path);
    expect(calls).toContain("/api/v1/daily-course/today");
    expect(calls).toContain(
      "/api/v1/daily-course/day?scheduleId=schedule_01&createIfMissing=false",
    );
    expect(fetcher.mock.calls.every(([_, req]) => req.method === "GET")).toBe(true);
  });
  it("guest never fetches or exposes protected daily overview", async () => {
    cache.setQueryData(CURRENT_USER_QUERY_KEY, null);
    await render(<CourseCatalog userId={null} showDailyCourseOptIn={false}
      dailyTodayLoader={getTodayDailyCourse} dailyDayLoader={sourceOnlyDailyDayGet}/>);
    expect(fetcher).not.toHaveBeenCalled();
    expect(node.querySelector('a[href^="/daily-course/"]')).toBeNull();
  });
});
