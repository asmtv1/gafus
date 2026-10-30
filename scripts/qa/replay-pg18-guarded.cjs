"use strict";
const fs=require("node:fs"),path=require("node:path"),cp=require("node:child_process");
const root=path.resolve("apps/api/src");
const files=[
 ["modules/trainer-articles/infrastructure/own-article-cutoff.real-pg.mounted.test.ts","AG1_ARTICLE_CUTOFF_OWN_PG18"],
 ["modules/trainer-notes/infrastructure/read-notes-summary-snapshot.real-pg.mounted.test.ts","AG1_TRAINER_NOTES_SUMMARY_PG18"],
 ["modules/trainer-notes/infrastructure/read-notes-summary-snapshot.tie-real-pg.mounted.test.ts","AG1_TRAINER_NOTES_TIE_REAL_PG18"],
 ["routes/v1/g1-diary-get-real-pg.mounted.test.ts","AG1_DIARY_HONO_OWN_PG18"],
 ["routes/v1/g1-favorites-registered-real-pg.mounted.test.ts","AG1_FAVORITES_HONO_OWN_PG18"],
 ["routes/v1/g1-learner-daily-today-day-registered.real-pg.mounted.test.ts","AG1_LEARNER_DAILY_HONO_OWN_PG18"],
 ["routes/v1/g1-student-notes-registered-real-pg.mounted.test.ts","AG1_NOTES_HONO_OWN_PG18"],
 ["routes/v1/g1-surveys-read-real-pg.mounted.test.ts","AG1_SURVEY_HONO_OWN_PG18"],
 ["routes/v1/g1-tr014-four-registered-read.real-pg.mounted.test.ts","AG1_TR014_HONO_OWN_PG18"],
 ["routes/v1/g1-trainer-exam-two-registered.real-pg.mounted.test.ts","AG1_TRAINER_EXAM_HONO_OWN_PG18"],
 ["routes/v1/g1-trainer-notes-articles-two-registered.real-pg.mounted.test.ts","AG1_G3_TRAINER_METADATA_OWN_PG18"],
 ["routes/v1/g1-trainer-three-reads.real-pg.mounted.test.ts","AG1_TRAINER_JOINT_OWN_PG18"],
 ["routes/v1/g1-training-current-two-reads.real-pg.mounted.test.ts","AG1_TRAINING_FORWARD_OWN_PG18"],
 ["routes/v1/public-courses.real-pg.mounted.test.ts","G1_AG1_PUBLIC_CATALOG_OWN_PG18"]
];
const sock=path.resolve(".local-pg-scratch/s");
const results=[];
for(let i=0;i<files.length;i++){
 const [file,flag]=files[i],source=fs.readFileSync(path.join(root,file),"utf8");
 const db=source.match(/const\s+(?:database|dbName|db)\s*=\s*"([^"]+)"/)?.[1];
 const tag=source.match(/const\s+(?:appTag|appName|tag|application)\s*=\s*"([^"]+)"/)?.[1];
 if(!db||!tag||!db.startsWith("gafus_refactor_")||!tag.startsWith("ag1_"))throw Error("REFUSE_UNKNOWN_GUARD:"+file);
 const u=new URL("postgresql://asmtv1@localhost:55917/"+db);
 u.searchParams.set("host",sock);u.searchParams.set("application_name",tag);
 const env={...process.env,CI:"1",NODE_ENV:"test",DATABASE_URL:u.toString(),[flag]:"1",NODE_OPTIONS:"--require="+path.resolve("scripts/qa/block-nonlocal-network.cjs")};
 const output=cp.spawnSync("pnpm",["--filter","@gafus/api","exec","vitest","run","--config","vitest.config.ts",file],{env,encoding:"utf8",timeout:85000,maxBuffer:8*1024*1024});
 const text=(output.stdout||"")+"\n"+(output.stderr||"");
 const basename=path.basename(file,".ts");
 fs.writeFileSync(path.join(".local-pg-scratch/qa-logs","pg18-"+basename+"-20261029.log"),text);
 const s=text.replace(/\x1b\[[0-9;]*m/g,"");
 const item={file,database:db,guard:flag,exit:output.status,timeout:output.error?.code==="ETIMEDOUT",summary:s.split("\n").filter(l=>/^\s*(Test Files|Tests)\s+/.test(l)),failures:s.split("\n").filter(l=>l.startsWith(" FAIL  ")).slice(0,2),lastError:s.split("\n").filter(l=>/Error:|AssertionError:/.test(l)).slice(-2).map(l=>l.slice(0,140))};
 results.push(item);
 fs.writeFileSync(".local-pg-scratch/qa-logs/pg18-guarded-results-20261029.json",JSON.stringify(results,null,2));
 console.log("PG18_GUARDED_SUITE",JSON.stringify(item));
}
console.log("PG18_GUARDED_TOTAL",JSON.stringify({total:results.length,pass:results.filter(r=>r.exit===0).length,fail:results.filter(r=>r.exit!==0).length}));
if(results.some(r=>r.exit!==0))process.exitCode=1;
