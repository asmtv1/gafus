/** Opt-in authorization+serialization acceptance on throwaway loopback PostgreSQL. */
import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { prisma } from "@gafus/prisma";
import { refreshCourseContentRevision } from "./cacheRevisionService.js";
const enabled=process.env.GAFUS_COURSE_REVISION_ISOLATED_TEST==="1";
if(enabled){
  const url=new URL(process.env.DATABASE_URL??"http://invalid");
  if(url.protocol!=="postgresql:"||url.hostname!=="127.0.0.1"||
      url.pathname!=="/gafus_refactor_course_revision"||
      process.env.GAFUS_LOCAL_ISOLATED_API!=="1")
    throw Error("DENIED: course revision E2E accepts private loopback PostgreSQL only");
}
const suite=enabled?describe:describe.skip;
suite("course content revision authoritative staff ACL and concurrent PostgreSQL updates",()=>{
  let admin="";let moderator="";let regular="";
  beforeAll(async()=>{
    await prisma.courseContentRevision.create({data:{id:1,revision:0n}});
    admin=(await prisma.user.create({
      data:{username:"qa_course_admin_"+randomUUID(),password:randomUUID(),role:"ADMIN"},
    })).id;
    moderator=(await prisma.user.create({
      data:{username:"qa_course_mod_"+randomUUID(),password:randomUUID(),role:"MODERATOR"},
    })).id;
    regular=(await prisma.user.create({
      data:{username:"qa_course_user_"+randomUUID(),password:randomUUID(),role:"USER"},
    })).id;
  });
  afterAll(async()=>{
    if(admin&&moderator&&regular){
      await prisma.user.deleteMany({where:{id:{in:[admin,moderator,regular]}}});
    }
    await prisma.courseContentRevision.deleteMany({where:{id:1}});
    await prisma.$disconnect();
  });
  it("authenticated ADMIN and MODERATOR increment the same authoritative DB row",async()=>{
    expect(await refreshCourseContentRevision(admin)).toBe("1");
    expect(await refreshCourseContentRevision(moderator)).toBe("2");
    expect(await prisma.courseContentRevision.findUnique({where:{id:1}}))
      .toMatchObject({revision:2n});
  });
  it("rejects USER and non-existing principals without changing revision",async()=>{
    await expect(refreshCourseContentRevision(regular)).rejects.toThrow("FORBIDDEN");
    await expect(refreshCourseContentRevision(randomUUID())).rejects.toThrow("FORBIDDEN");
    expect((await prisma.courseContentRevision.findUniqueOrThrow({where:{id:1}})).revision)
      .toBe(2n);
  });
  it("serializes 8 parallel admin revisions without losing increments",async()=>{
    const revisions=await Promise.all(
      Array.from({length:8},()=>refreshCourseContentRevision(admin)));
    expect(revisions.sort()).toEqual(["10","3","4","5","6","7","8","9"].sort());
    expect((await prisma.courseContentRevision.findUniqueOrThrow({where:{id:1}})).revision)
      .toBe(10n);
  });
  it("denies demoted staff even when the previously issued JWT remains ADMIN",async()=>{
    await prisma.user.update({where:{id:admin},data:{role:"USER"}});
    await expect(refreshCourseContentRevision(admin)).rejects.toThrow("FORBIDDEN");
    expect((await prisma.courseContentRevision.findUniqueOrThrow({where:{id:1}})).revision)
      .toBe(10n);
  });
  it("returns null for missing revision row and does not report success",async()=>{
    await prisma.courseContentRevision.delete({where:{id:1}});
    expect(await refreshCourseContentRevision(moderator)).toBeNull();
  });
});
