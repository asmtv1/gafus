import { describe, expect, it, vi } from "vitest";
import {
  buildSession, createTrainerCookieFetch, mutateTrainerApiEnvelope,
  readTrainerApiEnvelope, trainerLogin, trainerLogout, trainerMe,
  validatedTrainerApiPath,
} from "./trainerBrowserAuth";

const user = { id: "trainer-A", username: "trainer", role: "TRAINER" };
const response = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers });

describe("live Trainer browser cookie transport, local URL & identity fences", () => {
  it("rejects arbitrary URLs and escaped delimiters before any network", () => {
    for (const input of [
      "https://external.example/api/v1/trainer/steps", "//evil.test", "/api/v1/auth/login",
      "/api/v1/trainer/../admin", "/api/v1/trainer/steps%2Fadmin",
      "/api/v1/trainer/steps#token", "/api/v1/trainer/steps?secret=x#anchor",
      "/api/v1/consultations/user/bookings",
    ]) expect(() => validatedTrainerApiPath(input)).toThrow();
    expect(validatedTrainerApiPath("/api/v1/trainer/steps?isDailyCourse=true"))
      .toBe("/api/v1/trainer/steps?isDailyCourse=true");
    expect(validatedTrainerApiPath("/api/v1/consultations/trainer/bookings"))
      .toBe("/api/v1/consultations/trainer/bookings");
    expect(validatedTrainerApiPath("/api/v1/consultations/bookings/id-123/voximplant/prepare"))
      .toBe("/api/v1/consultations/bookings/id-123/voximplant/prepare");
    for (const denied of [
      "/api/v1/consultations/bookings/id/voximplant/delete",
      "/api/v1/consultations/bookings/id/voximplant/prepare/unsafe",
      "/api/v1/consultations/bookings/%2e%2e/voximplant/sign",
      "/api/v1/consultations/bookings/id/voximplant/sign?url=https://evil.test",
      "/api/v1/consultations/bookings/id/voximplant/sign#token",
    ]) expect(() => validatedTrainerApiPath(denied)).toThrow();
  });
  it("strips any synthetic Bearer header and only transmits HttpOnly cookie credentials", async () => {
    const original = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      response(200, { success: true, data: [] }, { "cache-control": "private, no-store" }));
    const unauthorized = vi.fn();
    const cookieFetch = createTrainerCookieFetch(original as typeof fetch, unauthorized);
    await cookieFetch("/api/v1/trainer/steps", {
      method: "GET", headers: { Authorization: "Bearer fake-witness" },
      credentials: "omit",
    });
    expect(original).toHaveBeenCalledTimes(1);
    const [path, options] = original.mock.calls[0]!;
    expect(path).toBe("/api/v1/trainer/steps");
    expect(options?.credentials).toBe("include");
    expect(new Headers(options?.headers).has("Authorization")).toBe(false);
    expect(new Headers(options?.headers).get("X-Gafus-Auth-Transport")).toBe("cookie");
    expect(unauthorized).not.toHaveBeenCalled();
  });
  it("401 callback retires session and never retries write automatically", async () => {
    const original = vi.fn(async () => response(401, { success: false, error: "no" }));
    const unauthorized = vi.fn();
    const cookieFetch = createTrainerCookieFetch(original as typeof fetch, unauthorized);
    const result = await mutateTrainerApiEnvelope(cookieFetch, {
      method: "POST", path: "/api/v1/trainer/authoring/steps", body: { title: "A" },
      signal: new AbortController().signal,
    });
    expect(result.status).toBe(401);
    expect(unauthorized).toHaveBeenCalledTimes(1);
    expect(original).toHaveBeenCalledTimes(1);
  });
  it("read returns private cache header and guarded data envelope", async () => {
    const f = vi.fn(async () => response(200, { success: true, data: [1] },
      { "cache-control": "private, no-store" }));
    const result = await readTrainerApiEnvelope(f as typeof fetch,
      "/api/v1/trainer/steps", new AbortController().signal);
    expect(result).toEqual({ status: 200,
      headers: { "cache-control": "private, no-store", "referrer-policy": "" },
      body: { success: true, data: [1] },
    });
  });
  it("me first 401 rotates refresh cookie once then reads verified role", async () => {
    const calls: string[] = [];
    const fetchImpl = vi.fn(async (path: string) => {
      calls.push(path);
      if (path.endsWith("/refresh")) return response(200, { success: true, data: {} });
      return calls.filter(value => value.endsWith("/me")).length === 1 ?
        response(401, { success: false }) : response(200, { success: true, data: user });
    });
    expect(await trainerMe(fetchImpl as typeof fetch)).toEqual(user);
    expect(calls).toEqual(["/api/v1/auth/me", "/api/v1/auth/refresh", "/api/v1/auth/me"]);
  });
  it("401 refresh does not fall through into stale cached identity", async () => {
    const fetchImpl = vi.fn(async (path: string) => path.endsWith("/me") ?
      response(401, { success: false }) : response(401, { success: false }));
    expect(await trainerMe(fetchImpl as typeof fetch)).toBeNull();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
  it("login/logout have only cookie header and do not persist browser tokens", async () => {
    const calls: { path: string; options: RequestInit | undefined }[] = [];
    const fetchImpl = vi.fn(async (path: string, options?: RequestInit) => {
      calls.push({ path, options });
      return response(200, path.endsWith("/login") ?
        { success: true, data: { user } } : { success: true });
    });
    expect(await trainerLogin(fetchImpl as typeof fetch, "trainer", "secret-password"))
      .toEqual(user);
    await trainerLogout(fetchImpl as typeof fetch);
    for (const { options } of calls) {
      expect(options?.credentials).toBe("include");
      expect(new Headers(options?.headers).get("X-Gafus-Auth-Transport")).toBe("cookie");
      expect(new Headers(options?.headers).has("Authorization")).toBe(false);
    }
    const session = buildSession(user as Parameters<typeof buildSession>[0]);
    expect(session.witness).toMatch(/^cookie-session:/);
    expect(session.witness).not.toContain("secret-password");
  });
});
