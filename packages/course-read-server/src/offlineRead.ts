/**
 * Authorization-neutral offline course/version snapshots.
 * The HTTP/application layer remains responsible for release/ACL policy;
 * this adapter must not infer authorization from a course row.
 */
import { prisma } from "@gafus/prisma";

export async function readOfflineCourseVersion(courseType: string) {
  return prisma.course.findFirst({
    where: { type: courseType },
    select: { updatedAt: true },
    orderBy: { createdAt: "asc" },
  });
}

export async function readOfflineFullCourse(courseType: string) {
  return prisma.course.findFirst({
    where: { type: courseType },
    orderBy: { createdAt: "asc" },
    select: {
        id: true,
        type: true,
        name: true,
        description: true,
        shortDesc: true,
        duration: true,
        logoImg: true,
        isPrivate: true,
        isPaid: true,
        avgRating: true,
        trainingLevel: true,
        createdAt: true,
        updatedAt: true,
        author: {
          select: {
            username: true,
          },
        },
        videoUrl: true,
        equipment: true,
        dayLinks: {
          orderBy: { order: "asc" },
          select: {
            id: true,
            order: true,
            day: {
              select: {
                id: true,
                title: true,
                description: true,
                equipment: true,
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
          },
        },
      },
  });
}
