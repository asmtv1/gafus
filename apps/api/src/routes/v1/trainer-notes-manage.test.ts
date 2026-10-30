import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import {
  createTrainerNotesManageRoutes,
  type TrainerNotesManagePorts,
} from "./trainer-notes-manage";

const staffId = "cm1rtx5qq00004ph6y2swjp41";
const studentId = "cm1rtx5qq00014ph6y2swjp42";
const noteId = "cm1rtx5qq00024ph6y2swjp43";
const payload = {
  title: "Прогресс",
  tags: ["курс"],
  studentIds: [studentId],
  entries: [{ content: "Умеет сидеть", order: 0, isVisibleToStudent: true }],
};
function make(
  role: "TRAINER" | "MODERATOR" | "ADMIN" | "USER" | "PARTNER" | "GUEST" = "TRAINER",
  userId = staffId,
) {
  const ports = {
    lookup: vi.fn(async () => [{ id: studentId, username: "learner" }]),
    list: vi.fn(async () => ({ notes: [], total: 0, page: 0, pageSize: 50 })),
    create: vi.fn(async () => ({ success: true })),
    update: vi.fn(async () => ({ success: true })),
    remove: vi.fn(async () => ({ success: true })),
  } satisfies TrainerNotesManagePorts;
  const app = new Hono();
  app.use("*", async (c, next) => {
    if (role !== "GUEST") c.set("user", { id: userId, username: "tester", role });
    await next();
  });
  app.route("/notes/manage", createTrainerNotesManageRoutes(ports));
  const get = (path = "") => app.request("/notes/manage" + path);
  const send = (method: "POST" | "PUT" | "DELETE", path = "", body?: unknown) =>
    app.request("/notes/manage" + path, {
      method,
      headers: body === undefined ? {} : { "content-type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  return { ports, get, send, app };
}
describe("trainer full notes API actor scope and protected mutations", () => {
  it("reads full notes only under derived owner for trainer and moderator, admin sees all", async () => {
    for (const role of ["TRAINER", "MODERATOR", "ADMIN"] as const) {
      const { get, ports } = make(role);
      const response = await get("?page=0&pageSize=50&studentId=" + studentId);
      expect(response.status).toBe(200);
      expect(response.headers.get("Cache-Control")).toContain("no-store");
      expect(response.headers.get("Referrer-Policy")).toBe("no-referrer");
      expect(ports.list).toHaveBeenCalledWith({
        page: 0,
        pageSize: 50,
        studentId,
        trainerId: role === "ADMIN" ? null : staffId,
      });
    }
  });
  it("rejects unauthorised actors and invalid URL queries without querying Core", async () => {
    for (const role of ["USER", "GUEST", "PARTNER"] as const) {
      const { get, send, ports } = make(role);
      expect((await get()).status).toBe(403);
      expect((await send("POST", "", payload)).status).toBe(403);
      expect((await send("PUT", "/" + noteId, payload)).status).toBe(403);
      expect((await send("DELETE", "/" + noteId)).status).toBe(403);
      expect(ports.list).not.toHaveBeenCalled();
      expect(ports.create).not.toHaveBeenCalled();
    }
    const { get, ports } = make();
    for (const query of [
      "?page=-1",
      "?page=1&page=2",
      "?pageSize=0",
      "?pageSize=100",
      "?trainerId=" + staffId,
      "?studentId=bad-id",
    ])
      expect((await get(query)).status).toBe(400);
    expect(ports.list).not.toHaveBeenCalled();
  });
  it("looks up USER students with bounded search and no client owner override", async () => {
    const { get, ports } = make();
    const result = await get("/lookup?query=learner");
    expect(result.status).toBe(200);
    expect(await result.json()).toEqual({
      success: true,
      data: [{ id: studentId, username: "learner" }],
    });
    expect(ports.lookup).toHaveBeenCalledWith("learner", 10);
    for (const query of [
      "/lookup?query=a",
      "/lookup?query=one&query=two",
      "/lookup?username=staff",
      "/lookup?query=" + "x".repeat(51),
    ])
      expect((await get(query)).status).toBe(400);
    expect(ports.lookup).toHaveBeenCalledTimes(1);
  });
  it("creates only schema-validated notes for current actor, refuses forged ownership", async () => {
    const { send, ports } = make();
    const response = await send("POST", "", payload);
    expect(response.status).toBe(201);
    expect(ports.create).toHaveBeenCalledWith(payload, staffId);
    for (const invalid of [
      { ...payload, trainerId: "foreign" },
      { ...payload, entries: [] },
      { ...payload, entries: [{ ...payload.entries[0], isVisibleToStudent: "yes" }] },
      { ...payload, studentIds: [studentId, studentId] },
    ])
      expect((await send("POST", "", invalid)).status).toBe(400);
    expect(ports.create).toHaveBeenCalledTimes(1);
  });
  it("passes update/delete ID from route and admin flag from verified actor", async () => {
    const trainer = make();
    expect((await trainer.send("PUT", "/" + noteId, payload)).status).toBe(200);
    expect(trainer.ports.update).toHaveBeenCalledWith({ ...payload, id: noteId }, staffId, false);
    expect((await trainer.send("DELETE", "/" + noteId)).status).toBe(200);
    expect(trainer.ports.remove).toHaveBeenCalledWith({ id: noteId }, staffId, false);
    const admin = make("ADMIN");
    expect((await admin.send("PUT", "/" + noteId, { title: null })).status).toBe(200);
    expect(admin.ports.update).toHaveBeenCalledWith({ id: noteId, title: null }, staffId, true);
    expect((await admin.send("DELETE", "/" + noteId)).status).toBe(200);
    expect(admin.ports.remove).toHaveBeenCalledWith({ id: noteId }, staffId, true);
    for (const invalid of [
      { ...payload, trainerId: "someone-else" },
      { ...payload, id: "forged" },
    ])
      expect((await trainer.send("PUT", "/" + noteId, invalid)).status).toBe(400);
    expect((await trainer.send("DELETE", "/bad-id")).status).toBe(400);
  });
  it("accepts Node HTTP bodyless DELETE stream but rejects nonempty streamed payload", async () => {
    const { app, ports } = make();
    const requestWithStream = (bytes: Uint8Array) => new Request(
      "http://localhost/notes/manage/" + noteId,
      {
        method: "DELETE",
        body: new ReadableStream<Uint8Array>({
          start(controller) {
            if (bytes.length) controller.enqueue(bytes);
            controller.close();
          },
        }),
        duplex: "half",
      } as RequestInit & { duplex: "half" },
    );
    const empty = await app.request(requestWithStream(new Uint8Array(0)));
    expect(empty.status).toBe(200);
    expect(ports.remove).toHaveBeenCalledWith({ id: noteId }, staffId, false);
    const nonempty = await app.request(requestWithStream(new TextEncoder().encode("{}")));
    expect(nonempty.status).toBe(400);
    expect(ports.remove).toHaveBeenCalledTimes(1);
  });

  it("does not leak private Core errors or claim failed writes are successful", async () => {
    const { send, get, ports } = make();
    ports.create.mockRejectedValueOnce(Error("SECRET_NOTE_CONTENT"));
    let result = await send("POST", "", payload);
    expect(result.status).toBe(500);
    expect(JSON.stringify(await result.json())).not.toContain("SECRET_NOTE_CONTENT");
    ports.remove.mockResolvedValueOnce({ success: false });
    result = await send("DELETE", "/" + noteId);
    expect(result.status).toBe(409);
    expect(JSON.stringify(await result.json())).not.toContain("SECRET_NOTE_CONTENT");
    ports.list.mockRejectedValueOnce(Error("PRIVATE_STUDENT_IDENTITY"));
    result = await get();
    expect(result.status).toBe(500);
    expect(JSON.stringify(await result.json())).not.toContain("PRIVATE_STUDENT_IDENTITY");
    expect(result.headers.get("Cache-Control")).toContain("no-store");
  });
});
