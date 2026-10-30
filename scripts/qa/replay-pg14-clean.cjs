"use strict";
const fs=require("node:fs"),path=require("node:path"),cp=require("node:child_process");
const sock=path.resolve(".ag1-course-pg/sock"),port=55433;
const url=(role,db)=>"postgresql://"+role+"@localhost:"+port+"/"+db+"?host="+sock;
const tests=[
 ["routes/v1/g1-gafus-admin-dashboard.real-prisma-pg.mounted.test.ts","ag1_gafus134","ag1_gafus134_read","G1_AG1_GAFUS_ADMIN_URL"],
 ["routes/v1/g1-trainer-calendar-read.real-prisma-pg.mounted.test.ts","ag1_calendar132","ag1_cal132_read","G1_AG1_CALENDAR_ADMIN_URL"],
 ["routes/v1/g1-trainer-statistics-courses.real-prisma-pg.mounted.test.ts","ag1_stats135","ag1_stats135_read","G1_AG1_STATS_ADMIN_URL"],
 ["routes/v1/g1-trainer-statistics-steps.real-prisma-pg.mounted.test.ts","ag1_stats136","ag1_stats136_read","G1_AG1_STATS_STEPS_ADMIN_URL"]
];
const results=[];
for(const [file,db,role,key] of tests){
 const env={...process.env,CI:"1",NODE_ENV:"test",G1_AG1_OWN_PG:"1",DATABASE_URL:url(role,db),[key]:url("ag1_course",db),NODE_OPTIONS:"--require="+path.resolve("scripts/qa/block-nonlocal-network.cjs")};
 const p=cp.spawnSync("pnpm",["--filter","@gafus/api","exec","vitest","run","--config","vitest.config.ts",file],{env,encoding:"utf8",timeout:95000,maxBuffer:8*1024*1024});
 const txt=(p.stdout||"")+"\n"+(p.stderr||"");
 const logfile=".local-pg-scratch/qa-logs/pg14-clean-"+path.basename(file,".ts")+"-20261029.log";
 fs.writeFileSync(logfile,txt);
 const lines=txt.replace(/\x1b\[[0-9;]*m/g,"").split("\n");
 const x={file,db,exit:p.status,timeout:p.error?.code==="ETIMEDOUT",summary:lines.filter(l=>/^\s*(Tests|Test Files)\s+/.test(l)),issues:lines.filter(l=>/^(Error:|AssertionError| FAIL  )/.test(l)).slice(0,5).map(l=>l.slice(0,160)),logfile};
 results.push(x);fs.writeFileSync(".local-pg-scratch/qa-logs/pg14-clean-results-20261029.json",JSON.stringify(results,null,2));console.log("PG14_CLEAN_SUITE",JSON.stringify(x));
}
console.log("PG14_CLEAN_TOTAL",{total:results.length,pass:results.filter(x=>x.exit===0).length});
if(results.some(x=>x.exit!==0))process.exitCode=1;
