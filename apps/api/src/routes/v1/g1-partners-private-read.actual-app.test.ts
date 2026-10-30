/**
 * AG1-ECON060 actual API app + real signed JWT/rate middleware:
 * partner /me must be actor-private and whitelist current response fields.
 * Synthetic Redis counter and Core boundary; no payment, PG or provider.
 */
import { randomBytes } from "node:crypto";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type * as PartnerService from "@gafus/core/services/appSubscription";
import type * as PrismaModule from "@gafus/prisma";

const m = vi.hoisted(() => ({
  profile: vi.fn(), dashboard: vi.fn(), registration: vi.fn(), findUser: vi.fn(),
  rateCalls: [] as string[], rateLimited: false,
}));
vi.mock("@hono-rate-limiter/redis", () => ({
  RedisStore: class {
    windowMs = 60_000;
    init(options: { windowMs: number }) { this.windowMs = options.windowMs; }
    async increment(key: string) {
      m.rateCalls.push(key);
      return {
        totalHits: m.rateLimited ? 101 : 1,
        resetTime: new Date(Date.now() + this.windowMs),
      };
    }
    async decrement() { return undefined; }
    async resetKey() { return undefined; }
  },
}));
vi.mock("@gafus/prisma", async (importOriginal) => {
  const original = await importOriginal<typeof PrismaModule>();
  return {
    ...original,
    prisma: { ...original.prisma, user: {
      ...original.prisma.user, findUnique: m.findUser,
    } },
  };
});
vi.mock("@gafus/core/services/auth", async (importOriginal) => ({
  ...await importOriginal<object>(), isRegistrationCompleted: m.registration,
}));
vi.mock("@gafus/core/services/appSubscription", async (importOriginal) => ({
  ...await importOriginal<typeof PartnerService>(),
  getPartnerProfile: m.profile,
  getPartnerDashboard: m.dashboard,
}));
import { app } from "../../app";
import { generateAccessToken } from "@gafus/auth/jwt";
import { PartnerProgramError } from "@gafus/core/services/appSubscription";

const path = "/api/v1/partners/me";
const SECRET = "PRIVATE_PARTNER_BANK_ACCOUNT_BUYER_EMAIL_PAYMENT_TOKEN";
const tokens: Record<string, string> = {};
beforeAll(async () => {
  process.env.JWT_SECRET = randomBytes(48).toString("hex");
  for (const name of ["A", "B", "USER", "MOD"]) {
    tokens[name] = await generateAccessToken({
      id: "USER_" + name,
      role: name === "USER" ? "USER" : name === "MOD" ? "MODERATOR" : "PARTNER",
      username: name.toLowerCase(),
    });
  }
});
beforeEach(() => {
  vi.clearAllMocks();
  m.rateLimited = false;
  m.rateCalls.length = 0;
  m.registration.mockResolvedValue(true);
  m.findUser.mockImplementation(async ({where}:{where:{id:string}}) => {
    const name=where.id.replace("USER_","");
    const role=name==="USER"?"USER":name==="MOD"?"MODERATOR":["A","B"].includes(name)?"PARTNER":null;
    return role ? {sessionsRevokedAt:null,registrationPending:false,role} : null;
  });
  m.profile.mockImplementation(async (id: string) => ({
    userId: id, isActive: id !== "USER_B",
    bankAccount: SECRET, payoutDetails: { card: SECRET },
    user: { email: SECRET, role: "PARTNER" },
  }));
  m.dashboard.mockImplementation(async (id: string) => ({
    referralCode: "PROMO_" + id,
    referrals: id === "USER_A" ? 3 : 0,
    earnedKopecks: id === "USER_A" ? 25_000 : 0,
    reservedKopecks: id === "USER_A" ? 5_000 : 0,
    availableKopecks: id === "USER_A" ? 20_000 : 0,
    buyerEmail: SECRET,
    payoutIban: SECRET,
    privateLedger: { paymentToken: SECRET },
  }));
});
const request = (who: string, url = path) => app.request(url, {
  method: "GET",
  headers: who ? { authorization: "Bearer " + (tokens[who] ?? who) } : {},
});
const privateRead = (r: Response) => {
  expect(r.headers.get("cache-control")).toBe("private, no-store");
  expect(r.headers.get("referrer-policy")).toBe("no-referrer");
};
const noCore = () => {
  expect(m.profile).not.toHaveBeenCalled();
  expect(m.dashboard).not.toHaveBeenCalled();
};

describe("AG1 ECON060 mounted real /partners/me read privacy and owner", () => {
  it("actor A -> B -> A preserves exact public dashboard DTO/active and no PII", async () => {
    for (const [who, expected] of [
      ["A", { referralCode: "PROMO_USER_A", referrals: 3, earnedKopecks: 25_000,
        reservedKopecks: 5_000, availableKopecks: 20_000, active: true }],
      ["B", { referralCode: "PROMO_USER_B", referrals: 0, earnedKopecks: 0,
        reservedKopecks: 0, availableKopecks: 0, active: false }],
      ["A", { referralCode: "PROMO_USER_A", referrals: 3, earnedKopecks: 25_000,
        reservedKopecks: 5_000, availableKopecks: 20_000, active: true }],
    ] as const) {
      const r = await request(who);
      expect(r.status).toBe(200);
      privateRead(r);
      expect(await r.json()).toEqual({ success: true, data: expected });
    }
    expect(m.profile.mock.calls).toEqual([["USER_A"], ["USER_B"], ["USER_A"]]);
    expect(m.dashboard.mock.calls).toEqual([["USER_A"], ["USER_B"], ["USER_A"]]);
  });
  it("ignores untrusted foreign userId query, uses real JWT principal", async () => {
    const r = await request("A", path + "?userId=USER_B&partnerId=OTHER&scope=all");
    expect(r.status).toBe(200);
    privateRead(r);
    expect((await r.json()).data.referralCode).toBe("PROMO_USER_A");
    expect(m.profile).toHaveBeenCalledWith("USER_A");
    expect(m.dashboard).toHaveBeenCalledWith("USER_A");
  });
  it.each(["", "bad.jwt.value"])("guest or invalid JWT is 401 before Core/DB %s", async who => {
    const r = await request(who);
    expect(r.status).toBe(401);
    privateRead(r);
    noCore();
  });
  it("unregistered provisional JWT still 401 before Core and remains private", async () => {
    m.registration.mockResolvedValueOnce(false);
    const r = await request("A");
    expect(r.status).toBe(401);
    privateRead(r);
    noCore();
  });
  it.each(["USER", "MOD"])("non-partner %s maps PARTNER_REQUIRED to 403, no dashboard", async who => {
    m.profile.mockRejectedValueOnce(new PartnerProgramError("PARTNER_REQUIRED"));
    const r = await request(who);
    expect(r.status).toBe(403);
    expect(await r.json()).toMatchObject({
      success: false, code: "PARTNER_REQUIRED", error: "PARTNER_REQUIRED",
    });
    privateRead(r);
    expect(m.dashboard).not.toHaveBeenCalled();
  });
  it("partner missing assigned promo preserves current 400 code and private", async () => {
    m.dashboard.mockRejectedValueOnce(new PartnerProgramError("PARTNER_PROMO_REQUIRED"));
    const r = await request("A");
    expect(r.status).toBe(400);
    expect(await r.json()).toMatchObject({
      success: false, code: "PARTNER_PROMO_REQUIRED",
    });
    privateRead(r);
  });
  it("empty zero balances are 200, not 404, no extra fields", async () => {
    const r = await request("B");
    expect(r.status).toBe(200);
    privateRead(r);
    expect(await r.json()).toEqual({ success: true, data: {
      referralCode: "PROMO_USER_B", referrals: 0, earnedKopecks: 0,
      reservedKopecks: 0, availableKopecks: 0, active: false,
    } });
  });
  it("unexpected Core error masks private message/stack, private cache", async () => {
    const e = new Error(SECRET);
    e.stack = SECRET;
    m.dashboard.mockRejectedValueOnce(e);
    const r = await request("A");
    expect(r.status).toBe(500);
    privateRead(r);
    expect(await r.json()).toEqual({
      success: false, code: "PARTNER_ERROR", error: "Внутренняя ошибка",
    });
  });
  it("early rate limiter 429 is private and does not call Core", async () => {
    m.rateLimited = true;
    const r = await request("A");
    expect(r.status).toBe(429);
    privateRead(r);
    expect(m.rateCalls.length).toBeGreaterThan(0);
    noCore();
  });
});
