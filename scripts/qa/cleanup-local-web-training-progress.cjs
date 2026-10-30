"use strict";
const fs=require("node:fs"),cp=require("node:child_process"),{Client}=require("pg");
const path=".local-pg-scratch/qa-training-progress-fixture-20261029.json";
if(!fs.existsSync(path))throw Error("NO_QA_FIXTURE_TO_CLEAN");
const q=JSON.parse(fs.readFileSync(path,"utf8")),id=q.ids;
const pid=cp.execFileSync("lsof",["-t","-nP","-iTCP:3001","-sTCP:LISTEN"],{encoding:"utf8"}).trim().split("\n")[0];
const ps=cp.execFileSync("ps",["eww","-p",pid,"-o","command="],{encoding:"utf8"});
const raw=ps.match(/(?:^|\s)DATABASE_URL=([^\s]+)/)?.[1],u=new URL(raw);
if(u.hostname!=="127.0.0.1"||u.port!=="55921"||u.pathname!=="/gafus_refactor_real_work_20261024"||q.localOnly!==true||q.database!=="gafus_refactor_real_work_20261024")throw Error("REFUSE_NONLOCAL_DATABASE");
(async()=>{
const c=new Client({connectionString:raw});await c.connect();
const deleted={};try{
await c.query("BEGIN");
try{
const [course,day,step,dl,sl,ut,us,uc]=await Promise.all([
 c.query('SELECT id FROM "Course" WHERE id=$1 AND "authorId"=$2 AND name=$3 AND type=$4 FOR UPDATE',[id.course,q.trainerId,q.names.course,q.type]),
 c.query('SELECT id FROM "TrainingDay" WHERE id=$1 AND "authorId"=$2 AND title=$3 FOR UPDATE',[id.day,q.trainerId,q.names.day]),
 c.query('SELECT id FROM "Step" WHERE id=$1 AND "authorId"=$2 AND title=$3 FOR UPDATE',[id.step,q.trainerId,q.names.step]),
 c.query('SELECT id FROM "DayOnCourse" WHERE id=$1 AND "courseId"=$2 AND "dayId"=$3',[id.dayOnCourse,id.course,id.day]),
 c.query('SELECT id FROM "StepOnDay" WHERE id=$1 AND "stepId"=$2 AND "dayId"=$3',[id.stepOnDay,id.step,id.day]),
 c.query('SELECT id,"userId" FROM "UserTraining" WHERE "dayOnCourseId"=$1',[id.dayOnCourse]),
 c.query('SELECT us.id,ut."userId",us."stepOnDayId" FROM "UserStep" us JOIN "UserTraining" ut ON ut.id=us."userTrainingId" WHERE ut."dayOnCourseId"=$1',[id.dayOnCourse]),
 c.query('SELECT "userId" FROM "UserCourse" WHERE "courseId"=$1',[id.course]),
]);
if([course,day,step,dl,sl].some(x=>x.rowCount!==1))throw Error("QA_FIXTURE_OWNERSHIP_MISSING");
if(ut.rows.some(x=>x.userId!==q.learnerId)||us.rows.some(x=>x.userId!==q.learnerId||x.stepOnDayId!==id.stepOnDay)||uc.rows.some(x=>x.userId!==q.learnerId))throw Error("REFUSE_NONQA_USER_ASSOCIATION");
const extra=await c.query('SELECT (SELECT count(*) FROM "DayOnCourse" WHERE "courseId"=$1 OR "dayId"=$2)::int links,(SELECT count(*) FROM "StepOnDay" WHERE "dayId"=$2 OR "stepId"=$3)::int steps,(SELECT count(*) FROM "DiaryEntry" WHERE "dayId"=$2)::int diaries,(SELECT count(*) FROM "ExamResult" er JOIN "UserStep" us ON er."userStepId"=us.id JOIN "UserTraining" ut ON ut.id=us."userTrainingId" WHERE ut."dayOnCourseId"=$4)::int exams',[id.course,id.day,id.step,id.dayOnCourse]);
if(extra.rows[0].links!==1||extra.rows[0].steps!==1||extra.rows[0].diaries!==0||extra.rows[0].exams!==0)throw Error("REFUSE_LINKED_OUTSIDE_QA_FIXTURE");
const actions=[
 ["userSteps",c.query('DELETE FROM "UserStep" WHERE "userTrainingId" IN (SELECT id FROM "UserTraining" WHERE "dayOnCourseId"=$1 AND "userId"=$2) AND "stepOnDayId"=$3',[id.dayOnCourse,q.learnerId,id.stepOnDay])],
 ["userTraining",c.query('DELETE FROM "UserTraining" WHERE "dayOnCourseId"=$1 AND "userId"=$2',[id.dayOnCourse,q.learnerId])],
 ["userCourse",c.query('DELETE FROM "UserCourse" WHERE "courseId"=$1 AND "userId"=$2',[id.course,q.learnerId])],
 ["dayOnCourse",c.query('DELETE FROM "DayOnCourse" WHERE id=$1 AND "courseId"=$2',[id.dayOnCourse,id.course])],
 ["stepOnDay",c.query('DELETE FROM "StepOnDay" WHERE id=$1 AND "dayId"=$2',[id.stepOnDay,id.day])],
 ["course",c.query('DELETE FROM "Course" WHERE id=$1 AND "authorId"=$2',[id.course,q.trainerId])],
 ["day",c.query('DELETE FROM "TrainingDay" WHERE id=$1 AND "authorId"=$2',[id.day,q.trainerId])],
 ["step",c.query('DELETE FROM "Step" WHERE id=$1 AND "authorId"=$2',[id.step,q.trainerId])],
];
for(const [key,p] of actions){const r=await p;deleted[key]=r.rowCount;if(["dayOnCourse","stepOnDay","course","day","step"].includes(key)&&r.rowCount!==1)throw Error("QA_CLEANUP_ROW_COUNT_MISMATCH:"+key)}
await c.query("COMMIT");
}catch(e){await c.query("ROLLBACK").catch(()=>{});throw e}
const after=await c.query('SELECT (SELECT count(*) FROM "Course" WHERE id=$1)::int courses,(SELECT count(*) FROM "Step" WHERE id=$2)::int steps,(SELECT count(*) FROM "TrainingDay" WHERE id=$3)::int days,(SELECT count(*) FROM "UserCourse" WHERE "courseId"=$1)::int usercourses',[id.course,id.step,id.day]);
if(Object.values(after.rows[0]).some(v=>v!==0))throw Error("QA_CLEANUP_READBACK_FAILED");
fs.unlinkSync(path);
console.log("QA_LEARNER_TRAINING_FIXTURE_CLEANED",{...deleted,after:after.rows[0],onlyOwnRows:true});
}finally{await c.end()}
})().catch(e=>{console.log("QA_LEARNER_TRAINING_CLEANUP_ERROR",e.code||e.message);process.exitCode=1});
