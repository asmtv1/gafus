/** Disposable owner-scope and minimal projection parity; never any production DB. */
import assert from "node:assert/strict";
import {prisma} from "@gafus/prisma";
import {readOwnedPets,readOwnedPetDetail} from "@gafus/pets-server/pet-reads";
import {readCoursePathHeader,readOwnedCoursePathProgress,listCourseIdsForTrainingDay} from "@gafus/course-read-server/course-path-read";
import {getUserPets,getPetById} from "../../packages/core/src/services/pets/petsReadService.js";
import {getCoursesUsingDay} from "../../packages/core/src/services/trainingDay/helpers.js";
import {readDurableCourseContentRevision} from "@gafus/course-read-server/content-revision";
import {readCourseEditorSnapshot} from "@gafus/course-read-server/editor-snapshot";
const url=new URL(process.env.DATABASE_URL??"http://invalid");
if(process.env.GAFUS_LOCAL_ISOLATED_API!=="1" || process.env.GAFUS_PET_COURSE_REAL_PG!=="1" ||
   url.protocol!=="postgresql:" || url.hostname!=="127.0.0.1" ||
   url.pathname!=="/gafus_refactor_pet_course_read")
 throw Error("REFUSING_NON_DISPOSABLE_PET_COURSE_DB");

async function main(){
 const [a,b]=await Promise.all([
   prisma.user.create({data:{username:"pet_path_owner_a",password:"synthetic-disposable"}}),
   prisma.user.create({data:{username:"pet_path_owner_b",password:"synthetic-disposable"}}),
 ]);
 const pet=await prisma.pet.create({data:{
   ownerId:a.id,name:"Dog A",type:"DOG",breed:"Synthetic",birthDate:new Date("2020-01-01")
 }});
 const other=await prisma.pet.create({data:{
   ownerId:b.id,name:"Dog B",type:"DOG",breed:"Synthetic",birthDate:new Date("2021-01-01")
 }});
 await prisma.award.create({data:{petId:pet.id,title:"Badge A",date:new Date("2025-02-01")}});
 assert.deepEqual((await readOwnedPets(a.id)).map(p=>p.id),[pet.id]);
 assert.deepEqual((await readOwnedPets(b.id)).map(p=>p.id),[other.id]);
 assert.deepEqual((await getUserPets(a.id,{throwOnError:true},readOwnedPets)).map(p=>p.id),[pet.id]);
 assert.equal((await getPetById(other.id,a.id,readOwnedPetDetail)),null);
 assert.equal((await readOwnedPetDetail(other.id,a.id)),null);
 const petDetail=await readOwnedPetDetail(pet.id,a.id);
 assert.equal(petDetail?.awards[0]?.title,"Badge A");
 const pets=await readOwnedPets(a.id);
 assert.equal(pets[0]?._count.documents,0);
 assert.equal(pets[0]?._count.preventionEntries,0);
 assert.equal((await readOwnedPetDetail("missing",a.id)),null);
 assert.equal((await readOwnedPets("")).length,0);
 const course=await prisma.course.create({data:{
   name:"Exportable A",type:"pet_path_a",trainingLevel:"BEGINNER",duration:"7",logoImg:"",authorId:a.id,
 }});
 const c2=await prisma.course.create({data:{
   name:"Exportable B",type:"pet_path_b",trainingLevel:"BEGINNER",duration:"7",logoImg:"",authorId:a.id,
 }});
 const startedAt=new Date("2026-11-06T10:00:00Z");
 await prisma.userCourse.create({data:{userId:a.id,courseId:course.id,startedAt}});
 assert.deepEqual(await readCoursePathHeader(course.id),{name:"Exportable A",type:"pet_path_a"});
 assert.equal((await readOwnedCoursePathProgress(a.id,course.id))?.startedAt?.getTime(),startedAt.getTime());
 assert.equal(await readOwnedCoursePathProgress(b.id,course.id),null,"an enrollment belongs to only one user");
 assert.equal(await readOwnedCoursePathProgress(a.id,c2.id),null);
 const day=await prisma.trainingDay.create({data:{title:"Shared test day",authorId:a.id}});
 await prisma.dayOnCourse.createMany({data:[
   {dayId:day.id,courseId:course.id,order:0},
   {dayId:day.id,courseId:c2.id,order:0},
 ]});
 assert.deepEqual(new Set(await getCoursesUsingDay(day.id)),new Set([course.id,c2.id]));
 assert.deepEqual(new Set(await listCourseIdsForTrainingDay(day.id)),new Set([course.id,c2.id]));
 assert.deepEqual(await getCoursesUsingDay("missing"),[]);
 // The trainer editor's role is rechecked in DB, not trusted from an old access JWT.
 await prisma.user.update({where:{id:a.id},data:{role:"TRAINER"}});
 const ownEditor=await readCourseEditorSnapshot(course.id,{id:a.id,role:"TRAINER"});
 assert.equal(ownEditor.status,"found");
 if(ownEditor.status!=="found")throw Error("editor should exist");
 assert.equal(ownEditor.data.version,1);
 assert.equal(ownEditor.data.name,"Exportable A");
 assert.equal(ownEditor.data.dayLinks.length,1);
 assert.equal(JSON.stringify(ownEditor).includes("synthetic-disposable"),false);
 assert.deepEqual(await readCourseEditorSnapshot(course.id,{id:b.id,role:"TRAINER"}),{status:"not_found"});
 await prisma.user.update({where:{id:a.id},data:{role:"USER"}});
 assert.deepEqual(await readCourseEditorSnapshot(course.id,{id:a.id,role:"TRAINER"}),{status:"not_found"},"demoted trainer must not access draft with stale role");
 await prisma.user.update({where:{id:b.id},data:{role:"ADMIN"}});
 assert.equal((await readCourseEditorSnapshot(course.id,{id:b.id,role:"ADMIN"})).status,"found");
 assert.deepEqual(await readCourseEditorSnapshot(course.id,{id:b.id,role:"TRAINER"}),{status:"not_found"},"stale lower-role claim denied");

 await assert.rejects(readDurableCourseContentRevision(),/COURSE_CACHE_DURABLE_REVISION_MISSING/);
 await prisma.courseContentRevision.create({data:{id:1,revision:9n}});
 assert.equal(await readDurableCourseContentRevision(),"9");
 await prisma.courseContentRevision.update({where:{id:1},data:{revision:9007199254740997n}});
 assert.equal(await readDurableCourseContentRevision(),"9007199254740997");
 console.log("PET_COURSE_READ_REAL_PG_PASS: Pet list/detail owner-isolated, awards/counts, Core adapter parity, course enrollment owner-isolated, training-day course joins, durable revision bigint/missing fail-closed, trainer editor role demotion and admin read");
}
main().then(async()=>prisma.$disconnect())
 .catch(async(error)=>{console.error(error);await prisma.$disconnect();process.exitCode=1;});
