/** AG1-LEARN-032: student-specific trainer notes remain private, errors don't log PII. */
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ notes: vi.fn(), error: vi.fn() }));
vi.mock("@gafus/core/services/notes", () => ({ getStudentNotes: m.notes }));
vi.mock("@gafus/logger", () => ({
  createWebLogger: () => ({ error: m.error }),
}));
import { notesRoutes } from "./notes";

function app() {
  const server = new Hono();
  server.use("/api/v1/notes/*", async (c, next) => {
    c.set("user", {
      id: c.req.header("x-test-user") ?? "student-A",
      username: "fixture",
      role: "USER",
    });
    await next();
  });
  server.route("/api/v1/notes", notesRoutes);
  return server;
}

describe("AG1 student notes Hono privacy & owner source", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    m.notes.mockImplementation(async (ownerId: string) => ([
      { id: `note-${ownerId}`, text: `private-for-${ownerId}` },
    ]));
  });

  it("returns private, no-store notes scoped to both independent principals", async () => {
    for (const ownerId of ["student-A", "student-B"]) {
      const response = await app().request("/api/v1/notes/student", {
        headers: { "x-test-user": ownerId },
      });
      expect(response.status).toBe(200);
      expect(response.headers.get("Cache-Control")).toBe("private, no-store");
      await expect(response.json()).resolves.toEqual({
        success: true,
        data: [{ id: `note-${ownerId}`, text: `private-for-${ownerId}` }],
      });
    }
    expect(m.notes.mock.calls.map(([ownerId]) => ownerId)).toEqual(["student-A", "student-B"]);
  });

  it("provider failure gives private 500 and does not log sensitive note or stack", async () => {
    const secret = "PRIVATE_TRAINER_NOTE_HEALTH_OR_PAYMENT_TOKEN";
    const err = new Error(`provider ${secret}`);
    err.stack = `stack ${secret}`;
    m.notes.mockRejectedValueOnce(err);
    const response = await app().request("/api/v1/notes/student");
    expect(response.status).toBe(500);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    await expect(response.json()).resolves.toEqual({
      success: false, error: "Внутренняя ошибка",
    });
    expect(m.error).toHaveBeenCalledTimes(1);
    const passedException = m.error.mock.calls[0]?.[1];
    expect(passedException?.message ?? "").not.toContain(secret);
    expect(passedException?.stack ?? "").not.toContain(secret);
  });
});
