/** Actual Hono signed JWT -> current packaged Core getUserPets -> fake Prisma.
 * This intentionally DOES NOT mock Core pets or logger. No real IO/writes.
 */
import { randomBytes } from "node:crypto";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type * as PrismaModule from "@gafus/prisma";

const m = vi.hoisted(() => ({
  find: vi.fn(), session: vi.fn(), registration: vi.fn(), write: vi.fn(),
  rateKeys: [] as string[], throttle: false,
}));
vi.mock("@hono-rate-limiter/redis", () => ({
  RedisStore: class {
    windowMs = 60_000;
    init(o: {windowMs: number}) { this.windowMs = o.windowMs; }
    async increment(key: string) {
      m.rateKeys.push(key);
      return { totalHits: m.throttle ? 101 : 1,
        resetTime: new Date(Date.now() + this.windowMs) };
    }
    async decrement() { return undefined; }
    async resetKey() { return undefined; }
  },
}));
vi.mock("@gafus/prisma", async original => {
  const a = await original<typeof PrismaModule>();
  return { ...a, prisma: {
    ...a.prisma,
    user: { ...a.prisma.user, findUnique: m.session },
    pet: { ...a.prisma.pet, findMany: m.find, findFirst: m.write,
      create: m.write, update: m.write, updateMany: m.write, delete: m.write },
    award: { create: m.write, delete: m.write },
    $transaction: m.write,
  } };
});
vi.mock("@gafus/core/services/auth", async original => ({
  ...await original<object>(), isRegistrationCompleted: m.registration,
}));
// Explicitly no vi.mock of @gafus/core/services/pets or @gafus/logger.
import { app } from "../../app";
import { getUserPets } from "@gafus/core/services/pets";
import { generateAccessToken } from "@gafus/auth/jwt";
import { LoggerFactory, UnifiedLogger } from "@gafus/logger";

const actors = {
  A: { id: "owner_A", username: "a", role: "USER" },
  B: { id: "owner_B", username: "b", role: "USER" },
  ADMIN: { id: "admin_1", username: "admin", role: "ADMIN" },
} as const;
const tokens: Record<string, string> = {};
const SECRET = "PRIVATE_PET_PROVIDER_TOKEN_EMAIL";
const pet = (id: string, ownerId: string, date: string) => ({
  id, ownerId, name: "Pet "+id, type: "DOG", breed: "Mixed",
  birthDate: new Date("2020-04-05T00:00:00Z"),
  createdAt: new Date(date), updatedAt: new Date("2026-10-20T00:00:00Z"),
  showInProfile: false, notes: "note-" + ownerId + "-" + SECRET,
  awards: [
    { id: "early-" + ownerId, petId: id, date: new Date("2026-01-02") },
    { id: "late-" + ownerId, petId: id, date: new Date("2026-10-02") },
  ],
});
const rows = [
  pet("a-later", "owner_A", "2026-09-02"),
  pet("b-only", "owner_B", "2026-08-02"),
  pet("a-earlier", "owner_A", "2026-07-02"),
];
beforeAll(async () => {
  process.env.JWT_SECRET = randomBytes(48).toString("hex");
  for (const [name, actor] of Object.entries(actors)) {
    tokens[name] = await generateAccessToken(actor);
  }
});
beforeEach(() => {
  vi.clearAllMocks();
  m.throttle = false;
  m.rateKeys.length = 0;
  m.registration.mockResolvedValue(true);
  // JWT verification now enforces live DB role equality. A synthetic
  // session fixture must return the real role of the requested actor.
  m.session.mockImplementation(async ({where}:{where:{id:string}}) => ({
    sessionsRevokedAt:null,registrationPending:false,
    role:Object.values(actors).find(actor=>actor.id===where.id)?.role ?? "USER",
  }));
  m.find.mockImplementation(async (q: {
    where: {ownerId: string};
    include: {awards: {orderBy: {date: string}}};
    orderBy: {createdAt: string};
  }) => {
    const owned = rows.filter(x => x.ownerId === q.where.ownerId);
    if (q.orderBy.createdAt === "asc") {
      owned.sort((a,b) => a.createdAt.getTime()-b.createdAt.getTime());
    }
    return owned.map(x => ({ ...x, awards: q.include.awards.orderBy.date === "desc"
      ? [...x.awards].sort((a,b) => b.date.getTime()-a.date.getTime())
      : [...x.awards] }));
  });
});
const request = (who: string, path = "/api/v1/pets") => app.request(path, {
  method: "GET",
  headers: who ? { authorization: "Bearer " + (tokens[who] ?? who) } : {},
});
const privateHeaders = (r: Response) => {
  const cache = (r.headers.get("cache-control") ?? "")
    .toLowerCase().split(",").map(x => x.trim());
  expect(cache).toContain("private");
  expect(cache).toContain("no-store");
  expect(cache).not.toContain("public");
  expect(r.headers.get("referrer-policy")).toBe("no-referrer");
};
const query = (ownerId: string) => {
  expect(m.find).toHaveBeenCalledWith({
    where: {ownerId}, include: {
      awards: {orderBy: {date: "desc"}},
      _count: {select: {documents: true, preventionEntries: true}},
    },
    orderBy: {createdAt: "asc"},
  });
};
const zeroWrites = () => expect(m.write).not.toHaveBeenCalled();

describe("Pet list ACTUAL app -> actual Core -> synthetic Prisma", () => {
  it("real packaged getUserPets function callable", () => {
    expect(typeof getUserPets).toBe("function"); zeroWrites();
  });
  it("A B A owner-only notes and awards, sorted using actual Core query", async () => {
    for (const [who, owner, expected] of [
      ["A","owner_A",["a-earlier","a-later"]],
      ["B","owner_B",["b-only"]],
      ["A","owner_A",["a-earlier","a-later"]],
    ] as const) {
      const r = await request(who);
      expect(r.status).toBe(200); privateHeaders(r);
      const body = await r.json();
      expect(body.success).toBe(true);
      expect(body.data.map((x: {id: string})=>x.id)).toEqual(expected);
      for (const x of body.data) {
        expect(x.ownerId).toBe(owner);
        expect(x.notes).toBe("note-" + owner + "-" + SECRET);
        expect(x.awards.map((a: {id:string})=>a.id))
          .toEqual(["late-"+owner,"early-"+owner]);
      }
      expect(JSON.stringify(body)).not.toContain(
        "note-" + (owner==="owner_A"?"owner_B":"owner_A") + "-" + SECRET,
      );
      query(owner); zeroWrites();
    }
    expect(m.find.mock.calls.map(([q])=>q.where.ownerId))
      .toEqual(["owner_A","owner_B","owner_A"]);
  });
  it("ADMIN cannot impersonate owner through query or verified role", async () => {
    const r = await request("ADMIN","/api/v1/pets?userId=owner_A");
    expect(r.status).toBe(200); privateHeaders(r);
    expect(await r.json()).toEqual({success:true,data:[]});
    query("admin_1"); zeroWrites();
  });
  it("USER A cannot query impersonate B through ownerId/userId extras", async () => {
    const r=await request("A","/api/v1/pets?ownerId=owner_B&userId=owner_B");
    expect(r.status).toBe(200); privateHeaders(r);
    const body=await r.json();
    expect(body.data.map((x:{id:string})=>x.id))
      .toEqual(["a-earlier","a-later"]);
    expect(JSON.stringify(body)).not.toContain("note-owner_B-"+SECRET);
    query("owner_A"); zeroWrites();
  });
  it("provisional signed JWT rejected before private pet Prisma reads", async () => {
    m.registration.mockResolvedValueOnce(false);
    const r=await request("A");
    expect(r.status).toBe(401); privateHeaders(r);
    expect(await r.json()).toMatchObject({code:"REGISTRATION_PENDING"});
    expect(m.find).not.toHaveBeenCalled(); zeroWrites();
  });
  it("out-of-order parallel A/B Prisma responses remain actor scoped", async () => {
    const existing = m.find.getMockImplementation()!;
    const pending = new Map<string, () => void>();
    m.find.mockImplementation((q: {where:{ownerId:string}}) =>
      new Promise(resolve => {
        pending.set(q.where.ownerId, () => resolve(existing(q)));
      }));
    const a = request("A");
    const b = request("B");
    await vi.waitFor(() => expect(pending.size).toBe(2));
    pending.get("owner_B")!();
    pending.get("owner_A")!();
    const [ra,rb] = await Promise.all([a,b]);
    expect([ra.status,rb.status]).toEqual([200,200]);
    privateHeaders(ra); privateHeaders(rb);
    const [aa,bb] = await Promise.all([ra.json(),rb.json()]);
    expect(aa.data.map((x:{id:string})=>x.id)).toEqual(["a-earlier","a-later"]);
    expect(bb.data.map((x:{id:string})=>x.id)).toEqual(["b-only"]);
    zeroWrites();
  });
  it("empty owner list is 200 [] not a DB failure", async () => {
    const r=await request("ADMIN");
    expect(r.status).toBe(200); privateHeaders(r);
    expect(await r.json()).toEqual({success:true,data:[]});
    query("admin_1"); zeroWrites();
  });
  it("Prisma fault: 500, original private message/stack excluded by ACTUAL Core/API logger", async () => {
    const core = LoggerFactory.getAllLoggers().get("web:core-pets");
    const route = LoggerFactory.getAllLoggers().get("web:api-pets");
    expect(core).toBeInstanceOf(UnifiedLogger);
    expect(route).toBeInstanceOf(UnifiedLogger);
    const coreLog = vi.spyOn(core as UnifiedLogger, "error");
    const apiLog = vi.spyOn(route as UnifiedLogger, "error");
    const corePino = vi.spyOn((core as UnifiedLogger).getPinoLogger(),"error");
    const apiPino = vi.spyOn((route as UnifiedLogger).getPinoLogger(),"error");
    const failure = new Error(SECRET+" owner_A private@example.invalid");
    failure.stack = "PrivateError: "+SECRET+" actor=owner_A private@example.invalid";
    try {
      m.find.mockRejectedValueOnce(failure);
      const r = await request("A");
      expect(r.status).toBe(500); privateHeaders(r);
      const body = await r.json();
      expect(body).toEqual({success:false,error:"Внутренняя ошибка сервера"});
      // Logging the replacement Error still emits its local filesystem stack.
      // The owner-private GET does not need a stack at all.
      expect(coreLog).toHaveBeenCalledExactlyOnceWith(
        "PET_LIST_FAILED",
      );
      expect(apiLog).toHaveBeenCalledExactlyOnceWith(
        "PET_LIST_FAILED",
      );
      expect(corePino).toHaveBeenCalledExactlyOnceWith(
        { err: undefined }, "PET_LIST_FAILED",
      );
      expect(apiPino).toHaveBeenCalledExactlyOnceWith(
        { err: undefined }, "PET_LIST_FAILED",
      );
      const observed = JSON.stringify([
        body,coreLog.mock.calls,apiLog.mock.calls,
        corePino.mock.calls,apiPino.mock.calls,
      ]);
      for(const sensitive of [SECRET,"owner_A","private@example.invalid"]) {
        expect(observed).not.toContain(sensitive);
      }
      expect(observed).not.toContain("stack");
      zeroWrites();
    } finally {
      apiPino.mockRestore(); corePino.mockRestore();
      apiLog.mockRestore(); coreLog.mockRestore();
    }
  });
  it("guest/invalid JWT 401 private before Core", async () => {
    for(const who of ["","bad.jwt"]){
      const r=await request(who);
      expect(r.status).toBe(401); privateHeaders(r);
    }
    expect(m.find).not.toHaveBeenCalled(); zeroWrites();
  });
  it("limiter 429 private before Core", async () => {
    m.throttle=true;
    const r=await request("A");
    expect(r.status).toBe(429); privateHeaders(r);
    expect(m.find).not.toHaveBeenCalled(); zeroWrites();
  });
});
