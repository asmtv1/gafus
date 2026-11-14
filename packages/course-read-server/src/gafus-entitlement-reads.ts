/** User- and course-occurrence-scoped SQL projections for Gafus entitlements.
 * No entitlement decisions happen here: Core still checks every per-user grant.
 */
import {prisma} from "@gafus/prisma";
export async function readGafusUserStepOccurrence(userStepId:string,userId:string){
 if (!userStepId || !userId) return null;
  return prisma.userStep.findFirst({
    where: { id: userStepId, userTraining: { userId: userId } },
    select: {
      stepOnDayId: true,
      userTraining: { select: { dayOnCourseId: true } },
    },
  });
}
export async function readGafusVideoOccurrences(videoUrl:string){
 if (!videoUrl) return [];
  return prisma.dayOnCourse.findMany({
    where: { day: { stepLinks: { some: { step: { videoUrl: videoUrl } } } } },
    select: {
      id: true,
      day: {
        select: {
          stepLinks: {
            where: { step: { videoUrl: videoUrl } },
            select: { id: true },
          },
        },
      },
    },
  });
}
