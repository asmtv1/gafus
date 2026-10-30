/** AG1-OPS-061: auth outcome and admin intro reports never become cacheable. */
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ event: vi.fn(), outcome: vi.fn(), report: vi.fn() }));
vi.mock("@gafus/mobile-intro-server", () => ({
  recordMobileIntroEvent: m.event,
  recordMobileIntroAuthOutcome: m.outcome,
  getMobileIntroReport: m.report,
}));
import { mobileIntroRoutes } from "./mobile-intro";

function app() {
  const server = new Hono();
  server.use("/api/v1/mobile-intro/*", async (c, next) => {
    if (c.req.header("x-test-role") !== "ANONYMOUS") {
      const role = c.req.header("x-test-role") === "ADMIN" ? "ADMIN" : "USER";
      c.set("user", { id: "user-A", username: "student", role });
    }
    await next();
  });
  server.route("/api/v1/mobile-intro", mobileIntroRoutes);
  return server;
}
const outcome = {
  installationId: "1234567890abcdef", introVersion: "1", platform: "IOS",
  openedAt: "2026-10-20T10:00:00.000Z", outcome: "LOGGED_IN",
};
const reportUrl = "/api/v1/mobile-intro/admin/report?start=2026-10-01T00%3A00%3A00.000Z" +
  "&end=2026-10-21T00%3A00%3A00.000Z";
function submit(body: unknown) {
  return app().request("/api/v1/mobile-intro/auth-outcome", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("AG1-OPS-061 mobile intro HTTP privacy and roles", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    m.outcome.mockResolvedValue({ recorded: true });
    m.report.mockResolvedValue({ opened: 4, completed: 2 });
  });

  it("auth-outcome uses current principal, not the body-provided user", async () => {
    const response = await submit(outcome);
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(m.outcome).toHaveBeenCalledWith(expect.objectContaining({ userId: "user-A" }));
  });

  it("identity spoofing returns uncached 409 without database write", async () => {
    const response = await submit({ ...outcome, userId: "user-B" });
    expect(response.status).toBe(409);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(m.outcome).not.toHaveBeenCalled();
  });

  it("admin report is never cacheable and restricted to ADMIN role", async () => {
    const server = app();
    const denied = await server.request(reportUrl);
    expect(denied.status).toBe(403);
    expect(denied.headers.get("Cache-Control")).toBe("private, no-store");
    expect(m.report).not.toHaveBeenCalled();
    const allowed = await server.request(reportUrl, { headers: { "x-test-role": "ADMIN" } });
    expect(allowed.status).toBe(200);
    expect(allowed.headers.get("Cache-Control")).toBe("private, no-store");
    expect(m.report).toHaveBeenCalledOnce();
  });

  it("unauthenticated auth outcome is 401 with private no-store", async () => {
    const response = await app().request("/api/v1/mobile-intro/auth-outcome", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-test-role": "ANONYMOUS" },
      body: JSON.stringify(outcome),
    });
    expect(response.status).toBe(401);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(m.outcome).not.toHaveBeenCalled();
  });
});
