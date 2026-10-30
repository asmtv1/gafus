/** Opt-in original Hono router + real Core + isolated PostgreSQL with synthetic staff. */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { prisma } from "@gafus/prisma";

const v = vi.hoisted(() => ({
  verify: vi.fn(async (token: string) => {
    const actors: Record<string, { id: string; username: string; role: string }> = {
      "admin-test-token": { id: "admin5_http_admin", username: "synthetic-admin", role: "ADMIN" },
      "mod-test-token": {
        id: "admin5_http_moderator",
        username: "synthetic-mod",
        role: "MODERATOR",
      },
      "trainer-test-token": {
        id: "admin5_http_trainer",
        username: "synthetic-trainer",
        role: "TRAINER",
      },
      "user-test-token": { id: "admin5_http_user", username: "synthetic-user", role: "USER" },
    };
    return actors[token] ?? null;
  }),
}));
vi.mock("@gafus/auth/jwt", () => ({ verifyAccessToken: v.verify }));
vi.mock("@gafus/core/services/auth", () => ({ isRegistrationCompleted: async () => true }));
// Load the REAL modified Core source, not its old compiled dist, and no fake CRUD.
vi.mock(
  "@gafus/core/services/consultation",
  async () => import("../../../../../packages/core/src/services/consultation/index"),
);
vi.mock("@gafus/logger", () => ({
  createWebLogger: () => ({ info: vi.fn(), success: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import { authMiddleware } from "../../middleware/auth.js";
import { adminConsultationScheduleRoutes } from "./admin-consultation-schedules";
import { consultationMskDayKey } from "../../../../../packages/core/src/services/consultation/consultationMskFormat";
import { getAvailableSlots } from "../../../../../packages/core/src/services/consultation/slotService";

const root = "/api/v1/admin/consultations/schedules";
const trainerId = "admin5_http_trainer";
const cynId = "admin5_http_cyno";
const databaseUrl = "postgresql://asmtv1@127.0.0.1:55695/gafus_admin5_isolated";
const range = () =>
  `?fromUtc=${encodeURIComponent(new Date().toISOString())}&toUtc=${encodeURIComponent(new Date(Date.now() + 14 * 86400000).toISOString())}`;
const app = new Hono();
app.use(`${root}/*`, authMiddleware);
app.route(root, adminConsultationScheduleRoutes);
const rule = (startTime = "09:00") => ({
  weekday: 1,
  startTime,
  endTime: "12:00",
  isWorkingDay: true,
});
function req(
  path: string,
  method = "GET",
  body?: object,
  actor: "admin" | "mod" | "trainer" | "user" | "guest" = "admin",
) {
  const token = {
    admin: "admin-test-token",
    mod: "mod-test-token",
    trainer: "trainer-test-token",
    user: "user-test-token",
    guest: "",
  }[actor];
  return app.request(`http://127.0.0.1:5173${root}${path}`, {
    method,
    headers: {
      ...(token ? { cookie: `gafus_access=${token}` } : {}),
      "x-gafus-auth-transport": "cookie",
      origin: "http://127.0.0.1:5173",
      ...(body ? { "content-type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
const run = process.env.ADMIN5_SCHEDULE_REALPG_RUN === "1" ? describe : describe.skip;
let verifiedIsolatedDatabase = false;
run("ADMIN5 original staff Hono cookie -> real Core -> isolated PG and client readback", () => {
  beforeAll(async () => {
    if (process.env.DATABASE_URL !== databaseUrl) throw Error("ADMIN5 unexpected DATABASE_URL");
    const identity = await prisma.$queryRaw<{ db: string; role: string; port: number }[]>`
      SELECT current_database() AS db, current_user AS role, inet_server_port() AS port`;
    expect(identity).toEqual([{ db: "gafus_admin5_isolated", role: "asmtv1", port: 55695 }]);
    verifiedIsolatedDatabase = true;
    expect(await prisma.consultationCynologist.findUnique({ where: { id: cynId } })).toBeNull();
    await prisma.consultationCynologist.create({
      data: { id: cynId, userId: trainerId, slotHorizonDays: 17, slotDurationMin: 30 },
    });
  });
  afterAll(async () => {
    if (verifiedIsolatedDatabase) {
      await prisma.consultationCynologist.deleteMany({ where: { id: cynId } });
    }
    await prisma.$disconnect();
  });

  it("rejects guest, ordinary user, trainer and moderator without changing Core", async () => {
    for (const [actor, status] of [
      ["guest", 401],
      ["user", 403],
      ["trainer", 403],
      ["mod", 403],
    ] as const) {
      expect((await req(`/${trainerId}${range()}`, "GET", undefined, actor)).status).toBe(status);
      expect((await req(`/${trainerId}`, "PUT", { rules: [rule()] }, actor)).status).toBe(status);
    }
    expect(
      await prisma.consultationAvailabilityRule.count({ where: { cynologistId: cynId } }),
    ).toBe(0);
  });

  it("rejects invalid weekdays, fake dates, nontrainer IDs, and bad time intervals", async () => {
    expect((await req(`/${trainerId}`, "PUT", { rules: [rule(), rule()] })).status).toBe(400);
    expect((await req(`/${trainerId}/day-offs`, "POST", { date: "2026-02-31" })).status).toBe(400);
    expect(
      (
        await req(`/${trainerId}/exceptions`, "POST", {
          startAt: "2026-11-01T16:00:00Z",
          endAt: "2026-11-01T15:00:00Z",
        })
      ).status,
    ).toBe(400);
    expect((await req(`/admin5_http_user${range()}`)).status).toBe(403);
    expect((await req(`/${trainerId}?fromUtc=bad&toUtc=bad`)).status).toBe(400);
  });

  it("genuine cookie-origin PUT, GET, POST/DELETE day-off and exception affect client slots", async () => {
    const saved = await req(`/${trainerId}`, "PUT", { rules: [rule()] });
    expect(saved.status).toBe(200);
    const read = await req(`/${trainerId}${range()}`);
    expect(read.status).toBe(200);
    expect(read.headers.get("cache-control")).toContain("no-store");
    const payload = (await read.json()) as {
      data: {
        availability: {
          rules: { weekday: number }[];
          dayOffs: { id: string; date: string }[];
          exceptions: { id: string; startAtUtc: string }[];
        };
        editableSlots: { startAtUtc: string; endAtUtc: string }[];
      };
    };
    expect(payload.data.availability.rules).toMatchObject([{ weekday: 1 }]);
    const slot = payload.data.editableSlots[0];
    expect(slot).toBeDefined();
    const date = consultationMskDayKey(new Date(slot!.startAtUtc));
    expect(
      (await req(`/${trainerId}/day-offs`, "POST", { date, reason: "synthetic" })).status,
    ).toBe(200);
    const blocked = await getAvailableSlots(
      trainerId,
      new Date(),
      new Date(Date.now() + 14 * 86400000),
    );
    expect(blocked.some((s) => consultationMskDayKey(new Date(s.startAtUtc)) === date)).toBe(false);
    const withDayOff = await req(`/${trainerId}${range()}`);
    const dayData = (await withDayOff.json()) as {
      data: {
        availability: {
          dayOffs: { id: string; date: string }[];
        };
      };
    };
    const dayOffId = dayData.data.availability.dayOffs.find((d) => d.date === date)?.id;
    expect(dayOffId).toBeTruthy();
    expect((await req(`/${trainerId}/day-offs/${dayOffId}`, "DELETE")).status).toBe(200);

    expect(
      (
        await req(`/${trainerId}/exceptions`, "POST", {
          startAt: slot!.startAtUtc,
          endAt: slot!.endAtUtc,
          reason: "synthetic",
        })
      ).status,
    ).toBe(200);
    const afterEx = await getAvailableSlots(
      trainerId,
      new Date(),
      new Date(Date.now() + 14 * 86400000),
    );
    expect(afterEx.some((s) => s.startAtUtc === slot!.startAtUtc)).toBe(false);
    const exRead = await req(`/${trainerId}${range()}`);
    const exData = (await exRead.json()) as {
      data: {
        availability: {
          exceptions: { id: string; startAtUtc: string }[];
        };
      };
    };
    const exId = exData.data.availability.exceptions.find(
      (e) => e.startAtUtc === slot!.startAtUtc,
    )?.id;
    expect(exId).toBeTruthy();
    expect((await req(`/${trainerId}/exceptions/${exId}`, "DELETE")).status).toBe(200);
    const restored = await getAvailableSlots(
      trainerId,
      new Date(),
      new Date(Date.now() + 14 * 86400000),
    );
    expect(restored.some((s) => s.startAtUtc === slot!.startAtUtc)).toBe(true);
  });

  it("old admin token is denied after database role demotion", async () => {
    await prisma.$executeRaw`UPDATE "User" SET role='USER' WHERE id='admin5_http_admin'`;
    try {
      expect((await req(`/${trainerId}${range()}`)).status).toBe(403);
      expect((await req(`/${trainerId}`, "PUT", { rules: [rule()] })).status).toBe(403);
    } finally {
      await prisma.$executeRaw`UPDATE "User" SET role='ADMIN' WHERE id='admin5_http_admin'`;
    }
  });
});
