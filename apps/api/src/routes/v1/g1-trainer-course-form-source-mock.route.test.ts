/** COURSE031: source-only Hono route, actual schemas, MOCKED Core write/read ports. */
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  createCourse,
  updateCourse,
  getCourseEditorSnapshot,
} from "@gafus/core/services/trainerCourse";
import {
  createTrainerCourseSchema,
  updateTrainerCourseSchema,
} from "../../../../../packages/core/src/services/trainerCourse/schemas";

// Existing route module's unrelated GET/name reader imports are inert mocks.
vi.mock("@gafus/core/services/trainerCourse", () => ({
  readCourseNameVersion: vi.fn(),
  updateCourseNameVersioned: vi.fn(),
  getCourseDraftWithRelations: vi.fn(),
  getCourseEditorSnapshot: vi.fn(),
}));
import {
  trainerCoursesRoutes,
  createTrainerCourseFormSourceMockRoutes,
} from "./trainer-courses";

type Actor = { id: string; role: "TRAINER" | "ADMIN" | "MODERATOR"; username: string };
const trainer: Actor = { id: "trainer-a", role: "TRAINER", username: "trainer-a" };
const other: Actor = { id: "trainer-b", role: "TRAINER", username: "trainer-b" };
const moderator: Actor = { id: "moderator", role: "MODERATOR", username: "mod" };
const snapshot = () => ({
  id: "course1", version: 4, name: "Old", guideContent: null,
  shortDesc: "", description: "", duration: "1 hour", videoUrl: null,
  logoImg: "", isPrivate: false, isPaid: false, showInProfile: true,
  isPersonalized: false, equipment: "", trainingLevel: "BEGINNER",
  dayLinks: [], access: [],
});
const body = () => ({
  name: "Course", guideContent: null, shortDesc: "", description: "OK",
  duration: "1 hour", videoUrl: null, logoImg: "", isPublic: true,
  isPaid: false, showInProfile: true, isPersonalized: false,
  trainingDays: ["day-one", "day-two"], allowedUsers: [],
  equipment: "leash", trainingLevel: "BEGINNER",
});
const create = vi.fn<typeof createCourse>(async input => ({ success: true, id: input.id }));
const update = vi.fn<typeof updateCourse>(async input => ({
  success: true, version: input.expectedVersion + 1,
}));
const read = vi.fn<typeof getCourseEditorSnapshot>(async () => ({
  status: "found", data: snapshot(),
}));
const ports = {
  create, update, snapshot: read,
  createSchema: createTrainerCourseSchema, updateSchema: updateTrainerCourseSchema,
};
let actor: Actor = trainer;
const app = new Hono();
app.use("*", async (c, next) => {
  c.set("user", actor);
  await next();
});
app.route("/trainer/courses", createTrainerCourseFormSourceMockRoutes({
  mode: "SOURCE_MOCK_ONLY", ports,
}));
const request = (
  method: "POST" | "PUT", value: unknown, url = "/trainer/courses/course1",
  extra?: { type?: string },
) => app.request(method === "POST" ? "/trainer/courses" : url, {
  method,
  headers: { "content-type": extra?.type ?? "application/json" },
  body: JSON.stringify(value),
});
const noWrites = () => {
  expect(create).not.toHaveBeenCalled();
  expect(update).not.toHaveBeenCalled();
};
beforeEach(() => {
  vi.clearAllMocks();
  actor = trainer;
  create.mockImplementation(async input => ({ success: true, id: input.id }));
  update.mockImplementation(async input => ({
    success: true, version: input.expectedVersion + 1,
  }));
  read.mockImplementation(async () => ({ status: "found", data: snapshot() }));
});

describe("COURSE031 mocked-only free public CourseForm transport", () => {
  it("normal registered router is OFF and never calls a Core port", async () => {
    for (const [method, url] of [
      ["POST", "/"], ["PUT", "/course1"],
    ] as const) {
      const r = await trainerCoursesRoutes.request(url, {
        method, headers: { "content-type": "application/json" },
        body: JSON.stringify(body()),
      });
      expect(r.status).toBe(404);
    }
    noWrites();
    expect(read).not.toHaveBeenCalled();
  });
  it("permitted POST generates server UUID, calls mock create once and returns 201 id", async () => {
    const response = await request("POST", body());
    expect(response.status).toBe(201);
    const json = await response.json() as { success: boolean; data: { id: string } };
    expect(json.success).toBe(true);
    expect(json.data.id).toMatch(/^[a-f\d-]{36}$/i);
    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      ...body(), id: json.data.id,
    }), trainer.id);
    expect(update).not.toHaveBeenCalled();
    expect(read).not.toHaveBeenCalled();
  });
  it("permitted PUT checks coherent version/target, calls mock update once and returns 200", async () => {
    const response = await request("PUT", { ...body(), expectedVersion: 4 });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true, data: { id: "course1", version: 5 },
    });
    expect(read).toHaveBeenCalledExactlyOnceWith("course1", {
      id: trainer.id, role: trainer.role,
    });
    expect(update).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ ...body(), id: "course1", expectedVersion: 4 }),
      { id: trainer.id, role: trainer.role },
    );
    expect(create).not.toHaveBeenCalled();
  });
  it.each([
    { isPaid: true }, { isPublic: false }, { logoImg: "https://cdn/x" },
    { videoUrl: "https://cdn/video" }, { allowedUsers: ["user-a"] },
    { authorId: "other" }, { role: "ADMIN" }, { unknown: true },
    { id: "other-course" }, { name: "" },
  ])("rejects forbidden POST fields before ANY Core call %j", async mutation => {
    const response = await request("POST", { ...body(), ...mutation });
    expect(response.status).toBe(400);
    noWrites(); expect(read).not.toHaveBeenCalled();
  });
  it.each([
    { isPaid: true }, { isPublic: false }, { logoImg: "https://cdn/x" },
    { videoUrl: "https://cdn/video" }, { allowedUsers: ["user-a"] },
    { authorId: "other" }, { role: "ADMIN" }, { version: 4 },
    { id: "wrong" }, { expectedVersion: 0 }, { expectedVersion: 4.5 },
    { expectedVersion: 2147483648 },
  ])("rejects forbidden PUT fields before ANY Core call %j", async mutation => {
    const response = await request("PUT", { ...body(), expectedVersion: 4, ...mutation });
    expect(response.status).toBe(400);
    noWrites(); expect(read).not.toHaveBeenCalled();
  });
  it("rejects invalid content type and extra query with zero calls", async () => {
    expect((await request("POST", body(), "", { type: "text/plain" })).status).toBe(400);
    expect((await request("PUT", { ...body(), expectedVersion: 4 },
      "/trainer/courses/course1?mode=edit")).status).toBe(400);
    noWrites(); expect(read).not.toHaveBeenCalled();
  });
  it("forbids unrelated role before all Core calls", async () => {
    actor = moderator;
    expect((await request("POST", body())).status).toBe(403);
    expect((await request("PUT", { ...body(), expectedVersion: 4 })).status).toBe(403);
    noWrites(); expect(read).not.toHaveBeenCalled();
  });
  it("foreign/missing target maps snapshot not_found to 404 without write", async () => {
    actor = other;
    read.mockResolvedValueOnce({ status: "not_found" });
    const response = await request("PUT", { ...body(), expectedVersion: 4 });
    expect(response.status).toBe(404);
    expect(update).not.toHaveBeenCalled();
  });
  it.each([
    { isPaid: true }, { isPrivate: true }, { logoImg: "https://cdn/x" },
    { videoUrl: "https://cdn/video" },
    { access: [{ userId: "x", user: { id: "x", username: "x" } }] },
  ])("rejects existing paid/private/media/access target BEFORE update %j", async fields => {
    read.mockResolvedValueOnce({ status: "found", data: { ...snapshot(), ...fields } });
    const r = await request("PUT", { ...body(), expectedVersion: 4 });
    expect(r.status).toBe(403);noWrites();expect(read).toHaveBeenCalledTimes(1);
  });
  it("snapshot changed since pinned version rejects 409 before Core update", async () => {
    read.mockResolvedValueOnce({ status: "found", data: { ...snapshot(), version: 5 } });
    expect((await request("PUT", { ...body(), expectedVersion: 4 })).status).toBe(409);
    noWrites();
  });
  it.each(["stale", "not_found", "invalid", "unknown"] as const)(
    "maps Core update %s without retry", async status => {
      update.mockResolvedValueOnce({ success: false, status, error: "PRIVATE_INTERNAL" });
      const response = await request("PUT", { ...body(), expectedVersion: 4 });
      expect(response.status).toBe({ stale: 409, not_found: 404, invalid: 400,
        unknown: 500 }[status]);
      expect(JSON.stringify(await response.json())).not.toContain("PRIVATE_INTERNAL");
      expect(update).toHaveBeenCalledTimes(1);
    },
  );
  it("malformed success ACK, Core throw, postcommit-ambiguous error never retry", async () => {
    update.mockResolvedValueOnce({ success: true, version: 999 });
    expect((await request("PUT", { ...body(), expectedVersion: 4 })).status).toBe(500);
    update.mockRejectedValueOnce(new Error("DATABASE_DETAILS"));
    expect((await request("PUT", { ...body(), expectedVersion: 4 })).status).toBe(500);
    expect(update).toHaveBeenCalledTimes(2);
    create.mockResolvedValueOnce({ success: false, error: "RAW_DB_ERROR" });
    const response = await request("POST", body());
    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain("RAW_DB_ERROR");
    expect(create).toHaveBeenCalledTimes(1);
  });
  it("snapshot invalid/unknown or malformed data cannot authorize write", async () => {
    read.mockResolvedValueOnce({ status: "unknown" });
    expect((await request("PUT", { ...body(), expectedVersion: 4 })).status).toBe(500);
    noWrites();
  });
});
