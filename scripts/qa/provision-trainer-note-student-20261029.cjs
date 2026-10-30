"use strict";
const fs=require("fs"),crypto=require("crypto"),cp=require("child_process"),{Client}=require("pg");
const path=".local-pg-scratch/qa-trainer-notes-cuid-student-20261029.json";
if(fs.existsSync(path))throw Error("REFUSE_OVERWRITE_QA_STUDENT_TRACKER");
const pid=cp.execFileSync("lsof",["-t","-nP","-iTCP:3001","-sTCP:LISTEN"],{encoding:"utf8"}).trim().split("\n")[0];
const ps=cp.execFileSync("ps",["eww","-p",pid,"-o","command="],{encoding:"utf8"}),raw=ps.match(/(?:^|\s)DATABASE_URL=([^\s]+)/)?.[1],u=new URL(raw);
if(u.hostname!=="127.0.0.1"||u.port!=="55921"||u.pathname!=="/gafus_refactor_real_work_20261024")throw Error("REFUSE_NONLOCAL_WORK_DB");
const id="c"+crypto.randomBytes(12).toString("hex"),username="qa_trainer_notes_cuid_student_20261029";
(async()=>{
 const db=new Client({connectionString:raw});await db.connect();try{
 const pre=await db.query('SELECT count(*)::int n FROM "User" WHERE username=$1',[username]);if(pre.rows[0].n!==0)throw Error("QA_STUDENT_USERNAME_ALREADY_EXISTS");
 const secret=crypto.randomBytes(48).toString("hex");
 const result=await db.query('INSERT INTO "User" (id,username,password,role,"registrationChannel","createdAt","updatedAt") VALUES ($1,$2,$3,$4,$5,NOW(),NOW()) RETURNING id,username,role,email,phone',[id,username,secret,"USER","UNKNOWN"]);
 const a=result.rows[0];
 if(result.rowCount!==1||a.id!==id||a.username!==username||a.role!=="USER"||a.email!==null||a.phone!==null)throw Error("QA_STUDENT_CREATE_VERIFICATION_FAILED");
 fs.writeFileSync(path,JSON.stringify({id,username}),{mode:0o600,flag:"wx"});
 console.log("QA_ONLY_CUID_STUDENT_CREATED",{cuidLength:id.length,usernameIsQAMarked:true,emailNull:true,phoneNull:true,tracker:path});
 }finally{await db.end()}
})().catch(e=>{console.log("QA_CUID_STUDENT_PROVISION_ERROR",String(e.message).slice(0,180));process.exitCode=1});
