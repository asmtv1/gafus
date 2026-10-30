import { afterEach, describe, expect, it, vi } from "vitest";
import type { TrainingDaySummary } from "./trainingDaysApi";
import type { TrainingStepPreview } from "./trainingDayApi";
import {
  initializeLearnerExam, readLearnerExamPreview, readLearnerExam,
  submitLearnerExam, uploadLearnerExamVideo,
} from "./trainingExamApi";

const userStepId = "c" + "u".repeat(24);
const stepId = "c" + "s".repeat(24);
const courseType = "TRAINING_ONE";
const day: TrainingDaySummary = {
  trainingDayId: "day1", dayOnCourseId: "clwdayoc0000000000000001",
  courseId: "course1", title: "День", type: "practice", userStatus: "IN_PROGRESS",
  estimatedDuration: 10, theoryMinutes: 2, equipment: "", isLocked: false,
};
const step: TrainingStepPreview = {
  id: stepId, title: "Экзамен", description: "", type: "EXAMINATION",
  status: "NOT_STARTED", order: 2, durationSec: 0,
  locked: false, videoUrl: null, imageUrls: [],
};
const qs = [{ id: "q1", question: "Какой ответ?", options: ["Нет", "Да"], correctAnswer: 1 }];
const projection = (overrides: Record<string, unknown> = {}) => ({
  courseId: day.courseId, dayOnCourseId: day.dayOnCourseId,
  trainingDayId: "physicalDay", steps: [{
    id: step.id, order: step.order, type: "EXAMINATION", locked: false,
    userStepId, hasTestQuestions: true, checklist: qs,
    requiresWrittenFeedback: true, requiresVideoReport: true,
    ...overrides,
  }],
});
const result = (overrides: Record<string, unknown> = {}) => ({
  id: "exam1", testAnswers: null, writtenFeedback: null, videoReportUrl: null,
  isPassed: null, trainerComment: null,
  ...overrides,
});
const json = (data: unknown, status = 200) => new Response(JSON.stringify({
  success: status === 200, data,
  ...(status !== 200 && { error: "NO_PRIVATE_DATA", code: "NOT_FOUND" }),
}), { status });
afterEach(() => vi.unstubAllGlobals());

describe("learner exam owner-bound existing Hono API", () => {
  it("initializes on explicit click with exact course and step occurrence", async () => {
    const spy = vi.fn().mockResolvedValue(json(projection()));
    vi.stubGlobal("fetch", spy);
    const exam = await initializeLearnerExam(courseType, day, step);
    expect(exam).toEqual({ userStepId, stepId, questions: qs,
      requiresWrittenFeedback: true, requiresVideoReport: true });
    expect(spy).toHaveBeenCalledWith(
      `/api/v1/training/day?courseType=${courseType}&dayOnCourseId=${day.dayOnCourseId}&createIfMissing=true`,
      expect.objectContaining({ method: "GET", credentials: "include" }),
    );
    expect(spy.mock.calls[0][1].headers["X-Gafus-Auth-Transport"]).toBe("cookie");
  });
  it("first-open protected preview reads questions WITHOUT creating a UserStep", async () => {
    const projected=projection({userStepId:undefined});
    const fetcher=vi.fn().mockImplementation(async()=>json(projected));
    vi.stubGlobal("fetch",fetcher);
    expect(await readLearnerExamPreview(courseType,day,step)).toEqual({
      userStepId:null,stepId,questions:qs,
      requiresWrittenFeedback:true,requiresVideoReport:true,
    });
    expect(fetcher).toHaveBeenCalledExactlyOnceWith(
      "/api/v1/training/day?courseType=TRAINING_ONE&dayOnCourseId="+
        day.dayOnCourseId+"&createIfMissing=false",
      expect.objectContaining({method:"GET",credentials:"include"}),
    );
    await expect(initializeLearnerExam(courseType,day,step,false)).rejects
      .toThrow("EXAM_BINDING_UNAVAILABLE");
  });
  it("rejects identity mismatch, locked and malformed checklist before submit", async () => {
    const spy = vi.fn(); vi.stubGlobal("fetch", spy);
    await expect(initializeLearnerExam(courseType, { ...day, isLocked: true }, step))
      .rejects.toThrow("INVALID_EXAM_ACCESS");
    expect(spy).not.toHaveBeenCalled();
    spy.mockResolvedValueOnce(json({ ...projection(), courseId: "wrong" }))
      .mockResolvedValueOnce(json(projection({ userStepId: "otherUser" })))
      .mockResolvedValueOnce(json(projection({ checklist: qs.map(q => ({
        ...q, correctAnswer: 9,
      })) })));
    await expect(initializeLearnerExam(courseType, day, step))
      .rejects.toThrow("EXAM_IDENTITY_MISMATCH");
    await expect(initializeLearnerExam(courseType, day, step))
      .rejects.toThrow("EXAM_BINDING_UNAVAILABLE");
    await expect(initializeLearnerExam(courseType, day, step))
      .rejects.toThrow("EXAM_QUESTIONS_INVALID");
  });
  it("only 404 means absent exam; protected 403 stays an error", async () => {
    const spy = vi.fn().mockResolvedValueOnce(json(null, 404))
      .mockResolvedValueOnce(json(null, 403))
      .mockResolvedValueOnce(json(result({ testAnswers: { q1: 1 } })));
    vi.stubGlobal("fetch", spy);
    expect(await readLearnerExam(userStepId)).toBeNull();
    await expect(readLearnerExam(userStepId)).rejects.toMatchObject({ status: 403 });
    expect((await readLearnerExam(userStepId))?.testAnswers).toEqual({ q1: 1 });
  });
  it("submits answer payload to real exam endpoint without client grade spoof", async () => {
    const spy = vi.fn().mockResolvedValue(json({ success: true, examResultId: "exam1" }));
    vi.stubGlobal("fetch", spy);
    await submitLearnerExam({ userStepId, stepId, testAnswers: { q1: 1 } });
    const [url, options] = spy.mock.calls[0];
    expect(url).toBe("/api/v1/exam/submit");
    expect(options).toMatchObject({ method: "POST", credentials: "include" });
    expect(JSON.parse(options.body)).toEqual({ userStepId, stepId, testAnswers: { q1: 1 } });
    expect(options.body).not.toContain("isPassed");
    await expect(submitLearnerExam({ userStepId, stepId,
      writtenFeedback: "short" })).rejects.toThrow("INVALID_EXAM_SUBMISSION");
    expect(spy).toHaveBeenCalledTimes(1);
  });
  it("video upload uses multipart cookie and server cap, never JSON envelope", async () => {
    const file = new File(["video"], "record.webm", { type: "video/webm" });
    const spy = vi.fn().mockResolvedValue(json({ videoUrl: "https://cdn.example/video.webm" }));
    vi.stubGlobal("fetch", spy);
    expect(await uploadLearnerExamVideo(userStepId, file))
      .toBe("https://cdn.example/video.webm");
    const [url, options] = spy.mock.calls[0];
    expect(url).toBe("/api/v1/exam/upload-video");
    expect(options.body).toBeInstanceOf(FormData);
    expect(options.body.get("userStepId")).toBe(userStepId);
    expect(options.body.get("video")).toBe(file);
    expect(options.headers).not.toHaveProperty("Content-Type");
    expect(options).toMatchObject({ method: "POST", credentials: "include" });
    await expect(uploadLearnerExamVideo(userStepId,
      new File(["wrong"], "wrong.txt", { type: "text/plain" })))
      .rejects.toThrow("INVALID_EXAM_VIDEO");
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
