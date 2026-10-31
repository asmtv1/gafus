import { afterEach, describe, expect, it, vi } from "vitest";
import { apiRequest } from "./client";

const success = (data?: unknown) => new Response(
  JSON.stringify({ success: true, data }), { status: 200 },
);
const failure = (status: number) => new Response(
  JSON.stringify({ success: false, error: "Request refused" }), { status },
);

afterEach(() => vi.unstubAllGlobals());

describe("Web access-cookie recovery", () => {
  it("refreshes an expired access cookie then retries one safe GET", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(failure(401))
      .mockResolvedValueOnce(success())
      .mockResolvedValueOnce(success({ enabled: true }));
    vi.stubGlobal("fetch", fetcher);

    await expect(apiRequest("/api/v1/feed/status")).resolves.toEqual({ enabled: true });
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
      "/api/v1/feed/status",
      "/api/v1/auth/refresh",
      "/api/v1/feed/status",
    ]);
    expect(fetcher.mock.calls[1][1]).toMatchObject({
      method: "POST", credentials: "include", body: "{}",
      headers: expect.objectContaining({ "X-Gafus-Auth-Transport": "cookie" }),
    });
    expect(fetcher.mock.calls[2][1].headers.Authorization).toBeUndefined();
  });

  it("coalesces simultaneous 401 reads into one rotation", async () => {
    const calls = new Map<string, number>();
    const fetcher = vi.fn((path: string) => {
      if (path === "/api/v1/auth/refresh") return Promise.resolve(success());
      const n = calls.get(path) ?? 0;
      calls.set(path, n + 1);
      return Promise.resolve(n === 0 ? failure(401) : success({ path }));
    });
    vi.stubGlobal("fetch", fetcher);
    const [first, second] = await Promise.all([
      apiRequest("/api/v1/feed/status"),
      apiRequest("/api/v1/feed/posts"),
    ]);
    expect(first).toEqual({ path: "/api/v1/feed/status" });
    expect(second).toEqual({ path: "/api/v1/feed/posts" });
    expect(fetcher.mock.calls.filter(([url]) => url === "/api/v1/auth/refresh")).toHaveLength(1);
    expect(fetcher).toHaveBeenCalledTimes(5);
  });

  it("does not retry a failing GET more than once after successful refresh", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(failure(401))
      .mockResolvedValueOnce(success())
      .mockResolvedValueOnce(failure(401));
    vi.stubGlobal("fetch", fetcher);
    await expect(apiRequest("/api/v1/feed/status")).rejects.toMatchObject({ status: 401 });
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("preserves the original 401 when the refresh cookie is invalid", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(failure(401)).mockResolvedValueOnce(failure(401));
    vi.stubGlobal("fetch", fetcher);
    await expect(apiRequest("/api/v1/feed/status")).rejects.toMatchObject({ status: 401 });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("does not mistake refresh outages or rotation conflicts for logout", async () => {
    for (const code of [409, 503]) {
      const fetcher = vi.fn().mockResolvedValueOnce(failure(401))
        .mockResolvedValueOnce(failure(code));
      vi.stubGlobal("fetch", fetcher);
      await expect(apiRequest("/api/v1/feed/status")).rejects.toMatchObject({ status: code });
      expect(fetcher).toHaveBeenCalledTimes(2);
    }
  });

  it("never replays writes, auth endpoints, credential-free requests, or forbidden reads", async () => {
    const cases: [string, object, number][] = [
      ["/api/v1/feed/posts", { method: "POST", json: {} }, 401],
      ["/api/v1/feed/posts", { method: "PATCH", json: {} }, 401],
      ["/api/v1/feed/posts", { method: "DELETE" }, 401],
      ["/api/v1/auth/me", {}, 401],
      ["/api/v1/feed/status", { credentials: "omit" }, 401],
      ["/api/v1/feed/status", {}, 403],
      ["/api/v1/feed/status", {}, 404],
      ["/api/v1/feed/status", {}, 429],
    ];
    for (const [url, options, status] of cases) {
      const fetcher = vi.fn().mockResolvedValue(failure(status));
      vi.stubGlobal("fetch", fetcher);
      await expect(apiRequest(url, options)).rejects.toMatchObject({ status });
      expect(fetcher).toHaveBeenCalledTimes(1);
    }
  });
});
