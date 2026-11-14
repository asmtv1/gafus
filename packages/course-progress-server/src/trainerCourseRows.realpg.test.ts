import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@gafus/prisma";
import {
  createTrainerCourseRow,
  updateTrainerCourseRows,
  readCourseRowLogo,
  readCourseRowAuthor,
  readCourseDraftRow,
  readCourseRowVisibleAfterStale,
  deleteTrainerCourseRowDependencies,
  CourseVersionNoMatch,
  type TrainerCourseRowsInput,
} from "./trainerCourseRows";
const qa = describe.runIf(process.env.GAFUS_TRAINER_COURSE_ROWS_REAL_PG === "enabled");
const author = "trainer-course-qa-author",
  foreign = "trainer-course-qa-foreign";
const cid = "trainer-course-qa-course",
  day1 = "trainer-course-qa-day-1",
  day2 = "trainer-course-qa-day-2";
let disposable = false;
const input: TrainerCourseRowsInput = {
  id: cid,
  name: "Original",
  description: "",
  shortDesc: "",
  duration: "30",
  logoImg: "",
  videoUrl: null,
  isPublic: false,
  isPaid: false,
  showInProfile: true,
  isPersonalized: false,
  guideContent: null,
  equipment: "",
  trainingLevel: "BEGINNER",
  trainingDays: [day1, day2],
  allowedUsers: [],
};
qa("trainer Course version CAS on isolated PostgreSQL18", () => {
  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL ?? "");
    expect(url.hostname).toBe("127.0.0.1");
    expect(url.pathname).toBe("/gafus_trainer_course_rows_qa");
    const rows = await prisma.$queryRawUnsafe<{ db: string; v: number }[]>(
      "SELECT current_database() AS db,current_setting('server_version_num')::integer AS v",
    );
    expect(rows[0]?.db).toBe("gafus_trainer_course_rows_qa");
    expect(rows[0]?.v).toBeGreaterThanOrEqual(180000);
    disposable = true;
    await prisma.$executeRawUnsafe(
      'CREATE OR REPLACE FUNCTION trainer_course_qa_increment_version() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW."version" := OLD."version" + 1; RETURN NEW; END; $$',
    );
    await prisma.$executeRawUnsafe(
      'CREATE TRIGGER trainer_course_qa_version BEFORE UPDATE ON "Course" FOR EACH ROW EXECUTE FUNCTION trainer_course_qa_increment_version()',
    );
    await prisma.user.createMany({
      data: [
        { id: author, username: author, password: "fictional-test-only", role: "TRAINER" },
        { id: foreign, username: foreign, password: "fictional-test-only", role: "TRAINER" },
      ],
    });
    for (const id of [day1, day2])
      await prisma.trainingDay.create({ data: { id, title: id, authorId: author } });
  });
  afterAll(async () => {
    if (!disposable) return;
    await prisma.dayOnCourse.deleteMany({ where: { courseId: cid } });
    await prisma.courseAccess.deleteMany({ where: { courseId: cid } });
    await prisma.course.deleteMany({ where: { id: cid } });
    await prisma.trainingDay.deleteMany({ where: { id: { in: [day1, day2] } } });
    await prisma.user.deleteMany({ where: { id: { in: [author, foreign] } } });
    await prisma.$executeRawUnsafe('DROP TRIGGER IF EXISTS trainer_course_qa_version ON "Course"');
    await prisma.$executeRawUnsafe("DROP FUNCTION IF EXISTS trainer_course_qa_increment_version()");
    await prisma.$disconnect();
  });
  it("creates private course with ordered day links atomically", async () => {
    await createTrainerCourseRow(input, author, "trainer-course-qa-type", true, [
      { day: { connect: { id: day1 } }, order: 1 },
      { day: { connect: { id: day2 } }, order: 2 },
    ]);
    expect((await readCourseRowLogo(cid))?.logoImg).toBe("");
    expect((await readCourseRowAuthor(cid))?.authorId).toBe(author);
    expect((await readCourseDraftRow(cid))?.dayLinks.map((l) => l.dayId)).toEqual([day1, day2]);
  });
  it("rejects other owner and stale CAS before day updates", async () => {
    await expect(
      updateTrainerCourseRows(
        { ...input, expectedVersion: 1, name: "Foreign" },
        { id: foreign, role: "TRAINER" },
        true,
      ),
    ).rejects.toBeInstanceOf(CourseVersionNoMatch);
    expect((await prisma.course.findUnique({ where: { id: cid } }))?.version).toBe(1);
    expect(await readCourseRowVisibleAfterStale(cid, { id: foreign, role: "TRAINER" })).toEqual([]);
    expect(
      await updateTrainerCourseRows(
        { ...input, expectedVersion: 1, name: "Owner update", trainingDays: [day2, day1] },
        { id: author, role: "TRAINER" },
        true,
      ),
    ).toBe(2);
    expect((await readCourseDraftRow(cid))?.dayLinks.map((l) => l.dayId)).toEqual([day2, day1]);
    await expect(
      updateTrainerCourseRows(
        { ...input, expectedVersion: 1, name: "Stale" },
        { id: author, role: "TRAINER" },
        true,
      ),
    ).rejects.toBeInstanceOf(CourseVersionNoMatch);
    expect((await prisma.course.findUnique({ where: { id: cid } }))?.version).toBe(2);
  });
  it("deletes course dependencies without deleting authored training days", async () => {
    await deleteTrainerCourseRowDependencies(cid);
    expect(await prisma.course.findUnique({ where: { id: cid } })).toBeNull();
    expect(await prisma.trainingDay.count({ where: { id: { in: [day1, day2] } } })).toBe(2);
  });
});
