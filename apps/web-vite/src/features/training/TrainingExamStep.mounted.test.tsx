// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CURRENT_USER_QUERY_KEY } from "../../shared/auth/useAuth";
import type { TrainingDaySummary } from "./trainingDaysApi";
import type { TrainingStepPreview } from "./trainingDayApi";
import { TrainingExamStep } from "./TrainingExamStep";

const userStepId = "c" + "u".repeat(24);
const stepId = "c" + "s".repeat(24);
const step: TrainingStepPreview = {
  id: stepId, title: "Экзамен", description: "", order: 0,
  type: "EXAMINATION", status: "NOT_STARTED", locked: false,
  durationSec: 0, videoUrl: null, imageUrls: [],
};
const day: TrainingDaySummary = {
  trainingDayId: "day1", dayOnCourseId: "clwdayoc0000000000000001",
  courseId: "course1", title: "День", type: "practice", userStatus: "IN_PROGRESS",
  estimatedDuration: 10, theoryMinutes: 2, equipment: "", isLocked: false,
};
const examBody = {
  courseId: day.courseId, dayOnCourseId: day.dayOnCourseId,
  trainingDayId: "physicalday", steps: [{
    id: step.id, type: "EXAMINATION", order: 0, locked: false, userStepId,
    hasTestQuestions: true,
    checklist: [{ id: "q1", question: "Выберите вариант", options: ["Нет", "Да"],
      correctAnswer: 1 }],
    requiresWrittenFeedback: true, requiresVideoReport: false,
  }],
};
const result = (answers: Record<string, number> | null) => ({
  id: "exam1", testAnswers: answers, writtenFeedback: null, videoReportUrl: null,
  isPassed: answers !== null, trainerComment: null, testScore: answers ? 1 : null,
  testMaxScore: answers ? 1 : null, reviewedAt: null, reviewedBy: null,
});
const ok = (data: unknown) => new Response(
  JSON.stringify({ success: true, data }), { status: 200 },
);
const missing = () => new Response(JSON.stringify({
  success: false, error: "Не найдено", code: "NOT_FOUND",
}), { status: 404 });
let host: HTMLDivElement;
let root: Root;
let cache: QueryClient;
const wait = async () => {
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 40)); });
};
async function mount(viewStep=step) {
  await act(async () => root.render(<QueryClientProvider client={cache}>
    <TrainingExamStep userId="owner_A" courseType="COURSE" day={day} step={viewStep} />
  </QueryClientProvider>));
  await wait();
}
async function click(text: string) {
  const button = [...host.querySelectorAll<HTMLButtonElement>("button")]
    .find(item => item.textContent?.includes(text));
  expect(button, "Expected button " + text).toBeDefined();
  await act(async () => button?.click());
  await wait();
}
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div"); document.body.append(host);
  root = createRoot(host);
  cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  cache.setQueryData(CURRENT_USER_QUERY_KEY, { id: "owner_A", role: "USER", username: "A" });
});
afterEach(async () => {
  await act(async () => root.unmount());
  cache.clear(); host.remove(); vi.unstubAllGlobals();
});

describe("learner Next exam panel with real Hono-shape transport", () => {
  it("written feedback submit inherits the shared olive PrimaryButton, preserving disabled validation", async () => {
    const spy = vi.fn(async (path: string, options: RequestInit) => {
      expect(options.method).toBe("GET");
      if (path.startsWith("/api/v1/training/day?")) return ok({
        ...examBody, steps: examBody.steps.map(({userStepId: _ignored, ...row}) => row),
      });
      if (path.startsWith("/api/v1/exam/result?")) return missing();
      throw Error("EXAM_READ_ONLY_STYLE_TEST");
    });
    vi.stubGlobal("fetch", spy);
    await mount();
    const button = [...host.querySelectorAll<HTMLButtonElement>("button")].find(
      item => item.textContent?.trim() === "Отправить обратную связь");
    expect(button).toBeDefined();
    expect(button?.getAttribute("data-gafus-shared-button")).toBe("primary");
    expect(button?.classList.contains("gafus-primary-button")).toBe(true);
    expect(button?.type).toBe("submit");
    expect(button?.disabled).toBe(true);
    expect(button?.closest("form")?.querySelector("textarea")).not.toBeNull();
    expect(button?.closest("form")?.classList.contains("training-exam-form--written"))
      .toBe(true);
    expect(button?.closest("form")?.querySelector(".training-exam-form-title")?.textContent)
      .toContain("Письменная обратная связь");
    expect(host.querySelector(".training-exam-header")?.textContent)
      .toContain("Проверка знаний");
    expect(host.querySelector(".training-learner-counter")?.textContent)
      .toContain("минимум 10 символов");
    expect(host.querySelectorAll(".training-exam-form")).toHaveLength(2);
    expect(spy.mock.calls.every(([,req]) => req.method === "GET")).toBe(true);
  });
  it("creates no step on mount, opens through exact GET, POSTs only answered test and verifies GET", async () => {
    let saved: Record<string, number> | null = null;
    const spy = vi.fn(async (path: string, options: RequestInit) => {
      if (path.startsWith("/api/v1/training/day")) {
        if (path.includes("createIfMissing=false")) return ok({
          ...examBody, steps: examBody.steps.map(({userStepId: _ignored, ...row})=>row),
        });
        return ok(examBody);
      }
      if (path.startsWith("/api/v1/exam/result")) return saved ? ok(result(saved)) : missing();
      if (path === "/api/v1/exam/submit") {
        saved = JSON.parse(options.body as string).testAnswers;
        return ok({ success: true, examResultId: "exam1" });
      }
      throw Error("Unexpected HTTP " + path);
    });
    vi.stubGlobal("fetch", spy);
    await mount();
    expect(host.textContent).toContain("Выберите вариант");
    expect(host.textContent).not.toContain("Открыть экзамен");
    expect(spy.mock.calls.every(([_,req])=>req.method==="GET")).toBe(true);
    expect(spy.mock.calls.some(([path])=>
      String(path).includes("createIfMissing=true"))).toBe(false);
    expect(spy.mock.calls.filter(([path]) => path === "/api/v1/exam/submit")).toHaveLength(0);
    const answer = host.querySelectorAll<HTMLInputElement>('input[type="radio"]')[1];
    await act(async () => answer.click());
    await click("Отправить тест");
    expect(spy.mock.calls.filter(([path]) => path === "/api/v1/exam/submit")).toHaveLength(1);
    expect(host.textContent).toContain("Тест сдан");
    expect(host.textContent).toContain("сохранён и перечитан");
  });

  it("existing started exam opens read-only immediately without createIfMissing or POST",async()=>{
    const spy=vi.fn(async(path:string,options:RequestInit)=>{
      expect(options.method).toBe("GET");
      if(path.startsWith("/api/v1/training/day?"))return ok(examBody);
      if(path.startsWith("/api/v1/exam/result?"))return missing();
      throw Error("UNEXPECTED_EXAM_WRITE");
    });
    vi.stubGlobal("fetch",spy);
    await mount({...step,status:"IN_PROGRESS"});
    expect(host.textContent).toContain("Выберите вариант");
    expect(host.textContent).not.toContain("Открыть экзамен");
    expect(spy.mock.calls.some(([path])=>String(path).includes("createIfMissing=true")))
      .toBe(false);
    expect(spy.mock.calls.every(([,options])=>options.method==="GET")).toBe(true);
  });
  it("lost submit ACK is not replayed; explicit GET reconciles saved answer", async () => {
    let saved: Record<string, number> | null = null;
    const spy = vi.fn(async (path: string, options: RequestInit) => {
      if (path.startsWith("/api/v1/training/day")) {
        if (path.includes("createIfMissing=false")) return ok({
          ...examBody, steps: examBody.steps.map(({userStepId: _ignored, ...row})=>row),
        });
        return ok(examBody);
      }
      if (path.startsWith("/api/v1/exam/result")) return saved ? ok(result(saved)) : missing();
      if (path === "/api/v1/exam/submit") {
        saved = JSON.parse(options.body as string).testAnswers;
        throw new TypeError("ACK_LOST_SECRET");
      }
      throw Error("Unexpected HTTP " + path);
    });
    vi.stubGlobal("fetch", spy);
    await mount();
    await act(async () => host.querySelectorAll<HTMLInputElement>('input[type="radio"]')[1].click());
    await click("Отправить тест");
    expect(host.textContent).toContain("Результат отправки неизвестен");
    expect(host.textContent).not.toContain("ACK_LOST_SECRET");
    expect(host.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(true);
    expect(spy.mock.calls.filter(([path]) => path === "/api/v1/exam/submit")).toHaveLength(1);
    await click("Проверить результат");
    expect(host.textContent).toContain("состояние экзамена на сервере");
    expect(host.textContent).toContain("Тест сдан");
    expect(spy.mock.calls.filter(([path]) => path === "/api/v1/exam/submit")).toHaveLength(1);
  });

  it("trainer changed exam questions after preview: deny POST and keep original draft",async()=>{
    const spy=vi.fn(async(path:string)=>{
      if(path.startsWith("/api/v1/training/day")){
        const current=path.includes("createIfMissing=false");
        const raw=current?{
          ...examBody,steps:examBody.steps.map(({userStepId: _ignored,...row})=>row),
        }:{
          ...examBody,steps:examBody.steps.map(row=>({...row,
            checklist:row.checklist.map(q=>({...q,correctAnswer:0}))})),
        };
        return ok(raw);
      }
      throw Error("PREVIEW_CHANGED_MUST_NOT_POST");
    });
    vi.stubGlobal("fetch",spy);
    await mount();
    await act(async()=>host.querySelectorAll<HTMLInputElement>('input[type="radio"]')[1].click());
    await click("Отправить тест");
    expect(spy.mock.calls.some(([path])=>path==="/api/v1/exam/submit")).toBe(false);
    expect(host.textContent).toContain("Состояние шага изменилось");
    expect(host.querySelectorAll<HTMLInputElement>('input[type="radio"]')[1].checked).toBe(true);
  });

  it("owner replacement retires the mounted examiner without leaking saved private data", async () => {
    const spy = vi.fn(async (path: string) => {
      if (path.startsWith("/api/v1/training/day")) {
        if (path.includes("createIfMissing=false")) return ok({
          ...examBody, steps: examBody.steps.map(({userStepId: _ignored, ...row})=>row),
        });
        return ok(examBody);
      }
      if (path.startsWith("/api/v1/exam/result")) return missing();
      throw Error("Unexpected HTTP " + path);
    });
    vi.stubGlobal("fetch", spy);
    await mount();
    expect(host.textContent).toContain("Выберите вариант");
    await act(async () => cache.setQueryData(CURRENT_USER_QUERY_KEY,
      { id: "owner_B", username: "B", role: "USER" }));
    await wait();
    expect(host.textContent).toContain("Сессия изменилась");
    expect(host.textContent).not.toContain("Выберите вариант");
    expect(spy.mock.calls.filter(([path]) => path === "/api/v1/exam/submit")).toHaveLength(0);
  });
});
