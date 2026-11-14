/** An authorization-neutral, read-only content snapshot. No learner, grant,
 * media signing or progress table may be selected. Core handles cache revision
 * and every authenticated read checks the caller's access independently.
 */
import { prisma, type Prisma } from "@gafus/prisma";

const trainingDayContentSelect = {
  id: true,
  order: true,
  courseId: true,
  course: {
    select: {
      duration: true,
      isPersonalized: true,
    },
  },
  day: {
    select: {
      id: true,
      title: true,
      description: true,
      type: true,
      showCoursePathExport: true,
      stepLinks: {
        orderBy: { order: "asc" },
        select: {
          id: true,
          order: true,
          step: {
            select: {
              id: true,
              title: true,
              description: true,
              durationSec: true,
              estimatedDurationSec: true,
              videoUrl: true,
              videoUrls: true,
              imageUrls: true,
              pdfUrls: true,
              type: true,
              checklist: true,
              requiresVideoReport: true,
              requiresWrittenFeedback: true,
              hasTestQuestions: true,
              surveySlug: true,
            },
          },
        },
      },
    },
  },
} satisfies Prisma.DayOnCourseSelect;

export async function readTrainingDayContent(courseType: string, dayOnCourseId: string) {
  return prisma.dayOnCourse.findFirst({
    where: { id: dayOnCourseId, course: { type: courseType } },
    select: trainingDayContentSelect,
  });
}
