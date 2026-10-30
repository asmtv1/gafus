import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../api/client";
import { getCurrentUser, login, logout, refreshSession } from "./authApi";

const user = { id: "1", username: "tester", role: "USER" };
afterEach(() => vi.unstubAllGlobals());

describe("Web cookie-only API client", () => {
  it("uses same-origin cookie transport without Authorization and without JWT in JS", async () => {
    const mocked = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      success: true, data: { user },
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", mocked);
    expect(await login({ username: "tester", password: "safe-password" })).toEqual({ user });
    const [path, options] = mocked.mock.calls[0];
    expect(path).toBe("/api/v1/auth/login");
    expect(options.credentials).toBe("include");
    expect(options.headers["X-Gafus-Auth-Transport"]).toBe("cookie");
    expect(options.headers.Authorization).toBeUndefined();
    expect(JSON.stringify(options)).not.toContain("accessToken");
    expect(JSON.stringify(options)).not.toContain("refreshToken");
  });

  it("uses cookie /me with no bearer header", async () => {
    const mocked = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      success: true, data: user,
    }), { status: 200 }));
    vi.stubGlobal("fetch", mocked);
    expect(await getCurrentUser()).toEqual(user);
    expect(mocked.mock.calls[0][1].headers.Authorization).toBeUndefined();
  });

  it("restores expired access cookie with refresh then retries /me once", async () => {
    const mocked = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        success: false, error: "Unauthorized",
      }), { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true }), { status: 200 }))
      .mockResolvedValueOnce(new Response(
        JSON.stringify({ success: true, data: user }), { status: 200 },
      ));
    vi.stubGlobal("fetch", mocked);
    expect(await getCurrentUser()).toEqual(user);
    expect(mocked.mock.calls.map(([path]) => path)).toEqual([
      "/api/v1/auth/me", "/api/v1/auth/refresh", "/api/v1/auth/me",
    ]);
    expect(mocked.mock.calls[1][1]).toMatchObject({
      credentials: "include",
      method: "POST",
      body: "{}",
    });
  });

  it("treats stock non-JSON auth HTTP429 as RATE_LIMITED without leaking body or retry", async()=>{
    const fetcher=vi.fn().mockResolvedValue(new Response(
      "<html>PRIVATE_RATE_GATE_DETAIL</html>", {status:429,
        headers:{"Content-Type":"text/html","Retry-After":"900"}},
    ));
    vi.stubGlobal("fetch",fetcher);
    await expect(login({username:"tester",password:"fake"})).rejects.toMatchObject({
      name:"ApiError",status:429,code:"RATE_LIMITED",
      message:"Слишком много запросов. Попробуйте позже.",
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(fetcher.mock.results)).not.toContain("PRIVATE_RATE_GATE_DETAIL");
  });
  it("logout HTTP429 fails closed and never resends the cookie POST", async()=>{
    const fetcher=vi.fn().mockResolvedValue(new Response("Too Many Requests",{status:429}));
    vi.stubGlobal("fetch",fetcher);
    await expect(logout()).rejects.toMatchObject({status:429,code:"RATE_LIMITED"});
    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher.mock.calls[0][0]).toBe("/api/v1/auth/logout");
    expect(fetcher.mock.calls[0][1]).toMatchObject({method:"POST",credentials:"include"});
  });
  it("auth /me HTTP429 is not a logout and cannot cause a refresh POST", async()=>{
    const fetcher=vi.fn().mockResolvedValue(new Response("Too Many Requests",{status:429}));
    vi.stubGlobal("fetch",fetcher);
    await expect(getCurrentUser()).rejects.toMatchObject({status:429,code:"RATE_LIMITED"});
    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher.mock.calls[0][0]).toBe("/api/v1/auth/me");
  });
  it("reads /me after a second browser tab wins refresh rotation", async () => {
    const mocked = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: false }), { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: false, code: "REFRESH_CONFLICT" }), { status: 409 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true, data: user }), { status: 200 }));
    vi.stubGlobal("fetch", mocked);
    expect(await getCurrentUser()).toEqual(user);
    expect(mocked.mock.calls.map(([path]) => path)).toEqual([
      "/api/v1/auth/me", "/api/v1/auth/refresh", "/api/v1/auth/me",
    ]);
  });

  it("does not sign out if a concurrent refresh is still unresolved", async () => {
    const mocked = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: false }), { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: false, code: "REFRESH_CONFLICT" }), { status: 409 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: false }), { status: 401 }));
    vi.stubGlobal("fetch", mocked);
    await expect(getCurrentUser()).rejects.toMatchObject({ status: 409, code: "REFRESH_CONFLICT" });
    expect(mocked).toHaveBeenCalledTimes(3);
  });

  it("treats rejected refresh as signed-out without exposing tokens", async () => {
    const mocked = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        success: false, error: "Unauthorized",
      }), { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        success: false, error: "Expired",
      }), { status: 401 }));
    vi.stubGlobal("fetch", mocked);
    expect(await getCurrentUser()).toBeNull();
    expect(mocked).toHaveBeenCalledTimes(2);
  });

  it("preserves backend failures rather than treating them as signed-out", async () => {
    const mocked = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        success: false, error: "Unauthorized",
      }), { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        success: false, error: "Service unavailable",
      }), { status: 503 }));
    vi.stubGlobal("fetch", mocked);
    await expect(getCurrentUser()).rejects.toBeInstanceOf(ApiError);
  });

  it("refresh/logout send only empty JSON body and cookie transport", async () => {
    const mocked = vi.fn().mockImplementation(() => Promise.resolve(
      new Response(JSON.stringify({ success: true }), { status: 200 }),
    ));
    vi.stubGlobal("fetch", mocked);
    await refreshSession();
    await logout();
    expect(mocked).toHaveBeenCalledTimes(2);
    for (const [path, options] of mocked.mock.calls) {
      expect(path.startsWith("/api/v1/auth/")).toBe(true);
      expect(options.method).toBe("POST");
      expect(options.body).toBe("{}");
      expect(options.headers["X-Gafus-Auth-Transport"]).toBe("cookie");
    }
  });

  it("refuses all absolute, external and protocol-relative URLs", async () => {
    const { apiRequest } = await import("../api/client");
    const mocked = vi.fn();
    vi.stubGlobal("fetch", mocked);
    for (const url of [
      "https://api.gafus.ru/api/v1/auth/me", "//api.gafus.ru/api/v1/auth/me",
      "/api/v2/auth/me", "/api/v1/../payments", "/api/v1/auth/me#hash",
    ]) {
      await expect(apiRequest(url)).rejects.toThrow(/relative/);
    }
    expect(mocked).not.toHaveBeenCalled();
  });
});
