import { Hono, type Context, type Next } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseUsernameAvailabilitySuccess } from "@gafus/types";

const service = vi.hoisted(() => vi.fn());
vi.mock("@gafus/core/services/auth", async importOriginal => ({
  ...await importOriginal<object>(), isUsernameAvailable: service,
}));
vi.mock("../../middleware/auth.js", () => ({
  authMiddleware: async (c: Context, next: Next) => {
    if (c.req.header("Authorization") !== "Bearer owner") {
      return c.json({ success: false, error: "Не авторизован" }, 401);
    }
    c.set("user", { id: "owner-1", username: "owner_1", role: "USER" });
    await next();
  },
}));
import { authRoutes } from "./auth";

const app = new Hono().route("/api/v1/auth", authRoutes);
const check = (username: string, authorized = true) => app.request(
  "/api/v1/auth/username-available?username=" + encodeURIComponent(username),
  { headers: authorized ? { Authorization: "Bearer owner" } : {} },
);

describe("username availability Hono -> shared DTO", () => {
  beforeEach(() => vi.clearAllMocks());
  it.each([true, false])("owner-scoped HTTP 200 boolean %s", async available => {
    service.mockResolvedValueOnce(available);
    const response = await check("  User_1  ");
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("Referrer-Policy")).toBe("no-referrer");
    expect(parseUsernameAvailabilitySuccess(await response.json())).toEqual({
      success: true, data: { available },
    });
    expect(service).toHaveBeenCalledExactlyOnceWith("User_1", "owner-1");
  });
  it.each(["ab", "a!", "x".repeat(51), "имя"])(
    "rejects malformed username before service: %s", async username => {
      expect((await check(username)).status).toBe(400);
      expect(service).not.toHaveBeenCalled();
    },
  );
  it.each([
    ["x".repeat(3), 200, "x".repeat(3)],
    [" " + "x".repeat(50) + " ", 200, "x".repeat(50)],
    ["  A_0  ", 200, "A_0"],
    ["  ab  ", 400, null],
    ["x".repeat(51), 400, null],
    ["  !valid  ", 400, null],
    ["z-з", 400, null],
    ["ab\ncd", 400, null],
  ] as const)("HTTP query/shared policy parity: %j -> %i", async (wire, expectedStatus, normalized) => {
    service.mockResolvedValue(true);
    const response = await check(wire);
    expect(response.status).toBe(expectedStatus);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("Referrer-Policy")).toBe("no-referrer");
    if (normalized === null) {
      expect(service).not.toHaveBeenCalled();
      const body = await response.json() as {success?: unknown};
      expect(body.success).not.toBe(true);
    } else {
      expect(service).toHaveBeenCalledExactlyOnceWith(normalized, "owner-1");
      expect(parseUsernameAvailabilitySuccess(await response.json()))
        .toEqual({success:true,data:{available:true}});
    }
  });
  it("missing query is a real Hono 400 before Core and remains private", async () => {
    const response = await app.request("/api/v1/auth/username-available", {
      headers: { Authorization: "Bearer owner" },
    });
    expect(response.status).toBe(400);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(service).not.toHaveBeenCalled();
  });
  it("server emits only compatible typed success with exact bool, no extra transport action", async () => {
    service.mockResolvedValueOnce(false);
    const response = await check("verified");
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json).toEqual({success:true,data:{available:false}});
    expect(parseUsernameAvailabilitySuccess({...json, addedInFuture:"ignored",
      data:{...json.data, anotherField:42}}))
      .toEqual({success:true,data:{available:false}});
    expect(parseUsernameAvailabilitySuccess({success:true,data:{available:"false"}}))
      .toBeNull();
  });
  it("rejects unauthenticated request before service", async () => {
    expect((await check("User_1", false)).status).toBe(401);
    expect(service).not.toHaveBeenCalled();
  });
  it("returns sanitized HTTP 500 error", async () => {
    service.mockRejectedValueOnce(new Error("private SQL diagnostic"));
    const res = await check("User_1");
    expect(res.status).toBe(500);
    const payload = await res.json();
    expect(payload).toEqual({
      success: false, code: "USERNAME_UNAVAILABLE", error: "Ошибка проверки логина",
    });
    expect(parseUsernameAvailabilitySuccess(payload)).toBeNull();
  });
});

// Acceptance regression fixture: original Hono Zod chain from before normalization refactor.
// Kept only as a historical comparator in tests; production policy has one owner.
import { z } from "zod/v3";
const legacyUsernameQuery = z.object({ username: z.string().trim().min(3).max(50).regex(/^[a-zA-Z0-9_]+$/, "Логин: латиница, цифры, _") });
describe("username HTTP400 external diagnostics regression", () => {
  it.each(["ab", "a!", "x".repeat(51), "имя", "  ab  ", "", " "])(
    "compares real HTTP400 response with legacy Zod diagnostics for %j", async username => {
      const response = await check(username);
      const actual = await response.json();
      const before = legacyUsernameQuery.safeParse({ username });
      expect(before.success).toBe(false);
      if (before.success) return;
      expect(response.status).toBe(400);
      // Assert the actual public zValidator HTTP envelope, not a private parse result.
      expect(actual).toEqual({success:false,error:{issues:before.error.issues,name:"ZodError"}});
    },
  );
});

describe("username HTTP400 missing-key Zod diagnostics", () => {
  it("keeps original invalid_type/Required issue and HTTP envelope", async () => {
    const response = await app.request("/api/v1/auth/username-available", {
      headers:{Authorization:"Bearer owner"},
    });
    const result = legacyUsernameQuery.safeParse({});
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({success:false,error:{issues:result.error.issues,name:"ZodError"}});
  });
});
