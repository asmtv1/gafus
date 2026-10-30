"use strict";
const fs=require("node:fs"),path=require("node:path"),cp=require("node:child_process");
const paths=[
 "apps/api/src/routes/v1/courses.ts",
 "apps/api/src/routes/v1/trainer-exam-summary.ts"
];
const before=paths.map(x=>fs.readFileSync(x,"utf8"));
const markers=[
 ['  } catch {\n    logger.error("Error in favorites GET API"', '  } catch (qaError) {\n    console.error("QA_FAVORITES_CAUSE",qaError instanceof Error?qaError.name:"Unknown",qaError instanceof Error?qaError.message.slice(0,400):"NonError");\n    logger.error("Error in favorites GET API"'],
 ['  } catch {\n    return c.json({\n      success: false, code: "INTERNAL_SERVER_ERROR",','  } catch (qaError) {\n    console.error("QA_EXAM_CAUSE",qaError instanceof Error?qaError.name:"Unknown",qaError instanceof Error?qaError.message.slice(0,400):"NonError");\n    return c.json({\n      success: false, code: "INTERNAL_SERVER_ERROR",']
];
const cases=[
 ["routes/v1/g1-favorites-registered-real-pg.mounted.test.ts","gafus_refactor_favorites_registered_ag1_20261024","ag1_course030_favorite_hono_sql_20261024","AG1_FAVORITES_HONO_OWN_PG18"],
 ["routes/v1/g1-trainer-exam-two-registered.real-pg.mounted.test.ts","gafus_refactor_trainer_exam_hono_ag1_20261024","ag1_trainer_exam_hono_sql_20261024","AG1_TRAINER_EXAM_HONO_OWN_PG18"]
];
try{
 for(let i=0;i<paths.length;i++){
  if(!before[i].includes(markers[i][0]))throw Error("UNEXPECTED_SOURCE_CATCH:"+paths[i]);
  fs.writeFileSync(paths[i],before[i].replace(markers[i][0],markers[i][1]));
 }
 for(const [file,db,app,flag] of cases){
  const u=new URL("postgresql://asmtv1@localhost:55917/"+db);
  u.searchParams.set("host",path.resolve(".local-pg-scratch/s"));
  u.searchParams.set("application_name",app);
  const env={...process.env,CI:"1",NODE_ENV:"test",DATABASE_URL:u.toString(),[flag]:"1",NODE_OPTIONS:"--require="+path.resolve("scripts/qa/block-nonlocal-network.cjs")};
  const p=cp.spawnSync("pnpm",["--filter","@gafus/api","exec","vitest","run","--config","vitest.config.ts",file],{env,encoding:"utf8",timeout:60000,maxBuffer:8*1024*1024});
  const s=((p.stdout||"")+"\n"+(p.stderr||"")).replace(/\x1b\[[0-9;]*m/g,"");
  const f=".local-pg-scratch/qa-logs/diagnose-"+path.basename(file,".ts")+"-20261029.log";
  fs.writeFileSync(f,s);
  console.log("READ_FAILURE_CAUSE",{file,exit:p.status,causes:s.split("\n").filter(l=>l.includes("QA_FAVORITES_CAUSE")||l.includes("QA_EXAM_CAUSE")).slice(0,5).map(l=>l.slice(0,470)),log:f});
 }
}finally{
 for(let i=0;i<paths.length;i++)fs.writeFileSync(paths[i],before[i]);
 console.log("QA_DIAGNOSTIC_SOURCE_RESTORED");
}
