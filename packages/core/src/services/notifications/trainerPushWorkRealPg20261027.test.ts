/** Actual WORK PostgreSQL persistence, fake queue, no device/provider delivery. */
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@gafus/prisma";
const m = vi.hoisted(() => ({
  add: vi.fn(async () => ({ id: "synthetic-push-job-only" })),
}));
vi.mock("@gafus/queues", () => ({ pushQueue: { add: m.add } }));
vi.mock("@gafus/logger", () => ({
  createWebLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), success: vi.fn() }),
}));
import { sendImmediatePushNotification } from "./immediatePushService";
const nonce = randomBytes(10).toString("hex");
const user = "push_trainer_" + nonce;
const subscription = "push_sub_" + nonce;
const notificationIds: string[] = [];
async function guard() {
  const d = new URL(process.env.DATABASE_URL ?? "postgresql://invalid/invalid");
  if (process.env.GAFUS_TRAINER_WORK_REALPG !== "1" ||
      d.hostname !== "127.0.0.1" || d.port !== "55921" ||
      d.pathname !== "/gafus_refactor_real_work_20261024" ||
      d.username !== "gafus_refactor_local_real" || d.search !== "?schema=public" ||
      !d.password) throw Error("REFUSE_NON_WORK");
  const rows = await prisma.$queryRawUnsafe<{ db: string; principal: string; addr: string }[]>(
    "SELECT current_database() AS db, current_user AS principal, inet_server_addr()::text AS addr",
  );
  if (rows[0]?.db !== "gafus_refactor_real_work_20261024" ||
      rows[0]?.principal !== "gafus_refactor_local_real" ||
      !["127.0.0.1", "127.0.0.1/32"].includes(rows[0].addr))
    throw Error("WRONG_POSTGRES");
}
describe.skipIf(process.env.GAFUS_TRAINER_WORK_REALPG !== "1")(
  "consultation immediate push persists recipient+payload and queues by notification ID",
  () => {
    let ownsUser = false, ownsSubscription = false;
    beforeAll(async () => {
      await guard();
      if (await prisma.user.count({ where: { id: user } })) throw Error("SYNTHETIC_COLLISION");
      await prisma.user.create({ data: {
        id: user, username: user, email: user + "@invalid.example",
        password: "INVALID_NO_LOGIN", role: "TRAINER",
      } });
      ownsUser = true;
      await prisma.pushSubscription.create({ data: {
        id: subscription, userId: user,
        endpoint: "ExpoPushToken[synthetic-consultation-" + nonce + "]",
        keys: {},
      } });
      ownsSubscription = true;
    });
    afterAll(async () => {
      try {
        await guard();
        await prisma.stepNotification.deleteMany({ where: { id: { in: notificationIds } } });
        if (ownsSubscription) {
          await prisma.pushSubscription.deleteMany({ where: { id: subscription } });
        }
        if (ownsUser) await prisma.user.deleteMany({ where: { id: user } });
      } finally { await prisma.$disconnect(); }
    });
    it("writes full trainer consultation push to WORK DB and passes exact ID to queue", async () => {
      const out = await sendImmediatePushNotification({
        userId: user,
        title: "Новая заявка на консультацию",
        body: "Подтвердите заявку",
        url: "/main-panel/consultations",
      });
      expect(out.success).toBe(true);
      expect(out.notificationId).toBeTruthy();
      notificationIds.push(out.notificationId!);
      const row = await prisma.stepNotification.findUniqueOrThrow({
        where: { id: out.notificationId! },
      });
      expect(row).toMatchObject({
        userId: user, type: "immediate", sent: false,
        jobId: "synthetic-push-job-only", url: "/main-panel/consultations",
      });
      const content = row.subscription as { subscriptions?: { endpoint?: string }[] };
      expect(content.subscriptions?.[0]?.endpoint).toContain(nonce);
      expect(m.add).toHaveBeenCalledWith(
        "push", { notificationId: row.id },
        expect.objectContaining({ attempts: 3, delay: 0 }),
      );
    });
    it("does not enqueue without a registered native/web device", async () => {
      await prisma.pushSubscription.deleteMany({ where: { id: subscription } });
      ownsSubscription = false;
      const before = m.add.mock.calls.length;
      const out = await sendImmediatePushNotification({
        userId: user, title: "Новая заявка", body: "Нет токена",
        url: "/main-panel/consultations",
      });
      expect(out.success).toBe(false);
      expect(m.add).toHaveBeenCalledTimes(before);
    });
  },
);
