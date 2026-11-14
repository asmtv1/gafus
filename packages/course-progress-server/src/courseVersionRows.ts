/** ORM-only Course.version read, CAS write and row-locked logo update.
 * Core owns input validation, failure mapping and post-commit publication;
 * the database trigger is the only Course.version incrementer.
 * No imports from Core, and no provider/network I/O inside the transaction.
 */
import {prisma} from "@gafus/prisma";
export type CourseVersionRow={id:string;name:string;version:number};
export type CourseVersionRowActor={id:string;role:string};
const isVersion=(v:unknown):v is number=>typeof v==="number"&&Number.isSafeInteger(v)&&v>0&&v<=2147483647;
export async function readCourseVersionRows(courseId:string,actor:CourseVersionRowActor):Promise<CourseVersionRow[]>{
  return actor.role === "ADMIN"
      ? await prisma.$queryRaw<CourseVersionRow[]>`
          SELECT "id","name","version" FROM "Course" WHERE "id" = ${courseId}
        `
      : await prisma.$queryRaw<CourseVersionRow[]>`
          SELECT "id","name","version" FROM "Course"
          WHERE "id" = ${courseId} AND "authorId" = ${actor.id}
        `;
}
export async function writeCourseNameVersionRows(input:{courseId:string;name:string;expectedVersion:number},actor:CourseVersionRowActor):Promise<CourseVersionRow[]>{
  return actor.role === "ADMIN"
      ? await prisma.$queryRaw<CourseVersionRow[]>`
          UPDATE "Course" SET "name" = ${input.name},
            "updatedAt" = timezone('UTC', CURRENT_TIMESTAMP)
          WHERE "id" = ${input.courseId} AND "version" = ${input.expectedVersion}
          RETURNING "id","name","version"
        `
      : await prisma.$queryRaw<CourseVersionRow[]>`
          UPDATE "Course" SET "name" = ${input.name},
            "updatedAt" = timezone('UTC', CURRENT_TIMESTAMP)
          WHERE "id" = ${input.courseId} AND "authorId" = ${actor.id}
            AND "version" = ${input.expectedVersion}
          RETURNING "id","name","version"
        `;
}
export async function setCourseLogoVersionRows(input:{courseId:string;logoUrl:string;expectedVersion:number},actor:CourseVersionRowActor){
  return prisma.$transaction(async tx => {
      const existing = actor.role === "ADMIN"
        ? await tx.$queryRaw<{ logoImg: string; version: number }[]>`
            SELECT "logoImg","version" FROM "Course"
            WHERE "id"=${input.courseId} FOR UPDATE
          `
        : await tx.$queryRaw<{ logoImg: string; version: number }[]>`
            SELECT "logoImg","version" FROM "Course"
            WHERE "id"=${input.courseId} AND "authorId"=${actor.id}
            FOR UPDATE
          `;
      if (existing.length === 0) return { status: "not_found" as const };
      if (existing.length !== 1 || !isVersion(existing[0]?.version))
        return { status: "unknown" as const };
      if (existing[0].version !== input.expectedVersion)
        return { status: "stale" as const };
      const updated = actor.role === "ADMIN"
        ? await tx.$queryRaw<{ version: number }[]>`
            UPDATE "Course"
            SET "logoImg"=${input.logoUrl}, "updatedAt"=timezone('UTC', CURRENT_TIMESTAMP)
            WHERE "id"=${input.courseId}
              AND "version"=${input.expectedVersion}
            RETURNING "version"
          `
        : await tx.$queryRaw<{ version: number }[]>`
            UPDATE "Course"
            SET "logoImg"=${input.logoUrl}, "updatedAt"=timezone('UTC', CURRENT_TIMESTAMP)
            WHERE "id"=${input.courseId} AND "authorId"=${actor.id}
              AND "version"=${input.expectedVersion}
            RETURNING "version"
          `;
      if (updated.length !== 1 || updated[0]?.version !== input.expectedVersion + 1)
        throw Error("UNEXPECTED_LOGO_VERSION");
      return {
        status: "updated" as const,
        data: {
          version: updated[0].version,
          previousLogoUrl: existing[0].logoImg || null,
        },
      };
    });
}
export async function writeCourseNameObservedCas(where:{id:string;authorId?:string;updatedAt:Date},name:string,updatedAt:Date){
 return prisma.course.updateMany({where,data:{name,updatedAt}});
}
export async function readCourseObservedRevision(id:string,authorId?:string){
 return prisma.course.findFirst({where:{id,...(authorId?{authorId}:{})},select:{updatedAt:true}});
}
