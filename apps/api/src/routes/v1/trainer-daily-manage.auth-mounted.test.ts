/** Real Hono authMiddleware + HS256 JWT + registered writer router, fake DB/Core.
 * Tests the CURRENT (role+revocation in one select) session contract. Never SQL.
 */
import { randomBytes } from "node:crypto";
import { Hono } from "hono";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type * as PrismaModule from "@gafus/prisma";

const mock = vi.hoisted(() => ({
  roles: {} as Record<string, string>,
  session: vi.fn(), registered: vi.fn(),
}));
vi.mock("@gafus/prisma", async original => {
  const live = await original<typeof PrismaModule>();
  return { ...live, prisma: { ...live.prisma,
    user: { ...live.prisma.user, findUnique: mock.session },
  } };
});
vi.mock("@gafus/core/services/auth", async original => ({
  ...await original<object>(), isRegistrationCompleted: mock.registered,
}));

import { authMiddleware } from "../../middleware/auth";
import { generateAccessToken } from "@gafus/auth/jwt";
import { createTrainerDailyManageRoutes, type TrainerDailyManagePorts } from
  "./trainer-daily-manage";

const accounts = {
  admin: { id: "SCHEDULE_ADMIN", username: "admin", role: "ADMIN" as const },
  trainer: { id: "SCHEDULE_TRAINER", username: "trainer", role: "TRAINER" as const },
  moderator: { id: "SCHEDULE_MOD", username: "mod", role: "MODERATOR" as const },
  user: { id: "SCHEDULE_USER", username: "user", role: "USER" as const },
};
type Account = keyof typeof accounts;
const tokens: Record<string, string> = {};
beforeAll(async () => {
  vi.stubEnv("JWT_SECRET", randomBytes(48).toString("hex"));
  for (const [name, account] of Object.entries(accounts)) {
    tokens[name] = await generateAccessToken(account);
  }
});
beforeEach(() => {
  vi.clearAllMocks();
  mock.roles = Object.fromEntries(Object.values(accounts).map(a => [a.id, a.role]));
  mock.registered.mockResolvedValue(true);
  mock.session.mockImplementation(async (input: {
    where: { id: string };
    select: { sessionsRevokedAt: boolean; registrationPending: boolean; role: boolean };
  }) => {
    // Exact current projection matters: returning only revocation data rejects
    // the JWT because its signed role is checked on each request.
    if (!input.select.sessionsRevokedAt || !input.select.registrationPending ||
        !input.select.role) throw Error("INVALID_SESSION_READ_PROJECTION");
    const role = mock.roles[input.where.id];
    return role ? { sessionsRevokedAt: null, registrationPending: false, role } : null;
  });
});

function build() {
  const ports = {
    putBundle: vi.fn(async () => ({ success: true as const, id: "bundle-A" })),
    deleteBundle: vi.fn(async () => ({ success: true as const })),
    putSchedule: vi.fn(async () => ({ success: true as const, id: "schedule-A" })),
    deleteSchedule: vi.fn(async () => ({ success: true as const })),
  } satisfies TrainerDailyManagePorts;
  const app = new Hono();
  app.use("/api/v1/trainer/daily-course/manage/*", async (c, next) => {
    c.header("Cache-Control", "private, no-store");
    await next();
  });
  app.use("/api/v1/trainer/daily-course/manage/*", authMiddleware);
  app.route("/api/v1/trainer/daily-course/manage", createTrainerDailyManageRoutes(ports));
  const request = (who: Account | "guest", path: string, method: "PUT" | "DELETE",
    body?: unknown) => app.request(`/api/v1/trainer/daily-course/manage/${path}`, {
    method,
    headers: {
      ...(who === "guest" ? {} : { Authorization: `Bearer ${tokens[who]}` }),
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { ports, request };
}

describe("live JWT role policy around trainer calendar writer", () => {
  it("ADMIN signed JWT reaches Core PUT, with verified actor and private response", async () => {
    const { ports, request } = build();
    const r = await request("admin", "schedule", "PUT", {
      date: "2026-11-05", bundleId: "BUNDLE-A", isPublished: false,
    });
    expect(r.status).toBe(200);
    expect(r.headers.get("cache-control")).toContain("no-store");
    expect(ports.putSchedule).toHaveBeenCalledWith({ id: accounts.admin.id, role: "ADMIN" },
      { date: "2026-11-05", bundleId: "BUNDLE-A", isPublished: false });
  });
  it("TRAINER signed JWT can edit own bundles but cannot overwrite global date", async () => {
    const { ports, request } = build();
    const r = await request("trainer", "schedule", "PUT", {
      date: "2026-11-05", bundleId: "BUNDLE-A", isPublished: true,
    });
    expect(r.status).toBe(403);
    expect(ports.putSchedule).not.toHaveBeenCalled();
    const bundle = await request("trainer", "bundles", "PUT", {
      title: "Связка", stepIds: ["one", "two"], type: "daily_course",
    });
    expect(bundle.status).toBe(200);
    expect(ports.putBundle).toHaveBeenCalledWith({ id: accounts.trainer.id, role: "TRAINER" },
      expect.objectContaining({ title: "Связка" }));
  });
  it("MODERATOR, USER and unauthenticated requests cannot invoke Core writes", async () => {
    const { ports, request } = build();
    for (const who of ["moderator", "user", "guest"] as const) {
      const response = await request(who, "bundles", "PUT", {
        title: "Forbidden", stepIds: ["one", "two"],
      });
      expect(response.status).toBe(who === "guest" ? 401 : 403);
    }
    expect(ports.putBundle).not.toHaveBeenCalled();
  });
  it("old ADMIN JWT is denied after server-side role demotion", async () => {
    const { ports, request } = build();
    mock.roles[accounts.admin.id] = "USER";
    const response = await request("admin", "schedule", "PUT", {
      date: "2026-11-05", bundleId: "BUNDLE-A", isPublished: true,
    });
    expect(response.status).toBe(401);
    expect(ports.putSchedule).not.toHaveBeenCalled();
  });
  it("Core delete rejects are visible as non-200 with no secret leakage", async () => {
    const { ports, request } = build();
    vi.mocked(ports.deleteBundle).mockRejectedValueOnce(new Error("PRIVATE_SQL_DETAILS"));
    const r = await request("trainer", "bundles/bundle-A", "DELETE");
    expect(r.status).toBe(409);
    expect(JSON.stringify(await r.json())).not.toContain("PRIVATE_SQL_DETAILS");
  });
});
