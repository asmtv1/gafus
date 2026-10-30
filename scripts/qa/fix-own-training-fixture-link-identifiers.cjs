"use strict";
const fs=require("node:fs"),cp=require("node:child_process"),{randomBytes}=require("node:crypto"),{Client}=require("pg");
const file=".local-pg-scratch/qa-training-progress-fixture-20261029.json";
const fixture=JSON.parse(fs.readFileSync(file,"utf8"));
const pid=cp.execFileSync("lsof",["-t","-nP","-iTCP:3001","-sTCP:LISTEN"],{encoding:"utf8"}).trim().split("\n")[0];
const ps=cp.execFileSync("ps",["eww","-p",pid,"-o","command="],{encoding:"utf8"});
const raw=ps.match(/(?:^|\s)DATABASE_URL=([^\s]+)/)?.[1],u=new URL(raw);
if(u.hostname!=="127.0.0.1"||u.port!=="55921"||u.pathname!=="/gafus_refactor_real_work_20261024"||fixture.database!=="gafus_refactor_real_work_20261024"||fixture.localOnly!==true)throw Error("REFUSE_WRONG_QA_STORAGE");
const newIds={stepOnDay:"c"+randomBytes(16).toString("hex").slice(0,24),dayOnCourse:"c"+randomBytes(16).toString("hex").slice(0,24)};
(async()=>{
 const db=new Client({connectionString:raw});await db.connect();
 try{
 await db.query("BEGIN");
 try{
 const s=await db.query('SELECT sod.id FROM "StepOnDay" sod JOIN "Step" s ON s.id=sod."stepId" JOIN "TrainingDay" d ON d.id=sod."dayId" WHERE sod.id=$1 AND s."authorId"=$2 AND d."authorId"=$2 AND s.title=$3 AND d.title=$4 FOR UPDATE OF sod',[fixture.ids.stepOnDay,fixture.trainerId,fixture.names.step,fixture.names.day]);
 const d=await db.query('SELECT doc.id FROM "DayOnCourse" doc JOIN "Course" c ON c.id=doc."courseId" JOIN "TrainingDay" d ON d.id=doc."dayId" WHERE doc.id=$1 AND c."authorId"=$2 AND d."authorId"=$2 AND c.name=$3 AND d.title=$4 FOR UPDATE OF doc',[fixture.ids.dayOnCourse,fixture.trainerId,fixture.names.course,fixture.names.day]);
 if(s.rowCount!==1||d.rowCount!==1)throw Error("NOT_OWN_QA_FIXTURE");
 const child=await db.query('SELECT (SELECT count(*) FROM "UserTraining" WHERE "dayOnCourseId"=$1)::int n1,(SELECT count(*) FROM "UserStep" WHERE "stepOnDayId"=$2)::int n2',[fixture.ids.dayOnCourse,fixture.ids.stepOnDay]);
 if(child.rows[0].n1!==0||child.rows[0].n2!==0)throw Error("REFUSE_WITH_USER_PROGRESS");
 await db.query('UPDATE "StepOnDay" SET id=$1 WHERE id=$2',[newIds.stepOnDay,fixture.ids.stepOnDay]);
 await db.query('UPDATE "DayOnCourse" SET id=$1 WHERE id=$2',[newIds.dayOnCourse,fixture.ids.dayOnCourse]);
 await db.query("COMMIT");
 }catch(e){await db.query("ROLLBACK").catch(()=>{});throw e}
 const next={...fixture,ids:{...fixture.ids,...newIds},idCorrection:"local QA links corrected to Prisma-generated CUID identifier contract",correctedAt:new Date().toISOString()};
 const temp=file+".next";const fd=fs.openSync(temp,"wx",0o600);fs.writeFileSync(fd,JSON.stringify(next,null,2));fs.closeSync(fd);fs.renameSync(temp,file);fs.chmodSync(file,0o600);
 console.log("QA_LINK_ID_CORRECTION_LOCAL_ONLY",{stepOnDayFormat:"cuid",dayOnCourseFormat:"cuid",allOwnerChecks:true,noProgressRows:true});
 }finally{await db.end()}
})().catch(e=>{console.log("QA_LINK_CORRECTION_ERROR",e.code||e.message);process.exitCode=1});
