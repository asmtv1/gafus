/** Persistence adapter for owner-keyed course progress and completion.
 * No Core import: this module may be used by API and Worker without a cycle.
 */
import {prisma, type UserCourse} from "@gafus/prisma";

export type CourseCompletionRecord = UserCourse;

function requireOwnerAndCourse(userId:string,courseId:string):void{
  if(!userId || !courseId)throw new Error("COURSE_COMPLETION_ACTOR_AND_COURSE_REQUIRED");
}

/** A stable completedAt timestamp even under duplicate, concurrent completions.
 * The canonical user row is locked before the presence check and INSERT/UPDATE.
 */
export async function completeUserCourseRecord(userId:string,courseId:string):Promise<UserCourse>{
  requireOwnerAndCourse(userId,courseId);
  return prisma.$transaction(async tx=>{
    const actor=await tx.$queryRaw<{id:string}[]>`
      SELECT "id" FROM "User" WHERE "id" = ${userId} AND "registrationPending" = false FOR UPDATE
    `;
    if(actor.length!==1)throw new Error("COURSE_COMPLETION_ACTOR_UNAVAILABLE");
    const where={userId_courseId:{userId,courseId}};
    const existing=await tx.userCourse.findUnique({where});
    if(existing?.completedAt)return existing;
    const completedAt=new Date();
    if(existing)return tx.userCourse.update({where,data:{status:"COMPLETED",completedAt}});
    return tx.userCourse.create({data:{userId,courseId,status:"COMPLETED",completedAt}});
  });
}

/** Existing progress check must not silently create an enrollment record.
 * Locks the same actor row, then returns the same row if already completed.
 */
export async function completeExistingUserCourseRecord(userId:string,courseId:string):Promise<UserCourse>{
  requireOwnerAndCourse(userId,courseId);
  return prisma.$transaction(async tx=>{
    const actor=await tx.$queryRaw<{id:string}[]>`
      SELECT "id" FROM "User" WHERE "id" = ${userId} AND "registrationPending" = false FOR UPDATE
    `;
    if(actor.length!==1)throw new Error("COURSE_COMPLETION_ACTOR_UNAVAILABLE");
    const where={userId_courseId:{userId,courseId}};
    const existing=await tx.userCourse.findUnique({where});
    if(!existing)throw new Error("COURSE_ENROLLMENT_NOT_FOUND");
    if(existing.completedAt)return existing;
    return tx.userCourse.update({where,data:{status:"COMPLETED",completedAt:new Date()}});
  });
}

export async function countCourseDays(courseId:string):Promise<number>{
  if(!courseId)return 0;
  return prisma.dayOnCourse.count({where:{courseId}});
}

export async function readCourseDayIds(courseId:string):Promise<{id:string}[]>{
  if(!courseId)return [];
  return prisma.dayOnCourse.findMany({where:{courseId},select:{id:true},orderBy:{order:"asc"}});
}

export async function readOwnTrainingStatuses(userId:string,dayOnCourseIds:readonly string[]):Promise<{dayOnCourseId:string;status:string}[]>{
  if(!userId || !dayOnCourseIds.length)return [];
  return prisma.userTraining.findMany({
    where:{userId,dayOnCourseId:{in:[...new Set(dayOnCourseIds)]}},
    select:{dayOnCourseId:true,status:true},
  });
}
