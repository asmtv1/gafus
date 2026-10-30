/** AG1-SOC-040: oversized upload rejection never emits a cacheable response. */
import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ dispatch: vi.fn() }));
vi.mock("@gafus/questions-server", () => ({
  dispatchQuestionsRequest: m.dispatch,
  questionHttpError: () => ({ status: 500, body: { success: false } }),
}));
import { questionsRoutes } from "./questions";
const app = new Hono();
app.route("/api/v1/questions", questionsRoutes);

describe("AG1-SOC-040 body limit denies private payloads before dispatch", () => {
  it("large content-length causes 413 and retains no-store", async () => {
    const response = await app.request("/api/v1/questions/photos", {
      method: "POST",
      headers: {
        "content-type": "application/octet-stream",
        "content-length": String(10 * 1024 * 1024 + 65536 + 1),
      },
      body: "tiny-body",
    });
    expect(response.status).toBe(413);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(m.dispatch).not.toHaveBeenCalled();
  });
});
