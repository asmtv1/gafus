// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TrainerExamManageRoute, type TrainerExamManageTransport } from "./TrainerExamManageRoute";

const actor = { id: "trainer-a", role: "TRAINER" as const };
const privateHeaders = { "cache-control": "private, no-store" };
const exam = {
  id: "exam-1",
  userStepId: "user-step-1",
  status: "IN_PROGRESS",
  createdAt: "2026-10-26T10:00:00.000Z",
  reviewedAt: null,
  courseName: "Послушание",
  courseType: "regular",
  stepTitle: "Сидеть",
  hasTestQuestions: false,
  requiresWrittenFeedback: true,
  requiresVideoReport: true,
  userName: "Ученик",
  testScore: null,
  testMaxScore: null,
  testAnswers: null,
  writtenFeedback: "Тренировали команду",
  videoReportUrl: "https://media.example/video.m3u8",
  trainerComment: null,
  overallScore: null,
  isPassed: null,
  reviewedBy: null,
};
type Exam = Omit<typeof exam, "reviewedAt" | "isPassed"> & { reviewedAt: string | null; isPassed: boolean | null };
let rows: Exam[] = [];
let stale = false;
let status = 200;
const read = vi.fn(async (_path: string, _signal: AbortSignal) => ({
  status,
  headers: privateHeaders,
  body: { success: true, data: rows },
}));
const write = vi.fn(async (request: Parameters<TrainerExamManageTransport>[0]) => {
  const payload = request.body as { action: "approve" | "reject"; userStepId: string };
  if (!stale && status === 200)
    rows = rows.map((row) => ({
      ...row,
      status: payload.action === "approve" ? "COMPLETED" : "IN_PROGRESS",
      reviewedAt: "2026-10-26T11:00:00.000Z",
      isPassed: payload.action === "approve",
    }));
  return { status, headers: privateHeaders, body: { success: status === 200 } };
});
let root: Root;
let host: HTMLDivElement;
const current = () => ({ actor, token: "opaque", authEpoch: "epoch-1" });
async function mount(props: Partial<Parameters<typeof TrainerExamManageRoute>[0]> = {}) {
  await act(async () =>
    root.render(
      createElement(TrainerExamManageRoute, {
        pathname: "/main-panel/exam-results",
        search: "?hideCompleted=false",
        actor,
        token: "opaque",
        authEpoch: "epoch-1",
        enabled: true,
        examSummaryTransport: read,
        examManageTransport: write,
        getCurrentSession: current,
        ...props,
      }),
    ),
  );
}
async function clickByText(part: string) {
  const button = Array.from(host.querySelectorAll("button")).find((el) =>
    el.textContent?.includes(part),
  );
  expect(button).toBeTruthy();
  await act(async () => button!.click());
}
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  rows = [{ ...exam }];
  status = 200;
  stale = false;
  read.mockClear();
  write.mockClear();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
});
describe("trainer full exam Vite review", () => {
  it("shows scoped answers and video and confirms a review only after fresh GET", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    await mount();
    expect(host.textContent).toContain("Тренировали команду");
    const media = host.querySelector("video");
    expect(media?.getAttribute("src")).toBe("https://media.example/video.m3u8");
    await clickByText("Принять экзамен");
    expect(write).toHaveBeenCalledTimes(1);
    expect(write.mock.calls[0]![0]).toMatchObject({
      method: "POST",
      path: "/api/v1/trainer/exam-results/manage/review",
      body: { userStepId: "user-step-1", action: "approve", trainerComment: null },
    });
    expect(read.mock.calls.length).toBeGreaterThan(1);
    expect(host.textContent).toContain("Решение подтверждено");
    expect(host.textContent).toContain("Завершён");
  });
  it("does not claim success for acknowledged but unchanged Core state", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    stale = true;
    await mount();
    await clickByText("Вернуть на доработку");
    expect(write).toHaveBeenCalledTimes(1);
    expect(host.textContent).not.toContain("Решение подтверждено");
  });
  it("requires explicit confirmation and denies current session retirement", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    await mount();
    await clickByText("Принять экзамен");
    expect(write).not.toHaveBeenCalled();
    await mount({ getCurrentSession: () => null });
    expect(host.textContent).not.toContain("Тренировали команду");
    expect(host.textContent).toContain("недоступны");
    expect(write).not.toHaveBeenCalled();
  });
  it("does not render private details when server denies read", async () => {
    status = 403;
    await mount();
    expect(host.textContent).toContain("Нет доступа");
    expect(host.textContent).not.toContain("Тренировали команду");
  });
});
