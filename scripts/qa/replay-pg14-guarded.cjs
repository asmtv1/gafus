"use strict";
const fs=require("node:fs"),path=require("node:path"),cp=require("node:child_process");
const socket=path.resolve(".ag1-course-pg/sock");
const url=(role,db)=>"postgresql://"+role+"@localhost:55432/"+db+"?host="+socket;
const fixtures=[
 ["routes/v1/g1-course-editor-snapshot.real-pg.mounted.test.ts","ag1_fullform","ag1_course",null],
 ["routes/v1/g1-feed-notifications-real-pg.mounted.test.ts","ag1_stats135","ag1_stats135_read","G1_AG1_FEED_HTTP_ADMIN_URL"],
 ["routes/v1/g1-gafus-admin-dashboard.real-prisma-pg.mounted.test.ts","ag1_gafus134","ag1_gafus134_read","G1_AG1_GAFUS_ADMIN_URL","ag1_course"],
 ["routes/v1/g1-trainer-articles-own.real-pg.mounted.test.ts","ag1_stats135","ag1_stats135_read","G1_AG1_ARTICLES_ADMIN_URL"],
 ["routes/v1/g1-trainer-calendar-read.real-prisma-pg.mounted.test.ts","ag1_calendar132","ag1_cal132_read","G1_AG1_CALENDAR_ADMIN_URL","ag1_course"],
 ["routes/v1/g1-trainer-notes-summary.real-pg.mounted.test.ts","ag1_stats135","ag1_stats135_read","G1_AG1_NOTES_ADMIN_URL"],
 ["routes/v1/g1-trainer-statistics-courses.real-prisma-pg.mounted.test.ts","ag1_stats135","ag1_stats135_read","G1_AG1_STATS_ADMIN_URL"],
 ["routes/v1/g1-trainer-statistics-steps.real-prisma-pg.mounted.test.ts","ag1_stats136","ag1_stats136_read","G1_AG1_STATS_STEPS_ADMIN_URL","ag1_course"],
 ["routes/v1/g1-training-online-read.real-pg.mounted.test.ts","ag1_stats135","ag1_stats135_read","G1_AG1_TRAINING_ADMIN_URL"]
];
const results=[];
const targeted=new Set(["g1-course-editor-snapshot","g1-gafus-admin-dashboard","g1-trainer-calendar-read","g1-trainer-statistics-steps"]);
for(const [file,db,role,adminVar,adminRole] of fixtures.filter(f=>[...targeted].some(n=>f[0].includes(n)))){
 const env={...process.env,CI:"1",NODE_ENV:"test",G1_AG1_OWN_PG:"1",DATABASE_URL:url(role,db),NODE_OPTIONS:"--require="+path.resolve("scripts/qa/block-nonlocal-network.cjs")};
 if(adminVar)env[adminVar]=url(adminRole||"ag1_course",db);
 const p=cp.spawnSync("pnpm",["--filter","@gafus/api","exec","vitest","run","--config","vitest.config.ts",file],{env,encoding:"utf8",timeout:95000,maxBuffer:10*1024*1024});
 const output=(p.stdout||"")+"\n"+(p.stderr||"");
 const log=".local-pg-scratch/qa-logs/pg14-"+path.basename(file,".ts")+"-20261029.log";
 fs.writeFileSync(log,output);
 const clean=output.replace(/\x1b\[[0-9;]*m/g,"");
 const x={file,db,role,exit:p.status,timeout:p.error?.code==="ETIMEDOUT",summary:clean.split("\n").filter(l=>/^\s*(Tests|Test Files)\s+/.test(l)),errors:clean.split("\n").filter(l=>/^(Error:|AssertionError| FAIL  )/.test(l)).slice(0,4).map(l=>l.slice(0,150)),log};
 results.push(x);
 fs.writeFileSync(".local-pg-scratch/qa-logs/pg14-role-corrected-results-20261029.json",JSON.stringify(results,null,2));
 console.log("PG14_GUARDED_SUITE",JSON.stringify(x));
}
console.log("PG14_GUARDED_TOTAL",JSON.stringify({total:results.length,pass:results.filter(x=>x.exit===0).length,fail:results.filter(x=>x.exit!==0).length}));
if(results.some(x=>x.exit!==0))process.exitCode=1;
