import { afterEach, describe, expect, it, vi } from "vitest";
import type { TrainingDaySummary } from "./trainingDaysApi";
import {
  actionForStep, getBoundProgressDay, projectBoundProgressDay, writeBoundStep,
} from "./trainingProgressConnectedApi";

const day = {
  trainingDayId: "trainingDay_01", dayOnCourseId: "dayOnCourse_01", courseId: "course_01",
  isLocked: false, title: "День 1", type: "TRAINING",
  userStatus: "NOT_STARTED", estimatedDuration: 12, theoryMinutes: 3, equipment: "",
} as TrainingDaySummary;
const step = (props: Record<string, unknown> = {}) => ({
  id: "step_01", stepOnDayId: "occurrence_01", title: "Команда ко мне",
  status: "NOT_STARTED", locked: false, durationSec: 180, type: "TRAINING",
  order: 0, isPausedOnServer: false,
  description: "SECRET_PRIVATE_STEP", videoUrl: "https://storage.example/secret",
  userStepId: "PRIVATE_USER_STEP", ...props,
});
const raw = (props: Record<string, unknown> = {}) => ({
  courseId: day.courseId, trainingDayId: day.trainingDayId,
  dayOnCourseId: day.dayOnCourseId, onlineStepBinding: "STEP_ON_DAY_ID_V1",
  steps: [step()], ...props,
});
const ok = (data?: unknown, status = 200) => new Response(JSON.stringify({
  success: status < 400, data, code: status === 409 ? "STALE_STEP_BINDING" : undefined,
}), { status });
afterEach(() => vi.unstubAllGlobals());

describe("stable server StepOnDay Web protocol", () => {
  it("projects occurrence, status and duration without private step body/media", () => {
    const parsed = projectBoundProgressDay(raw(), day);
    expect(parsed.available).toBe(true);
    expect(parsed.steps[0]).toMatchObject({
      id: "step_01", stepOnDayId: "occurrence_01", index: 0,
      status: "NOT_STARTED", remainingSec: null,
    });
    expect(JSON.stringify(parsed)).not.toContain("SECRET_PRIVATE_STEP");
    expect(JSON.stringify(parsed)).not.toContain("PRIVATE_USER_STEP");
    expect(JSON.stringify(parsed)).not.toContain("storage.example");
  });
  it("real Core physical Day.id differs from /days DayOnCourse.id but occurrence binding stays exact", () => {
    const parsed=projectBoundProgressDay(raw({trainingDayId:"physicalDay_02",steps:[
      step({id:"template_01",stepOnDayId:"occurrence_01",order:0}),
      step({id:"template_01",stepOnDayId:"occurrence_02",order:9}),
    ]}),day);
    expect(parsed.trainingDayId).toBe("physicalDay_02");
    expect(parsed.available).toBe(true);
    expect(parsed.steps.map(s=>s.stepOnDayId)).toEqual(["occurrence_01","occurrence_02"]);
    expect(()=>projectBoundProgressDay(raw({dayOnCourseId:"foreignDay"}),day)).toThrow();
    expect(()=>projectBoundProgressDay(raw({courseId:"foreignCourse"}),day)).toThrow();
    expect(()=>projectBoundProgressDay(raw({trainingDayId:"../unsafe"}),day)).toThrow();
  });
  it("uses server-issued timer clocks without leaking private fields", () => {
    const time = "2026-10-26T11:00:00.000Z";
    const projected = projectBoundProgressDay(raw({
      serverNow: time,
      steps: [step({
        status: "IN_PROGRESS", remainingSecOnServer: 60,
        timerSnapshot: {
          remainingSecAtServerNow: 18,
          expiresAt: "2026-10-26T11:00:18.000Z",
        },
        secretKey: "PRIVATE_SECRET_CANARY",
      })],
    }), day);
    expect(projected.serverNow).toBe(time);
    expect(projected.steps[0]?.timerSnapshot).toEqual({
      remainingSecAtServerNow: 18, expiresAt: "2026-10-26T11:00:18.000Z",
    });
    expect(JSON.stringify(projected)).not.toContain("PRIVATE_SECRET_CANARY");
    expect(JSON.stringify(projected)).not.toContain("userStepId");
  });
  it("rejects invalid, future-independent, or conflicting server timer snapshots", () => {
    expect(() => projectBoundProgressDay(raw({serverNow: "not-date"}),day))
      .toThrow("INVALID_BOUND_SERVER_TIME");
    for (const timerSnapshot of [
      {remainingSecAtServerNow: -1, expiresAt: null},
      {remainingSecAtServerNow: NaN, expiresAt: null},
      {remainingSecAtServerNow: null, expiresAt: "2026-10-26T11:00:00.000Z"},
      {remainingSecAtServerNow: 4, expiresAt: "invalid"},
    ]) {
      expect(() => projectBoundProgressDay(raw({
        serverNow:"2026-10-26T11:00:00.000Z",
        steps:[step({status:"IN_PROGRESS",timerSnapshot})],
      }),day)).toThrow();
    }
    expect(() => projectBoundProgressDay(raw({
      serverNow:"2026-10-26T11:00:00.000Z",
      steps:[step({status:"COMPLETED",
        timerSnapshot:{remainingSecAtServerNow:0,expiresAt:"2026-10-26T11:00:00.000Z"}})],
    }),day)).toThrow("CONFLICTING_BOUND_TIMER_SNAPSHOT");
  });
  it("missing flag or occurrence blocks all writes; never trusts array index alone", async () => {
    expect(projectBoundProgressDay(raw({ onlineStepBinding: undefined }), day).available)
      .toBe(false);
    const parsed = projectBoundProgressDay(raw({ steps: [step({ stepOnDayId: null })] }), day);
    expect(parsed.available).toBe(false);
    expect(actionForStep(parsed.steps[0]!)).toEqual([]);
    await expect(writeBoundStep(parsed, parsed.steps[0]!, "start")).rejects
      .toThrow("UNVERIFIED_STEP_OCCURRENCE");
  });
  it("reused Step.id on two different StepOnDay occurrences is safe", () => {
    const parsed = projectBoundProgressDay(raw({ steps: [
      step(), step({ stepOnDayId: "occurrence_02", order: 1 }),
    ] }), day);
    expect(parsed.available).toBe(true);
    expect(parsed.steps.map(s => s.stepOnDayId)).toEqual(["occurrence_01", "occurrence_02"]);
    const duplicate = projectBoundProgressDay(raw({ steps: [step(), step({ order: 1 })] }), day);
    expect(duplicate.available).toBe(false);
  });
  it("owner bound GET sends header and never creates UserTraining on read", async () => {
    const fetcher = vi.fn(async () => ok(raw()));
    vi.stubGlobal("fetch", fetcher);
    const result = await getBoundProgressDay("IMPULSE_CONTROL", day);
    expect(result.available).toBe(true);
    const [url, request] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("createIfMissing=false");
    expect(request).toMatchObject({
      method: "GET", credentials: "include",
      headers: expect.objectContaining({ "X-Gafus-Web-Step-Binding": "1" }),
    });
  });
  it("POST start carries matching occurrence and Step.id assertions", async () => {
    const fetcher = vi.fn(async (_url: string, _request: RequestInit) => ok());
    vi.stubGlobal("fetch", fetcher);
    const parsed = projectBoundProgressDay(raw(), day);
    await writeBoundStep(parsed, parsed.steps[0]!, "start");
    const [url, request] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/v1/training/step/start");
    expect(request.method).toBe("POST");
    expect(JSON.parse(String(request.body))).toEqual({
      courseId: day.courseId, dayOnCourseId: day.dayOnCourseId,
      stepIndex: 0, expectedStepOnDayId: "occurrence_01", expectedStepId: "step_01",
      status: "IN_PROGRESS", durationSec: 180,
    });
  });
  it("pause sends remainingSec, never resets server time to initial duration", async () => {
    const fetcher = vi.fn(async (_url: string, _request: RequestInit) => ok()); vi.stubGlobal("fetch", fetcher);
    const parsed = projectBoundProgressDay(raw({
      steps: [step({ status: "IN_PROGRESS", isPausedOnServer: false,
        remainingSecOnServer: 37 })],
    }), day);
    await writeBoundStep(parsed, parsed.steps[0]!, "pause");
    const [, request] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(request.body)).timeLeftSec).toBe(37);
  });
  it("server IN_PROGRESS + paused=true offers Resume after reload", () => {
    const parsed = projectBoundProgressDay(raw({
      steps: [step({ status: "IN_PROGRESS", isPausedOnServer: true,
        remainingSecOnServer: 31 })],
    }), day);
    expect(parsed.available).toBe(true);
    expect(actionForStep(parsed.steps[0]!)).toEqual(["resume", "reset"]);
  });
  it("pause accepts elapsed time that is not greater than server remaining", async () => {
    const fetcher = vi.fn(async (_url: string, _options: RequestInit) => ok());
    vi.stubGlobal("fetch", fetcher);
    const parsed = projectBoundProgressDay(raw({
      steps: [step({ status: "IN_PROGRESS", remainingSecOnServer: 65 })],
    }), day);
    await writeBoundStep(parsed, parsed.steps[0]!, "pause", 42);
    const [, request] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(request.body)).timeLeftSec).toBe(42);
    await expect(writeBoundStep(parsed, parsed.steps[0]!, "pause", 70))
      .rejects.toThrow("INVALID_REMAINING_STEP_TIME");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("source PRACTICE cannot offer a timer and completes only by explicit practice action", async () => {
    for (const status of ["NOT_STARTED", "IN_PROGRESS", "PAUSED", "RESET"] as const) {
      const parsed = projectBoundProgressDay(raw({
        steps: [step({ type: "PRACTICE", status })],
      }), day);
      expect(parsed.available).toBe(true);
      expect(actionForStep(parsed.steps[0]!)).toEqual(["complete/practice"]);
      await expect(writeBoundStep(parsed, parsed.steps[0]!, "start"))
        .rejects.toThrow("UNVERIFIED_STEP_OCCURRENCE");
    }
    const complete = projectBoundProgressDay(raw({
      steps: [step({ type: "PRACTICE", status: "COMPLETED" })],
    }), day);
    expect(actionForStep(complete.steps[0]!)).toEqual([]);
  });
  it("theory completes only through validated theory route", async () => {
    const fetcher = vi.fn(async (_url: string, _request: RequestInit) => ok()); vi.stubGlobal("fetch", fetcher);
    const parsed = projectBoundProgressDay(raw({ steps: [step({ type: "THEORY" })] }), day);
    expect(actionForStep(parsed.steps[0]!)).toEqual(["complete/theory"]);
    await writeBoundStep(parsed, parsed.steps[0]!, "complete/theory");
    expect(fetcher.mock.calls[0]?.[0]).toBe("/api/v1/training/step/complete/theory");
  });
  it("timed TRAINING/BREAK complete only when wall-clock expires and reset after completion", async () => {
    const fetcher = vi.fn(async (_url: string, _init?: RequestInit) => ok());
    vi.stubGlobal("fetch", fetcher);
    for (const type of ["TRAINING", "BREAK"] as const) {
      const running = projectBoundProgressDay(raw({ steps: [
        step({type,status:"IN_PROGRESS",durationSec:30})
      ] }), day);
      expect(actionForStep(running.steps[0]!)).toEqual(["pause","reset"]);
      await expect(writeBoundStep(running,running.steps[0]!,"complete/timer"))
        .rejects.toThrow("UNVERIFIED_STEP_OCCURRENCE");
      await writeBoundStep(running,running.steps[0]!,"complete/timer",0);
      expect(fetcher.mock.calls.at(-1)?.[0]).toBe("/api/v1/training/step/complete/practice");
      const completed = projectBoundProgressDay(raw({ steps: [
        step({type,status:"COMPLETED"})
      ] }), day);
      expect(actionForStep(completed.steps[0]!)).toEqual(["reset"]);
    }
  });
  it("a verified zero-second timer is allowed to finish without waiting a fake minute", async () => {
    const fetcher = vi.fn(async (_url: string) => ok()); vi.stubGlobal("fetch", fetcher);
    const zero=projectBoundProgressDay(raw({steps:[step({durationSec:0,
      remainingSecOnServer:0,status:"IN_PROGRESS",type:"BREAK"})]}),day);
    await writeBoundStep(zero,zero.steps[0]!,"complete/timer",0);
    expect(fetcher.mock.calls[0]?.[0]).toBe("/api/v1/training/step/complete/practice");
  });
  it("exams and survey cannot fake generic completion", () => {
    for (const type of ["EXAMINATION", "DIARY", "SURVEY"]) {
      const parsed = projectBoundProgressDay(raw({ steps: [step({ type })] }), day);
      expect(actionForStep(parsed.steps[0]!)).toEqual([]);
    }
  });
  it("409 STALE_STEP_BINDING is not swallowed and no second write", async () => {
    const fetcher = vi.fn(async (_url: string, _request: RequestInit) => ok(undefined, 409)); vi.stubGlobal("fetch", fetcher);
    const parsed = projectBoundProgressDay(raw(), day);
    await expect(writeBoundStep(parsed, parsed.steps[0]!, "start"))
      .rejects.toMatchObject({ status: 409, code: "STALE_STEP_BINDING" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
