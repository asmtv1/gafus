// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CURRENT_USER_QUERY_KEY } from "../../shared/auth/useAuth";
import { DailyBoundProgress } from "./DailyBoundProgress";
import type { DailyToday } from "./dailyCourseApi";
import type { TrainingStepPreview } from "../training/trainingDayApi";

const today: DailyToday = {
  mskDate: "2026-10-25", scheduleId: "schedule_01", userStatus: "NOT_STARTED",
  day: { id: "day_01", title: "День", description: "Практика", type: "training",
    estimatedDuration: 2, theoryMinutes: 0, stepsCount: 1 },
  stepsSummary: { total: 1, completed: 0 },
};
let client: QueryClient;
let node: HTMLDivElement;
let root: Root;
let fetcher: ReturnType<typeof vi.fn>;
let currentStatus = "NOT_STARTED";
let paused = false;
let stale = false;
let rejectPost = false;
let includeServerTimer = false;
let inlineStepType: "PRACTICE" | "THEORY" = "PRACTICE";
const success = (data: unknown, status = 200) => new Response(JSON.stringify({
  success: status === 200, data, code: status === 409 ? "STALE_STEP_BINDING" : undefined,
}), { status });
const bundle = () => ({ scheduleId: "schedule_01", mskDate: today.mskDate,
  trainingDayId: "day_01", bundleId: "day_01", onlineStepBinding: "BUNDLE_STEP_ID_V1",
  ...(includeServerTimer ? {serverNow:"2026-10-25T12:00:00.000Z"} : {}),
  steps: [{ stepId: "step_01", bundleStepId: stale ? "changed_id" : "bundle_01",
    stepIndex: 0, status: currentStatus, isPausedOnServer: paused,
    remainingSec: 50,
    ...(includeServerTimer ? {timerSnapshot: {
      remainingSecAtServerNow: 12,expiresAt:"2026-10-25T12:00:12.000Z",
    }} : {}),
    step: { id: "step_01", title: "Выдержка",
      type: includeServerTimer ? "TRAINING" : inlineStepType,
      durationSec: 50, PRIVATE_STUDENT: "do-not-expose" } }] });
async function flush() { await act(async () => new Promise(r => setTimeout(r, 30))); }
async function click(label: string) {
  const b = [...node.querySelectorAll<HTMLButtonElement>("button")]
    .find(x => x.textContent?.trim() === label);
  expect(b, label).toBeDefined();
  await act(async () => b?.click()); await flush();
}
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  stale = false; rejectPost = false; includeServerTimer = false;
  inlineStepType = "PRACTICE";
  currentStatus = "NOT_STARTED"; paused = false;
  fetcher = vi.fn(async (url: string, req: RequestInit) => {
    if (url.includes("/day?")) return success(bundle());
    if (url.endsWith("/today")) return success(today);
    if (url.includes("/step/")) {
      if (rejectPost) return success(null, 409);
      const kind = url.split("/").at(-1);
      if (kind === "start" || kind === "resume") { currentStatus = "IN_PROGRESS"; paused = false; }
      if (kind === "pause") { currentStatus = "IN_PROGRESS"; paused = true; }
      if (kind === "complete") { currentStatus = "COMPLETED"; paused = false; }
      if (kind === "reset") { currentStatus = "RESET"; paused = false; }
      expect(JSON.parse(String(req.body))).toMatchObject({
        scheduleId: "schedule_01", stepIndex: 0,
        expectedStepId: "step_01", expectedBundleStepId: "bundle_01",
      });
      return success(null);
    }
    throw Error("UNEXPECTED" + url);
  });
  vi.stubGlobal("fetch", fetcher);
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(CURRENT_USER_QUERY_KEY, { id: "owner_A", username: "owner_A", role: "USER" });
  node = document.createElement("div"); document.body.append(node); root = createRoot(node);
});
afterEach(async () => {
  await act(async () => root.unmount()); client.clear(); node.remove(); vi.unstubAllGlobals();
});
async function mount() {
  await act(async () => root.render(<QueryClientProvider client={client}>
    <DailyBoundProgress userId="owner_A" today={today}/>
  </QueryClientProvider>));
  await flush();
}
const inlinePreview = (type: "PRACTICE" | "THEORY" = "PRACTICE"):
  TrainingStepPreview => ({
    id: "step_01", title: "Выдержка", type, status: "NOT_STARTED",
    locked: false, order: 0, description: "Сделайте шаг спокойно",
    durationSec: 50, videoUrl: null, imageUrls: [],
  });
async function mountInline(preview: TrainingStepPreview) {
  await act(async () => root.render(<QueryClientProvider client={client}>
    <DailyBoundProgress userId="owner_A" today={today} steps={[preview]}/>
  </QueryClientProvider>));
  await flush();
}

describe("source Next Day inline daily step parity", () => {
  it("collapsed card owns its controls; PRACTICE has only «Я выполнил» after expansion", async () => {
    await mountInline(inlinePreview());
    expect(node.querySelectorAll(".training-next-step-card")).toHaveLength(1);
    expect(node.textContent).not.toContain("Мой прогресс за день");
    expect(node.textContent).not.toContain("Начать");
    expect(node.textContent).not.toContain("Я выполнил");
    const toggle=node.querySelector<HTMLButtonElement>(".training-next-step-header");
    expect(toggle?.getAttribute("aria-expanded")).toBe("false");
    await act(async () => toggle?.click());
    expect(toggle?.getAttribute("aria-expanded")).toBe("true");
    expect(node.textContent).toContain("Сделайте шаг спокойно");
    expect(node.textContent).toContain("Я выполнил");
    expect(node.textContent).not.toContain("Завершить шаг");
    expect(node.textContent).not.toContain("Пауза");
    expect(node.querySelector(".daily-next-refresh")).toBeNull();
    await click("Я выполнил");
    expect(node.textContent).toContain("Пройден");
    expect(node.textContent).toContain("Упражнение выполнено");
    expect(node.textContent).not.toContain("Шаг сохранён, результат подтверждён сервером.");
    expect(fetcher.mock.calls.filter(([_,req]) => req.method === "POST")).toHaveLength(1);
    expect(fetcher.mock.calls.filter(([url]) => String(url).includes("/day?")))
      .toHaveLength(3); // initial, preflight, confirmed readback
  });
  it("opening THEORY does not complete it; reading confirmation saves without closing", async () => {
    inlineStepType="THEORY";
    await mountInline(inlinePreview("THEORY"));
    const toggle=node.querySelector<HTMLButtonElement>(".training-next-step-header");
    await act(async () => toggle?.click());
    await flush();
    expect(toggle?.getAttribute("aria-expanded")).toBe("true");
    expect(node.textContent).not.toContain("Пройден");
    expect(fetcher.mock.calls.every(([_,req])=>req.method==="GET")).toBe(true);
    const read=[...node.querySelectorAll<HTMLButtonElement>("button")]
      .find(button=>button.textContent==="Я дочитал шаг");
    expect(read).toBeDefined();
    await act(async () => read?.click());await flush();
    expect(node.querySelector(".training-next-step-header")?.getAttribute("aria-expanded"))
      .toBe("true");
    expect(node.textContent).toContain("Пройден");
    expect(node.querySelector(".training-theory-read-badge")?.textContent?.trim())
      .toBe("Прочитано");
    expect(node.querySelectorAll(".training-theory-read-badge")).toHaveLength(1);
    expect(node.querySelector(".daily-inline-done")).toBeNull();
    expect(node.textContent).not.toContain("Шаг прочитан. Можно вернуться к материалу.");
    expect(fetcher.mock.calls.filter(([_,req])=>req.method==="POST")).toHaveLength(1);
  });
  it("long THEORY saves on actual user scroll end, not when opened, and remains expanded",async()=>{
    inlineStepType="THEORY";
    let top=window.innerHeight+240;
    const original=Element.prototype.getBoundingClientRect;
    const rect=vi.spyOn(Element.prototype,"getBoundingClientRect").mockImplementation(
      function(this:Element){
        if(this.classList.contains("training-theory-end-marker"))
          return {top,bottom:top+1,left:0,right:300,width:300,height:1,x:0,y:top,
            toJSON:()=>({})};
        return original.call(this);
      });
    try {
      await mountInline(inlinePreview("THEORY"));
      const toggle=node.querySelector<HTMLButtonElement>(".training-next-step-header");
      await act(async()=>toggle?.click());await flush();
      expect(fetcher.mock.calls.every(([_,req])=>req.method==="GET")).toBe(true);
      expect(toggle?.getAttribute("aria-expanded")).toBe("true");
      top=window.innerHeight-90;
      await act(async()=>window.dispatchEvent(new Event("scroll")));await flush();
      expect(fetcher.mock.calls.filter(([_,req])=>req.method==="POST")).toHaveLength(1);
      expect(node.textContent).toContain("Пройден");
      expect(node.querySelector(".training-theory-read-badge")?.textContent?.trim())
        .toBe("Прочитано");
      expect(node.querySelector(".daily-inline-done")).toBeNull();
      expect(node.querySelector(".training-next-step-header")?.getAttribute("aria-expanded"))
        .toBe("true");
      await act(async()=>window.dispatchEvent(new Event("scroll")));
      expect(fetcher.mock.calls.filter(([_,req])=>req.method==="POST")).toHaveLength(1);
    } finally { rect.mockRestore(); }
  });
  it("mismatched step projection cannot receive a command even while expanded", async () => {
    await mountInline({...inlinePreview(),id:"mismatched-step-id"});
    const toggle=node.querySelector<HTMLButtonElement>(".training-next-step-header");
    await act(async () => toggle?.click());
    expect(node.textContent).not.toContain("Я выполнил");
    expect(fetcher.mock.calls.every(([_,req])=>req.method === "GET")).toBe(true);
  });
});

describe("actual bound daily step control", () => {
  it("shows the negotiated server timer, not stale persisted remainingSec", async () => {
    currentStatus = "IN_PROGRESS";includeServerTimer = true;
    await mount();
    expect(node.textContent).toContain("Осталось по серверу: 00:12");
    expect(node.textContent).not.toContain("Осталось по серверу: 00:50");
    expect(node.innerHTML).not.toContain("do-not-expose");
  });
  it("opens with verified occurrence, then start-pause-resume-complete with fresh GET", async () => {
    await mount();
    expect(node.textContent).toContain("Выдержка");
    expect(node.innerHTML).not.toContain("do-not-expose");
    await click("Начать"); expect(node.textContent).toContain("В процессе");
    await click("Пауза"); expect(node.textContent).toContain("На паузе");
    await click("Продолжить"); expect(node.textContent).toContain("В процессе");
    await click("Завершить шаг"); expect(node.textContent).toContain("Пройден");
    expect(fetcher.mock.calls.filter(([_, req]) => req.method === "POST"))
      .toHaveLength(4);
  });
  it("409 refreshes immutable binding automatically, then waits for a deliberate reselect", async () => {
    rejectPost = true; await mount(); await click("Начать");
    expect(node.textContent).toContain("Прогресс обновлён. Выберите действие заново.");
    expect([...node.querySelectorAll<HTMLButtonElement>("button")]
      .find(b => b.textContent?.trim() === "Начать")?.disabled).toBe(false);
    expect(fetcher.mock.calls.filter(([_, req]) => req.method === "POST"))
      .toHaveLength(1);
    expect(fetcher.mock.calls.filter(([url]) => String(url).includes("/day?")))
      .toHaveLength(3); // rendered GET, preflight GET, explicit 409-reconcile GET
    // Only an actual second user click may generate a second POST.
    rejectPost = false;
    await click("Начать");
    expect(node.textContent).toContain("В процессе");
    expect(fetcher.mock.calls.filter(([_, req]) => req.method === "POST"))
      .toHaveLength(2);
  });
  it("after lost POST ACK requires deliberate fresh GET and never auto-replays", async () => {
    await mount();
    const original = fetcher.getMockImplementation() as
      (url: string, req: RequestInit) => Promise<Response>;
    fetcher.mockImplementation(async (url: string, req: RequestInit) => {
      if (url.endsWith("/step/start")) throw Error("CONNECTION_DROPPED_AFTER_WRITE");
      return original(url, req);
    });
    await click("Начать");
    expect(node.textContent).toContain("Ответ записи неизвестен");
    expect([...node.querySelectorAll<HTMLButtonElement>("button")]
      .find(b => b.textContent?.trim() === "Начать")?.disabled).toBe(true);
    expect(fetcher.mock.calls.filter(([_, req]) => req.method === "POST")).toHaveLength(1);
    await click("Обновить прогресс");
    expect(fetcher.mock.calls.filter(([_, req]) => req.method === "POST")).toHaveLength(1);
    expect(node.textContent).not.toContain("Ответ записи неизвестен");
  });
  it("same owner /me revalidation never retires verified step and can still start", async () => {
    await mount();
    await act(async () => client.setQueryData(CURRENT_USER_QUERY_KEY,
      { id: "owner_A", username: "owner_A", role: "USER" }));
    await flush();
    expect(node.textContent).not.toContain("Сессия изменилась");
    expect(node.textContent).toContain("Начать");
    await click("Начать");
    expect(node.textContent).toContain("В процессе");
    expect(fetcher.mock.calls.filter(([_, req]) => req.method === "POST")).toHaveLength(1);
  });
  it("new sessionRevision with same owner ID retires controls without POST", async () => {
    await mount();
    await act(async () => client.setQueryData(CURRENT_USER_QUERY_KEY,
      { id: "owner_A", username: "owner_A", role: "USER", sessionRevision: "new" }));
    await flush();
    expect(node.textContent).toContain("Сессия изменилась");
    expect(node.textContent).not.toContain("Начать");
    expect(fetcher.mock.calls.every(([_, req]) => req.method === "GET")).toBe(true);
  });
  it("identity change retires all actions without another POST", async () => {
    await mount();
    await act(async () => client.setQueryData(CURRENT_USER_QUERY_KEY,
      { id: "owner_B", username: "owner_B", role: "USER" }));
    await flush();
    expect(node.textContent).toContain("Сессия изменилась");
    expect(node.textContent).not.toContain("Начать");
    expect(fetcher.mock.calls.every(([_, req]) => req.method === "GET")).toBe(true);
  });
});
