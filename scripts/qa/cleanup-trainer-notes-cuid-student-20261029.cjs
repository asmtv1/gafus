"use strict";
const fs=require("fs"),cp=require("child_process"),{Client}=require("pg");
const path=".local-pg-scratch/qa-trainer-notes-cuid-student-20261029.json";
const fixture=JSON.parse(fs.readFileSync(path,"utf8"));
if(fixture.username!=="qa_trainer_notes_cuid_student_20261029"||!/^c[a-z0-9]{24}$/.test(fixture.id))throw Error("UNSAFE_QA_STUDENT_ID");
const processId=cp.execFileSync("lsof",["-t","-nP","-iTCP:3001","-sTCP:LISTEN"],{encoding:"utf8"}).trim().split("\n")[0];
const ps=cp.execFileSync("ps",["eww","-p",processId,"-o","command="],{encoding:"utf8"});
const raw=ps.match(/(?:^|\s)DATABASE_URL=([^\s]+)/)?.[1],u=new URL(raw);
if(u.hostname!=="127.0.0.1"||u.port!=="55921"||u.pathname!=="/gafus_refactor_real_work_20261024")throw Error("REFUSE_NONLOCAL_QA_DB");
(async()=>{
 const c=new Client({connectionString:raw});await c.connect();try{
 await c.query("BEGIN");
 try{
 const user=await c.query('SELECT id,username,role,email,phone FROM "User" WHERE id=$1 FOR UPDATE',[fixture.id]);
 if(user.rowCount!==1||user.rows[0].username!==fixture.username||user.rows[0].role!=="USER"||user.rows[0].email!==null||user.rows[0].phone!==null)throw Error("REFUSE_UNRELATED_USER");
 const notes=await c.query('SELECT count(*)::int n FROM "TrainerNoteStudent" WHERE "studentId"=$1',[fixture.id]);
 if(notes.rows[0].n!==0)throw Error("REFUSE_STUDENT_HAS_ASSOCIATED_NOTES");
 const dependencies=await c.query(
 "SELECT child.relname AS child_table, a.attname AS child_column FROM pg_constraint con JOIN pg_class child ON child.oid=con.conrelid JOIN pg_namespace ns ON ns.oid=child.relnamespace JOIN pg_attribute a ON a.attrelid=con.conrelid AND a.attnum=con.conkey[1] WHERE con.contype='f' AND con.confrelid='\"User\"'::regclass AND array_length(con.conkey,1)=1 AND ns.nspname='public'");
 let foreignRows=0;
 for(const dep of dependencies.rows){
  const query='SELECT EXISTS(SELECT 1 FROM "'+dep.child_table.replaceAll('"','""')+'" WHERE "'+dep.child_column.replaceAll('"','""')+'"=$1) AS present';
  const res=await c.query(query,[fixture.id]);
  if(res.rows[0].present){foreignRows++;console.log("QA_STUDENT_CLEANUP_BLOCKED_BY_CHILD_TABLE",dep.child_table);}
 }
 if(foreignRows!==0)throw Error("REFUSE_STUDENT_HAS_NONQA_DEPENDENCIES");
 const removed=await c.query('DELETE FROM "User" WHERE id=$1 AND username=$2 AND role=$3 AND email IS NULL AND phone IS NULL',[fixture.id,fixture.username,"USER"]);
 if(removed.rowCount!==1)throw Error("QA_STUDENT_DELETE_COUNT_INVALID");
 await c.query("COMMIT");
 }catch(e){await c.query("ROLLBACK").catch(()=>{});throw e}
 const confirm=await c.query('SELECT count(*)::int n FROM "User" WHERE id=$1',[fixture.id]);
 if(confirm.rows[0].n!==0)throw Error("QA_STUDENT_CLEANUP_READBACK_FAILED");
 fs.unlinkSync(path);
 console.log("TEMP_CUID_QA_STUDENT_REMOVED_EXACT_GUARDED",{ownStudentRemoved:1,unrelatedLinkedRows:0,trackerRemoved:true});
 }finally{await c.end()}
})().catch(e=>{console.log("TEMP_QA_CUID_STUDENT_CLEANUP_ERROR",String(e.message).slice(0,180));process.exitCode=1});
