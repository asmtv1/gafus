/**
 * Opt-in WORK-only integration. Random exact test fixtures; never production.
 */
import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@gafus/prisma";
const hooks = vi.hoisted(() => ({ cache: vi.fn(), publish: vi.fn(async () => undefined) }));
vi.mock("../training/trainingDayContent", () => ({
  invalidateCourseContentCache: hooks.cache,
}));
vi.mock("../training/trainingContentRevision", () => ({
  publishCourseContentChange: hooks.publish,
}));
vi.mock("@gafus/logger", () => ({
  createWebLogger: () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn() }),
}));
import { createCourse, updateCourse } from "./trainerCourseService";
import { getCourseEditorSnapshot } from "./courseEditorSnapshotService";
import { deleteCourseVersioned } from "./courseDeleteVersionedService";

const nonce = randomBytes(10).toString("hex");
const id = randomUUID();
const trainerId = "trainer_work_" + nonce;
const dayId = "day_work_" + nonce;
const owner = { id: trainerId, role: "TRAINER" as const };
const foreign = { id: "foreign_work_" + nonce, role: "TRAINER" as const };
const dbName = "gafus_refactor_real_work_20261024";
async function guard(): Promise<void> {
  const d = new URL(process.env.DATABASE_URL ?? "postgresql://missing/invalid");
  if (process.env.GAFUS_TRAINER_WORK_REALPG !== "1" ||
      d.hostname !== "127.0.0.1" || d.port !== "55921" ||
      d.pathname !== "/" + dbName || d.username !== "gafus_refactor_local_real" ||
      d.search !== "?schema=public" || !d.password) throw Error("REFUSE_NON_WORK_DB");
  // SQL is a fixed literal, never constructed from client input.
  const rows = await prisma.$queryRawUnsafe<
    { db: string; principal: string; host: string }[]
  >("SELECT current_database() AS db, current_user AS principal, inet_server_addr()::text AS host");
  // Postgres inet_server_addr() may stringify as the local /32 CIDR.
  if (rows.length !== 1 || rows[0]?.db !== dbName ||
      rows[0].principal !== "gafus_refactor_local_real" ||
      !["127.0.0.1", "127.0.0.1/32"].includes(rows[0].host))
    throw Error("WRONG_DATABASE_SESSION");
}
const form = {
  id, name: "Trainer synthetic", duration: "4 дня",
  description: "Only test data", shortDesc: "Synthetic course",
  logoImg: "", videoUrl: null, guideContent: null,
  isPublic: true, isPaid: false, showInProfile: false, isPersonalized: false,
  equipment: "", trainingLevel: "BEGINNER" as const,
  allowedUsers: [] as string[], trainingDays: [dayId],
};
describe.skipIf(process.env.GAFUS_TRAINER_WORK_REALPG !== "1")(
  "trainer full-form Core actual isolated WORK PostgreSQL",
  () => {
    let hasUser = false, hasDay = false, hasCourse = false;
    beforeAll(async () => {
      await guard();
      const checks = await Promise.all([
        prisma.user.count({ where: { id: trainerId } }),
        prisma.trainingDay.count({ where: { id: dayId } }),
        prisma.course.count({ where: { id } }),
      ]);
      if (checks.some(Boolean)) throw Error("SYNTHETIC_ID_COLLISION");
      await prisma.user.create({
        data: {
          id: trainerId, username: trainerId, role: "TRAINER",
          email: trainerId + "@invalid.example", password: "INVALID_NO_LOGIN",
        },
      });
      hasUser = true;
      await prisma.trainingDay.create({
        data: { id: dayId, title: "Synthetic day", authorId: trainerId },
      });
      hasDay = true;
    });
    afterAll(async () => {
      try {
        await guard();
        if (hasCourse) await prisma.course.deleteMany({ where: { id } });
        if (hasDay) await prisma.trainingDay.deleteMany({ where: { id: dayId } });
        if (hasUser) await prisma.user.deleteMany({ where: { id: trainerId } });
      } finally {
        await prisma.$disconnect();
      }
    });
    it("creates a synthetic course, trigger supplies version 1", async () => {
      const r = await createCourse(form, trainerId);
      expect(r).toMatchObject({ success: true, id });
      hasCourse = true;
      const snap = await getCourseEditorSnapshot(id, owner);
      expect(snap.status).toBe("found");
      if (snap.status !== "found") throw Error("SNAPSHOT_MISSING");
      expect(snap.data.version).toBe(1);
      expect(snap.data.dayLinks.map(item => item.dayId)).toEqual([dayId]);
      expect(await getCourseEditorSnapshot(id, foreign)).toEqual({ status: "not_found" });
    });
    it("updates full-form using real atomic CAS", async () => {
      const r = await updateCourse({
        ...form, expectedVersion: 1, name: "Updated synthetic",
      }, owner);
      expect(r).toMatchObject({ success: true, version: 2 });
      const snap = await getCourseEditorSnapshot(id, owner);
      expect(snap.status).toBe("found");
      if (snap.status !== "found") throw Error("SNAPSHOT_MISSING");
      expect(snap.data.name).toBe("Updated synthetic");
      expect(snap.data.version).toBe(2);
    });
    it("refuses stale writes and keeps committed name", async () => {
      const r = await updateCourse({
        ...form, expectedVersion: 1, name: "Stale overwrite",
      }, owner);
      expect(r.status).toBe("stale");
      const snap = await getCourseEditorSnapshot(id, owner);
      expect(snap.status).toBe("found");
      if (snap.status !== "found") throw Error("SNAPSHOT_MISSING");
      expect(snap.data.name).toBe("Updated synthetic");
    });
    it("refuses foreign/stale delete and deletes only the synthetic own course", async () => {
      expect(await deleteCourseVersioned(id, 2, foreign)).toEqual({ status: "not_found" });
      expect(await deleteCourseVersioned(id, 1, owner)).toEqual({ status: "stale" });
      const r = await deleteCourseVersioned(id, 2, owner);
      expect(r).toEqual({ status: "deleted", logoImg: "" });
      hasCourse = false;
      expect(await getCourseEditorSnapshot(id, owner)).toEqual({ status: "not_found" });
    });
  },
);
