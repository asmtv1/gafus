/** Real Core/Prisma Course CAS on isolated schema-only restored PG18 staging DB.
 * Staging has ZERO user records from the original work DB. No Hono/JWT, providers,
 * production services or writes to permanent WORK/reference database.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@gafus/prisma";

const sideEffects = vi.hoisted(() => ({ invalidate: vi.fn(), publish: vi.fn() }));
vi.mock("../training/trainingDayContent", () => ({
  invalidateCourseContentCache: sideEffects.invalidate,
}));
vi.mock("../training/trainingContentRevision", () => ({
  publishCourseContentChange: sideEffects.publish,
}));
vi.mock("@gafus/logger", () => ({
  createWebLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), success: vi.fn() }),
}));
import {
  readCourseNameVersion,
  updateCourseNameVersioned,
  setCourseLogoVersioned,
} from "./courseVersionService";

const courseId = "ag1FullSchemaCASCourse20261025";
const ownerId = "ag1FullSchemaCASOwner20261025";
const foreignId = "ag1FullSchemaCASForeign20261025";
const owner = { id: ownerId, role: "TRAINER" };
const foreign = { id: foreignId, role: "TRAINER" };
const ensure = (value: unknown, code: string): void => {
  if (!value) throw Error(code);
};
const version = async () => {
  const rows = await prisma.$queryRaw<{ version: number; name: string; logoImg: string }[]>`
    SELECT "version", "name", "logoImg" FROM "Course" WHERE "id"=${courseId}`;
  ensure(rows.length === 1, "SYNTHETIC_ROW_MISSING");
  return rows[0];
};

describe.skipIf(process.env.GAFUS_AG1_FULLSCHEMA_STAGE_CAS !== "1")(
  "original Course version service against full restored staging schema",
  () => {
    beforeAll(async () => {
      ensure(process.env.GAFUS_AG1_FULLSCHEMA_STAGE_CAS === "1", "EXPLICIT_STAGE_OPTIN_MISSING");
      const [session] = await prisma.$queryRaw<{ db: string; role: string; host: string }[]>`
        SELECT current_database() AS db, current_user AS role, inet_server_addr()::text AS host`;
      ensure(session?.db === "gafus_refactor_course_cas_stage_20261025", "WRONG_DB");
      ensure(session?.role === "gafus_refactor_local_real", "WRONG_ROLE");
      ensure(session?.host?.startsWith("127.0.0.1"), "WRONG_HOST");
      ensure(
        (await prisma.user.count()) === 0 && (await prisma.course.count()) === 0,
        "STAGE_NOT_EMPTY_ABORT_NO_WRITES",
      );
      sideEffects.publish.mockResolvedValue(undefined);
      for (const id of [ownerId, foreignId]) {
        await prisma.user.create({
          data: {
            id,
            username: id,
            password: "INVALID_NO_LOGIN",
            email: `${id}@invalid.example`,
          },
        });
      }
      await prisma.course.create({
        data: {
          id: courseId,
          name: "Synthetic initial",
          type: "AG1_FULLSCHEMA_CAS_STAGING",
          duration: "0",
          logoImg: "",
          trainingLevel: "BEGINNER",
          authorId: ownerId,
        },
      });
    });

    afterAll(async () => {
      // Delete only exactly owned synthetic rows, never wildcard user data.
      try {
        const [session] = await prisma.$queryRaw<{ db: string }[]>`
          SELECT current_database() AS db`;
        if (session?.db === "gafus_refactor_course_cas_stage_20261025") {
          await prisma.course.deleteMany({ where: { id: courseId } });
          await prisma.user.deleteMany({ where: { id: { in: [ownerId, foreignId] } } });
        }
      } finally {
        await prisma.$disconnect();
      }
    });

    it("reads real original Course.version=1 and masks foreign owner", async () => {
      expect((await version()).version).toBe(1);
      expect(await readCourseNameVersion(courseId, owner)).toMatchObject({
        status: "found",
        data: { version: 1, id: courseId },
      });
      expect(await readCourseNameVersion(courseId, foreign)).toEqual({ status: "not_found" });
    });

    it("updates name only for owner with current version, increments exactly once", async () => {
      const result = await updateCourseNameVersioned(
        {
          courseId,
          expectedVersion: 1,
          name: "Synthetic version 2",
        },
        owner,
      );
      expect(result).toMatchObject({ status: "updated", data: { version: 2 } });
      expect(await version()).toMatchObject({ version: 2, name: "Synthetic version 2" });
      expect(sideEffects.invalidate).toHaveBeenCalledExactlyOnceWith(courseId);
      expect(sideEffects.publish).toHaveBeenCalledOnce();
    });

    it("stale and foreign name writers cannot override or publish", async () => {
      sideEffects.invalidate.mockClear();
      sideEffects.publish.mockClear();
      const stale = await updateCourseNameVersioned(
        {
          courseId,
          expectedVersion: 1,
          name: "stale denied",
        },
        owner,
      );
      expect(stale).toEqual({ status: "stale" });
      const denied = await updateCourseNameVersioned(
        {
          courseId,
          expectedVersion: 2,
          name: "foreign denied",
        },
        foreign,
      );
      expect(denied).toEqual({ status: "not_found" });
      expect((await version()).version).toBe(2);
      expect(sideEffects.publish).not.toHaveBeenCalled();
      expect(sideEffects.invalidate).not.toHaveBeenCalled();
    });

    it("updates logo using original transactional FOR UPDATE CAS, no CDN", async () => {
      const result = await setCourseLogoVersioned(
        {
          courseId,
          expectedVersion: 2,
          logoUrl: "synthetic-logo-only",
        },
        owner,
      );
      expect(result).toEqual({ status: "updated", data: { version: 3, previousLogoUrl: null } });
      expect(await version()).toMatchObject({ version: 3, logoImg: "synthetic-logo-only" });
      expect(
        await setCourseLogoVersioned(
          {
            courseId,
            expectedVersion: 2,
            logoUrl: "stale-logo-denied",
          },
          owner,
        ),
      ).toEqual({ status: "stale" });
      expect(
        await setCourseLogoVersioned(
          {
            courseId,
            expectedVersion: 3,
            logoUrl: "foreign-logo-denied",
          },
          foreign,
        ),
      ).toEqual({ status: "not_found" });
      expect((await version()).version).toBe(3);
    });

    it("simultaneous exact-version name CAS has precisely one winner", async () => {
      sideEffects.invalidate.mockClear();
      sideEffects.publish.mockClear();
      const results = await Promise.all([
        updateCourseNameVersioned({ courseId, expectedVersion: 3, name: "CAS winner A" }, owner),
        updateCourseNameVersioned({ courseId, expectedVersion: 3, name: "CAS winner B" }, owner),
      ]);
      expect(results.filter((r) => r.status === "updated")).toHaveLength(1);
      expect(results.filter((r) => r.status === "stale")).toHaveLength(1);
      expect((await version()).version).toBe(4);
      expect(sideEffects.publish).toHaveBeenCalledOnce();
    });
  },
);
