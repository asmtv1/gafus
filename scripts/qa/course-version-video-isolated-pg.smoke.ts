/** Phase G: row-locked trainer course CAS and course-occurrence video ACL on a disposable PostgreSQL instance. */
import assert from "node:assert/strict";
import {prisma} from "@gafus/prisma";
import {
 readCourseVersionRows,writeCourseNameVersionRows,setCourseLogoVersionRows,
 writeCourseNameObservedCas,readCourseObservedRevision,
} from "@gafus/course-progress-server/course-version-rows";
import {
 readTrainerVideoManifest,readTrainerVideoOwnership,
 readTrainerVideoStepOccurrences,readVideoCourseDayOccurrences,
 hasPublishedDailyCourseVideo,
} from "@gafus/course-read-server/video-access-read";
import {readCourseNameVersion} from "../../packages/core/src/services/trainerCourse/courseVersionService.js";
import {checkVideoAccess,getVideoManifestInfo} from "../../apps/api/src/modules/video/composition/video-access.js";
import {courseVersionRowsPort} from "../../apps/api/src/modules/trainer-courses/composition/course-version-rows-instance.js";

const url=new URL(process.env.DATABASE_URL??"http://invalid");
if(process.env.GAFUS_LOCAL_ISOLATED_API!=="1"||process.env.GAFUS_COURSE_VIDEO_REAL_PG!=="1"||
  url.protocol!=="postgresql:"||url.hostname!=="127.0.0.1"||
  url.pathname!=="/gafus_refactor_course_version_video"){
 throw Error("REFUSING_NON_DISPOSABLE_COURSE_VERSION_VIDEO_DB");
}
async function main(){
 const zone=await prisma.$queryRaw<{zone:string}[]>`SELECT current_setting('TimeZone') AS zone`;
 assert.equal(zone[0]?.zone,"Pacific/Auckland","non-UTC test detects timestamp drift");
 const triggers=await prisma.$queryRaw<{name:string}[]>`SELECT tgname AS name FROM pg_trigger WHERE tgrelid='"Course"'::regclass AND NOT tgisinternal`;
 assert.ok(triggers.some(t=>t.name==="Course_global_version_increment"),"requires exactly the production Course.version trigger");
 const [owner,other,viewer]=await Promise.all([
  prisma.user.create({data:{username:"version_owner",password:"synthetic-disposable"}}),
  prisma.user.create({data:{username:"version_other",password:"synthetic-disposable"}}),
  prisma.user.create({data:{username:"version_viewer",password:"synthetic-disposable"}}),
 ]);
 const trainer={id:owner.id,role:"TRAINER"};
 const foreignTrainer={id:other.id,role:"TRAINER"};
 const admin={id:other.id,role:"ADMIN"};
 const course=await prisma.course.create({data:{
  name:"Original",type:"course_video_g_unique",duration:"7",logoImg:"synthetic-old-logo",
  trainingLevel:"BEGINNER",authorId:owner.id,
 }});
 assert.equal((await readCourseVersionRows(course.id,trainer))[0]?.version,1);
 assert.deepEqual(await readCourseVersionRows(course.id,foreignTrainer),[]);
 assert.equal((await readCourseNameVersion(course.id,foreignTrainer,courseVersionRowsPort)).status,"not_found");
 const writes=await Promise.all([
  writeCourseNameVersionRows({courseId:course.id,name:"Writer One",expectedVersion:1},trainer),
  writeCourseNameVersionRows({courseId:course.id,name:"Writer Two",expectedVersion:1},trainer),
 ]);
 assert.deepEqual(writes.map(r=>r.length).sort(),[0,1],"two concurrent editors cannot both win version-1 CAS");
 assert.equal((await prisma.course.findUniqueOrThrow({where:{id:course.id}})).version,2,"DB trigger increments exactly once");
 assert.deepEqual(await writeCourseNameVersionRows({courseId:course.id,name:"Foreign",expectedVersion:2},foreignTrainer),[]);
 assert.equal((await prisma.course.findUniqueOrThrow({where:{id:course.id}})).version,2);
 assert.equal((await readCourseNameVersion(course.id,trainer,courseVersionRowsPort)).status,"found");
 const stamped=await readCourseObservedRevision(course.id,owner.id);
 assert.ok(stamped?.updatedAt);
 assert.equal(await readCourseObservedRevision(course.id,other.id),null);
 const nameCas=await writeCourseNameObservedCas({id:course.id,authorId:owner.id,updatedAt:stamped.updatedAt},"Name via observed CAS",new Date(stamped.updatedAt.getTime()+1000));
 assert.equal(nameCas.count,1);
 const staleNameCas=await writeCourseNameObservedCas({id:course.id,authorId:owner.id,updatedAt:stamped.updatedAt},"STALE SHOULD NOT WIN",new Date(stamped.updatedAt.getTime()+3000));
 assert.equal(staleNameCas.count,0);
 assert.equal((await prisma.course.findUniqueOrThrow({where:{id:course.id}})).name,"Name via observed CAS");
 assert.equal((await prisma.course.findUniqueOrThrow({where:{id:course.id}})).version,3);
 const oldLogo=await setCourseLogoVersionRows({courseId:course.id,logoUrl:"synthetic-new-logo",expectedVersion:2},trainer);
 assert.deepEqual(oldLogo,{status:"stale"});
 const logoSet=await setCourseLogoVersionRows({courseId:course.id,logoUrl:"synthetic-new-logo",expectedVersion:3},trainer);
 assert.deepEqual(logoSet,{status:"updated",data:{version:4,previousLogoUrl:"synthetic-old-logo"}});
 assert.deepEqual(await setCourseLogoVersionRows({courseId:course.id,logoUrl:"overwrite",expectedVersion:4},foreignTrainer),{status:"not_found"});
 assert.deepEqual(await setCourseLogoVersionRows({courseId:course.id,logoUrl:"overwrite",expectedVersion:3},admin),{status:"stale"});
 assert.equal((await prisma.course.findUniqueOrThrow({where:{id:course.id}})).version,4);
 await assert.rejects(prisma.course.update({where:{id:course.id},data:{version:77}}),/Course.version is database-managed/);
 assert.equal((await prisma.course.findUniqueOrThrow({where:{id:course.id}})).version,4);
 const timestamp=await prisma.course.findUniqueOrThrow({where:{id:course.id},select:{updatedAt:true}});
 assert.ok(timestamp.updatedAt.getTime()>new Date("2026-01-01").getTime(),"course timestamps still UTC-compatible in a non-UTC DB");

 // An identical shared day can be linked to private and public courses. The
 // per-occurrence entitlement must not use one course's access for another.
 const privateCourse=await prisma.course.create({data:{name:"Private",type:"course_video_private_unique",duration:"7",logoImg:"",trainingLevel:"BEGINNER",authorId:owner.id,isPrivate:true}});
 const publicCourse=await prisma.course.create({data:{name:"Public",type:"course_video_public_unique",duration:"7",logoImg:"",trainingLevel:"BEGINNER",authorId:owner.id,isPrivate:false,isPaid:false}});
 const day=await prisma.trainingDay.create({data:{title:"Shared day",authorId:owner.id}});
 const [privateOccurrence,publicOccurrence]=await Promise.all([
  prisma.dayOnCourse.create({data:{courseId:privateCourse.id,dayId:day.id,order:0}}),
  prisma.dayOnCourse.create({data:{courseId:publicCourse.id,dayId:day.id,order:0}}),
 ]);
 const video=await prisma.trainerVideo.create({data:{
  trainerId:owner.id,relativePath:"synthetic/video.mp4",originalName:"synthetic.mp4",mimeType:"video/mp4",fileSize:1024n,
  thumbnailPath:"synthetic-thumbnail.jpg",hlsManifestPath:null,transcodingStatus:"COMPLETED",
 }});
 const step=await prisma.step.create({data:{title:"Video lesson",authorId:owner.id,videoUrl:`https://synthetic.invalid/video/${video.id}.mp4`}});
 const stepLink=await prisma.stepOnDay.create({data:{dayId:day.id,stepId:step.id,order:0}});
 assert.equal((await readTrainerVideoManifest(video.id))?.trainerId,owner.id);
 assert.equal((await getVideoManifestInfo(video.id))?.thumbnailPath,"synthetic-thumbnail.jpg");
 assert.equal((await readTrainerVideoOwnership(video.id))?.trainerId,owner.id);
 assert.deepEqual((await readTrainerVideoStepOccurrences(video.id)).map(x=>x.id),[stepLink.id]);
 assert.deepEqual(new Set((await readVideoCourseDayOccurrences([day.id,day.id])).map(x=>x.id)),new Set([privateOccurrence.id,publicOccurrence.id]));
 assert.equal(await checkVideoAccess({userId:owner.id,videoId:video.id}),true,"uploader always owns video");
 assert.equal(await checkVideoAccess({userId:viewer.id,videoId:video.id}),true,"public course occurrence grants access");
 await prisma.dayOnCourse.delete({where:{id:publicOccurrence.id}});
 assert.equal(await checkVideoAccess({userId:viewer.id,videoId:video.id}),false,"private course alone cannot leak shared video");
 await prisma.courseAccess.create({data:{courseId:privateCourse.id,userId:viewer.id}});
 assert.equal(await checkVideoAccess({userId:viewer.id,videoId:video.id}),true,"owner's assigned private course may access video");
 await prisma.courseAccess.delete({where:{courseId_userId:{courseId:privateCourse.id,userId:viewer.id}}});
 assert.equal(await checkVideoAccess({userId:viewer.id,videoId:video.id}),false,"revoked assignment immediately denies playback");
 assert.equal(await checkVideoAccess({userId:viewer.id,videoId:"video-not-found"}),false);
 assert.equal(await getVideoManifestInfo("video-not-found"),null);
 assert.deepEqual(await readTrainerVideoStepOccurrences(""),[]);
 assert.deepEqual(await readVideoCourseDayOccurrences([]),[]);
 assert.equal(await hasPublishedDailyCourseVideo(video.id,new Date()),false);
 // Daily course is explicitly free once published, not for future drafts.
 const bundle=await prisma.dailyCourseBundle.create({data:{title:"Synthetic daily",authorId:owner.id}});
 await prisma.dailyCourseBundleStep.create({data:{bundleId:bundle.id,stepId:step.id,order:0}});
 await prisma.dailyCourseSchedule.create({data:{date:new Date("2026-11-06"),bundleId:bundle.id,createdById:owner.id,isPublished:false}});
 assert.equal(await hasPublishedDailyCourseVideo(video.id,new Date("2026-11-07")),false);
 assert.equal(await checkVideoAccess({userId:viewer.id,videoId:video.id}),false,"unpublished daily content is private");
 await prisma.dailyCourseSchedule.update({where:{date:new Date("2026-11-06")},data:{isPublished:true}});
 assert.equal(await hasPublishedDailyCourseVideo(video.id,new Date("2026-11-07")),true);
 assert.equal(await checkVideoAccess({userId:viewer.id,videoId:video.id}),true,"published daily content is accessible");
 console.log("PHASE_G_COURSE_VIDEO_REAL_PG_PASS: trigger-managed Course.version concurrent CAS; actor and stale fencing; observed timestamp CAS; row-locked logo; foreign and private video denies; shared-day occurrence ACL; assignment revocation; unpublished vs published daily video");
}
main().then(async()=>prisma.$disconnect()).catch(async err=>{console.error(err);await prisma.$disconnect();process.exitCode=1;});
