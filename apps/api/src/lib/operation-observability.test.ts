import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import {
  authorizedOperationMetrics,
  operationMetricsMiddleware,
  renderOperationMetrics,
  getOutboxCorrelation,
  getRequestCorrelation,
  withCorrelatedUseCase,
} from "./operation-observability";

describe("API trace IDs and low cardinality metrics", () => {
  it("generates independent trace IDs and does not echo untrusted IDs", async () => {
    const app = new Hono();
    app.use("*", operationMetricsMiddleware);
    app.get("/moment/:userId", (c) => c.json({ ok: true }));
    const response = await app.request("/moment/private-signed-path", {
      headers: { traceparent: "attacker-secret" },
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("X-Trace-Id")).toMatch(/^[a-f0-9]{32}$/);
    expect(response.headers.get("X-Request-Id")).toMatch(/^[a-f0-9-]{36}$/);
    expect(response.headers.get("X-Operation-Id")).toMatch(/^[a-f0-9-]{36}$/);
    expect(renderOperationMetrics()).toContain('route="/moment/:userId"');
    expect(renderOperationMetrics()).not.toContain("private-signed-path");
    expect(renderOperationMetrics()).not.toContain("attacker-secret");
  });
  it("assigns unique request and operation IDs even for a shared upstream trace", async () => {
    const app = new Hono();
    app.use("*", operationMetricsMiddleware);
    app.get("/", async (c) => {
      await Promise.resolve();
      return c.json(getRequestCorrelation());
    });
    const headers = {
      traceparent: "00-" + "a".repeat(32) + "-" + "b".repeat(16) + "-01",
      "X-Request-Id": "client-controlled-value",
    };
    const first = await app.request("/", { headers });
    const second = await app.request("/", { headers });
    const one = (await first.json()) as { requestId: string; operationId: string; traceId: string };
    const two = (await second.json()) as typeof one;
    expect(one.traceId).not.toBe(two.traceId);
    expect(one.traceId).not.toBe("a".repeat(32));
    expect(one.traceId).toBe(first.headers.get("X-Trace-Id"));
    expect(two.traceId).toBe(second.headers.get("X-Trace-Id"));
    expect(one.requestId).toBe(first.headers.get("X-Request-Id"));
    expect(one.requestId).not.toBe("client-controlled-value");
    expect(one.requestId).not.toBe(two.requestId);
    expect(one.operationId).not.toBe(two.operationId);
    expect(one.operationId).toBe(first.headers.get("X-Operation-Id"));
    expect(two.operationId).toBe(second.headers.get("X-Operation-Id"));
    expect(one.operationId).toMatch(/^[a-f0-9-]{36}$/);
    expect(getRequestCorrelation()).toEqual({});
  });
  it("does not trust valid W3C traceparent as a server root", async () => {
    const app = new Hono();
    app.use("*", operationMetricsMiddleware);
    app.get("/", (c) => c.text("ok"));
    const trace = "a".repeat(32);
    const response = await app.request("/", {
      headers: { traceparent: "00-" + trace + "-" + "b".repeat(16) + "-01" },
    });
    expect(response.headers.get("X-Trace-Id")).toMatch(/^[a-f0-9]{32}$/);
    expect(response.headers.get("X-Trace-Id")).not.toBe(trace);
    const invalid = await app.request("/", {
      headers: { traceparent: "00-" + trace + "-" + "0".repeat(16) + "-01" },
    });
    expect(invalid.headers.get("X-Trace-Id")).toMatch(/^[a-f0-9]{32}$/);
    expect(invalid.headers.get("X-Trace-Id")).not.toBe(trace);
  });
  it("propagates one request trace and stable business operation across awaits", async () => {
    const app = new Hono();
    app.use("*", operationMetricsMiddleware);
    app.post("/outbox", async (c) => {
      await Promise.resolve();
      return c.json({ first: getOutboxCorrelation(), second: getOutboxCorrelation() });
    });
    const response = await app.request("/outbox", { method: "POST" });
    const ids = (await response.json()) as {
      first: { traceId: string; operationId: string };
      second: { traceId: string; operationId: string };
    };
    expect(ids.first.traceId).toBe(response.headers.get("X-Trace-Id"));
    expect(ids.second.traceId).toBe(ids.first.traceId);
    expect(ids.first.operationId).toMatch(/^[a-f0-9-]{36}$/);
    expect(ids.second.operationId).toBe(ids.first.operationId);
    expect(getOutboxCorrelation()).toEqual({});
  });
  it("propagates nested use-case operation IDs and rejects variable names", async () => {
    const app = new Hono();
    app.use("*", operationMetricsMiddleware);
    app.get("/nested", async (c) => {
      const outer = getRequestCorrelation();
      const result = await withCorrelatedUseCase("chat2.message.create", async () => {
        await Promise.resolve();
        return getRequestCorrelation();
      });
      return c.json({ outer, result });
    });
    const response = await app.request("/nested");
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      outer: { operationId: string; traceId: string; requestId: string };
      result: { operationId: string; traceId: string; requestId: string };
    };
    expect(body.outer).toEqual(body.result);
    expect(response.headers.get("X-Operation-Id")).toBe(body.result.operationId);
    await expect(withCorrelatedUseCase("user/123/secret-path", async () => 1)).rejects.toThrow(
      "INVALID_OPERATION_STAGE",
    );
  });
  it("fails closed for metrics secrets", () => {
    const secret = "a".repeat(40);
    expect(authorizedOperationMetrics("Bearer " + secret, secret)).toBe(true);
    expect(authorizedOperationMetrics("Bearer " + "a".repeat(39), secret)).toBe(false);
    expect(authorizedOperationMetrics("Bearer " + secret, "")).toBe(false);
  });
});
