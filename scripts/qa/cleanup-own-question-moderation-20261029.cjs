"use strict";
const fs=require("node:fs"),cp=require("node:child_process"),{Client}=require("pg");
const roles=JSON.parse(fs.readFileSync(".local-pg-scratch/qa-browser-accounts-20261029.json","utf8"));
const author=roles.find(x=>x.role==="USER"),reporter=roles.find(x=>x.role==="TRAINER");
const title="QA: сквозная жалоба и решение администратора 20261029";
const pid=cp.execFileSync("lsof",["-t","-nP","-iTCP:3001","-sTCP:LISTEN"],{encoding:"utf8"}).trim().split("\n")[0];
const text=cp.execFileSync("ps",["eww","-p",pid,"-o","command="],{encoding:"utf8"});
const raw=text.match(/(?:^|\s)DATABASE_URL=([^\s]+)/)?.[1],u=new URL(raw);
if(u.hostname!=="127.0.0.1"||u.port!=="55921"||u.pathname!=="/gafus_refactor_real_work_20261024")throw Error("REFUSE_UNSAFE_DB");
(async()=>{
 const db=new Client({connectionString:raw});await db.connect();try{
 await db.query("BEGIN");
 try{
 const questions=await db.query('SELECT id,"authorId",title,"hiddenAt","deletedAt" FROM "Question" WHERE title=$1 AND "authorId"=$2 FOR UPDATE',[title,author.id]);
 if(questions.rowCount!==1||questions.rows[0].hiddenAt||questions.rows[0].deletedAt)throw Error("REFUSE_NON_QA_QUESTION");
 const qid=questions.rows[0].id;
 const reports=await db.query('SELECT id,"reporterId","questionId",resolution,"resolvedAt" FROM "QuestionReport" WHERE "questionId"=$1 FOR UPDATE',[qid]);
 if(reports.rowCount!==1||reports.rows[0].reporterId!==reporter.id||!reports.rows[0].resolvedAt||!reports.rows[0].resolution?.startsWith("dismiss:"))throw Error("REFUSE_NON_QA_REPORT");
 const subs=await db.query('SELECT (SELECT count(*)::int FROM "QuestionAnswer" WHERE "questionId"=$1) answers,(SELECT count(*)::int FROM "QuestionPhoto" WHERE "questionId"=$1) photos,(SELECT count(*)::int FROM "QuestionView" WHERE "questionId"=$1) views',[qid]);
 if(subs.rows[0].answers!==0||subs.rows[0].photos!==0)throw Error("REFUSE_QUESTION_WITH_USER_MEDIA_OR_ANSWERS");
 const deletedReport=await db.query('DELETE FROM "QuestionReport" WHERE id=$1 AND "reporterId"=$2 AND "questionId"=$3',[reports.rows[0].id,reporter.id,qid]);
 const deletedQuestion=await db.query('DELETE FROM "Question" WHERE id=$1 AND "authorId"=$2 AND title=$3',[qid,author.id,title]);
 if(deletedReport.rowCount!==1||deletedQuestion.rowCount!==1)throw Error("LOCAL_QA_CLEANUP_ROW_MISMATCH");
 await db.query("COMMIT");
 const after=await db.query('SELECT (SELECT count(*)::int FROM "Question" WHERE id=$1) questions,(SELECT count(*)::int FROM "QuestionReport" WHERE "questionId"=$1) reports,(SELECT count(*)::int FROM "QuestionView" WHERE "questionId"=$1) views',[qid]);
 if(Object.values(after.rows[0]).some(n=>n!==0))throw Error("QA_CLEANUP_SQL_READBACK_FAILED");
 console.log("QA_CROSS_APP_REPORT_LOCAL_CLEANUP_PASS",JSON.stringify({ownQuestionRemoved:1,ownReportRemoved:1,qaQuestionViewsCascaded:subs.rows[0].views,after:after.rows[0]}));
 }catch(e){await db.query("ROLLBACK").catch(()=>{});throw e}
 }finally{await db.end()}
})().catch(e=>{console.log("QA_CROSS_APP_CLEANUP_FAIL",e.code||e.message);process.exitCode=1});
