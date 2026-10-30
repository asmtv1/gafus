/**
 * ADMIN-5 opt-in isolated PostgreSQL fault/concurrency test (PG14 or PG18).
 * NEVER run on Main, WORK shared PG, or production. No Prisma migrations.
 * Uses the exact isolated-schema SQL adjacent to this test, disposable local PG.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@gafus/prisma";
import { consultationMskDayKey } from "./consultationMskFormat";

const owner = "admin5_only_trainer";
const cynId = "admin5_only_cyno";
const dbUrl = "postgresql://asmtv1@127.0.0.1:55695/gafus_admin5_isolated";
vi.mock("./cynologistService", () => ({
  ensureConsultationCynologistRow: vi.fn(async () => cynId),
}));
vi.mock("@gafus/logger", () => ({
  createWebLogger: () => ({ info: vi.fn(), success: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));
import {
  addDayOff,
  addSlotException,
  getTrainerAvailability,
  getTrainerEditableSlots,
  removeDayOff,
  removeSlotException,
  setTrainerAvailability,
} from "./availabilityService";
import { getAvailableSlots } from "./slotService";

const rule = (startTime = "10:00", endTime = "11:00", isWorkingDay = true) => ({
  weekday: 1,
  startTime,
  endTime,
  isWorkingDay,
});
const endHorizon = () => new Date(Date.now() + 17 * 86_400_000);
const localTest = process.env.ADMIN5_SCHEDULE_REALPG_RUN === "1" ? describe : describe.skip;
let verifiedIsolatedDatabase = false;

localTest("ADMIN5 isolated original Core+real PostgreSQL schedule atomicity", () => {
  beforeAll(async () => {
    if (process.env.DATABASE_URL !== dbUrl) throw Error("ADMIN5: forbidden DB identity");
    const rows = await prisma.$queryRaw<{ db: string; role: string; port: number }[]>`
      SELECT current_database() AS db, current_user AS role, inet_server_port() AS port
    `;
    expect(rows).toEqual([{ db: "gafus_admin5_isolated", role: "asmtv1", port: 55695 }]);
    verifiedIsolatedDatabase = true;
    expect(await prisma.consultationCynologist.findUnique({ where: { id: cynId } })).toBeNull();
    await prisma.consultationCynologist.create({
      data: { id: cynId, userId: owner, slotHorizonDays: 17, slotDurationMin: 30 },
    });
  });
  afterAll(async () => {
    if (verifiedIsolatedDatabase) {
      await prisma.consultationCynologist.deleteMany({ where: { id: cynId } });
    }
    await prisma.$disconnect();
  });

  it("SET weekly rules atomically materializes FREE slots visible to trainer and client", async () => {
    await setTrainerAvailability(owner, { rules: [rule()] });
    const persisted = await getTrainerAvailability(owner);
    expect(persisted.rules).toHaveLength(1);
    expect(persisted.rules[0]?.isWorkingDay).toBe(true);
    const editable = await getTrainerEditableSlots(owner, new Date(), endHorizon());
    const client = await getAvailableSlots(owner, new Date(), endHorizon());
    expect(editable.length).toBeGreaterThan(0);
    expect(client.length).toBeGreaterThan(0);
    expect(client.every((s) => editable.some((row) => row.id === s.id))).toBe(true);
  });

  it("a day off hides client/trainer slots, and removal restores them", async () => {
    const before = await getTrainerEditableSlots(owner, new Date(), endHorizon());
    const day = consultationMskDayKey(new Date(before[0]!.startAtUtc));
    await addDayOff(owner, day, "ADMIN5 synthetic");
    const stored = await getTrainerAvailability(owner);
    const dayOff = stored.dayOffs.find((d) => d.date === day);
    expect(dayOff).toBeDefined();
    const after = await getAvailableSlots(owner, new Date(), endHorizon());
    expect(after.some((slot) => consultationMskDayKey(new Date(slot.startAtUtc)) === day)).toBe(
      false,
    );
    await removeDayOff(owner, dayOff!.id);
    const restored = await getTrainerEditableSlots(owner, new Date(), endHorizon());
    expect(restored.some((slot) => consultationMskDayKey(new Date(slot.startAtUtc)) === day)).toBe(
      true,
    );
  });

  it("an exception blocks actual client slot and DELETE restores it", async () => {
    const before = await getTrainerEditableSlots(owner, new Date(), endHorizon());
    const slot = before[0]!;
    await addSlotException(owner, new Date(slot.startAtUtc), new Date(slot.endAtUtc), "ADMIN5");
    const persisted = await getTrainerAvailability(owner);
    const ex = persisted.exceptions.find((e) => e.startAtUtc === slot.startAtUtc);
    expect(ex).toBeDefined();
    const after = await getAvailableSlots(owner, new Date(), endHorizon());
    expect(after.some((item) => item.startAtUtc === slot.startAtUtc)).toBe(false);
    await removeSlotException(owner, ex!.id);
    const restored = await getTrainerEditableSlots(owner, new Date(), endHorizon());
    expect(restored.some((item) => item.startAtUtc === slot.startAtUtc)).toBe(true);
  });

  it("a forced SQL rebuild failure rolls back weekly rules and materialized slots", async () => {
    const beforeRule = (await getTrainerAvailability(owner)).rules;
    const beforeSlots = await getTrainerEditableSlots(owner, new Date(), endHorizon());
    expect(beforeSlots.length).toBeGreaterThan(0);
    await prisma.$executeRawUnsafe(`
      CREATE FUNCTION admin5_fail_slot_delete() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF OLD."cynologistId" = 'admin5_only_cyno' THEN
          RAISE EXCEPTION 'ADMIN5_INJECTED_REBUILD_FAILURE';
        END IF;
        RETURN OLD;
      END; $$`);
    await prisma.$executeRawUnsafe(`
      CREATE TRIGGER admin5_fail_delete BEFORE DELETE ON "ConsultationSlot"
      FOR EACH ROW EXECUTE FUNCTION admin5_fail_slot_delete()`);
    try {
      await expect(
        setTrainerAvailability(owner, { rules: [rule("10:00", "11:00", false)] }),
      ).rejects.toThrow();
      const rules = (await getTrainerAvailability(owner)).rules;
      const afterSlots = await getTrainerEditableSlots(owner, new Date(), endHorizon());
      expect(rules).toMatchObject(beforeRule);
      expect(afterSlots.map((s) => s.startAtUtc)).toEqual(beforeSlots.map((s) => s.startAtUtc));
    } finally {
      await prisma.$executeRawUnsafe(
        'DROP TRIGGER IF EXISTS admin5_fail_delete ON "ConsultationSlot"',
      );
      await prisma.$executeRawUnsafe("DROP FUNCTION IF EXISTS admin5_fail_slot_delete()");
    }
  });

  it("a cancelled historical booking cannot resurrect a blocked slot", async () => {
    const prior = await getTrainerEditableSlots(owner, new Date(), endHorizon());
    const slot = prior[0]!;
    const historicId = "admin5_history_cancellation";
    await prisma.consultationBooking.create({
      data: {
        id: historicId,
        clientId: "admin5_http_user",
        cynologistId: cynId,
        slotId: slot.id,
        status: "CANCELLED_BY_USER",
        confirmationDeadlineAt: new Date(Date.now() + 86_400_000),
      },
    });
    try {
      await addSlotException(owner, new Date(slot.startAtUtc), new Date(slot.endAtUtc));
      const archivedSlot = await prisma.consultationSlot.findUniqueOrThrow({
        where: { id: slot.id },
      });
      expect(archivedSlot.status).toBe("BLOCKED");
      const available = await getAvailableSlots(owner, new Date(), endHorizon());
      expect(available.some((entry) => entry.id === slot.id)).toBe(false);
      const exception = (await getTrainerAvailability(owner)).exceptions.find(
        (item) => item.startAtUtc === slot.startAtUtc,
      );
      expect(exception).toBeDefined();
      await removeSlotException(owner, exception!.id);
      expect(
        (
          await prisma.consultationSlot.findUniqueOrThrow({
            where: { id: slot.id },
          })
        ).status,
      ).toBe("FREE");
    } finally {
      await prisma.consultationBooking.deleteMany({ where: { id: historicId } });
    }
  });

  it("concurrent admin PUTs serialize and leave a self-consistent final schedule", async () => {
    const a = rule("09:00", "10:00");
    const b = rule("11:00", "12:00");
    await Promise.all([
      setTrainerAvailability(owner, { rules: [a] }),
      setTrainerAvailability(owner, { rules: [b] }),
    ]);
    const result = (await getTrainerAvailability(owner)).rules;
    expect(result).toHaveLength(1);
    expect([a.startTime, b.startTime]).toContain(result[0]!.startTime);
    const allSlots = await getTrainerEditableSlots(owner, new Date(), endHorizon());
    expect(allSlots.length).toBeGreaterThan(0);
    // all returned local times must follow the final winning rule, no stale rebuild.
    const expectedFirstUtcHour = Number(result[0]!.startTime.slice(0, 2)) - 3;
    expect(
      allSlots.every(
        (s) =>
          new Date(s.startAtUtc).getUTCHours() === expectedFirstUtcHour ||
          new Date(s.startAtUtc).getUTCHours() === expectedFirstUtcHour,
      ),
    ).toBe(true);
    expect(
      await prisma.consultationAvailabilityRule.count({ where: { cynologistId: cynId } }),
    ).toBe(1);
  });
  it("materializes a 60-day calendar in one fast batch without per-slot SELECT", async () => {
    await prisma.consultationCynologist.update({
      where: { id: cynId },
      data: { slotHorizonDays: 60 },
    });
    const start = Date.now();
    await setTrainerAvailability(owner, {
      rules: Array.from({ length: 7 }, (_, weekday) => ({
        weekday,
        startTime: "09:00",
        endTime: "18:00",
        isWorkingDay: weekday >= 1 && weekday <= 5,
      })),
    });
    const elapsedMs = Date.now() - start;
    const slotCount = await prisma.consultationSlot.count({ where: { cynologistId: cynId } });
    expect(slotCount).toBeGreaterThan(500);
    // A regression to N sequential INSERT+SELECT queries would exceed this
    // bounded local-PG acceptance deadline by a large margin.
    expect(elapsedMs).toBeLessThan(15_000);
    const deletionStart = Date.now();
    await setTrainerAvailability(owner, {
      rules: Array.from({ length: 7 }, (_, weekday) => ({
        weekday,
        startTime: "09:00",
        endTime: "18:00",
        isWorkingDay: false,
      })),
    });
    const deletionElapsedMs = Date.now() - deletionStart;
    expect(await prisma.consultationSlot.count({ where: { cynologistId: cynId } })).toBe(0);
    expect(deletionElapsedMs).toBeLessThan(15_000);
    console.warn(
      "ADMIN5_BULK_REBUILD_PG",
      JSON.stringify({ slotCount, elapsedMs, deletionElapsedMs }),
    );
  }, 20_000);
});
