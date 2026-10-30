import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import { createTrainerExamManageRoutes, type TrainerExamManagePorts } from "./trainer-exam-manage";
import type { ExamResultWithDetails } from "@gafus/core/services/exam";

const fixture = {
  id: "result-1",
  createdAt: new Date("2026-10-26T10:00:00.000Z"),
  reviewedAt: null,
  reviewedBy: null,
  testAnswers: { q1: 2 },
  testScore: 5,
  testMaxScore: 7,
  videoReportUrl: "https://media.example/test.m3u8",
  writtenFeedback: "Пёс сел",
  overallScore: null,
  isPassed: null,
  trainerComment: null,
  userStep: {
    id: "user-step-1",
    status: "IN_PROGRESS",
    stepOnDay: {
      step: {
        title: "Проверка",
        hasTestQuestions: true,
        requiresWrittenFeedback: true,
        requiresVideoReport: true,
      },
    },
    userTraining: {
      user: {
        username: "learner",
        profile: { fullName: "Ученик" },
        email: "PRIVATE@example.invalid",
      },
      dayOnCourse: { course: { name: "Начальный", type: "regular" } },
    },
  },
} as unknown as ExamResultWithDetails;
function make(role: "TRAINER" | "ADMIN" | "MODERATOR" | "USER" | "GUEST" = "TRAINER") {
  const ports = {
    list: vi.fn(async () => [fixture]),
    review: vi.fn(async (): Promise<{ success?: boolean; error?: string }> => ({ success: true })),
  } satisfies TrainerExamManagePorts;
  const app = new Hono();
  app.use("*", async (c, next) => {
    if (role !== "GUEST") c.set("user", { id: "actor-A", role, username: "tester" });
    await next();
  });
  app.route("/review/manage", createTrainerExamManageRoutes(ports));
  const get = (path = "") => app.request("/review/manage" + path);
  const post = (body: unknown, headers = { "content-type": "application/json" }) =>
    app.request("/review/manage/review", {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
  return { ports, get, post };
}
describe("full exam review API actor and privacy boundary", () => {
  it("projects detail fields only, never serializes the Prisma user record", async () => {
    const { get, ports } = make();
    const response = await get();
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    const payload = (await response.json()) as { data: Record<string, unknown>[] };
    expect(payload.data[0]).toMatchObject({
      userStepId: "user-step-1",
      userName: "Ученик",
      courseName: "Начальный",
      testAnswers: { q1: 2 },
      writtenFeedback: "Пёс сел",
    });
    expect(JSON.stringify(payload)).not.toContain("PRIVATE@example.invalid");
    expect(ports.list).toHaveBeenCalledWith("actor-A", { hideCompleted: false }, false);
    const admin = make("ADMIN");
    expect((await admin.get()).status).toBe(200);
    expect(admin.ports.list).toHaveBeenCalledWith("actor-A", { hideCompleted: false }, true);
  });
  it("reviews ordinary or daily step through Core with actor-derived role", async () => {
    for (const role of ["TRAINER", "ADMIN", "MODERATOR"] as const) {
      const { post, ports } = make(role);
      const response = await post({
        userStepId: "user-step-1",
        action: "approve",
        trainerComment: " Отлично ",
      });
      expect(response.status).toBe(200);
      expect(response.headers.get("Cache-Control")).toContain("private");
      expect(ports.review).toHaveBeenCalledWith("actor-A", role, {
        userStepId: "user-step-1",
        action: "approve",
        trainerComment: "Отлично",
      });
    }
  });
  it("denies guests and ordinary users before any Core operation", async () => {
    for (const role of ["USER", "GUEST"] as const) {
      const { get, post, ports } = make(role);
      expect((await get()).status).toBe(403);
      expect((await post({ userStepId: "user-step-1", action: "reject" })).status).toBe(403);
      expect(ports.list).not.toHaveBeenCalled();
      expect(ports.review).not.toHaveBeenCalled();
    }
  });
  it("rejects unknown props, oversized comment, incorrect action and GET query", async () => {
    const { get, post, ports } = make();
    for (const body of [
      { userStepId: "x", action: "pass" },
      { userStepId: "x", action: "approve", reviewerId: "admin" },
      { userStepId: "x", action: "approve", trainerComment: "x".repeat(1001) },
      { action: "reject" },
    ])
      expect((await post(body)).status).toBe(400);
    expect(
      (await post({ userStepId: "x", action: "approve" }, { "content-type": "text/plain" })).status,
    ).toBe(400);
    expect((await get("?trainerId=foreign")).status).toBe(400);
    expect(ports.review).not.toHaveBeenCalled();
    expect(ports.list).not.toHaveBeenCalled();
  });
  it("does not expose private errors or claim a failed Core review is successful", async () => {
    const { get, post, ports } = make();
    ports.review.mockResolvedValueOnce({ success: false, error: "SECRET_FOREIGN_COURSE" });
    let result = await post({ userStepId: "x", action: "reject" });
    expect(result.status).toBe(409);
    expect(JSON.stringify(await result.json())).not.toContain("SECRET_FOREIGN_COURSE");
    ports.list.mockRejectedValueOnce(Error("SECRET_STUDENT"));
    result = await get();
    expect(result.status).toBe(500);
    expect(JSON.stringify(await result.json())).not.toContain("SECRET_STUDENT");
  });
});
