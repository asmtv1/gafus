import { afterEach, describe, expect, it, vi } from "vitest";
import type { DailyToday } from "./dailyCourseApi";
import { boundTimerSeconds, dailyAvailableActions, getDailyBoundDay, projectDailyBoundDay,
  updateDailyBoundStep } from "./dailyBoundProgressApi";

const today: DailyToday = {
  mskDate: "2026-10-25", scheduleId: "schedule_01", userStatus: "IN_PROGRESS",
  day: { id: "day_01", title: "День", description: "Учимся", type: "PRACTICE",
    estimatedDuration: 4, theoryMinutes: 0, stepsCount: 1 },
  stepsSummary: { total: 1, completed: 0 },
};
const step = (fields: Record<string, unknown> = {}) => ({
  id: "us_private", stepId: "step_01", bundleStepId: "bundle_step_01", stepIndex: 0,
  status: "NOT_STARTED", isPausedOnServer: false, remainingSec: null,
  step: { id: "step_01", title: "Команда рядом", type: "PRACTICE", durationSec: 60,
    pdfUrls: ["https://cdn.example/private.pdf"], requiresVideoReport: true,
    SECRET_MEDICAL_RECORD: "secret" },
  ...fields,
});
const detail = (fields: Record<string, unknown> = {}) => ({
  scheduleId: today.scheduleId, mskDate: today.mskDate,
  trainingDayId: today.day!.id, bundleId: today.day!.id,
  onlineStepBinding: "BUNDLE_STEP_ID_V1", steps: [step()], ...fields,
});
const ok = (data?: unknown, status = 200) => new Response(JSON.stringify({
  success: status < 400, data, code: status === 409 ? "STALE_STEP_BINDING" : undefined,
}), { status });
afterEach(() => vi.unstubAllGlobals());
describe("real Hono bundle occurrence and Moscow-day Web progress contract", () => {
  it("validates same schedule, day and immutable bundleStepId without leaking media", () => {
    const parsed = projectDailyBoundDay(detail(), today);
    expect(parsed.available).toBe(true);
    expect(parsed.steps[0]).toMatchObject({ id: "step_01", bundleStepId: "bundle_step_01",
      status: "NOT_STARTED", paused: false, stepIndex: 0, durationSec: 60 });
    expect(JSON.stringify(parsed)).not.toContain("cdn.example");
    expect(JSON.stringify(parsed)).not.toContain("SECRET_MEDICAL_RECORD");
    expect(JSON.stringify(parsed)).not.toContain("us_private");
  });
  it("monotonic countdown uses persisted Hono serverNow/expiry instead of client wall clock", () => {
    const original = projectDailyBoundDay(detail({
      serverNow: "2026-10-25T12:00:00.000Z",
      steps: [step({ status: "IN_PROGRESS", remainingSecOnServer: 30,
        step: {id:"step_01",title:"Таймер",type:"TRAINING",durationSec:30},
        timerSnapshot: { remainingSecAtServerNow: 21,
          expiresAt: "2026-10-25T12:00:21.000Z" } })],
    }), today);
    const running = original.steps[0]!;
    expect(running.remainingSec).toBe(30); // persisted base is NOT the live timer
    expect(boundTimerSeconds(running, original, original.receivedAtMonotonicMs)).toBe(21);
    expect(boundTimerSeconds(running, original, original.receivedAtMonotonicMs + 7000)).toBe(14);
    expect(boundTimerSeconds(running, original, original.receivedAtMonotonicMs + 200_000)).toBe(0);
    expect(JSON.stringify(original)).not.toContain("us_private");
    expect(Object.keys(original)).not.toContain("timerSnapshot");
  });
  it("paused timer stays fixed and invalid snapshots are rejected before any write", () => {
    const paused = projectDailyBoundDay(detail({
      serverNow: "2026-10-25T12:00:00.000Z",
      steps: [step({ status: "IN_PROGRESS", isPausedOnServer: true,
        step: {id:"step_01",title:"Таймер",type:"TRAINING",durationSec:30},
        timerSnapshot: { remainingSecAtServerNow: 12, expiresAt: null } })],
    }), today);
    expect(boundTimerSeconds(paused.steps[0]!, paused,
      paused.receivedAtMonotonicMs + 500000)).toBe(12);
    expect(() => projectDailyBoundDay(detail({ serverNow: "not-server-ISO" }), today))
      .toThrow("INVALID_DAILY_SERVER_CLOCK");
    expect(() => projectDailyBoundDay(detail({ steps: [step({
      timerSnapshot: { remainingSecAtServerNow: -1, expiresAt: null },
    })] }), today)).toThrow("INVALID_DAILY_TIMER_SNAPSHOT");
    const legacy = projectDailyBoundDay(detail(), today);
    expect(boundTimerSeconds(legacy.steps[0]!, legacy,
      legacy.receivedAtMonotonicMs + 10000)).toBeNull();
  });
  it("non-timed PRACTICE does not show fake 00:00 despite an estimated duration", () => {
    const day = projectDailyBoundDay(detail({
      serverNow: "2026-10-25T12:00:00.000Z",
      steps: [step({status:"IN_PROGRESS",remainingSecOnServer:0,
        step: {id:"step_01",title:"Нет таймера",type:"PRACTICE",
          durationSec:null,estimatedDurationSec:240},
        timerSnapshot:{remainingSecAtServerNow:0,expiresAt:"2026-10-25T12:00:00.000Z"},
      })],
    }), today);
    expect(day.steps[0]!.durationSec).toBe(0);
    expect(boundTimerSeconds(day.steps[0]!,day,day.receivedAtMonotonicMs)).toBeNull();
  });
  it("pause uses fresh authoritative remainingSecAtServerNow instead of stale stored base", async () => {
    const current = detail({serverNow:"2026-10-25T12:00:00.000Z",steps:[step({
      status:"IN_PROGRESS",remainingSecOnServer:60,
      step:{id:"step_01",title:"Таймер",type:"TRAINING",durationSec:60},
      timerSnapshot:{remainingSecAtServerNow:43,
        expiresAt:"2026-10-25T12:00:43.000Z"},
    })]});
    const fetcher=vi.fn(async (url:string,init:RequestInit)=>{
      if(url.endsWith("/today"))return ok(today);
      if(url.includes("/day?"))return ok(current);
      if(url.endsWith("/step/pause")){
        expect(JSON.parse(String(init.body))).toMatchObject({
          expectedBundleStepId:"bundle_step_01",expectedStepId:"step_01",
          timeLeftSec:43,
        });
        current.steps=[step({...current.steps[0],isPausedOnServer:true})];
        return ok();
      }
      throw Error("UNEXPECTED_HTTP_"+url);
    });
    vi.stubGlobal("fetch",fetcher);
    const before=projectDailyBoundDay(current,today);
    await updateDailyBoundStep(today,before,before.steps[0]!,"pause");
    expect(fetcher.mock.calls.filter(([_,req])=>req.method==="POST")).toHaveLength(1);
  });
  it("legacy response with no bundle step binding never permits any POST", async () => {
    const raw = projectDailyBoundDay(detail({ onlineStepBinding: undefined }), today);
    expect(raw.available).toBe(false);
    await expect(updateDailyBoundStep(today, raw, raw.steps[0]!, "start"))
      .rejects.toThrow("UNVERIFIED_DAILY_STEP");
  });
  it("validates server GET createIfMissing=false with feature header", async () => {
    const fetcher = vi.fn(async (_url: string, _opts: RequestInit) => ok(detail()));
    vi.stubGlobal("fetch", fetcher);
    expect((await getDailyBoundDay(today)).available).toBe(true);
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/v1/daily-course/day?scheduleId=schedule_01&createIfMissing=false");
    expect(init.method).toBe("GET");
    expect(init.headers).toMatchObject({ "X-Gafus-Web-Daily-Binding": "1" });
  });
  it("preflight and confirmed readback enforce one write and matching IDs", async () => {
    let current = "NOT_STARTED";
    const fetcher = vi.fn(async (url: string, init: RequestInit) => {
      if (url.endsWith("/today")) return ok(today);
      if (url.includes("/day?")) return ok(detail({ steps: [step({ status: current })] }));
      if (url.endsWith("/step/start")) {
        expect(JSON.parse(String(init.body))).toEqual({
          scheduleId: "schedule_01", stepIndex: 0,
          expectedBundleStepId: "bundle_step_01", expectedStepId: "step_01",
          durationSec: 60, status: "IN_PROGRESS",
        });
        expect(init.headers).toMatchObject({ "X-Gafus-Web-Daily-Binding": "1" });
        current = "IN_PROGRESS"; return ok();
      }
      throw Error("UNEXPECTED_HTTP_" + url);
    });
    vi.stubGlobal("fetch", fetcher);
    const before = projectDailyBoundDay(detail(), today);
    const after = await updateDailyBoundStep(today, before, before.steps[0]!, "start");
    expect(after.steps[0]?.status).toBe("IN_PROGRESS");
    expect(fetcher.mock.calls.filter(([_, req]) => req.method === "POST")).toHaveLength(1);
    expect(fetcher).toHaveBeenCalledTimes(5);
  });
  it("Moscow day change rejects before POST", async () => {
    const fetcher = vi.fn(async (_url: string, _init: RequestInit) => ok({
      ...today, mskDate: "2026-10-26",
    }));
    vi.stubGlobal("fetch", fetcher);
    const before = projectDailyBoundDay(detail(), today);
    await expect(updateDailyBoundStep(today, before, before.steps[0]!, "start"))
      .rejects.toThrow("DAILY_SCHEDULE_CHANGED");
    expect(fetcher.mock.calls.every(([_, req]) => req.method !== "POST")).toBe(true);
  });
  it("changed occurrence before POST does not mutate the wrong step", async () => {
    const fetcher = vi.fn(async (url: string, _init: RequestInit) =>
      url.endsWith("/today") ? ok(today) : ok(detail({
        steps: [step({ bundleStepId: "bundle_step_new" })],
      })));
    vi.stubGlobal("fetch", fetcher);
    const before = projectDailyBoundDay(detail(), today);
    await expect(updateDailyBoundStep(today, before, before.steps[0]!, "start"))
      .rejects.toThrow("DAILY_STEP_CHANGED");
    expect(fetcher.mock.calls.every(([_, req]) => req.method !== "POST")).toBe(true);
  });
  it("auth principal replacement during preflight prevents POST to the next account", async () => {
    let permit = true;
    let release!: (value: Response) => void;
    const held = new Promise<Response>(resolve => { release = resolve; });
    const fetcher = vi.fn(async (url: string, _init: RequestInit) =>
      url.endsWith("/today") ? held : ok(detail()));
    vi.stubGlobal("fetch", fetcher);
    const before = projectDailyBoundDay(detail(), today);
    const promise = updateDailyBoundStep(today, before, before.steps[0]!, "start",
      () => permit);
    permit = false;
    release(ok(today));
    await expect(promise).rejects.toThrow("DAILY_ACTOR_CHANGED");
    expect(fetcher.mock.calls.every(([_, req]) => req.method !== "POST")).toBe(true);
  });
  it("409 stale response has exactly one POST, never a retry", async () => {
    const fetcher = vi.fn(async (url: string, _init: RequestInit) =>
      url.endsWith("/today") ? ok(today) : url.includes("/day?")
        ? ok(detail()) : ok(undefined, 409));
    vi.stubGlobal("fetch", fetcher);
    const before = projectDailyBoundDay(detail(), today);
    await expect(updateDailyBoundStep(today, before, before.steps[0]!, "start"))
      .rejects.toMatchObject({ status: 409 });
    expect(fetcher.mock.calls.filter(([_, req]) => req.method === "POST")).toHaveLength(1);
  });
  it("post-ACK principal change does not GET another user's daily data", async () => {
    let permit = true;
    const calls: string[] = [];
    const fetcher = vi.fn(async (url: string, _init: RequestInit) => {
      calls.push(url);
      if (url.endsWith("/today")) return ok(today);
      if (url.includes("/day?")) return ok(detail());
      if (url.endsWith("/step/start")) { permit = false; return ok(); }
      throw Error("UNEXPECTED_HTTP_" + url);
    });
    vi.stubGlobal("fetch", fetcher);
    const before = projectDailyBoundDay(detail(), today);
    await expect(updateDailyBoundStep(today, before, before.steps[0]!, "start",
      () => permit)).rejects.toThrow("DAILY_ACTOR_CHANGED");
    expect(calls).toHaveLength(3); // /today, /day, one bound POST, no other owner GET
    expect(fetcher.mock.calls.filter(([_, req]) => req.method === "POST"))
      .toHaveLength(1);
  });
  it("paused status and survey/quiz exclusions match Core semantics", () => {
    const paused = projectDailyBoundDay(detail({ steps: [step({
      status: "IN_PROGRESS", isPausedOnServer: true, remainingSec: 35,
    })] }), today);
    expect(dailyAvailableActions(paused.steps[0]!)).toEqual(["resume", "complete", "reset"]);
    const exam = projectDailyBoundDay(detail({ steps: [step({ step: {
      id: "step_01", title: "Экзамен", type: "EXAMINATION", durationSec: 0,
    } })] }), today);
    expect(dailyAvailableActions(exam.steps[0]!)).toEqual([]);
  });
});
