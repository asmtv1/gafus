// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CURRENT_USER_QUERY_KEY } from "../../shared/auth/useAuth";
import { TrainingProgressConnected } from "./TrainingProgressConnected";
import { TrainingDayViewer } from "./TrainingDayViewer";
import type { TrainingDayDetail } from "./trainingDayApi";
import { TheoryReadingContext } from "./TheoryReadingContext";
import { timerStorageKey } from "./trainingStepClock";
import type { TrainingDaySummary } from "./trainingDaysApi";

const day = {
  trainingDayId: "trainingDay_01", dayOnCourseId: "dayOnCourse_01", courseId: "course_01",
  title: "День первый", type: "TRAINING", isLocked: false, userStatus: "NOT_STARTED",
  estimatedDuration: 10, theoryMinutes: 0, equipment: "",
} as TrainingDaySummary;
const originalStep = {
  id: "step_01", stepOnDayId: "occurrence_01", title: "Команда рядом",
  status: "NOT_STARTED", locked: false, type: "TRAINING",
  order: 0, durationSec: 120, isPausedOnServer: false,
  remainingSecOnServer: null as number | null,
  description: "PRIVATE STEP CONTENT",
};
let node: HTMLDivElement;
let root: Root;
let cache: QueryClient;
let fetcher: ReturnType<typeof vi.fn>;
let step: typeof originalStep;
let otherSteps: typeof originalStep[];
let missingBinding: boolean;
let failPost: boolean;
let staleOccurrence: boolean;
let lostAckAfterCommit: boolean;
let staleReadAfterCommit: boolean;
let timerCompletionFails: boolean;
let timerCompletionLosesAck: boolean;
let serverClockExpiryOffsetMs: number | null;
let ownerId: string;
const ack = (status = 200, data?: unknown) => new Response(JSON.stringify({
  success: status < 400, data,
  code: status === 409 ? "STALE_STEP_BINDING" : undefined,
}), { status });
async function tick() {
  await act(async () => new Promise(resolve => setTimeout(resolve, 25)));
}
async function mount() {
  await act(async () => root.render(<QueryClientProvider client={cache}>
    <TrainingProgressConnected userId="owner_A" courseType="IMPULSE_CONTROL" day={day}/>
  </QueryClientProvider>));
  await tick();
}
async function click(name: string) {
  const button = [...node.querySelectorAll<HTMLButtonElement>("button")]
    .find(b => b.textContent?.trim() === name);
  expect(button, name).toBeDefined();
  await act(async () => button?.click());
  await tick();
}
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  missingBinding = false; failPost = false; staleOccurrence = false;
  lostAckAfterCommit = false; staleReadAfterCommit = false;
  timerCompletionFails = false; timerCompletionLosesAck = false;
  serverClockExpiryOffsetMs = null;
  ownerId = "owner_A"; step = { ...originalStep }; otherSteps = [];
  window.localStorage.clear();
  fetcher = vi.fn(async (path: string, req: RequestInit) => {
    if (String(path).startsWith("/api/v1/training/day?") && req.method === "GET") {
      expect((req.headers as Record<string, string>)["X-Gafus-Web-Step-Binding"]).toBe("1");
      return ack(200, {
        courseId: day.courseId, dayOnCourseId: day.dayOnCourseId,
        trainingDayId: day.trainingDayId,
        onlineStepBinding: missingBinding ? undefined : "STEP_ON_DAY_ID_V1",
        ...(serverClockExpiryOffsetMs !== null ? {serverNow:new Date().toISOString()} : {}),
        steps: [staleOccurrence ? { ...step, stepOnDayId: "other_occurrence" } :
          staleReadAfterCommit && step.status === "IN_PROGRESS" ? originalStep :
          serverClockExpiryOffsetMs !== null && step.status === "IN_PROGRESS"
            ? {...step,timerSnapshot:{
              remainingSecAtServerNow:Math.max(0,
                Math.ceil(serverClockExpiryOffsetMs/1000)),
              expiresAt:step.isPausedOnServer ? null :
                new Date(Date.now()+serverClockExpiryOffsetMs).toISOString(),
            }} : step,
          ...otherSteps],
      });
    }
    if (path === "/api/v1/training/step/start" && req.method === "POST") {
      const data = JSON.parse(String(req.body));
      expect(data).toMatchObject({
        courseId: "course_01", dayOnCourseId: "dayOnCourse_01",
        expectedStepId: "step_01", expectedStepOnDayId: "occurrence_01",
        stepIndex: 0, durationSec: step.durationSec,
      });
      if (failPost) return ack(409);
      step = { ...step, status: "IN_PROGRESS", isPausedOnServer: false };
      if (lostAckAfterCommit) throw Error("AG2_SIMULATED_LOST_ACK_AFTER_SQL_COMMIT");
      return ack();
    }
    if (path === "/api/v1/training/step/pause" && req.method === "POST") {
      const data = JSON.parse(String(req.body));
      expect(data.timeLeftSec).toBe(120);
      step = { ...step, status: "IN_PROGRESS", isPausedOnServer: true };
      return ack();
    }
    if (path === "/api/v1/training/step/reset" && req.method === "POST") {
      step = {...step,status:"RESET",isPausedOnServer:false};
      return ack();
    }
    if (path === "/api/v1/training/step/resume" && req.method === "POST") {
      step = { ...step, status: "IN_PROGRESS", isPausedOnServer: false };
      return ack();
    }
    if (path === "/api/v1/training/step/complete/theory" && req.method === "POST") {
      step = {...step,status:"COMPLETED",isPausedOnServer:false};
      return ack();
    }
    if (path === "/api/v1/training/step/complete/practice" && req.method === "POST") {
      if (timerCompletionFails) return ack(409);
      step = { ...step, status: "COMPLETED", isPausedOnServer: false };
      if (timerCompletionLosesAck) throw Error("ACK_LOST_AFTER_TIMER_SQL_COMMIT");
      return ack();
    }
    throw Error(`UNEXPECTED_${req.method}_${path}`);
  });
  vi.stubGlobal("fetch", fetcher);
  cache = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  });
  cache.setQueryData(CURRENT_USER_QUERY_KEY, { id: ownerId, username: "test", role: "USER" });
  node = document.createElement("div"); document.body.append(node); root = createRoot(node);
});
afterEach(async () => {
  vi.useRealTimers();
  await act(async () => root.unmount()); cache.clear(); node.remove(); vi.unstubAllGlobals();
});

describe("ordinary Web /trainings day bound progress UI", () => {
  it("expanded completed PRACTICE shows only the original Next completed badge, no loose Пройден",async()=>{
    step={...step,status:"COMPLETED",type:"PRACTICE"};
    await act(async()=>root.render(<QueryClientProvider client={cache}>
      <div className="gafus-app"><section className="training-day-viewer--next">
        <TrainingProgressConnected userId="owner_A" courseType="IMPULSE_CONTROL"
          day={day} stepSelection={{index:0,id:"step_01"}} />
      </section></div>
    </QueryClientProvider>));
    await tick();
    const controls=node.querySelector(".training-progress-inline-step");
    expect(controls).not.toBeNull();
    const completed=controls?.querySelector(".training-next-practice-completed");
    expect(completed?.textContent?.trim()).toBe("Упражнение выполнено");
    expect(completed?.getAttribute("role")).toBe("status");
    expect(completed?.parentElement?.classList.contains(
      "training-next-practice-completed-wrap")).toBe(true);
    expect(controls?.querySelector(".training-next-practice-complete")).toBeNull();
    expect(controls?.querySelector("p")).toBeNull();
    expect(controls?.querySelector("strong")).toBeNull();
    expect(controls?.textContent).not.toContain("Пройден");
    expect(fetcher.mock.calls.filter(([_,req])=>req.method==="POST")).toHaveLength(0);
  });
  it("PRACTICE uses shared olive PrimaryButton and writes only on deliberate click",async()=>{
    step={...step,status:"NOT_STARTED",type:"PRACTICE"};
    await act(async()=>root.render(<QueryClientProvider client={cache}>
      <div className="gafus-app"><section className="training-day-viewer--next">
        <TrainingProgressConnected userId="owner_A" courseType="IMPULSE_CONTROL"
          day={day} stepSelection={{index:0,id:"step_01"}} />
      </section></div>
    </QueryClientProvider>));
    await tick();
    const button=node.querySelector<HTMLButtonElement>(".training-next-practice-complete");
    expect(button).not.toBeNull();
    expect(button?.getAttribute("data-gafus-shared-button")).toBe("primary");
    expect(button?.classList.contains("gafus-primary-button")).toBe(true);
    expect(button?.textContent?.trim()).toBe("Я выполнил");
    expect(button?.getAttribute("aria-label")).toContain("Я выполнил");
    expect(fetcher.mock.calls.filter(([_,req])=>req.method==="POST")).toHaveLength(0);
    await act(async()=>button?.click());await tick();
    const posts=fetcher.mock.calls.filter(([_,req])=>req.method==="POST");
    expect(posts).toHaveLength(1);
    expect(posts[0][0]).toBe("/api/v1/training/step/complete/practice");
    expect(node.querySelector(".training-next-practice-completed-wrap")?.textContent)
      .toContain("Упражнение выполнено");
  });
  it("expanded completed THEORY has no duplicated status line, standalone status remains",async()=>{
    step={...step,status:"COMPLETED",type:"THEORY"};
    await act(async()=>root.render(<QueryClientProvider client={cache}>
      <TrainingProgressConnected userId="owner_A" courseType="IMPULSE_CONTROL"
        day={day} stepSelection={{index:0,id:"step_01"}} />
    </QueryClientProvider>));
    await tick();
    const row=node.querySelector(".training-progress-inline-step");
    expect(row).not.toBeNull();
    expect(row?.textContent).not.toContain("Пройден");
    expect(row?.querySelector("p")).toBeNull();
    expect(row?.querySelector("strong")).toBeNull();
    expect(row?.querySelector(".training-next-practice-completed")).toBeNull();
    await act(async()=>root.render(<QueryClientProvider client={cache}>
      <TrainingProgressConnected userId="owner_A" courseType="IMPULSE_CONTROL"
        day={day} />
    </QueryClientProvider>));
    await tick();
    expect(node.textContent).toContain("Пройден");
  });
  it("start, pause, resume, finish persist after fresh GET without optimistic status", async () => {
    await mount();
    expect(node.textContent).toContain("Не начат");
    expect(node.innerHTML).not.toContain("PRIVATE STEP CONTENT");
    await click("Начать");
    expect(node.textContent).not.toContain("Состояние шага сохранено");
    expect(node.textContent).toContain("В процессе");
    await click("Пауза");
    expect(node.textContent).toContain("На паузе");
    await click("Продолжить");
    expect(node.textContent).toContain("В процессе");
    expect(node.querySelector('button[aria-label="Завершить: Команда рядом"]')).toBeNull();
    expect(node.textContent).toContain("В процессе");
    const writes = fetcher.mock.calls.filter(([_, init]) => init.method === "POST");
    expect(writes.map(([url]) => url)).toEqual([
      "/api/v1/training/step/start", "/api/v1/training/step/pause",
      "/api/v1/training/step/resume",
    ]);
  });
  it("restores a source wall-clock end after reload and auto-completes exactly once", async () => {
    step = {...step,status:"IN_PROGRESS",isPausedOnServer:false};
    const key = timerStorageKey("owner_A",day.courseId,day.dayOnCourseId,"occurrence_01");
    window.localStorage.setItem(key, JSON.stringify({
      initial:120,startedAt:Date.now()-125_000,
    }));
    await mount(); await tick();
    expect(step.status).toBe("COMPLETED");
    expect(node.textContent).toContain("Пройден");
    expect(fetcher.mock.calls.filter(([url,req]) =>
      url==="/api/v1/training/step/complete/practice" && req.method==="POST"))
      .toHaveLength(1);
    expect(window.localStorage.getItem(key)).toBeNull();
    expect(node.querySelector('button[aria-label="Начать заново: Команда рядом"]'))
      .not.toBeNull();
    await click("Начать заново");
    expect(node.textContent).toContain("Сброшен");
  });

  it("a live 2-second TRAINING timer reaches zero and completes without a manual click", async () => {
    step = {...step,durationSec:2};
    vi.useFakeTimers({toFake:["Date","setInterval","clearInterval"]});
    await mount();
    await click("Начать");
    expect(step.status).toBe("IN_PROGRESS");
    expect(node.querySelector('button[aria-label="Завершить: Команда рядом"]')).toBeNull();
    await act(async()=>{ await vi.advanceTimersByTimeAsync(3200); });
    await tick();
    expect(step.status).toBe("COMPLETED");
    expect(fetcher.mock.calls.filter(([url,req]) =>
      url==="/api/v1/training/step/complete/practice" && req.method==="POST"))
      .toHaveLength(1);
    expect(node.textContent).toContain("Пройден");
  });

  it("timer started in expanded step is completed by hidden monitor after accordion collapses", async () => {
    step = {...step,durationSec:2};
    vi.useFakeTimers({toFake:["Date","setInterval","clearInterval"]});
    const panels=(opened:boolean)=><QueryClientProvider client={cache}>
      <TrainingProgressConnected userId="owner_A" courseType="IMPULSE_CONTROL"
        day={day} monitorOnly />
      {opened&&<TrainingProgressConnected userId="owner_A"
        courseType="IMPULSE_CONTROL" day={day} delegatedExpiry
        stepSelection={{index:0,id:"step_01"}}/>}
    </QueryClientProvider>;
    await act(async()=>root.render(panels(true)));
    await tick();
    await click("Начать");
    expect(step.status).toBe("IN_PROGRESS");
    await act(async()=>root.render(panels(false)));
    await act(async()=>{await vi.advanceTimersByTimeAsync(3200);});
    await tick();
    expect(step.status).toBe("COMPLETED");
    expect(fetcher.mock.calls.filter(([url,req])=>
      url==="/api/v1/training/step/complete/practice"&&req.method==="POST"))
      .toHaveLength(1);
  });
  it("zero-second BREAK completes immediately after verified server start", async () => {
    step = {...step,type:"BREAK",durationSec:0,remainingSecOnServer:0};
    await mount();
    await click("Начать");await tick();await tick();
    expect(step.status).toBe("COMPLETED");
    expect(fetcher.mock.calls.filter(([url,req]) =>
      url==="/api/v1/training/step/complete/practice" && req.method==="POST"))
      .toHaveLength(1);
  });
  it("timer expiry 409 never mutates displayed status or retries automatically", async () => {
    timerCompletionFails = true;
    step = {...step,status:"IN_PROGRESS"};
    window.localStorage.setItem(
      timerStorageKey("owner_A",day.courseId,day.dayOnCourseId,"occurrence_01"),
      JSON.stringify({initial:120,startedAt:Date.now()-126_000}),
    );
    await mount();await tick();await tick();
    expect(step.status).toBe("IN_PROGRESS");
    expect(node.textContent).toContain("Шаг уже изменён на сервере");
    expect(node.textContent).not.toContain("Пройден");
    expect(fetcher.mock.calls.filter(([url,req]) =>
      url==="/api/v1/training/step/complete/practice" && req.method==="POST"))
      .toHaveLength(1);
  });
  it("lost timer completion ACK fails closed even if server has committed", async () => {
    timerCompletionLosesAck = true;
    step = {...step,status:"IN_PROGRESS"};
    window.localStorage.setItem(
      timerStorageKey("owner_A",day.courseId,day.dayOnCourseId,"occurrence_01"),
      JSON.stringify({initial:120,startedAt:Date.now()-126_000}),
    );
    await mount();await tick();
    expect(step.status).toBe("COMPLETED");
    expect(node.textContent).toContain("Результат записи не подтверждён");
    expect(fetcher.mock.calls.filter(([url,req]) =>
      url==="/api/v1/training/step/complete/practice" && req.method==="POST"))
      .toHaveLength(1);
  });

  it("day-level monitor completes expired timer with accordion closed and renders no second list", async () => {
    step = {...step,status:"IN_PROGRESS"};
    window.localStorage.setItem(
      timerStorageKey("owner_A",day.courseId,day.dayOnCourseId,"occurrence_01"),
      JSON.stringify({initial:120,startedAt:Date.now()-130_000}),
    );
    await act(async()=>root.render(<QueryClientProvider client={cache}>
      <TrainingProgressConnected userId="owner_A" courseType="IMPULSE_CONTROL"
        day={day} monitorOnly />
    </QueryClientProvider>));
    await tick();await tick();
    expect(step.status).toBe("COMPLETED");
    expect(node.textContent).toBe("");
    expect(fetcher.mock.calls.filter(([url,req]) =>
      url==="/api/v1/training/step/complete/practice" && req.method==="POST"))
      .toHaveLength(1);
  });
  it("server-authoritative expired timer completes on a second device without local storage", async () => {
    step={...step,status:"IN_PROGRESS"};
    serverClockExpiryOffsetMs=-2000;
    await mount();await tick();
    expect(step.status).toBe("COMPLETED");
    expect(fetcher.mock.calls.filter(([url,req]) =>
      url === "/api/v1/training/step/complete/practice" && req.method === "POST"))
      .toHaveLength(1);
  });
  it("unrecognized other-device timer never auto-completes from a guessed start time", async () => {
    step = {...step,status:"IN_PROGRESS"};
    await act(async()=>root.render(<QueryClientProvider client={cache}>
      <TrainingProgressConnected userId="owner_A" courseType="IMPULSE_CONTROL"
        day={day} monitorOnly />
    </QueryClientProvider>));
    await tick();
    expect(fetcher.mock.calls.some(([_,req])=>req.method==="POST")).toBe(false);
    expect(window.localStorage.getItem(
      timerStorageKey("owner_A",day.courseId,day.dayOnCourseId,"occurrence_01")
    )).toBeNull();
  });

  it("theory read-end turns the open header green without remounting its text or scrolling", async () => {
    step = { ...step, type: "THEORY", status: "NOT_STARTED" };
    const dayRead = vi.fn(async (): Promise<TrainingDayDetail> => ({
      trainingDayId: day.trainingDayId, dayOnCourseId: day.dayOnCourseId,
      courseId: day.courseId, title: day.title, type: "TRAINING",
      description: "Описание дня", userStatus: "IN_PROGRESS",
      steps: [{ id: step.id, title: step.title, description: "Большая теория. ".repeat(150),
        type: "THEORY", status: "NOT_STARTED", locked: false,
        order: 0, durationSec: 0, videoUrl: null, imageUrls: [] }],
    }));
    await act(async () => root.render(<QueryClientProvider client={cache}>
      <TrainingDayViewer userId="owner_A" courseType="IMPULSE_CONTROL"
        day={day} onBack={vi.fn()} loadDay={dayRead} enableConnectedProgress />
    </QueryClientProvider>));
    await tick();
    const header = node.querySelector<HTMLButtonElement>(".training-next-step-header");
    expect(header).not.toBeNull();
    await act(async () => header?.click());
    await tick();
    const panel = node.querySelector<HTMLElement>(".training-next-step-content");
    const description = node.querySelector<HTMLElement>(".training-step-description");
    expect(panel).not.toBeNull();
    expect(description?.textContent).toContain("Большая теория");
    const button = [...node.querySelectorAll<HTMLButtonElement>("button")]
      .find(item => item.textContent === "Я дочитал шаг");
    expect(button).not.toBeUndefined();
    await act(async () => button?.click());
    for (let i = 0; i < 20 && !node.querySelector(".training-theory-read-badge"); i++)
      await tick();
    expect(fetcher.mock.calls.filter(([url,req]) =>
      url === "/api/v1/training/step/complete/theory" && req.method === "POST"))
      .toHaveLength(1);
    expect(node.querySelector(".training-theory-read-badge")?.textContent)
      .toContain("Прочитано");
    expect(node.querySelector(".training-next-step-card")?.getAttribute("data-status"))
      .toBe("COMPLETED");
    expect(header?.getAttribute("aria-expanded")).toBe("true");
    expect(node.querySelector(".training-next-step-content")).toBe(panel);
    expect(node.querySelector(".training-step-description")).toBe(description);
    expect(dayRead).toHaveBeenCalledTimes(1);
  });

  it("THEORY does not complete when opened, only after a real reading-end signal", async () => {
    step = {...step,type:"THEORY",status:"NOT_STARTED"};
    const renderAt = async (hasRead:boolean) => {
      await act(async()=>root.render(<QueryClientProvider client={cache}>
        <TheoryReadingContext.Provider value={hasRead}>
          <TrainingProgressConnected userId="owner_A" courseType="IMPULSE_CONTROL"
            day={day} stepSelection={{index:0,id:"step_01"}} />
        </TheoryReadingContext.Provider>
      </QueryClientProvider>));
      await tick();
    };
    await renderAt(false);
    expect(step.status).toBe("NOT_STARTED");
    expect(fetcher.mock.calls.every(([_,req])=>req.method==="GET")).toBe(true);
    await renderAt(true);await tick();
    expect(step.status).toBe("COMPLETED");
    await renderAt(true);
    expect(fetcher.mock.calls.filter(([url,req])=>
      url==="/api/v1/training/step/complete/theory" && req.method==="POST"))
      .toHaveLength(1);
  });

  it("other running timed step blocks start without sending a POST", async () => {
    otherSteps=[{...originalStep,id:"step_02",stepOnDayId:"occurrence_02",
      title:"Второй таймер",order:1,status:"IN_PROGRESS"}];
    await mount();
    await click("Начать");
    expect(node.textContent).toContain("Один шаг уже активен");
    expect(fetcher.mock.calls.filter(([_,req])=>req.method==="POST")).toHaveLength(0);
  });

  it("missing binding leaves visible explanation but sends no POST", async () => {
    missingBinding = true; await mount();
    expect(node.textContent).toContain("Сервер пока не подтвердил привязку");
    expect(node.textContent).not.toContain("Начать");
    expect(fetcher.mock.calls.every(([_, init]) => init.method === "GET")).toBe(true);
  });
  it("stale occurrence changed between GETs aborts without POST", async () => {
    await mount(); staleOccurrence = true;
    await click("Начать");
    expect(node.textContent).toContain("Состав или состояние шага изменились");
    expect(fetcher.mock.calls.filter(([_, init]) => init.method === "POST")).toHaveLength(0);
  });
  it("409 does not fake success or automatically retry POST", async () => {
    failPost = true; await mount();
    await click("Начать");
    expect(node.textContent).toContain("Шаг уже изменён на сервере");
    expect(node.textContent).not.toContain("Состояние шага сохранено");
    expect(fetcher.mock.calls.filter(([_, init]) => init.method === "POST")).toHaveLength(1);
  });
  it("unknown POST ACK after server commit blocks another write even after a successful GET", async () => {
    lostAckAfterCommit = true; await mount();
    await click("Начать");
    expect(node.textContent).toContain("Результат записи не подтверждён");
    const pause = node.querySelector<HTMLButtonElement>('button[aria-label="Пауза: Команда рядом"]');
    expect(pause?.disabled).toBe(true);
    await act(async () => pause?.click());
    await tick();
    expect(fetcher.mock.calls.filter(([_, init]) => init.method === "POST")).toHaveLength(1);
    expect(node.textContent).not.toContain("Состояние шага сохранено");
  });
  it("a mismatched fresh owner GET after HTTP200 blocks further mutation until re-entry", async () => {
    staleReadAfterCommit = true; await mount();
    await click("Начать");
    expect(node.textContent).toContain("Повтор заблокирован");
    const start = node.querySelector<HTMLButtonElement>('button[aria-label="Начать: Команда рядом"]');
    expect(start?.disabled).toBe(true);
    await act(async () => start?.click());
    expect(fetcher.mock.calls.filter(([_, init]) => init.method === "POST")).toHaveLength(1);
  });
  it("principal change retires mutation access and private cached data", async () => {
    await mount();
    await act(async () => cache.setQueryData(CURRENT_USER_QUERY_KEY, {
      id: "owner_B", username: "other", role: "USER",
    }));
    await tick();
    expect(node.textContent).toContain("Сессия изменилась");
    expect(node.querySelector('button[aria-label="Начать: Команда рядом"]')).toBeNull();
    expect(fetcher.mock.calls.every(([_, init]) => init.method === "GET")).toBe(true);
  });
});

describe("WEB3 inline source step progress occurrence binding", () => {
  it("renders bound controls in exactly the selected step, no duplicated day", async () => {
    await act(async () => root.render(<QueryClientProvider client={cache}>
      <TrainingProgressConnected userId="owner_A" courseType="IMPULSE_CONTROL"
        day={day} stepSelection={{ index: 0, id: "step_01" }}/>
    </QueryClientProvider>));
    await tick();
    expect(node.querySelectorAll(".training-progress-inline-step")).toHaveLength(1);
    expect(node.querySelector(".training-steps-list")).toBeNull();
    expect(node.textContent).not.toContain("Мой прогресс");
    await click("Начать");
    expect(node.textContent).not.toContain("Состояние шага сохранено");
    expect(fetcher.mock.calls.filter(([_, init]) => init.method === "POST"))
      .toHaveLength(1);
  });
  it("refuses actions when the expanded step index/id no longer matches GET", async () => {
    await act(async () => root.render(<QueryClientProvider client={cache}>
      <TrainingProgressConnected userId="owner_A" courseType="IMPULSE_CONTROL"
        day={day} stepSelection={{ index: 1, id: "step_wrong" }}/>
    </QueryClientProvider>));
    await tick();
    expect(node.textContent).toContain("Идентификатор шага изменился");
    expect(node.querySelector(".training-progress-inline-step")).toBeNull();
    expect(node.querySelector('button[aria-label^="Начать:"]')).toBeNull();
    expect(fetcher.mock.calls.filter(([_, init]) => init.method === "POST"))
      .toHaveLength(0);
  });
});
