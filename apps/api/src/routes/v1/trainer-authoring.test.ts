import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import { createTrainerAuthoringRoutes, type TrainerAuthoringPorts } from "./trainer-authoring";

const make = (
  role: "TRAINER" | "ADMIN" | "MODERATOR" | "USER" | "PARTNER" = "TRAINER",
) => {
  const ports: TrainerAuthoringPorts = {
    createCourse: vi.fn(async (input: { id: string }) => ({ success: true, id: input.id })),
    countOwnedDays: vi.fn(async (ids: string[]) => ids.length),
    createArticle: vi.fn(async () => ({ success: true, data: { id: "article-1", slug: "lesson" } })),
    createStep: vi.fn(async () => ({ success: true })),
    createDay: vi.fn(async () => ({ success: true, dayId: "new-day" })),
    countOwnedSteps: vi.fn(async (ids: string[]) => ids.length),
  };
  const app = new Hono();
  app.use("/*", async (c, next) => {
    c.set("user", { id: "trainer-A", role, username: "test_author" });
    await next();
  });
  app.route("/authoring", createTrainerAuthoringRoutes(ports));
  const post = (path: string, body: unknown, type = "application/json") =>
    app.request(`/authoring/${path}`, {
      method: "POST", headers: { "content-type": type }, body: JSON.stringify(body),
    });
  return { ports, post };
};
const step = {
  title: "Тренировка внимания", description: "Подробный план упражнения по шагам",
  type: "TRAINING", durationSec: 90, estimatedDurationSec: null,
  videoUrl: null, imageUrls: [], pdfUrls: [], checklist: null,
  requiresVideoReport: false, requiresWrittenFeedback: false,
  hasTestQuestions: false, surveySlug: null, isDailyCourse: false,
};
const day = {
  title: "Тренировка на улице", description: "День практики", type: "regular",
  equipment: "Поводок", showCoursePathExport: false,
  shareProgressAcrossCourses: false, stepIds: ["step-A", "step-B"],
};

describe("trainer authoring API source parity, no production DB / no real writes", () => {
  it("creates validated step with server ID and authenticated author, not JSON authorId", async () => {
    const { post, ports } = make();
    const response = await post("steps", step);
    expect(response.status).toBe(201);
    const body = await response.json() as { data: { id: string } };
    expect(body.data.id).toMatch(
      /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/,
    );
    expect(ports.createStep).toHaveBeenCalledWith({ ...step, id: body.data.id }, "trainer-A");
  });
  it("rejects client ID, authorId, malformed training durations and no exam mechanisms", async () => {
    const { post, ports } = make();
    for (const payload of [
      { ...step, id: "client-forged" },
      { ...step, authorId: "another-user" },
      { ...step, durationSec: null },
      { ...step, type: "EXAMINATION", durationSec: null },
    ]) expect((await post("steps", payload)).status).toBe(400);
    expect(ports.createStep).not.toHaveBeenCalled();
  });
  it("denies moderators and users all writes before calling any port", async () => {
    for (const role of ["MODERATOR", "USER", "PARTNER"] as const) {
      const { post, ports } = make(role);
      expect((await post("steps", step)).status).toBe(403);
      expect((await post("days", day)).status).toBe(403);
      expect(ports.createStep).not.toHaveBeenCalled();
      expect(ports.createDay).not.toHaveBeenCalled();
      expect(ports.countOwnedSteps).not.toHaveBeenCalled();
    }
  });
  it("creates day only after checking exact step ownership, never accepts authorId", async () => {
    const { post, ports } = make();
    const response = await post("days", day);
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ success: true, data: { id: "new-day" } });
    expect(ports.countOwnedSteps).toHaveBeenCalledWith(day.stepIds, "trainer-A", false);
    expect(ports.createDay).toHaveBeenCalledWith({ ...day, authorId: "trainer-A" });
    expect((await post("days", { ...day, authorId: "someone-else" })).status).toBe(400);
  });
  it("rejects foreign/missing IDs, duplicates and mixed-owner joins with no writes", async () => {
    const { post, ports } = make();
    vi.mocked(ports.countOwnedSteps).mockResolvedValue(1);
    expect((await post("days", day)).status).toBe(404);
    for (const invalid of [
      { ...day, stepIds: ["step-A", "step-A"] },
      { ...day, stepIds: "step-A" },
      { ...day, title: "" },
      { ...day, stepIds: [], extraPermission: true },
    ]) expect((await post("days", invalid)).status).toBe(400);
    expect(ports.createDay).not.toHaveBeenCalled();
  });
  it("admin may attach visible staff steps; Core failure yields 500 without false success", async () => {
    const { post, ports } = make("ADMIN");
    expect((await post("days", day)).status).toBe(201);
    expect(ports.countOwnedSteps).toHaveBeenCalledWith(day.stepIds, "trainer-A", true);
    vi.mocked(ports.createDay).mockRejectedValueOnce(new Error("PRIVATE_DB_SECRET"));
    const response = await post("days", day);
    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain("PRIVATE_DB_SECRET");
  });
  it("creates ordinary free public course with server ID and linked own days", async () => {
    const { post, ports } = make();
    const payload = {
      name: "Начальные команды", guideContent: null, shortDesc: "Для новичков",
      description: "Учимся командам", duration: "2 недели", videoUrl: null,
      logoImg: "", isPublic: true, isPaid: false, showInProfile: true,
      isPersonalized: false, trainingDays: ["own-day-A"], allowedUsers: [],
      equipment: "Поводок", trainingLevel: "BEGINNER",
    };
    const response = await post("courses", payload);
    expect(response.status).toBe(201);
    const data = await response.json() as { data: { id: string } };
    expect(data.data.id).toBeTruthy();
    expect(ports.countOwnedDays).toHaveBeenCalledWith(["own-day-A"], "trainer-A", false);
    expect(ports.createCourse).toHaveBeenCalledWith({ ...payload, id: data.data.id }, "trainer-A");
    for (const invalid of [
      { ...payload, id: "client" },
      { ...payload, authorId: "foreign" },
      { ...payload, isPaid: true },
      { ...payload, isPublic: false },
      { ...payload, trainingDays: ["own-day-A", "own-day-A"] },
    ]) expect((await post("courses", invalid)).status).toBe(400);
    expect(ports.createCourse).toHaveBeenCalledTimes(1);
  });
  it("foreign course days fail before Core create with no error content leak", async () => {
    const { post, ports } = make();
    vi.mocked(ports.countOwnedDays).mockResolvedValueOnce(0);
    const response = await post("courses", {
      name: "Учимся", duration: "2 недели", logoImg: "", isPublic: true,
      isPaid: false, videoUrl: null, allowedUsers: [], trainingDays: ["foreign-day"],
    });
    expect(response.status).toBe(404);
    expect(ports.createCourse).not.toHaveBeenCalled();
  });

  it("creates subscriber-only article through sanitized Core with actor-owned identity", async () => {
    const { post, ports } = make();
    const data = {
      title: "Первые команды", slug: "lesson", contentType: "HTML", content: "<h2>Тест</h2>",
      visibility: "PAID", description: "Курс по командам", logoImg: "", imageUrls: [],
      videoUrl: null,
    };
    const response = await post("articles", data);
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      success: true, data: { id: "article-1", slug: "lesson" },
    });
    expect(ports.createArticle).toHaveBeenCalledWith(data, "trainer-A");
    for (const invalid of [
      { ...data, visibility: "PUBLIC" },
      { ...data, authorId: "other" },
      { ...data, id: "forged" },
      { ...data, slug: "bad slug" },
      { ...data, description: "" },
    ]) expect((await post("articles", invalid)).status).toBe(400);
    expect(ports.createArticle).toHaveBeenCalledTimes(1);
  });
  it("denies moderator article writes and never surfaces private Core errors", async () => {
    const denied = make("MODERATOR");
    expect((await denied.post("articles", { title: "X" })).status).toBe(403);
    expect(denied.ports.createArticle).not.toHaveBeenCalled();
    const { ports, post } = make();
    vi.mocked(ports.createArticle).mockRejectedValue(new Error("DB_PRIVATE_ARTICLE"));
    const response = await post("articles", {
      title: "Учимся", slug: "lesson", content: "Статья", visibility: "PAID",
      description: "Описание статьи",
    });
    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain("DB_PRIVATE_ARTICLE");
  });

  it("only JSON and no unrecognized query parameters accepted", async () => {
    const { post, ports } = make();
    expect((await post("steps", step, "text/plain")).status).toBe(400);
    const response = await post("days?authorId=other", day);
    expect(response.status).toBe(400);
    expect(ports.createDay).not.toHaveBeenCalled();
  });
});
