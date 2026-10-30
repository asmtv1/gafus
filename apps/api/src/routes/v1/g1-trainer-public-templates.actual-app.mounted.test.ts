/**
 * AG4(v5) TR013 frozen authenticated PUBLIC-template read-only contract.
 * ACTUAL registered Hono/JWT/auth/rate -> mocked existing Core -> in-process
 * Prisma auth session. No real SQL/Redis/network/TLS/device/mutations.
 */
import { randomBytes } from "node:crypto";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type * as PrismaModule from "@gafus/prisma";

const m = vi.hoisted(() => ({
  templates: vi.fn(), visibleSteps: vi.fn(),
  registered: vi.fn(), session: vi.fn(), write: vi.fn(),
  rateLimited: false, rateKeys: [] as string[],
}));
vi.mock("@hono-rate-limiter/redis", () => ({
  RedisStore: class {
    windowMs = 60_000;
    init(x: { windowMs: number }) { this.windowMs = x.windowMs; }
    async increment(key: string) {
      m.rateKeys.push(key);
      return {
        totalHits: m.rateLimited ? 101 : 1,
        resetTime: new Date(Date.now() + this.windowMs),
      };
    }
    async decrement() { return undefined; }
    async resetKey() { return undefined; }
  },
}));
vi.mock("@gafus/prisma", async actual => {
  const a = await actual<typeof PrismaModule>();
  return {
    ...a,
    prisma: {
      ...a.prisma,
      user: { ...a.prisma.user, findUnique: m.session },
      stepTemplate: {
        ...a.prisma.stepTemplate,
        create: m.write, update: m.write, delete: m.write,
        deleteMany: m.write, updateMany: m.write,
      },
      step: {
        ...a.prisma.step,
        create: m.write, update: m.write, delete: m.write,
      },
      $transaction: m.write,
    },
  };
});
vi.mock("@gafus/core/services/auth", async original => ({
  ...await original<object>(), isRegistrationCompleted: m.registered,
}));
vi.mock("@gafus/core/services/trainerStep", async (importOriginal) => ({
  ...await importOriginal<typeof import("@gafus/core/services/trainerStep")>(),
  getStepTemplates: m.templates,
  getVisibleSteps: m.visibleSteps,
}));

import { app } from "../../app";
import { generateAccessToken } from "@gafus/auth/jwt";
import {
  templateListItemSchema,
  TR013_PUBLIC_TEMPLATE_LIST_PATH,
} from "../../../../../apps/trainer-panel/src/trainer-vite/tr013TemplateListRead20261022";

const SECRET = "SECRET_TEMPLATE_AUTHOR_EMAIL_PROFILE_BILLING_CREDENTIALS";
const TRAINING = "cat-training";
const SPORTS = "cat-sport";
const actors = {
  A: { id: "trainer-A", username: "trainer_a", role: "TRAINER" },
  B: { id: "trainer-B", username: "trainer_b", role: "TRAINER" },
  ADMIN: { id: "admin-1", username: "admin", role: "ADMIN" },
  MOD: { id: "moderator-1", username: "mod", role: "MODERATOR" },
  USER: { id: "user-1", username: "user", role: "USER" },
  PARTNER: { id: "partner-1", username: "partner", role: "PARTNER" },
} as const;
const jwt: Record<string, string> = {};
const date = (iso: string) => new Date(iso);
const make = (id: string, authorId: string, extra: Record<string, unknown> = {}) => ({
  id, title: "Template " + id, description: "Description " + id,
  durationSec: 120, estimatedDurationSec: 88,
  type: "TRAINING", imageUrls: ["/img/" + id + ".png"],
  pdfUrls: [], videoUrl: null, checklist: null,
  requiresVideoReport: false, requiresWrittenFeedback: true,
  hasTestQuestions: false, surveySlug: null,
  tags: ["learning"], isPublic: true, usageCount: 10,
  categoryId: TRAINING,
  category: { id: TRAINING, name: "Training", icon: "paw",
    privateOwner: SECRET, billingSecret: SECRET },
  authorId,
  author: { id: authorId, username: "user_" + authorId,
    email: SECRET, passwordHash: SECRET, profile: { privateNote: SECRET } },
  createdAt: date("2026-10-20T09:00:00.000Z"),
  updatedAt: date("2026-10-21T09:00:00.000Z"),
  sourceMediaSignature: SECRET, privatePayment: SECRET,
  ...extra,
});
const stored = [
  make("A-older", actors.A.id, {
    usageCount: 10, createdAt: date("2026-10-18T09:00:00.000Z"),
  }),
  make("B-popular", actors.B.id, {
    usageCount: 30, categoryId: SPORTS,
    category: { id: SPORTS, name: "Sport", icon: null, privateOwner: SECRET },
    createdAt: date("2026-10-16T09:00:00.000Z"),
  }),
  make("A-private", actors.A.id, {
    isPublic: false, usageCount: 999, createdAt: date("2026-10-22T11:00:00.000Z"),
  }),
  make("A-newer", actors.A.id, {
    usageCount: 10, createdAt: date("2026-10-21T09:00:00.000Z"),
  }),
  make("B-null-category", actors.B.id, {
    usageCount: 1, categoryId: null, category: null,
    durationSec: null, type: "THEORY", videoUrl: "/hls/preview.m3u8",
    createdAt: date("2026-10-19T09:00:00.000Z"),
  }),
];
const sorted = (category?: string) => stored
  .filter(x => x.isPublic && (!category || x.categoryId === category))
  .sort((a, b) => (b.usageCount as number) - (a.usageCount as number) ||
    (b.createdAt as Date).getTime() - (a.createdAt as Date).getTime());
const request = (who: string, suffix = "", method = "GET") =>
  app.request(TR013_PUBLIC_TEMPLATE_LIST_PATH + suffix, {
    method,
    headers: who ? { authorization: "Bearer " + (jwt[who] ?? who) } : {},
  });
const privateHeaders = (response: Response) => {
  const cache = (response.headers.get("cache-control") ?? "").toLowerCase()
    .split(",").map(x => x.trim());
  expect(cache).toContain("private");
  expect(cache).toContain("no-store");
  expect(cache).not.toContain("public");
  expect(response.headers.get("referrer-policy")).toBe("no-referrer");
};
const noWrite = () => expect(m.write).not.toHaveBeenCalled();
const noCore = () => {
  expect(m.templates).not.toHaveBeenCalled();
  expect(m.visibleSteps).not.toHaveBeenCalled();
};
const safe = (x: unknown) => expect(JSON.stringify(x)).not.toContain(SECRET);
const projectedKeys = [
  "id", "title", "description", "durationSec", "type",
  "imageUrls", "pdfUrls", "videoUrl", "checklist",
  "requiresVideoReport", "requiresWrittenFeedback", "hasTestQuestions",
  "surveySlug", "tags", "isPublic", "usageCount", "category", "author",
  "createdAt",
].sort();
const checkPublicList = (response: Response, data: unknown[], category?: string) => {
  for (const row of data as Record<string, unknown>[]) {
    expect(Object.keys(row).sort()).toEqual(projectedKeys);
    expect(templateListItemSchema.safeParse(row).success).toBe(true);
    expect(row.isPublic).toBe(true);
    if (category) {
      expect((row.category as { id: string }).id).toBe(category);
    }
    const author = row.author as Record<string, unknown>;
    expect(Object.keys(author).sort()).toEqual(["id", "username"]);
    if (row.category) {
      expect(Object.keys(row.category as Record<string, unknown>).sort())
        .toEqual(["icon", "id", "name"]);
    }
    expect(row.createdAt).toMatch(/Z$/);
  }
  safe(data);
  privateHeaders(response);
};
beforeAll(async () => {
  process.env.JWT_SECRET = randomBytes(48).toString("hex");
  for (const [alias, actor] of Object.entries(actors))
    jwt[alias] = await generateAccessToken(actor);
});
beforeEach(() => {
  vi.clearAllMocks();
  m.rateLimited = false;
  m.rateKeys.length = 0;
  m.registered.mockResolvedValue(true);
  m.session.mockImplementation(async ({where}:{where:{id:string}}) => {
    const matched=Object.values(actors).find((candidate)=>candidate.id===where.id);
    return matched ? {sessionsRevokedAt:null,registrationPending:false,role:matched.role} : null;
  });
  m.templates.mockImplementation(async (category?: string) => sorted(category));
});

describe("AG4 TR013 registered GET /api/v1/trainer/templates frozen producer", () => {
  it.each(["A", "B", "ADMIN", "MOD"] as const)(
    "%s sees immutable public-only templates across mixed authors", async who => {
      const r = await request(who);
      expect(r.status).toBe(200);
      const body = await r.json();
      expect(Object.keys(body).sort()).toEqual(["data", "success"]);
      expect(body.success).toBe(true);
      expect(body.data.map((x: { id: string }) => x.id))
        .toEqual(["B-popular", "A-newer", "A-older", "B-null-category"]);
      expect(new Set(body.data.map((x: { author: { id: string } }) => x.author.id)))
        .toEqual(new Set([actors.A.id, actors.B.id]));
      expect(body.data[3].category).toBeNull();
      expect(body.data[3].durationSec).toBeNull();
      expect(body.data[3].type).toBe("THEORY");
      expect(body.data[0].category.icon).toBeNull();
      checkPublicList(r, body.data);
      expect(m.templates).toHaveBeenCalledExactlyOnceWith(undefined);
      expect(m.visibleSteps).not.toHaveBeenCalled();
      noWrite();
    },
  );
  it.each(["A", "MOD"] as const)(
    "%s category query uses exact existing Core category string", async who => {
      const r = await request(who, "?categoryId=" + TRAINING);
      expect(r.status).toBe(200);
      const body = await r.json();
      expect(body.data.map((x: { id: string }) => x.id))
        .toEqual(["A-newer", "A-older"]);
      checkPublicList(r, body.data, TRAINING);
      expect(m.templates).toHaveBeenCalledExactlyOnceWith(TRAINING);
      noWrite();
    },
  );
  it.each(["", "?categoryId="])(
    "omitted or empty category %s preserves current unfiltered Core contract", async suffix => {
      const r = await request("A", suffix);
      expect(r.status).toBe(200);
      const body = await r.json();
      expect(body.data.map((x: { id: string }) => x.id))
        .toEqual(["B-popular", "A-newer", "A-older", "B-null-category"]);
      expect(m.templates).toHaveBeenCalledExactlyOnceWith(undefined);
      checkPublicList(r, body.data);
      noWrite();
    },
  );
  it("unknown category gives [] rather than false 404, no owner fallback", async () => {
    const r = await request("B", "?categoryId=not-found");
    expect(r.status).toBe(200); privateHeaders(r);
    expect(await r.json()).toEqual({ success: true, data: [] });
    expect(m.templates).toHaveBeenCalledExactlyOnceWith("not-found");
    noWrite();
  });
  it("category encoding decoded once; no invented category normalization", async () => {
    const category = "собаки и тренировка/2026";
    const r = await request("A", "?categoryId=" + encodeURIComponent(category));
    expect(r.status).toBe(200); privateHeaders(r);
    expect(await r.json()).toEqual({ success: true, data: [] });
    expect(m.templates).toHaveBeenCalledExactlyOnceWith(category);
    noWrite();
  });
  it.each(["USER", "PARTNER"] as const)(
    "%s has 403 without invoking template Core", async who => {
      const r = await request(who);
      expect(r.status).toBe(403); privateHeaders(r);
      expect(await r.json()).toEqual({
        success: false, code: "FORBIDDEN", error: "Недостаточно прав",
      });
      noCore(); noWrite();
    },
  );
  it.each(["", "bad.jwt"])(
    "guest/bad JWT is 401 before limiter/Core: %s", async who => {
      const r = await request(who);
      expect(r.status).toBe(401); privateHeaders(r);
      expect(await r.json()).toEqual({
        success: false, code: "UNAUTHORIZED", error: "Не авторизован",
      });
      expect(m.rateKeys).toHaveLength(0);
      noCore(); noWrite();
    },
  );
  it("registration pending keeps existing distinct 401 machine code", async () => {
    m.registered.mockResolvedValueOnce(false);
    const r = await request("A");
    expect(r.status).toBe(401); privateHeaders(r);
    expect(await r.json()).toMatchObject({
      success: false, code: "REGISTRATION_PENDING",
    });
    noCore(); noWrite();
  });
  it("early rate limiter429 after signed actor, before Core", async () => {
    m.rateLimited = true;
    const r = await request("A");
    expect(r.status).toBe(429); privateHeaders(r);
    expect(await r.json()).toEqual({
      success: false, code: "RATE_LIMITED", error: "Слишком много запросов",
    });
    expect(m.rateKeys.length).toBeGreaterThan(0);
    noCore(); noWrite();
  });
  it.each([
    "?categoryId=a&categoryId=b", "?isAdmin=true",
    "?authorId=trainer-B", "?ownerId=trainer-B", "?userId=trainer-B",
    "?isPublic=false", "?page=2", "?limit=1", "?sort=name",
  ])("extra or duplicate query %s fails BAD_QUERY before Core", async suffix => {
    const r = await request("A", suffix);
    expect(r.status).toBe(400); privateHeaders(r);
    expect(await r.json()).toEqual({
      success: false, code: "BAD_QUERY", error: "Некорректный запрос",
    });
    noCore(); noWrite();
  });
  it("empty true Core result stays 200 [] and has no writes", async () => {
    m.templates.mockResolvedValueOnce([]);
    const r = await request("A");
    expect(r.status).toBe(200); privateHeaders(r);
    expect(await r.json()).toEqual({ success: true, data: [] });
    expect(m.templates).toHaveBeenCalledExactlyOnceWith(undefined);
    noWrite();
  });
  it("Core storage failure becomes generic 500, no false [] or raw provider error", async () => {
    m.templates.mockRejectedValueOnce(
      new Error(SECRET + " DB readonly author=trainer-B"),
    );
    const r = await request("ADMIN");
    expect(r.status).toBe(500); privateHeaders(r);
    const body = await r.json();
    expect(body).toEqual({
      success: false, code: "INTERNAL_SERVER_ERROR",
      error: "Внутренняя ошибка сервера",
    });
    safe(body); noWrite();
  });
  it.each(["private", "wrongCategory", "badDate", "badAuthor",
    "badCategory", "badCount", "unsorted", "badNullable"] as const)(
    "malformed Core %s fails closed 500 and cannot leak PII", async mode => {
      switch (mode) {
      case "private":
        m.templates.mockResolvedValueOnce([make("private", actors.A.id, {
          isPublic: false,
        })]); break;
      case "wrongCategory":
        m.templates.mockResolvedValueOnce([make("wrong-cat", actors.A.id, {
          categoryId: SPORTS,
          category: { id: SPORTS, name: "Sport", icon: null },
        })]); break;
      case "badDate":
        m.templates.mockResolvedValueOnce([make("date", actors.A.id, {
          createdAt: new Date(NaN),
        })]); break;
      case "badAuthor":
        m.templates.mockResolvedValueOnce([make("author", actors.A.id, {
          author: { id: "trainer-A", email: SECRET },
        })]); break;
      case "badCategory":
        m.templates.mockResolvedValueOnce([make("category", actors.A.id, {
          category: { id: TRAINING, name: "Training", icon: 7 },
        })]); break;
      case "badCount":
        m.templates.mockResolvedValueOnce([make("count", actors.A.id, {
          usageCount: -1,
        })]); break;
      case "unsorted":
        m.templates.mockResolvedValueOnce([...sorted()].reverse()); break;
      case "badNullable":
        m.templates.mockResolvedValueOnce([make("dur", actors.A.id, {
          durationSec: Number.NaN,
        })]); break;
      }
      const suffix = mode === "wrongCategory" ? "?categoryId=" + TRAINING : "";
      const r = await request("A", suffix);
      expect(r.status).toBe(500); privateHeaders(r);
      const body = await r.json();
      expect(body).toEqual({
        success: false, code: "INTERNAL_SERVER_ERROR",
        error: "Внутренняя ошибка сервера",
      });
      safe(body); noWrite();
    },
  );
  it("POST is not a template-write route and never invokes Core", async () => {
    const r = await request("A", "", "POST");
    expect(r.status).not.toBe(200); privateHeaders(r);
    noCore(); noWrite();
  });
});
