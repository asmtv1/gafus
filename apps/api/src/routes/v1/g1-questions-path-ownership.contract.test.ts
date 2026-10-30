/** AG1-SOC-040: an extra "questions" path segment may never rewrite a mutation target. */
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  get: vi.fn(),
  remove: vi.fn(),
  edit: vi.fn(),
}));
vi.mock("@gafus/questions-server", () => ({
  dispatchQuestionsRequest: vi.fn(async (_userId: string, _request: Request, path: string) => {
    const parts = path.split("/").filter(Boolean);
    if (parts.length === 1) {
      if (_request.method === "DELETE") return m.remove(parts[0]);
      if (_request.method === "PATCH") return m.edit(parts[0]);
      if (_request.method === "GET") return m.get(parts[0]);
    }
    throw Object.assign(new Error("Маршрут не найден"), { status: 404 });
  }),
  questionHttpError: (err: unknown) => ({
    body: { success: false, error: "Маршрут не найден", code: "NOT_FOUND" },
    status: (err as { status?: number }).status ?? 500,
  }),
}));
import { questionsRoutes } from "./questions";

function app() {
  const server = new Hono();
  server.use("/api/v1/questions/*", async (c, next) => {
    c.set("user", { id: "owner-A", username: "test", role: "USER" });
    await next();
  });
  server.route("/api/v1/questions", questionsRoutes);
  return server;
}

describe("AG1-SOC-040 Hono questions exact route path extraction", () => {
  beforeEach(() => { vi.clearAllMocks(); m.remove.mockResolvedValue({ deleted: true }); });

  it("does not DELETE a question through an unrecognized extra /questions segment", async () => {
    const response = await app().request(
      "/api/v1/questions/question-A/questions/fake", { method: "DELETE" },
    );
    expect(response.status).toBe(404);
    expect(m.remove).not.toHaveBeenCalled();
  });

  it("does not PATCH a question through an unrecognized extra /questions segment", async () => {
    const response = await app().request(
      "/api/v1/questions/question-A/questions/fake", { method: "PATCH" },
    );
    expect(response.status).toBe(404);
    expect(m.edit).not.toHaveBeenCalled();
  });

  it("does not GET a question by dropping unknown nested segments", async () => {
    const response = await app().request("/api/v1/questions/question-A/questions/fake");
    expect(response.status).toBe(404);
    expect(m.get).not.toHaveBeenCalled();
  });

  it("keeps the original owner-scoped question endpoint working", async () => {
    const response = await app().request("/api/v1/questions/question-A", { method: "DELETE" });
    expect(response.status).toBe(200);
    expect(m.remove).toHaveBeenCalledWith("question-A");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });
});
