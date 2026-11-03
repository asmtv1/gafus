// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { TrainerOptInRoute } from "./optInRoute";

const actor = { id: "trainer-route-A", role: "TRAINER" as const };
let host: HTMLDivElement;
let root: Root;
const base = {
  actor, token: "test-session", authEpoch: "epoch-a",
  fetchImpl: vi.fn() as unknown as typeof fetch,
};
const headers = { "cache-control": "private, no-store" };
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});
type RouteProps = Parameters<typeof TrainerOptInRoute>[0];
const render = async (props: Pick<RouteProps, "pathname"> & Partial<RouteProps>) => {
  const input: RouteProps = { ...base, ...props };
  await act(async () => root.render(createElement(TrainerOptInRoute, input)));
};
const examRows = [
  { id: "pending", createdAt: "2026-10-25T00:00:00.000Z", courseName: "Daily", stepTitle: "One", status: "IN_PROGRESS", hasTestQuestions: true, requiresWrittenFeedback: false, requiresVideoReport: false },
  { id: "completed", createdAt: "2026-10-24T00:00:00.000Z", courseName: "Daily", stepTitle: "Two", status: "COMPLETED", hasTestQuestions: true, requiresWrittenFeedback: false, requiresVideoReport: false },
];
const makeStep = (n: number) => ({
  id: `daily-${n}`, title: `Day ${String(n).padStart(2, "0")}`, description: "Example",
  durationSec: null, estimatedDurationSec: null, type: "TRAINING", videoUrl: null,
  imageUrls: [], pdfUrls: [], checklist: null, surveySlug: null,
  isDailyCourse: true, authorId: actor.id,
  createdAt: new Date(Date.UTC(2026, 9, 25, 0, 0, 0) - n * 1000).toISOString(),
  updatedAt: "2026-10-25T00:00:00.000Z", author: { username: "trainer", profile: null },
  stepLinks: [],
});

describe("25 Oct legacy trainer route URL parity in isolated Vite opt-in consumers", () => {
  it("exam-results hideCompleted=false renders completed rows from real read response", async () => {
    const transport = vi.fn(async () => ({
      status: 200, headers, body: { success: true, data: examRows },
    }));
    await render({ pathname: "/main-panel/exam-results", search: "?hideCompleted=false",
      enableExamSummary: true, examSummaryTransport: transport });
    expect(transport).toHaveBeenCalledTimes(1);
    const checkbox = host.querySelector('input[type="checkbox"]') as HTMLInputElement;
    expect(checkbox.checked).toBe(false);
    expect(host.textContent).toContain("отображено: 2");
    await render({ pathname: "/main-panel/exam-results", search: "?hideCompleted=true", enableExamSummary: true, examSummaryTransport: transport });
    expect((host.querySelector('input[type="checkbox"]') as HTMLInputElement).checked).toBe(true);
    expect(host.textContent).toContain("отображено: 1");
  });

  it("daily-course/steps locks daily scope and honors createdAt desc 25 rows from URL", async () => {
    const steps = Array.from({ length: 27 }, (_, n) => makeStep(n));
    const transport = vi.fn(async (_request: { method: "GET"; path: string; signal: AbortSignal }) =>
      ({ status: 200, headers, body: { success: true, data: steps } }));
    await render({ pathname: "/main-panel/daily-course/steps", search: "?orderBy=createdAt&order=desc&rowsPerPage=25", enableVisibleSteps: true, visibleStepsTransport: transport });
    expect(transport).toHaveBeenCalledTimes(1);
    expect(transport.mock.calls[0]![0]).toMatchObject({ method: "GET", path: "/api/v1/trainer/steps?isDailyCourse=true" });
    expect(host.textContent).toContain("Созданные шаги курса дня");
    expect(host.textContent).toContain("показано: 25");
    expect(host.textContent).toContain("Day 24");
    expect(host.textContent).not.toContain("Day 25");
    expect(host.querySelector('select[aria-label="Тип шагов"]')).toBeNull();
  });

  it("days page uses own registered visible-days GET, not a placeholder, and retires rows", async () => {
    const day = {
      id: "own-day", title: "Воспитание", equipment: "Поводок", description: "Описание дня",
      type: "TRAINING", authorId: actor.id, showCoursePathExport: false,
      shareProgressAcrossCourses: false,
      createdAt: "2026-10-25T11:00:00.000Z", updatedAt: "2026-10-25T11:00:00.000Z",
      author: { username: "trainer", profile: null }, stepLinks: [], dayLinks: [],
    };
    const transport = vi.fn(async (_path: string, _signal: AbortSignal) => ({
      status: 200, headers, body: { success: true, data: [day] },
    }));
    await render({ pathname: "/main-panel/days", enableVisibleDays: true,
      visibleDaysTransport: transport });
    expect(transport).toHaveBeenCalledTimes(1);
    expect(transport.mock.calls[0]![0]).toBe("/api/v1/trainer/days");
    expect(host.textContent).toContain("Созданные дни");
    expect(host.textContent).toContain("Воспитание");
    await render({ pathname: "/main-panel/days", token: null,
      enableVisibleDays: true, visibleDaysTransport: transport });
    expect(host.textContent).toContain("Список дней недоступен");
    expect(host.textContent).not.toContain("Воспитание");
    expect(transport).toHaveBeenCalledTimes(1);
    await render({ pathname: "/main-panel/days", enableVisibleDays: true,
      visibleDaysTransport: transport, getCurrentSession: () => null });
    expect(host.textContent).toContain("Список дней недоступен");
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it("trainer FAQ route has been removed from the Vite app", async () => {
    await render({ pathname: "/main-panel/faq" });
    expect(host.textContent).not.toContain("Частые вопросы");
    expect(host.querySelector("video")).toBeNull();
    expect(base.fetchImpl).not.toHaveBeenCalled();
  });
});
