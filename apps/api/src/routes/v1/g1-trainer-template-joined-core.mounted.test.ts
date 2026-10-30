/**
 * AG1 TR013: ACTUAL registered app -> actual packaged Core getStepTemplates
 * -> synthetic Prisma. Core is never mocked. Read-only, no Next UI, no
 * listener/HTTP network, real PostgreSQL/Redis, SQL migration or writes.
 */
import { randomBytes } from "node:crypto";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type * as PrismaModule from "@gafus/prisma";

const m = vi.hoisted(() => ({
  find: vi.fn(), session: vi.fn(), registration: vi.fn(),
  write: vi.fn(), otherStep: vi.fn(),
  rateLimited: false, rateKeys: [] as string[],
}));
vi.mock("@hono-rate-limiter/redis", () => ({
  RedisStore: class {
    windowMs = 60_000;
    init(arg: { windowMs: number }) { this.windowMs = arg.windowMs; }
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
vi.mock("@gafus/prisma", async original => {
  const actual = await original<typeof PrismaModule>();
  return {
    ...actual,
    prisma: {
      ...actual.prisma,
      user: { ...actual.prisma.user, findUnique: m.session },
      stepTemplate: {
        ...actual.prisma.stepTemplate,
        findMany: m.find,
        create: m.write, update: m.write, delete: m.write,
        deleteMany: m.write, updateMany: m.write, upsert: m.write,
      },
      step: {
        ...actual.prisma.step,
        findMany: m.otherStep,
        create: m.write, update: m.write, delete: m.write,
      },
      $transaction: m.write,
    },
  };
});
vi.mock("@gafus/core/services/auth", async original => ({
  ...await original<object>(),
  isRegistrationCompleted: m.registration,
}));
// Intentionally NO vi.mock for @gafus/core/services/trainerStep or Core service.
import { app } from "../../app";
import { generateAccessToken } from "@gafus/auth/jwt";
import { getStepTemplates } from "@gafus/core/services/trainerStep";
import {
  templateListItemSchema,
  TR013_PUBLIC_TEMPLATE_LIST_PATH,
} from "../../../../../apps/trainer-panel/src/trainer-vite/tr013TemplateListRead20261022";

const SECRET = "PRIVATE_TR013_EMAIL_SESSION_ACCESS_PAYMENT_68918";
const ALPHA = "cat-alpha";
const BETA = "cat-beta";
const actors = {
  A: { id: "trainer-source-A", username: "trainer_a", role: "TRAINER" },
  B: { id: "trainer-source-B", username: "trainer_b", role: "TRAINER" },
  ADMIN: { id: "admin-source", username: "admin", role: "ADMIN" },
  MOD: { id: "moderator-source", username: "mod", role: "MODERATOR" },
  USER: { id: "user-source", username: "user", role: "USER" },
  PARTNER: { id: "partner-source", username: "partner", role: "PARTNER" },
} as const;
const tokens: Record<string, string> = {};
const d = (iso: string) => new Date(iso);
type Row = {
  id: string; title: string; description: string; durationSec: number | null;
  estimatedDurationSec: number | null; type: string;
  imageUrls: string[]; pdfUrls: string[]; videoUrl: string | null;
  checklist: null; requiresVideoReport: boolean;
  requiresWrittenFeedback: boolean; hasTestQuestions: boolean;
  surveySlug: string | null; tags: string[]; isPublic: boolean;
  usageCount: number; categoryId: string | null; authorId: string;
  createdAt: Date; updatedAt: Date;
  category: { id: string; name: string; icon: string | null;
    privateTenantEmail: string } | null;
  author: { id: string; username: string; email: string;
    profile: { privateNote: string } };
  ownerPrivateNote: string;
};
const make = (id: string, owner: string, opts: Partial<Row> = {}): Row => ({
  id, title: "Template " + id, description: "Description " + id,
  durationSec: 90, estimatedDurationSec: 30, type: "TRAINING",
  imageUrls: ["/img/" + id + ".png"], pdfUrls: [],
  videoUrl: null, checklist: null, requiresVideoReport: false,
  requiresWrittenFeedback: true, hasTestQuestions: false, surveySlug: null,
  tags: ["training"], isPublic: true, usageCount: 10,
  categoryId: ALPHA, authorId: owner,
  createdAt: d("2026-10-18T08:00:00.000Z"),
  updatedAt: d("2026-10-20T08:00:00.000Z"),
  author: {
    id: owner, username: "user_" + owner, email: SECRET,
    profile: { privateNote: SECRET },
  },
  category: {
    id: ALPHA, name: "Alpha", icon: "paw", privateTenantEmail: SECRET,
  },
  ownerPrivateNote: SECRET,
  ...opts,
});
const rows: Row[] = [
  make("A-tied-older", actors.A.id, {
    createdAt: d("2026-10-17T08:00:00.000Z"),
  }),
  make("B-most-used", actors.B.id, {
    categoryId: BETA, usageCount: 50,
    category: { id: BETA, name: "Beta", icon: null, privateTenantEmail: SECRET },
    createdAt: d("2026-10-16T08:00:00.000Z"),
  }),
  make("A-hidden", actors.A.id, {
    isPublic: false, usageCount: 900,
    createdAt: d("2026-10-22T08:00:00.000Z"),
  }),
  make("B-tied-newer", actors.B.id, {
    createdAt: d("2026-10-21T08:00:00.000Z"),
  }),
  make("A-null-category", actors.A.id, {
    categoryId: null, category: null, usageCount: 1,
    type: "THEORY", durationSec: null, videoUrl: "/video/lesson.m3u8",
    createdAt: d("2026-10-15T08:00:00.000Z"),
  }),
];
const PUBLIC_IDS = [
  "B-most-used", "B-tied-newer", "A-tied-older", "A-null-category",
];
const coreQuery = (categoryId?: string) => ({
  where: { isPublic: true, ...(categoryId ? { categoryId } : {}) },
  include: {
    category: { select: { id: true, name: true, icon: true } },
    author: { select: { id: true, username: true } },
  },
  orderBy: [{ usageCount: "desc" }, { createdAt: "desc" }],
});
const selected = (input: Record<string, unknown>,
  select: Record<string, boolean>) =>
  Object.fromEntries(Object.entries(select)
    .filter(([, value]) => value)
    .map(([key]) => [key, input[key]]));
const storageRead = async (query: {
  where: { isPublic: boolean; categoryId?: string };
  include: { author: { select: Record<string, boolean> };
    category: { select: Record<string, boolean> } };
  orderBy: { usageCount?: string; createdAt?: string }[];
}) => {
  // Simulates Prisma, not business policy in the route:
  // obey WHERE and ORDER BY supplied by the ACTUAL Core call.
  return rows
    .filter(row => row.isPublic === query.where.isPublic &&
      (query.where.categoryId === undefined ||
       row.categoryId === query.where.categoryId))
    .sort((a, b) => b.usageCount - a.usageCount ||
      b.createdAt.getTime() - a.createdAt.getTime())
    .map(row => ({
      ...row,
      author: selected(row.author, query.include.author.select),
      category: row.category
        ? selected(row.category, query.include.category.select) : null,
    }));
};
const request = (actor: string, query = "") =>
  app.request(TR013_PUBLIC_TEMPLATE_LIST_PATH + query, {
    method: "GET",
    headers: actor ? { authorization: "Bearer " + (tokens[actor] ?? actor) } : {},
  });
const privateHeaders = (r: Response) => {
  const cc = (r.headers.get("cache-control") ?? "")
    .toLowerCase().split(",").map(x => x.trim());
  expect(cc).toContain("private");
  expect(cc).toContain("no-store");
  expect(cc).not.toContain("public");
  expect(r.headers.get("referrer-policy")).toBe("no-referrer");
};
const noWrites = () => {
  expect(m.write).not.toHaveBeenCalled();
  expect(m.otherStep).not.toHaveBeenCalled();
};
const exactQuery = (categoryId?: string) => {
  expect(m.find).toHaveBeenCalledExactlyOnceWith(coreQuery(categoryId));
};
const assertDto = (input: unknown) => {
  const row = input as Record<string, unknown>;
  expect(templateListItemSchema.safeParse(input).success).toBe(true);
  expect(Object.keys(row).sort()).toEqual([
    "id", "title", "description", "durationSec", "type", "imageUrls",
    "pdfUrls", "videoUrl", "checklist", "requiresVideoReport",
    "requiresWrittenFeedback", "hasTestQuestions", "surveySlug", "tags",
    "isPublic", "usageCount", "category", "author", "createdAt",
  ].sort());
  expect(Object.keys(row.author as Record<string, unknown>).sort())
    .toEqual(["id", "username"]);
  if (row.category !== null) {
    expect(Object.keys(row.category as Record<string, unknown>).sort())
      .toEqual(["icon", "id", "name"]);
  }
  expect(row.createdAt).toMatch(/Z$/);
  expect(JSON.stringify(row)).not.toContain(SECRET);
  expect(JSON.stringify(row)).not.toContain("authorId");
  expect(JSON.stringify(row)).not.toContain("updatedAt");
  expect(JSON.stringify(row)).not.toContain("estimatedDurationSec");
};
beforeAll(async () => {
  process.env.JWT_SECRET = randomBytes(48).toString("hex");
  for (const [name, actor] of Object.entries(actors))
    tokens[name] = await generateAccessToken(actor);
});
beforeEach(() => {
  vi.clearAllMocks();
  m.rateLimited = false;
  m.rateKeys.length = 0;
  m.registration.mockResolvedValue(true);
  m.session.mockImplementation(async ({ where }: { where: { id: string } }) => {
    const actor = Object.values(actors).find((candidate) => candidate.id === where.id);
    return actor ? {sessionsRevokedAt:null,registrationPending:false,role:actor.role} : null;
  });
  m.find.mockImplementation(storageRead);
});
describe("TR013 joined registered Hono -> actual Core -> synthetic Prisma", () => {
  it("actual Core symbol is live, not a whole-Core mock", () => {
    expect(typeof getStepTemplates).toBe("function");
    noWrites();
  });
  it("A -> B -> A signed JWT mixed PUBLIC authors, no client owner scope", async () => {
    for (const actor of ["A", "B", "A"] as const) {
      const res = await request(actor);
      expect(res.status).toBe(200);
      privateHeaders(res);
      const body = await res.json();
      expect(Object.keys(body).sort()).toEqual(["data", "success"]);
      expect(body.data.map((x: { id: string }) => x.id)).toEqual(PUBLIC_IDS);
      expect(new Set(body.data.map((x: { author: { id: string } }) =>
        x.author.id))).toEqual(new Set([actors.A.id, actors.B.id]));
      for (const row of body.data) assertDto(row);
      expect(body.data[3].category).toBeNull();
      expect(body.data[3].durationSec).toBeNull();
      expect(body.data[1].createdAt).toBe("2026-10-21T08:00:00.000Z");
      expect(body.data[2].createdAt).toBe("2026-10-17T08:00:00.000Z");
      expect(JSON.stringify(body)).not.toContain("A-hidden");
      exactQuery();
      noWrites();
      vi.clearAllMocks();
    }
  });
  it.each(["ADMIN", "MOD"] as const)(
    "%s keeps existing mixed PUBLIC author scope, not owner-only", async actor => {
      const res = await request(actor);
      expect(res.status).toBe(200);
      privateHeaders(res);
      const body = await res.json();
      expect(body.data.map((x: { id: string }) => x.id)).toEqual(PUBLIC_IDS);
      for (const row of body.data) assertDto(row);
      exactQuery();
      noWrites();
    },
  );
  it.each([
    ["?categoryId=" + ALPHA, ALPHA, ["B-tied-newer", "A-tied-older"]],
    ["?categoryId=" + BETA, BETA, ["B-most-used"]],
    ["", undefined, PUBLIC_IDS],
    ["?categoryId=", undefined, PUBLIC_IDS],
    ["?categoryId=unknown-category", "unknown-category", []],
  ] as const)("Core requested category %s supplies expected result", async (
    query, categoryId, ids,
  ) => {
    const res = await request("A", query);
    expect(res.status).toBe(200);
    privateHeaders(res);
    const body = await res.json();
    expect(body.data.map((x: { id: string }) => x.id)).toEqual(ids);
    for (const row of body.data) assertDto(row);
    exactQuery(categoryId);
    noWrites();
  });
  it("nonempty encoded Unicode category is forwarded without normalization", async () => {
    const category = "собаки/уроки 2026";
    const res = await request("A", "?categoryId=" + encodeURIComponent(category));
    expect(res.status).toBe(200);
    privateHeaders(res);
    expect(await res.json()).toEqual({ success: true, data: [] });
    exactQuery(category);
    noWrites();
  });
  it("empty mock storage yields confirmed 200 [] with real Core call", async () => {
    m.find.mockResolvedValueOnce([]);
    const res = await request("A");
    expect(res.status).toBe(200);
    privateHeaders(res);
    expect(await res.json()).toEqual({ success: true, data: [] });
    exactQuery();
    noWrites();
  });
  it("storage DB error stays generic 500, not fabricated empty", async () => {
    m.find.mockRejectedValueOnce(
      new Error(SECRET + " synthetic SQL provider-private-stack"),
    );
    const res = await request("A");
    expect(res.status).toBe(500);
    privateHeaders(res);
    expect(await res.json()).toEqual({
      success: false, code: "INTERNAL_SERVER_ERROR",
      error: "Внутренняя ошибка сервера",
    });
    exactQuery();
    noWrites();
  });
  it.each([
    "private", "unsorted", "wrongCategory", "badDate", "badAuthor",
  ] as const)("actual Core returns malformed synthetic DB %s; route fails closed",
    async mode => {
      const normal = await storageRead(coreQuery(ALPHA));
      if (mode === "private") m.find.mockResolvedValueOnce([
        make("raw-hidden", actors.A.id, { isPublic: false }),
      ]);
      if (mode === "unsorted") m.find.mockResolvedValueOnce([...normal].reverse());
      if (mode === "wrongCategory") m.find.mockResolvedValueOnce([
        make("wrong-cat", actors.A.id, {
          categoryId: BETA,
          category: {
            id: BETA, name: "Beta", icon: null, privateTenantEmail: SECRET,
          },
        }),
      ]);
      if (mode === "badDate") m.find.mockResolvedValueOnce([
        make("invalid-date", actors.A.id, { createdAt: new Date(Number.NaN) }),
      ]);
      if (mode === "badAuthor") m.find.mockResolvedValueOnce([
        make("invalid-author", actors.A.id, {
          author: { id: "", username: "valid_username",
            email: SECRET, profile: { privateNote: SECRET } },
        }),
      ]);
      const res = await request("A", "?categoryId=" + ALPHA);
      expect(res.status).toBe(500);
      privateHeaders(res);
      const body = await res.json();
      expect(body).toEqual({
        success: false, code: "INTERNAL_SERVER_ERROR",
        error: "Внутренняя ошибка сервера",
      });
      expect(JSON.stringify(body)).not.toContain(SECRET);
      exactQuery(ALPHA);
      noWrites();
    });
  it.each(["USER", "PARTNER"] as const)(
    "%s forbidden before template Core/Prisma", async actor => {
      const res = await request(actor);
      expect(res.status).toBe(403);
      privateHeaders(res);
      expect(await res.json()).toEqual({
        success: false, code: "FORBIDDEN", error: "Недостаточно прав",
      });
      expect(m.find).not.toHaveBeenCalled();
      noWrites();
    },
  );
  it.each(["", "forged.jwt"])(
    "guest/invalid token 401 BEFORE limiter/Core %s", async actor => {
      const res = await request(actor);
      expect(res.status).toBe(401);
      privateHeaders(res);
      expect(await res.json()).toEqual({
        success: false, code: "UNAUTHORIZED", error: "Не авторизован",
      });
      expect(m.rateKeys).toHaveLength(0);
      expect(m.find).not.toHaveBeenCalled();
      noWrites();
    },
  );
  it("limiter 429 before actual Core/Prisma", async () => {
    m.rateLimited = true;
    const res = await request("A");
    expect(res.status).toBe(429);
    privateHeaders(res);
    expect(await res.json()).toEqual({
      success: false, code: "RATE_LIMITED", error: "Слишком много запросов",
    });
    expect(m.find).not.toHaveBeenCalled();
    noWrites();
  });
  it.each([
    "?isPublic=false", "?authorId=trainer-source-B",
    "?ownerId=trainer-source-B", "?categoryId=a&categoryId=b",
  ])("malformed query %s returns 400 BEFORE actual Core", async query => {
    const res = await request("A", query);
    expect(res.status).toBe(400);
    privateHeaders(res);
    expect(await res.json()).toEqual({
      success: false, code: "BAD_QUERY", error: "Некорректный запрос",
    });
    expect(m.find).not.toHaveBeenCalled();
    noWrites();
  });
});
