/** Database projections only. All entitlement decisions remain inside Core.
 * Occurrence ID is preserved: shared TrainingDays cannot grant another course.
 * TrainerVideo metadata has no media bytes or source storage credentials.
 */
import {prisma} from "@gafus/prisma";

export async function readTrainerVideoManifest(videoId:string){
 if(!videoId)return null;
 return prisma.trainerVideo.findUnique({
  where:{id:videoId},
  select:{hlsManifestPath:true,thumbnailPath:true,transcodingStatus:true,trainerId:true},
 });
}
export async function readTrainerVideoOwnership(videoId:string){
 if(!videoId)return null;
 return prisma.trainerVideo.findUnique({where:{id:videoId},select:{id:true,trainerId:true}});
}
/** Compatibility with existing imported trainer-video identifiers encoded inside
 * Step.videoUrl. Do not broaden this to an unrelated course or another user.
 */
export async function readTrainerVideoStepOccurrences(videoId:string){
 if(!videoId)return [];
 return prisma.stepOnDay.findMany({
  where:{step:{videoUrl:{contains:videoId}}},
  select:{id:true,dayId:true},
 });
}
export async function readVideoCourseDayOccurrences(dayIds:string[]){
 if(!dayIds.length)return [];
 return prisma.dayOnCourse.findMany({
  where:{dayId:{in:[...new Set(dayIds)]}},
  select:{id:true,dayId:true},
 });
}
export async function hasPublishedDailyCourseVideo(videoId:string,now:Date){
 if(!videoId)return false;
 const row=await prisma.dailyCourseBundleStep.findFirst({
  where:{step:{videoUrl:{contains:videoId}},bundle:{schedules:{some:{isPublished:true,date:{lte:now}}}}},
  select:{id:true},
 });
 return row!==null;
}
