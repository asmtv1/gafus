import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import {
  createTrainerFullCourseRoutes, type TrainerFullCoursePorts,
} from "./trainer-course-full-manage";

const id = "course_1";
const snapshot = {
  id, version: 4, name: "Курс", guideContent: null,
  shortDesc: "", description: "Памятка", duration: "5 дней",
  videoUrl: null, logoImg: "", isPrivate: false, isPaid: false,
  showInProfile: true, isPersonalized: false, equipment: "",
  trainingLevel: "BEGINNER", dayLinks: [], access: [],
};
const input = {
  name: "Обновлённый курс", guideContent: null, shortDesc: "",
  description: "Описание", duration: "7 дней", logoImg: "",
  videoUrl: null, isPublic: true, isPaid: false, showInProfile: true,
  isPersonalized: false, trainingDays: ["day-1"], allowedUsers: [],
  equipment: "", trainingLevel: "BEGINNER", expectedVersion: 4,
};
function make(role: "TRAINER" | "ADMIN" | "MODERATOR" | "USER" = "TRAINER",
  username = "trainer") {
  const ports = {
    snapshot: vi.fn(async () => ({ status: "found" as const, data: snapshot })),
    update: vi.fn(async () => ({ success: true, version: 5 })),
    countDays: vi.fn(async () => 1),
    countUsers: vi.fn(async () => 1),
    create: vi.fn(async (data: { id: string }) => ({ success: true, id: data.id })),
    remove: vi.fn(async () => ({ status: "deleted", logoImg: "" })),
  } as unknown as TrainerFullCoursePorts;
  const app = new Hono();
  app.use("*", async (c, next) => {
    c.set("user", { id: "trainer_A", username, role });
    await next();
  });
  app.route("/courses/manage", createTrainerFullCourseRoutes(ports));
  const post = (body: unknown) => app.request("/courses/manage", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const remove = (body: unknown) => app.request("/courses/manage/" + id, {
    method: "DELETE", headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const put = (body: unknown) => app.request("/courses/manage/" + id, {
    method: "PUT", headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { ports, put, post, remove };
}
describe("trainer full course Hono -> Core CAS boundary", () => {
  it("creates a real full form with server-owned UUID, actor and day validation", async () => {
    const { post, ports } = make();
    const body = { ...input };
    delete (body as { expectedVersion?: number }).expectedVersion;
    const response = await post(body);
    expect(response.status).toBe(201);
    const data = await response.json() as { data: { id: string } };
    expect(data.data.id).toMatch(/^[a-f0-9-]{36}$/);
    expect(ports.create).toHaveBeenCalledWith(
      expect.objectContaining({ id: data.data.id, name: input.name }), "trainer_A");
    expect(ports.countDays).toHaveBeenCalledWith(["day-1"], {
      id: "trainer_A", role: "TRAINER", username: "trainer",
    });
  });
  it("validates private course audience and paid creation permissions", async () => {
    const trainer = make();
    const inputBody: Record<string, unknown> = { ...input };
    delete inputBody.expectedVersion;
    expect((await trainer.post({ ...inputBody, isPaid: true })).status).toBe(403);
    expect((await trainer.post({ ...inputBody, isPublic: false, allowedUsers: ["user-1"] }))
      .status).toBe(201);
    expect(trainer.ports.countUsers).toHaveBeenCalledWith(["user-1"]);
    vi.mocked(trainer.ports.countUsers).mockResolvedValueOnce(0);
    expect((await trainer.post({ ...inputBody, isPublic: false, allowedUsers: ["user-1"] }))
      .status).toBe(400);
    expect((await trainer.post({ ...inputBody, authorId: "foreign" })).status).toBe(400);
    const admin = make("ADMIN");
    expect((await admin.post({ ...inputBody, isPaid: true })).status).toBe(201);
  });
  it("accepts own free course full form with ordered days and version increment", async () => {
    const { put, ports } = make();
    const response = await put(input);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(await response.json()).toEqual({ success: true, data: { id, version: 5 } });
    expect(ports.snapshot).toHaveBeenCalledWith(id, {
      id: "trainer_A", role: "TRAINER", username: "trainer",
    });
    expect(ports.countDays).toHaveBeenCalledWith(["day-1"], {
      id: "trainer_A", role: "TRAINER", username: "trainer",
    });
    expect(ports.update).toHaveBeenCalledWith({ ...input, id }, {
      id: "trainer_A", role: "TRAINER", username: "trainer",
    });
  });
  it("rejects forged owner, invalid URLs and public access list", async () => {
    const { put, ports } = make();
    const invalid = [
      { ...input, authorId: "foreign" },
      { ...input, logoImg: "javascript:alert(1)" },
      { ...input, allowedUsers: ["user-1"] },
      { ...input, expectedVersion: 0 },
    ];
    for (const body of invalid) expect((await put(body)).status).toBe(400);
    expect(ports.update).not.toHaveBeenCalled();
  });
  it("preserves duplicate occurrences in new and edited courses without weakening day ACL", async () => {
    const { post, put, ports } = make();
    const days = ["day-1", "day-1", "day-1"];
    const createBody: Record<string, unknown> = { ...input, trainingDays: days };
    delete createBody.expectedVersion;
    expect((await post(createBody)).status).toBe(201);
    expect(ports.create).toHaveBeenCalledWith(
      expect.objectContaining({ trainingDays: days }), "trainer_A");
    expect(ports.countDays).toHaveBeenLastCalledWith(["day-1"], expect.any(Object));
    expect((await put({ ...input, trainingDays: days })).status).toBe(200);
    expect(ports.update).toHaveBeenCalledWith(
      expect.objectContaining({ trainingDays: days }), expect.any(Object));
    expect(ports.countDays).toHaveBeenLastCalledWith(["day-1"], expect.any(Object));
    vi.mocked(ports.countDays).mockResolvedValueOnce(0);
    expect((await put({ ...input, trainingDays: ["foreign", "foreign"] })).status).toBe(404);
    expect(ports.countDays).toHaveBeenLastCalledWith(["foreign"], expect.any(Object));
    expect(ports.update).toHaveBeenCalledTimes(1);
  });
  it("rejects adding foreign day, stale version and hides missing courses", async () => {
    const { put, ports } = make();
    vi.mocked(ports.countDays).mockResolvedValueOnce(0);
    expect((await put(input)).status).toBe(404);
    expect(ports.update).not.toHaveBeenCalled();
    vi.mocked(ports.snapshot).mockResolvedValueOnce({
      status: "found", data: { ...snapshot, version: 5 },
    } as Awaited<ReturnType<TrainerFullCoursePorts["snapshot"]>>);
    expect((await put(input)).status).toBe(409);
    vi.mocked(ports.snapshot).mockResolvedValueOnce({ status: "not_found" });
    expect((await put(input)).status).toBe(404);
    expect(ports.update).not.toHaveBeenCalled();
  });
  it("paid edit requires approved role or trainer username", async () => {
    const ordinary = make();
    expect((await ordinary.put({ ...input, isPaid: true })).status).toBe(403);
    expect(ordinary.ports.update).not.toHaveBeenCalled();
    const admin = make("ADMIN");
    expect((await admin.put({ ...input, isPaid: true })).status).toBe(200);
    const privileged = make("TRAINER", "GaFuS");
    expect((await privileged.put({ ...input, isPaid: true })).status).toBe(200);
    const moderator = make("MODERATOR");
    expect((await moderator.put(input)).status).toBe(403);
  });
  it("deletes only through trusted actor and required exact Course.version", async () => {
    const { remove, ports } = make();
    expect((await remove({ expectedVersion: 4 })).status).toBe(200);
    expect(ports.remove).toHaveBeenCalledWith(id, 4, {
      id: "trainer_A", role: "TRAINER", username: "trainer",
    });
    for (const invalid of [
      { expectedVersion: 4, authorId: "other" },
      { expectedVersion: -1 }, {},
    ]) expect((await remove(invalid)).status).toBe(400);
    expect(ports.remove).toHaveBeenCalledTimes(1);
    vi.mocked(ports.remove).mockResolvedValueOnce({ status: "stale" });
    expect((await remove({ expectedVersion: 4 })).status).toBe(409);
    vi.mocked(ports.remove).mockResolvedValueOnce({ status: "not_found" });
    expect((await remove({ expectedVersion: 4 })).status).toBe(404);
  });
  it("does not acknowledge incorrect CAS revision or leaking Core provider error", async () => {
    const { put, ports } = make();
    vi.mocked(ports.update).mockResolvedValueOnce({ success: true, version: 99 });
    expect((await put(input)).status).toBe(500);
    vi.mocked(ports.update).mockResolvedValueOnce({
      success: false, status: "stale",
    });
    expect((await put(input)).status).toBe(409);
    vi.mocked(ports.update).mockRejectedValueOnce(Error("PRIVATE_DATABASE_SECRET"));
    const response = await put(input);
    expect(response.status).toBe(500);
    expect((await response.text())).not.toContain("PRIVATE_DATABASE_SECRET");
  });
});
