import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import {
  createTrainerDayManageRoutes, createTrainerStepManageRoutes,
  type TrainerContentPorts,
} from "./trainer-content-manage";

const id = "step_1";
const dayId = "day_1";
const step = {
  id, title: "Место", description: "Учимся выполнять команду место",
  type: "TRAINING", durationSec: 120, estimatedDurationSec: null,
  videoUrl: null, imageUrls: [], pdfUrls: [], checklist: [],
  requiresVideoReport: false, requiresWrittenFeedback: false,
  hasTestQuestions: false, isDailyCourse: false, surveySlug: null,
};
const day = {
  id: dayId, title: "Первый день", description: "День тренировок",
  type: "regular", equipment: "", showCoursePathExport: false,
  shareProgressAcrossCourses: false, stepLinks: [{ stepId: id, order: 0 }],
  privateLedger: "LEAK_THIS_PRIVATE_FIELD",
};
const noteId = "trainer_1";
type Role = "TRAINER" | "ADMIN" | "MODERATOR" | "USER" | "GUEST";
function setup(role: Role = "TRAINER") {
  const ports = {
    step: {
      read: vi.fn(async () => step),
      update: vi.fn(async () => ({ success: true })),
      remove: vi.fn(async () => ({ success: true })),
    },
    day: {
      read: vi.fn(async () => day),
      update: vi.fn(async () => ({ success: true })),
      remove: vi.fn(async () => ({ success: true })),
      countSteps: vi.fn(async () => 1),
    },
  } as unknown as TrainerContentPorts;
  const app = new Hono();
  app.use("*", async (c, next) => {
    if (role !== "GUEST") c.set("user", { id: noteId, username: "trainer", role });
    await next();
  });
  app.route("/steps/manage", createTrainerStepManageRoutes(ports));
  app.route("/days/manage", createTrainerDayManageRoutes(ports));
  const call = (kind: "steps" | "days", method: "GET" | "PUT" | "DELETE",
    target: string, body?: unknown) =>
    app.request("/" + kind + "/manage/" + target, {
      method, headers: body === undefined ? {} : { "content-type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  return { ports, call, app };
}
const formStep = { ...step, id: undefined };
const formDay = {
  title: day.title, description: day.description, type: day.type,
  equipment: day.equipment, showCoursePathExport: day.showCoursePathExport,
  shareProgressAcrossCourses: day.shareProgressAcrossCourses,
  stepIds: [id],
};
describe("trainer secured step/day edit routes", () => {
  it("reads own step and whitelisted day fields, forwards verified actor", async () => {
    const { call, ports } = setup();
    const stepResponse = await call("steps", "GET", id);
    expect(stepResponse.status).toBe(200);
    expect(stepResponse.headers.get("Cache-Control")).toContain("no-store");
    expect(ports.step.read).toHaveBeenCalledWith(id, { id: noteId, role: "TRAINER" });
    const dayResponse = await call("days", "GET", dayId);
    expect(dayResponse.status).toBe(200);
    expect((await dayResponse.text())).not.toContain("LEAK_THIS_PRIVATE_FIELD");
    expect(ports.day.read).toHaveBeenCalledWith(dayId, { id: noteId, role: "TRAINER" });
  });
  it("updates valid step and day, permits only step IDs from actor-owned list", async () => {
    const { call, ports } = setup();
    expect((await call("steps", "PUT", id, formStep)).status).toBe(200);
    expect(ports.step.update).toHaveBeenCalledWith(
      expect.objectContaining({ id, title: step.title }), { id: noteId, role: "TRAINER" });
    expect((await call("days", "PUT", dayId, formDay)).status).toBe(200);
    expect(ports.day.countSteps).toHaveBeenCalledWith([id], { id: noteId, role: "TRAINER" });
    expect(ports.day.update).toHaveBeenCalledWith(
      { id: dayId, ...formDay }, { id: noteId, role: "TRAINER" });
  });
  it("updates day with repeated steps, validating distinct IDs without collapsing order", async () => {
    const { call, ports } = setup();
    const ids = [id, id, id];
    expect((await call("days", "PUT", dayId, { ...formDay, stepIds: ids })).status).toBe(200);
    expect(ports.day.countSteps).toHaveBeenCalledWith([id], { id: noteId, role: "TRAINER" });
    expect(ports.day.update).toHaveBeenCalledWith({ id: dayId, ...formDay, stepIds: ids },
      { id: noteId, role: "TRAINER" });
  });
  it("denies attempt to attach foreign step IDs", async () => {
    const { call, ports } = setup();
    vi.mocked(ports.day.countSteps).mockResolvedValueOnce(0);
    const res = await call("days", "PUT", dayId, formDay);
    expect(res.status).toBe(404);
    expect(ports.day.update).not.toHaveBeenCalled();
    for (const invalid of [
      { ...formDay, authorId: "foreign-trainer" },
      { ...formDay, stepIds: ["invalid/slash"] },
    ]) expect((await call("days", "PUT", dayId, invalid)).status).toBe(400);
  });
  it("rejects forged ownership, unknown keys, and invalid exercise rules", async () => {
    const { call, ports } = setup();
    const invalid = [
      { ...formStep, authorId: "foreign" },
      { ...formStep, title: "x" },
      { ...formStep, type: "EXAMINATION" },
      { ...formStep, description: "short" },
      { ...formStep, type: "TRAINING", durationSec: null },
    ];
    for (const input of invalid) {
      expect((await call("steps", "PUT", id, input)).status).toBe(400);
    }
    expect(ports.step.update).not.toHaveBeenCalled();
  });
  it("deletes only one actor-scoped entity; rejects client query and body", async () => {
    const { call, ports } = setup("ADMIN");
    expect((await call("steps", "DELETE", id)).status).toBe(200);
    expect(ports.step.remove).toHaveBeenCalledWith(
      { stepIds: [id] }, { id: noteId, role: "ADMIN" });
    expect((await call("days", "DELETE", dayId)).status).toBe(200);
    expect(ports.day.remove).toHaveBeenCalledWith(
      { dayIds: [dayId] }, { id: noteId, role: "ADMIN" });
    expect((await call("steps", "DELETE", id + "?owner=someone")).status).toBe(400);
  });
  it("accepts empty HTTP DELETE body streams but rejects real streamed payloads", async () => {
    const { app, ports } = setup();
    const request = (kind: "steps" | "days", withPayload: boolean) => {
      const chunks = new ReadableStream<Uint8Array>({
        start(controller) {
          if (withPayload) controller.enqueue(new TextEncoder().encode('{"forged":true}'));
          controller.close();
        },
      });
      return new Request("http://local.test/" + kind + "/manage/" +
        (kind === "steps" ? id : dayId), {
        method: "DELETE", body: chunks, duplex: "half",
      } as RequestInit & { duplex: "half" });
    };
    expect((await app.request(request("steps", false))).status).toBe(200);
    expect((await app.request(request("days", false))).status).toBe(200);
    expect((await app.request(request("steps", true))).status).toBe(400);
    expect((await app.request(request("days", true))).status).toBe(400);
    expect(ports.step.remove).toHaveBeenCalledTimes(1);
    expect(ports.day.remove).toHaveBeenCalledTimes(1);
  });

  it("denies moderator and ordinary accounts before Core", async () => {
    for (const role of ["MODERATOR", "USER", "GUEST"] as const) {
      const { call, ports } = setup(role);
      expect((await call("steps", "GET", id)).status).toBe(403);
      expect((await call("days", "PUT", dayId, formDay)).status).toBe(403);
      expect((await call("days", "DELETE", dayId)).status).toBe(403);
      expect(ports.step.read).not.toHaveBeenCalled();
      expect(ports.day.update).not.toHaveBeenCalled();
    }
  });
  it("returns generic failure without leaking Core/ORM errors", async () => {
    const { call, ports } = setup();
    vi.mocked(ports.step.read).mockRejectedValueOnce(Error("PRIVATE_STUDENT"));
    let result = await call("steps", "GET", id);
    expect(result.status).toBe(500);
    expect((await result.text())).not.toContain("PRIVATE_STUDENT");
    vi.mocked(ports.day.remove).mockResolvedValueOnce({ success: false });
    result = await call("days", "DELETE", dayId);
    expect(result.status).toBe(409);
    expect((await result.text())).not.toContain("PRIVATE_STUDENT");
  });
});
