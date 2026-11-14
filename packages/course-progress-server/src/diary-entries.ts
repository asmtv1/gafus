/** Diary persistence only. Core performs content validation and course ACL.
 * The read projection is always bounded to the requesting user and selected
 * course's training-day occurrences; a shared TrainingDay never joins another
 * course's metadata or another user's content.
 */
import {prisma} from "@gafus/prisma";

export interface DiaryEntryWithDay {
  id: string;
  content: string;
  createdAt: Date;
  updatedAt: Date;
  dayId: string;
  dayOnCourseId: string;
  dayOrder: number;
  dayTitle: string;
}

/** Accept Course.id first, then legacy course.type as used by older clients. */
export async function resolveDiaryCourseId(courseIdOrType:string):Promise<string|null>{
 const byId=await prisma.course.findUnique({where:{id:courseIdOrType},select:{id:true}});
 if(byId)return byId.id;
 const byType=await prisma.course.findFirst({where:{type:courseIdOrType},select:{id:true}});
 return byType?.id??null;
}

/** Caller verifies course access before writing. Return only the occurrence's
 * FK fields; never infer membership using a globally shared dayId alone. */
export async function readDiaryDayOccurrence(dayOnCourseId:string){
 return prisma.dayOnCourse.findUnique({where:{id:dayOnCourseId},select:{dayId:true,courseId:true}});
}

/** Unique (userId, dayId) is the legacy diary identifier; retain it for
 * cross-course shared-day compatibility. Only this owner's content is edited. */
export async function writeDiaryUserDay(userId:string,dayId:string,content:string){
 return prisma.diaryEntry.upsert({
  where:{userId_dayId:{userId,dayId}},
  create:{userId,dayId,content},
  update:{content,updatedAt:new Date()},
 });
}

/** Called only after the canonical Core course ACL check succeeds. */
export async function readDiaryCourseEntries(
 userId:string,courseId:string,upToDayOnCourseId?:string,
):Promise<DiaryEntryWithDay[]>{
 let upToOrder:number|null=null;
 if(upToDayOnCourseId){
  const day=await prisma.dayOnCourse.findUnique({
   where:{id:upToDayOnCourseId,courseId},select:{order:true},
  });
  if(day)upToOrder=day.order;
 }
 const courseDays=await prisma.dayOnCourse.findMany({
  where:{courseId,...(upToOrder!==null?{order:{lte:upToOrder}}:{})},
  orderBy:{order:"asc"},
  select:{id:true,order:true,dayId:true,day:{select:{title:true}}},
 });
 const dayIdToDoc=new Map(courseDays.map(d=>[d.dayId,{
  order:d.order,title:d.day.title,dayOnCourseId:d.id,
 }]));
 if(!courseDays.length)return [];
 const rawEntries=await prisma.diaryEntry.findMany({
  where:{userId,dayId:{in:courseDays.map(d=>d.dayId)}},
  select:{id:true,content:true,createdAt:true,updatedAt:true,dayId:true},
 });
 rawEntries.sort((a,b)=>
  (dayIdToDoc.get(a.dayId)?.order??0)-(dayIdToDoc.get(b.dayId)?.order??0));
 return rawEntries.map(e=>{
  const doc=dayIdToDoc.get(e.dayId)!;
  return {id:e.id,content:e.content,createdAt:e.createdAt,updatedAt:e.updatedAt,
   dayId:e.dayId,dayOnCourseId:doc.dayOnCourseId,dayOrder:doc.order,dayTitle:doc.title};
 });
}
