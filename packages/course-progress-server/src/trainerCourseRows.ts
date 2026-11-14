/** Persistence boundary for trainer Course, version CAS and ordered day links. */
import { prisma } from "@gafus/prisma";
export type TrainerCourseRowsInput = {
  id: string;
  name: string;
  description: string;
  shortDesc: string;
  duration: string;
  logoImg: string;
  videoUrl?: string | null;
  isPublic: boolean;
  isPaid: boolean;
  showInProfile: boolean;
  isPersonalized: boolean;
  guideContent?: string | null;
  equipment: string;
  trainingLevel: "BEGINNER" | "INTERMEDIATE" | "ADVANCED" | "EXPERT";
  trainingDays: string[];
  allowedUsers: string[];
  expectedVersion?: number;
};
export type TrainerCourseRowActor = { id: string; role: string };
export class CourseVersionNoMatch extends Error {}
export async function createTrainerCourseRow(
  input: TrainerCourseRowsInput,
  authorId: string,
  type: string,
  isPrivate: boolean,
  dayLinksCreate: { day: { connect: { id: string } }; order: number }[],
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.course.create({
      data: {
        id: input.id,
        name: input.name,
        type,
        description: input.description ?? "",
        shortDesc: input.shortDesc ?? "",
        duration: input.duration,
        logoImg: input.logoImg ?? "",
        isPrivate,
        isPaid: input.isPaid ?? false,
        showInProfile: input.showInProfile ?? true,
        isPersonalized: input.isPersonalized ?? false,
        guideContent: input.guideContent?.trim() || null,
        videoUrl: input.videoUrl || null,
        equipment: input.equipment ?? "",
        trainingLevel: input.trainingLevel,
        authorId,
        dayLinks: {
          create: dayLinksCreate,
        },
        access:
          isPrivate && (input.allowedUsers?.length ?? 0) > 0
            ? {
                create: (input.allowedUsers ?? []).map((userId) => ({
                  user: { connect: { id: String(userId) } },
                })),
              }
            : undefined,
      },
    });
  });
}
export async function updateTrainerCourseRows(
  input: TrainerCourseRowsInput & { expectedVersion: number },
  actor: TrainerCourseRowActor,
  isPrivate: boolean,
): Promise<number> {
  let nextVersion: number | undefined;
  await prisma.$transaction(
    async (tx) => {
      const desiredDayIds = (input.trainingDays ?? []).map((d) => String(d));
      // The ONLY Course row update in this transaction. Actor ownership,
      // expectedVersion and full-form metadata are applied atomically.
      // The database BEFORE UPDATE trigger alone advances Course.version.
      const newRows =
        actor.role === "ADMIN"
          ? await tx.$queryRaw<{ id: string; version: number }[]>`
                UPDATE "Course" SET
                  "name" = ${input.name},
                  "description" = ${input.description ?? ""},
                  "shortDesc" = ${input.shortDesc ?? ""},
                  "duration" = ${input.duration},
                  "logoImg" = ${input.logoImg},
                  "videoUrl" = ${input.videoUrl || null},
                  "isPrivate" = ${isPrivate},
                  "isPaid" = ${input.isPaid},
                  "showInProfile" = ${input.showInProfile ?? true},
                  "isPersonalized" = ${input.isPersonalized ?? false},
                  "guideContent" = CASE WHEN ${input.guideContent === undefined}
                    THEN "guideContent"
                    ELSE ${input.guideContent?.trim() || null} END,
                  "equipment" = ${input.equipment ?? ""},
                  "trainingLevel" = ${input.trainingLevel}::"TrainingLevel",
                  "updatedAt" = timezone('UTC', CURRENT_TIMESTAMP)
                WHERE "id" = ${input.id} AND "version" = ${input.expectedVersion}
                RETURNING "id","version"
              `
          : await tx.$queryRaw<{ id: string; version: number }[]>`
                UPDATE "Course" SET
                  "name" = ${input.name},
                  "description" = ${input.description ?? ""},
                  "shortDesc" = ${input.shortDesc ?? ""},
                  "duration" = ${input.duration},
                  "logoImg" = ${input.logoImg},
                  "videoUrl" = ${input.videoUrl || null},
                  "isPrivate" = ${isPrivate},
                  "isPaid" = ${input.isPaid},
                  "showInProfile" = ${input.showInProfile ?? true},
                  "isPersonalized" = ${input.isPersonalized ?? false},
                  "guideContent" = CASE WHEN ${input.guideContent === undefined}
                    THEN "guideContent"
                    ELSE ${input.guideContent?.trim() || null} END,
                  "equipment" = ${input.equipment ?? ""},
                  "trainingLevel" = ${input.trainingLevel}::"TrainingLevel",
                  "updatedAt" = timezone('UTC', CURRENT_TIMESTAMP)
                WHERE "id" = ${input.id} AND "authorId" = ${actor.id}
                  AND "version" = ${input.expectedVersion}
                RETURNING "id","version"
              `;
      if (newRows.length === 0) throw new CourseVersionNoMatch();
      if (
        newRows.length !== 1 ||
        newRows[0]?.id !== input.id ||
        newRows[0]?.version !== input.expectedVersion + 1
      )
        throw new Error("COURSE_VERSION_UNEXPECTED_UPDATE");
      nextVersion = newRows[0].version;

      const existingDayLinks = await tx.dayOnCourse.findMany({
        where: { courseId: input.id },
        select: { id: true, dayId: true, order: true },
        orderBy: { order: "asc" },
      });

      const existingByDayId = new Map<string, typeof existingDayLinks>();
      for (const link of existingDayLinks) {
        const list = existingByDayId.get(link.dayId) ?? [];
        list.push(link);
        existingByDayId.set(link.dayId, list);
      }

      const reusedLinks: { id: string; newOrder: number }[] = [];
      const newLinks: { dayId: string; order: number }[] = [];

      desiredDayIds.forEach((dayId, index) => {
        const list = existingByDayId.get(dayId);
        if (list && list.length > 0) {
          const link = list.shift();
          if (link) reusedLinks.push({ id: link.id, newOrder: index + 1 });
        } else {
          newLinks.push({ dayId, order: index + 1 });
        }
      });

      const removedLinks = Array.from(existingByDayId.values()).flat();
      if (removedLinks.length > 0) {
        await tx.dayOnCourse.deleteMany({
          where: { id: { in: removedLinks.map((l) => l.id) } },
        });
      }

      const tempBase = desiredDayIds.length + existingDayLinks.length + 1000;
      for (let i = 0; i < reusedLinks.length; i += 1) {
        const link = reusedLinks[i];
        await tx.dayOnCourse.update({
          where: { id: link.id },
          data: { order: tempBase + i },
        });
      }

      if (newLinks.length > 0) {
        await tx.dayOnCourse.createMany({
          data: newLinks.map((link) => ({
            courseId: input.id,
            dayId: link.dayId,
            order: link.order,
          })),
        });
      }

      for (const link of reusedLinks) {
        await tx.dayOnCourse.update({
          where: { id: link.id },
          data: { order: link.newOrder },
        });
      }

      await tx.courseAccess.deleteMany({ where: { courseId: input.id } });
      if (isPrivate && input.allowedUsers?.length) {
        await tx.courseAccess.createMany({
          data: input.allowedUsers.map((userId) => ({
            courseId: input.id,
            userId: String(userId),
          })),
        });
      }
    },
    { maxWait: 10000, timeout: 20000 },
  );
  if (nextVersion === undefined) throw new Error("COURSE_VERSION_MISSING");
  return nextVersion;
}
export function readCourseRowLogo(courseId: string) {
  return prisma.course.findUnique({
    where: { id: courseId },
    select: { logoImg: true },
  });
}
export function readCourseRowAuthor(courseId: string) {
  return prisma.course.findUnique({
    where: { id: courseId },
    select: { authorId: true },
  });
}
export function readCourseDraftRow(courseId: string) {
  return prisma.course.findUnique({
    where: { id: courseId },
    select: {
      id: true,
      name: true,
      guideContent: true,
      shortDesc: true,
      description: true,
      duration: true,
      videoUrl: true,
      logoImg: true,
      isPrivate: true,
      isPaid: true,
      showInProfile: true,
      isPersonalized: true,
      equipment: true,
      trainingLevel: true,
      authorId: true,
      dayLinks: {
        select: {
          id: true,
          dayId: true,
          order: true,
          day: { select: { id: true, title: true } },
        },
        orderBy: { order: "asc" },
      },
      access: {
        select: {
          userId: true,
          user: { select: { id: true, username: true } },
        },
      },
    },
  });
}
export async function readCourseRowVisibleAfterStale(
  inputId: string,
  actor: TrainerCourseRowActor,
) {
  return actor.role === "ADMIN"
    ? prisma.$queryRaw<{ id: string }[]>`SELECT "id" FROM "Course" WHERE "id" = ${inputId}`
    : prisma.$queryRaw<
        { id: string }[]
      >`SELECT "id" FROM "Course" WHERE "id" = ${inputId} AND "authorId" = ${actor.id}`;
}
export async function deleteTrainerCourseRowDependencies(courseId: string): Promise<void> {
  await prisma.courseAccess.deleteMany({ where: { courseId } });
  await prisma.favoriteCourse.deleteMany({ where: { courseId } });
  await prisma.courseReview.deleteMany({ where: { courseId } });
  await prisma.userCourse.deleteMany({ where: { courseId } });
  await prisma.dayOnCourse.deleteMany({ where: { courseId } });
  await prisma.course.delete({ where: { id: courseId } });
}
