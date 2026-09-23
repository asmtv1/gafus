import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

const recordEvent = vi.hoisted(() => vi.fn());
const recordOutcome = vi.hoisted(() => vi.fn());
const getReport = vi.hoisted(() => vi.fn());

vi.mock("@gafus/core/services/mobileIntro", () => ({
  recordMobileIntroEvent: recordEvent,
  recordMobileIntroAuthOutcome: recordOutcome,
  getMobileIntroReport: getReport,
}));

import { jsonRequest } from "../../test/route-test-utils";
import { mobileIntroRoutes } from "./mobile-intro";

function appWithUser(role = "USER") {
  const app = new Hono();
  app.use("/api/v1/mobile-intro/*", async (c, next) => {
    c.set("user", { id: "user-1", username: "user", role: role as "USER" | "ADMIN" });
    await next();
  });
  app.route("/api/v1/mobile-intro", mobileIntroRoutes);
  return app;
}

const event = {
  installationId: "installation-0001",
  introVersion: "v1",
  platform: "IOS",
  event: "OPENED",
  openedAt: "2026-09-17T08:00:00.000Z",
  occurredAt: "2026-09-17T08:00:00.000Z",
};

describe("mobile intro routes", () => {
  beforeEach(() => vi.clearAllMocks());

  it("records a bounded public opening", async () => {
    const response = await appWithUser().request(jsonRequest("/api/v1/mobile-intro/events", "POST", event));
    expect(response.status).toBe(200);
    expect(recordEvent).toHaveBeenCalledWith(expect.objectContaining({ event: "OPENED", introVersion: "v1" }));
  });

  it("rejects impossible future event times", async () => {
    const response = await appWithUser().request(jsonRequest("/api/v1/mobile-intro/events", "POST", { ...event, openedAt: "2099-01-01T00:00:00.000Z", occurredAt: "2099-01-01T00:00:00.000Z" }));
    expect(response.status).toBe(400);
    expect(recordEvent).not.toHaveBeenCalled();
  });

  it("links an authenticated outcome", async () => {
    const response = await appWithUser().request(jsonRequest("/api/v1/mobile-intro/auth-outcome", "POST", { ...event, outcome: "LOGGED_IN" }));
    expect(response.status).toBe(200);
    expect(recordOutcome).toHaveBeenCalledWith(expect.objectContaining({ userId: "user-1", outcome: "LOGGED_IN" }));
  });

  it("does not attribute a queued outcome to a different logged-in user", async () => {
    const response = await appWithUser().request(jsonRequest("/api/v1/mobile-intro/auth-outcome", "POST", { ...event, outcome: "REGISTERED", userId: "other-user" }));
    expect(response.status).toBe(409);
    expect(recordOutcome).not.toHaveBeenCalled();
  });

  it("rejects anonymous conversion requests", async () => {
    const app = new Hono().route("/api/v1/mobile-intro", mobileIntroRoutes);
    const response = await app.request(jsonRequest("/api/v1/mobile-intro/auth-outcome", "POST", { ...event, outcome: "LOGGED_IN" }));
    expect(response.status).toBe(401);
    expect(recordOutcome).not.toHaveBeenCalled();
  });

  it("protects the report for admins", async () => {
    const denied = await appWithUser().request("/api/v1/mobile-intro/admin/report?start=2026-09-01T00%3A00%3A00.000Z&end=2026-09-18T00%3A00%3A00.000Z");
    expect(denied.status).toBe(403);
    getReport.mockResolvedValueOnce({ openings: 1 });
    const allowed = await appWithUser("ADMIN").request("/api/v1/mobile-intro/admin/report?start=2026-09-01T00%3A00%3A00.000Z&end=2026-09-18T00%3A00%3A00.000Z");
    expect(allowed.status).toBe(200);
  });
});
