/** Single committed PostgreSQL revision is the authority for content cache reuse. */
import {prisma} from "@gafus/prisma";

export async function readDurableCourseContentRevision():Promise<string>{
  const rows=await prisma.$queryRaw<{revision:bigint}[]>`
    SELECT "revision" FROM "CourseContentRevision" WHERE "id" = 1
  `;
  if(rows.length!==1 || typeof rows[0]?.revision!=="bigint")
    throw new Error("COURSE_CACHE_DURABLE_REVISION_MISSING");
  return rows[0].revision.toString();
}
