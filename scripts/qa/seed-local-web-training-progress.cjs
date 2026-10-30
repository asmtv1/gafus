"use strict";
const fs=require("node:fs"),cp=require("node:child_process"),{randomUUID}=require("node:crypto"),{Client}=require("pg");
const file=".local-pg-scratch/qa-training-progress-fixture-20261029.json";
if(fs.existsSync(file))throw Error("REFUSE_RESEED_EXISTING_QA_TRAINING");
const accounts=JSON.parse(fs.readFileSync(".local-pg-scratch/qa-browser-accounts-20261029.json","utf8"));
const trainer=accounts.find(x=>x.role==="TRAINER"),learner=accounts.find(x=>x.role==="USER");
const pid=cp.execFileSync("lsof",["-t","-nP","-iTCP:3001","-sTCP:LISTEN"],{encoding:"utf8"}).trim().split("\n")[0];
const cmd=cp.execFileSync("ps",["eww","-p",pid,"-o","command="],{encoding:"utf8"});
const raw=cmd.match(/(?:^|\s)DATABASE_URL=([^\s]+)/)?.[1],u=new URL(raw);
if(u.hostname!=="127.0.0.1"||u.port!=="55921"||u.pathname!=="/gafus_refactor_real_work_20261024")throw Error("REFUSE_NONLOCAL_QA_DB");
const token=randomUUID().slice(0,8);
const ids={step:randomUUID(),day:randomUUID(),stepOnDay:randomUUID(),course:randomUUID(),dayOnCourse:randomUUID()};
const names={step:"QA: тренировочный шаг "+token,day:"QA: день обучения "+token,course:"QA: курс обучения "+token};
const type="qa-training-"+token;
(async()=>{
 const db=new Client({connectionString:raw});await db.connect();
 try{
 const roles=await db.query('SELECT id,role FROM "User" WHERE id IN ($1,$2)',[trainer.id,learner.id]);
 if(roles.rowCount!==2||roles.rows.find(x=>x.id===trainer.id)?.role!=="TRAINER"||roles.rows.find(x=>x.id===learner.id)?.role!=="USER")throw Error("WRONG_QA_ROLES");
 await db.query("BEGIN");
 try{
 await db.query('INSERT INTO "Step" (id,title,description,type,"authorId","durationSec") VALUES ($1,$2,$3,$4,$5,$6)',[ids.step,names.step,"Локальное практическое упражнение в тестовом курсе, без медиа и внешних сообщений.","PRACTICE",trainer.id,null]);
 await db.query('INSERT INTO "TrainingDay" (id,title,description,"authorId","updatedAt") VALUES ($1,$2,$3,$4,NOW())',[ids.day,names.day,"Локальный тренировочный день, только синтетические пользователи.",trainer.id]);
 await db.query('INSERT INTO "StepOnDay" (id,"dayId","stepId","order") VALUES ($1,$2,$3,0)',[ids.stepOnDay,ids.day,ids.step]);
 await db.query('INSERT INTO "Course" (id,name,type,description,"shortDesc",duration,"logoImg","trainingLevel","authorId","isPrivate","isPaid","updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,false,false,NOW())',[ids.course,names.course,type,"Синтетический курс для локального браузерного тестирования прогресса.","QA local training progress","1 мин","","BEGINNER",trainer.id]);
 await db.query('INSERT INTO "DayOnCourse" (id,"courseId","dayId","order") VALUES ($1,$2,$3,0)',[ids.dayOnCourse,ids.course,ids.day]);
 await db.query("COMMIT");
 }catch(e){await db.query("ROLLBACK").catch(()=>{});throw e}
 const payload={ids,names,type,trainerId:trainer.id,learnerId:learner.id,database:"gafus_refactor_real_work_20261024",localOnly:true,seededAt:new Date().toISOString()};
 const fd=fs.openSync(file,"wx",0o600);fs.writeFileSync(fd,JSON.stringify(payload,null,2));fs.closeSync(fd);fs.chmodSync(file,0o600);
 const proof=await db.query('SELECT c.type,count(DISTINCT doc.id)::int days,count(DISTINCT sod.id)::int steps FROM "Course" c JOIN "DayOnCourse" doc ON doc."courseId"=c.id JOIN "StepOnDay" sod ON sod."dayId"=doc."dayId" WHERE c.id=$1 AND c."authorId"=$2 GROUP BY c.type',[ids.course,trainer.id]);
 if(proof.rowCount!==1||proof.rows[0].days!==1||proof.rows[0].steps!==1)throw Error("LOCAL_QA_SEED_READBACK_FAILED");
 console.log("LOCAL_SYNTHETIC_TRAINING_FIXTURE_READY",{courseType:type,days:1,steps:1,onlyQAAuthors:true});
 }finally{await db.end()}
})().catch(e=>{console.log("QA_TRAINING_FIXTURE_ERROR",e.code||e.message);process.exitCode=1});
