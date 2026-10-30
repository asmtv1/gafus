/** Opt-in actual local WORK PostgreSQL; synthetic rows and mock providers. */
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma, ConsultationBookingStatus, ConsultationSlotStatus } from "@gafus/prisma";

const m = vi.hoisted(() => ({
  mail: vi.fn(async () => "mock"),
  push: vi.fn(async () => ({ success: true })),
  add: vi.fn(async () => ({ id: "mock-job" })),
}));
vi.mock("@gafus/queues", () => ({
  consultationSlaQueue: { add: m.add },
  consultationReminderQueue: { add: m.add },
  CONSULTATION_SLA_JOB_ID: (id: string) => "sla:" + id,
  CONSULTATION_REMINDER_JOB_ID: (id: string, kind: string) => "reminder:" + id + ":" + kind,
  removeConsultationSlaJob: vi.fn(),
  removeConsultationReminderJob: vi.fn(),
}));
vi.mock("./notificationService", () => ({ enqueueConsultationEmail: m.mail }));
vi.mock("../notifications/immediatePushService", () => ({
  sendImmediatePushNotification: m.push,
}));
vi.mock("@gafus/logger", () => ({
  createWebLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));
import {
  cancelBookingByUser, confirmBookingByTrainer, completeBookingByTrainer,
  markBookingNoShowByTrainer, rejectBookingByTrainer,
} from "./bookingService";
import { createConsultationCallAdmission, signConsultationOneTimeKey } from "./voximplantService";

const suffix = randomBytes(10).toString("hex");
const trainer = "cons_trainer_" + suffix;
const client = "cons_client_" + suffix;
const cynId = "cons_cyn_" + suffix;
const ids = [0, 1, 2, 3].map(n => "cons_booking_" + suffix + "_" + n);
const slots = [0, 1, 2, 3].map(n => "cons_slot_" + suffix + "_" + n);

async function guard() {
  const d = new URL(process.env.DATABASE_URL ?? "postgresql://invalid/invalid");
  if (process.env.GAFUS_TRAINER_WORK_REALPG !== "1" ||
      d.hostname !== "127.0.0.1" || d.port !== "55921" ||
      d.pathname !== "/gafus_refactor_real_work_20261024" ||
      d.username !== "gafus_refactor_local_real" ||
      d.search !== "?schema=public" || !d.password)
    throw Error("NON_WORK_DB_REFUSED");
  // Constant SQL string: no caller-controlled interpolations.
  const [who] = await prisma.$queryRawUnsafe<
    { db: string; principal: string; addr: string }[]
  >("SELECT current_database() AS db, current_user AS principal, inet_server_addr()::text AS addr");
  if (who?.db !== "gafus_refactor_real_work_20261024" ||
      who.principal !== "gafus_refactor_local_real" ||
      !["127.0.0.1", "127.0.0.1/32"].includes(who.addr))
    throw Error("DATABASE_IDENTITY_DENIED");
}
describe.skipIf(process.env.GAFUS_TRAINER_WORK_REALPG !== "1")(
  "trainer transitions, Vox admission and push hooks in actual WORK PG",
  () => {
    let users = false, cyn = false;
    beforeAll(async () => {
      await guard();
      if ((await prisma.user.count({ where: { id: { in: [trainer, client] } } })) ||
          (await prisma.consultationCynologist.count({ where: { id: cynId } })) ||
          (await prisma.consultationBooking.count({ where: { id: { in: ids } } })))
        throw Error("SYNTHETIC_COLLISION");
      for (const id of [trainer, client]) {
        await prisma.user.create({ data: {
          id, username: id, email: id + "@invalid.example",
          password: "INVALID_NO_LOGIN", role: id === trainer ? "TRAINER" : "USER",
        } });
      }
      users = true;
      await prisma.consultationCynologist.create({ data: { id: cynId, userId: trainer } });
      cyn = true;
      for (let i = 0; i < ids.length; i++) {
        const startAt = new Date(Date.now() + 10 * 60_000 + i * 1000);
        const endAt = new Date(startAt.getTime() + 30 * 60_000);
        await prisma.consultationSlot.create({ data: {
          id: slots[i]!, cynologistId: cynId, startAt, endAt,
          status: ConsultationSlotStatus.BOOKED,
        } });
        await prisma.consultationBooking.create({ data: {
          id: ids[i]!, clientId: client, cynologistId: cynId, slotId: slots[i]!,
          confirmationDeadlineAt: new Date(Date.now() + 86400000),
          status: i === 2 ? ConsultationBookingStatus.CONFIRMED :
            ConsultationBookingStatus.PENDING_TRAINER_CONFIRMATION,
        } });
      }
    });
    afterAll(async () => {
      try {
        await guard();
        await prisma.consultationBooking.deleteMany({ where: { id: { in: ids } } });
        await prisma.consultationSlot.deleteMany({ where: { id: { in: slots } } });
        if (cyn) await prisma.consultationCynologist.deleteMany({ where: { id: cynId } });
        if (users) await prisma.user.deleteMany({ where: { id: { in: [trainer, client] } } });
      } finally { await prisma.$disconnect(); }
    });
    it("owner confirms pending, emits client push and refuses duplicate/foreign", async () => {
      await expect(confirmBookingByTrainer(client, "USER", ids[0]!))
        .rejects.toMatchObject({ code: "CONSULTATION_FORBIDDEN" });
      await expect(confirmBookingByTrainer("foreign", "TRAINER", ids[0]!))
        .rejects.toMatchObject({ code: "CONSULTATION_FORBIDDEN" });
      await confirmBookingByTrainer(trainer, "TRAINER", ids[0]!);
      const b = await prisma.consultationBooking.findUniqueOrThrow({ where: { id: ids[0]! } });
      expect(b.status).toBe("CONFIRMED");
      expect(b.trainerConfirmedAt).not.toBeNull();
      expect(m.push).toHaveBeenCalledWith(expect.objectContaining({
        userId: client, url: "/consultations/my",
      }));
      await expect(confirmBookingByTrainer(trainer, "TRAINER", ids[0]!))
        .rejects.toMatchObject({ code: "CONSULTATION_FORBIDDEN" });
    });
    it("Vox admission/sign require confirmed participant and never contact provider", async () => {
      vi.stubEnv("VOXIMPLANT_APPLICATION_ID", "1");
      vi.stubEnv("VOXIMPLANT_ACCOUNT_ID", "1");
      vi.stubEnv("VOXIMPLANT_ACCOUNT_NAME", "sandbox");
      vi.stubEnv("VOXIMPLANT_APPLICATION_NAME", "testapp");
      vi.stubEnv("VOXIMPLANT_KEY_ID", "test");
      vi.stubEnv("VOXIMPLANT_PRIVATE_KEY", "INVALID_TEST_ONLY");
      vi.stubEnv("VOXIMPLANT_CREDENTIAL_SECRET", "local-synthetic-secret-longer-than-32-characters");
      vi.stubEnv("VOXIMPLANT_ADMISSION_SECRET", "local-admission-secret-longer-than-32-characters");
      try {
        await expect(createConsultationCallAdmission(ids[0]!, "stranger"))
          .rejects.toMatchObject({ code: "CONSULTATION_FORBIDDEN" });
        const proof = await createConsultationCallAdmission(ids[0]!, trainer);
        expect(proof.admission).toMatch(/^\d{10}\.[a-f0-9]{64}$/);
        expect((await signConsultationOneTimeKey(ids[0]!, client, "valid-challenge-123")))
          .toMatch(/^[a-f0-9]{32}$/);
        await expect(createConsultationCallAdmission(ids[1]!, trainer))
          .rejects.toMatchObject({ code: "CONSULTATION_FORBIDDEN" });
      } finally { vi.unstubAllEnvs(); }
    });
    it("reject and client cancel return slots FREE and notify opposite party", async () => {
      await rejectBookingByTrainer(trainer, "TRAINER", ids[1]!, "Synthetic reason");
      expect((await prisma.consultationBooking.findUniqueOrThrow({
        where: { id: ids[1]! },
      })).status)
        .toBe("CANCELLED_BY_TRAINER");
      expect((await prisma.consultationSlot.findUniqueOrThrow({ where: { id: slots[1]! } })).status)
        .toBe("FREE");
      await cancelBookingByUser(client, ids[3]!);
      expect((await prisma.consultationBooking.findUniqueOrThrow({
        where: { id: ids[3]! },
      })).status)
        .toBe("CANCELLED_BY_USER");
      expect((await prisma.consultationSlot.findUniqueOrThrow({ where: { id: slots[3]! } })).status)
        .toBe("FREE");
      expect(m.push).toHaveBeenCalledWith(expect.objectContaining({
        userId: trainer, url: "/main-panel/consultations",
      }));
    });
    it("complete and no-show each CAS transition once, not twice", async () => {
      await completeBookingByTrainer(trainer, "TRAINER", ids[2]!);
      const b = await prisma.consultationBooking.findUniqueOrThrow({ where: { id: ids[2]! } });
      expect(b.status).toBe("COMPLETED");
      expect(b.completedAt).not.toBeNull();
      await expect(markBookingNoShowByTrainer(trainer, "TRAINER", ids[2]!))
        .rejects.toMatchObject({ code: "CONSULTATION_FORBIDDEN" });
      await markBookingNoShowByTrainer(trainer, "TRAINER", ids[0]!);
      expect((await prisma.consultationBooking.findUniqueOrThrow({
        where: { id: ids[0]! },
      })).status)
        .toBe("NO_SHOW");
      await expect(markBookingNoShowByTrainer(trainer, "TRAINER", ids[0]!))
        .rejects.toMatchObject({ code: "CONSULTATION_FORBIDDEN" });
    });
  },
);
