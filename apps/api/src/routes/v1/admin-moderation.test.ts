import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
const f = vi.hoisted(() => ({
  verify: vi.fn(), reg: vi.fn(), feedList: vi.fn(), feedAction: vi.fn(),
  questionList: vi.fn(), questionAction: vi.fn(), questionUnblock: vi.fn(),
}));
vi.mock("@gafus/auth/jwt", () => ({ verifyAccessToken: f.verify }));
vi.mock("@gafus/core/services/auth", () => ({ isRegistrationCompleted: f.reg }));
vi.mock("@gafus/core/services/feed", () => ({
  getAdminFeedReports: f.feedList, moderateAdminFeedReport: f.feedAction,
}));
vi.mock("@gafus/core/services/questions", () => ({
  getQuestionModeration: f.questionList,
  moderateQuestionReport: f.questionAction,
  unblockQuestionsUser: f.questionUnblock,
}));
import { authMiddleware } from "../../middleware/auth";
import { adminModerationRoutes } from "./admin-moderation";
const base = "/api/v1/admin/moderation";
function app() {
  const h = new Hono();
  h.use(`${base}/*`, authMiddleware);
  h.route(base, adminModerationRoutes);
  return h;
}
function req(path: string, method = "GET", body?: object, auth = true) {
  return app().request("http://local.test" + base + path, {
    method, headers: {
      ...(auth ? { authorization: "Bearer token" } : {}),
      ...(body ? { "content-type": "application/json" } : {}),
    }, ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  f.verify.mockResolvedValue({ id: "admin-id", role: "ADMIN", username: "admin" });
  f.reg.mockResolvedValue(true);
  f.feedList.mockResolvedValue({ items: [], nextCursor: null });
  f.feedAction.mockResolvedValue({ id: "report-1" });
  f.questionList.mockResolvedValue({ reports: [], blocks: [], nextPage: null });
  f.questionAction.mockResolvedValue({ id: "qreport1" });
  f.questionUnblock.mockResolvedValue({ userId: "u1" });
});

describe("feed and question admin moderation", () => {
  it("401 unauthenticated cannot list reports", async () => {
    expect((await req("/feed/reports", "GET", undefined, false)).status).toBe(401);
    expect(f.feedList).not.toHaveBeenCalled();
  });
  it("moderator can list and moderate feed report", async () => {
    f.verify.mockResolvedValue({ id: "mod", role: "MODERATOR", username: "mod" });
    const list = await req("/feed/reports?cursor=last123");
    expect(list.status).toBe(200);
    expect(f.feedList).toHaveBeenCalledWith("mod", "last123");
    const action = await req("/feed/reports/report-1", "POST", { action: "hide", reason: "Spam" });
    expect(action.status).toBe(200);
    expect(f.feedAction).toHaveBeenCalledWith("mod", "report-1", { action: "hide", reason: "Spam" });
  });
  it("moderator cannot touch questions moderation", async () => {
    f.verify.mockResolvedValue({ id: "mod", role: "MODERATOR", username: "mod" });
    expect((await req("/questions/reports")).status).toBe(403);
    expect((await req("/questions/blocks/u1", "DELETE")).status).toBe(403);
    expect(f.questionList).not.toHaveBeenCalled();
    expect(f.questionUnblock).not.toHaveBeenCalled();
  });
  it("USER cannot touch either section", async () => {
    f.verify.mockResolvedValue({ id: "user", role: "USER", username: "user" });
    expect((await req("/feed/reports")).status).toBe(403);
    expect((await req("/questions/reports")).status).toBe(403);
    expect(f.feedList).not.toHaveBeenCalled();
  });
  it("rejects malformed cursor and moderation action before Core", async () => {
    expect((await req("/feed/reports?cursor=%20bad")).status).toBe(400);
    expect((await req("/feed/reports/report-1", "POST", {
      action: "DELETE_ALL", reason: "Spam", actorId: "forged",
    })).status).toBe(400);
    expect(f.feedList).not.toHaveBeenCalled();
    expect(f.feedAction).not.toHaveBeenCalled();
  });
  it("GET questions pagination calls Core with JWT actor", async () => {
    const result = await req("/questions/reports?page=3");
    expect(result.status).toBe(200);
    expect(f.questionList).toHaveBeenCalledWith("admin-id", 3);
  });
  it("rejects invalid question page", async () => {
    expect((await req("/questions/reports?page=10001")).status).toBe(400);
    expect(f.questionList).not.toHaveBeenCalled();
  });
  it("POST question moderation preserves all Core action fields", async () => {
    const result = await req("/questions/reports", "POST", {
      reportId: "report1", action: "block", reason: "Spam",
    });
    expect(result.status).toBe(200);
    expect(f.questionAction).toHaveBeenCalledWith("admin-id", {
      reportId: "report1", action: "block", reason: "Spam",
    });
  });
  it("DELETE question block calls Core actor and user id", async () => {
    const result = await req("/questions/blocks/u1", "DELETE");
    expect(result.status).toBe(200);
    expect(f.questionUnblock).toHaveBeenCalledWith("admin-id", "u1");
  });
  it("maps Core typed 404 to safe code", async () => {
    f.feedAction.mockRejectedValue({ status: 404, code: "NOT_FOUND", message: "secret-internal" });
    const result = await req("/feed/reports/missing", "POST", { action: "hide", reason: "Spam" });
    expect(result.status).toBe(404);
    expect(await result.json()).toEqual({ success: false, code: "NOT_FOUND" });
  });
  it("masks unspecified Core exceptions", async () => {
    f.questionList.mockRejectedValue(new Error("internal sql secret"));
    const result = await req("/questions/reports");
    expect(result.status).toBe(503);
    expect(await result.text()).not.toContain("internal sql secret");
  });
});
