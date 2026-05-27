import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getStudentNotesMock } = vi.hoisted(() => ({
  getStudentNotesMock: vi.fn(),
}));

vi.mock("@gafus/core/services/notes", () => ({
  getStudentNotes: getStudentNotesMock,
}));

vi.mock("@gafus/logger", () => ({
  createWebLogger: () => ({
    error: vi.fn(),
  }),
}));

import { notesRoutes } from "./notes";

function createTestApp() {
  const app = new Hono();
  app.use("/api/v1/notes/*", async (c, next) => {
    c.set("user", { id: "user-1", username: "student", role: "USER" });
    await next();
  });
  app.route("/api/v1/notes", notesRoutes);
  return app;
}

describe("notes route contracts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns student notes for the authenticated user", async () => {
    getStudentNotesMock.mockResolvedValueOnce([{ id: "note-1" }]);

    const response = await createTestApp().request("/api/v1/notes/student");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: [{ id: "note-1" }],
      success: true,
    });
    expect(getStudentNotesMock).toHaveBeenCalledWith("user-1");
  });

  it("maps service failures to an internal error response", async () => {
    getStudentNotesMock.mockRejectedValueOnce(new Error("db down"));

    const response = await createTestApp().request("/api/v1/notes/student");

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Внутренняя ошибка",
      success: false,
    });
  });
});
