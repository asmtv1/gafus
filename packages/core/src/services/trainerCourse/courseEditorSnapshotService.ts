/**
 * Full Course editor atomic read: one server-owned Prisma REPEATABLE READ
 * snapshot of Course.version + all frozen editor fields and relations.
 * No CDN, Next, Redis, writes, actor-supplied admin bypass or client timestamp.
 */
import { Prisma, prisma } from "@gafus/prisma";
import type { CourseDraftDto } from "./trainerCourseService";

export type CourseEditorSnapshot = CourseDraftDto & { version: number };
export type EditorSnapshotResult =
  | { status: "found"; data: CourseEditorSnapshot }
  | { status: "not_found" | "invalid" | "unknown" };

const safeId = /^[A-Za-z0-9_-]{1,128}$/;
const snapshotSelect = {
  id: true, name: true, guideContent: true,
  shortDesc: true, description: true, duration: true,
  videoUrl: true, logoImg: true, isPrivate: true, isPaid: true,
  showInProfile: true, isPersonalized: true, equipment: true,
  trainingLevel: true,
  dayLinks: {
    select: {
      id: true, dayId: true, order: true,
      day: { select: { id: true, title: true } },
    },
    orderBy: [{ order: "asc" }, { id: "asc" }],
  },
  access: {
    select: {
      userId: true,
      user: { select: { id: true, username: true } },
    },
    orderBy: { userId: "asc" },
  },
} as const satisfies Prisma.CourseSelect;

export async function getCourseEditorSnapshot(
  courseId: string, actor: { id: string; role: string },
): Promise<EditorSnapshotResult> {
  if (!safeId.test(courseId) || !actor || !safeId.test(actor.id) ||
      (actor.role !== "TRAINER" && actor.role !== "ADMIN"))
    return { status: "invalid" };
  try {
    // Prisma relation loading may execute several SQL SELECT statements.
    // REPEATABLE READ protects parent version and all nested relations from
    // observing different concurrently committed revisions.
    const observed = await prisma.$transaction(async tx => {
      // The generated shared Prisma Client predates Course.version.
      // A parameterized SELECT of version in the SAME repeatable-read
      // transaction uses the very same snapshot as the existing typed
      // Core field/relations read. No shared Prisma generate required.
      const revisions = actor.role === "ADMIN"
        ? await tx.$queryRaw<{ version: number }[]>`
            SELECT "version" FROM "Course" WHERE "id" = ${courseId}
          `
        : await tx.$queryRaw<{ version: number }[]>`
            SELECT "version" FROM "Course"
            WHERE "id" = ${courseId} AND "authorId" = ${actor.id}
          `;
      if (revisions.length === 0) return null;
      if (revisions.length !== 1) throw Error("INVALID_COURSE_REVISION");
      const course = await tx.course.findFirst({
        where: {
          id: courseId,
          ...(actor.role === "TRAINER" ? { authorId: actor.id } : {}),
        },
        select: snapshotSelect,
      });
      if (!course) throw Error("INCONSISTENT_EDITOR_SNAPSHOT");
      return { course, version: revisions[0]!.version };
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
      maxWait: 10_000, timeout: 20_000,
    });
    if (!observed) return { status: "not_found" };
    const { course, version } = observed;
    if (!Number.isSafeInteger(version) || version < 1 ||
        version > 2147483647) return { status: "unknown" };
    return {
      status: "found",
      data: {
        id: course.id,
        version,
        name: course.name,
        guideContent: course.guideContent,
        shortDesc: course.shortDesc,
        description: course.description,
        duration: course.duration,
        videoUrl: course.videoUrl,
        logoImg: course.logoImg,
        isPrivate: course.isPrivate,
        isPaid: course.isPaid,
        showInProfile: course.showInProfile,
        isPersonalized: course.isPersonalized,
        equipment: course.equipment,
        trainingLevel: course.trainingLevel,
        dayLinks: course.dayLinks.map(link => ({
          id: link.id, dayId: link.dayId, order: link.order,
          day: { id: link.day.id, title: link.day.title },
        })),
        access: course.access.map(link => ({
          userId: link.userId,
          user: { id: link.user.id, username: link.user.username },
        })),
      },
    };
  } catch {
    // Never turn DB error into a misleading NOT_FOUND.
    return { status: "unknown" };
  }
}
