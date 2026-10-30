/** Owner-only, disposable Chromium -> registered Hono -> WORK PG Survey acceptance.
 * Invoked exclusively by web3-survey-hono-work.sh after exact DB preflight.
 * The extra Survey Step/StepOnDay/SurveyResponse are always cleaned by our
 * exact deterministic owner-bound IDs BEFORE existing fixture cleanup. */
import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync } from "node:fs";
import { prisma } from "@gafus/prisma";
import { chromium } from "../../.local-browser-mcp/node_modules/playwright/index.mjs";

const R="/Users/asmtv1/Desktop/gafus-refactor";
const lease=R+"/.local-pg-scratch/web3-unified-private.json";
const raw=new URL(process.env.DATABASE_URL??"postgresql://invalid/invalid");
if(process.cwd()!==R+"/apps/api" ||
  process.env.GAFUS_WEB3_SURVEY_REAL_HTTP!=="1" ||
  process.env.GAFUS_WEB3_REAL_BROWSER!=="1" ||
  process.env.GAFUS_LOCAL_ISOLATED_API!=="1" ||
  process.env.GAFUS_WEB3_OWN_HTTP!=="1" ||
  raw.protocol!=="postgresql:" || raw.hostname!=="127.0.0.1" ||
  raw.port!=="55921" ||raw.pathname!=="/gafus_refactor_real_work_20261024" ||
  raw.username!=="gafus_refactor_local_real" || !raw.password ||
  raw.search!=="?schema=public"||!existsSync(lease)||lstatSync(lease).isSymbolicLink())
  throw Error("WEB3_SURVEY_SCOPE_DENIED");
const F=JSON.parse(readFileSync(lease,"utf8")) as {
  users:{id:string;username:string;password:string}[];
  courseIds:string[];courseType:string;dayId:string;dayOnCourseId:string;
  stepIds:string[];stepOnDayIds:string[];
};
const ensure:(ok:unknown,code:string)=>asserts ok=(ok,code)=>{
  if(!ok)throw Error("WEB3_SURVEY_REAL_"+code);
};
ensure(F.users.length===2 && F.users.every(u=>
  /^[a-f0-9-]{36}$/.test(u.id)&&u.username==="web3_parity_"+u.id.replaceAll("-","") &&
  u.password.startsWith("Web3Synthetic!")),"ACTOR_LEASE_INVALID");
ensure(F.courseIds.length===2&&F.stepIds.length===2&&F.stepOnDayIds.length===2&&
 /^WEB3_PARITY_[0-9a-f]{8}$/.test(F.courseType),"FIXTURE_LEASE_INVALID");
const owner=F.users[0],foreign=F.users[1];
const derived=(namespace:string)=>"c"+createHash("sha256")
  .update(namespace+":"+F.stepIds[0]).digest("hex").slice(0,24);
const surveyStepId=derived("WEB3_SURVEY_STEP_R52");
const surveyLinkId=derived("WEB3_SURVEY_LINK_R52");
const slug="dog-home-alone-initial";
const verifyTarget=async()=>{
 const identity=await prisma.$queryRaw<{db:string;actor:string;version:string}[]>`
 SELECT current_database() AS db,current_user AS actor,
   current_setting('server_version_num') AS version`;
 ensure(identity.length===1&&identity[0]?.db==="gafus_refactor_real_work_20261024"&&
  identity[0].actor==="gafus_refactor_local_real" &&
  identity[0].version==="180004","DB_SCOPE_INVALID");
 const course=await prisma.course.findUnique({where:{id:F.courseIds[0]}});
 const day=await prisma.dayOnCourse.findUnique({where:{id:F.dayOnCourseId}});
 ensure(course?.type===F.courseType && day?.courseId===course.id &&
  day?.dayId===F.dayId,"COURSE_LEASE_CHANGED");
};
const clean=async()=>{
 await verifyTarget();
 const link=await prisma.stepOnDay.findUnique({where:{id:surveyLinkId}});
 ensure(!link||(link.dayId===F.dayId&&link.stepId===surveyStepId&&link.order===2),
  "CLEAN_LINK_NOT_OWNED");
 const step=await prisma.step.findUnique({where:{id:surveyStepId}});
 ensure(!step||(step.type==="SURVEY"&&step.surveySlug===slug&&
   step.authorId===owner.id),"CLEAN_STEP_NOT_OWNED");
 const users=F.users.map(x=>x.id);
 const responses=await prisma.surveyResponse.findMany({where:{stepId:surveyStepId}});
 ensure(responses.every(x=>x.courseId===F.courseIds[0]&&users.includes(x.userId)&&
  x.surveySlug===slug),"CLEAN_RESPONSE_NOT_OWNED");
 const diaries=await prisma.diaryEntry.findMany({
   where:{dayId:F.dayId,userId:{in:users}},
 });
 ensure(diaries.every(x=>users.includes(x.userId)&&x.dayId===F.dayId),
  "CLEAN_DIARY_NOT_OWNED");
 const progress=await prisma.userStep.findMany({
   where:{stepOnDayId:surveyLinkId},
   include:{userTraining:{select:{userId:true,dayOnCourseId:true}}},
 });
 ensure(progress.every(x=>users.includes(x.userTraining.userId)&&
   x.userTraining.dayOnCourseId===F.dayOnCourseId),"CLEAN_PROGRESS_NOT_OWNED");
 await prisma.surveyResponse.deleteMany({where:{stepId:surveyStepId}});
 await prisma.diaryEntry.deleteMany({where:{dayId:F.dayId,userId:{in:users}}});
 await prisma.userStep.deleteMany({where:{stepOnDayId:surveyLinkId}});
 if(link)await prisma.stepOnDay.delete({where:{id:surveyLinkId}});
 if(step)await prisma.step.delete({where:{id:surveyStepId}});
 ensure(await prisma.surveyResponse.count({where:{stepId:surveyStepId}})===0&&
    await prisma.userStep.count({where:{stepOnDayId:surveyLinkId}})===0&&
    await prisma.diaryEntry.count({where:{dayId:F.dayId,userId:{in:users}}})===0,
  "CLEANUP_STILL_REFERENCED");
 console.log("WEB3_SURVEY_EXACT_SYNTHETIC_CLEANUP_PASS");
};
const execute=async()=>{
 await verifyTarget();
 ensure(!await prisma.step.findUnique({where:{id:surveyStepId}})&&
  !await prisma.stepOnDay.findUnique({where:{id:surveyLinkId}}),
  "FIXTURE_ID_ALREADY_EXISTS");
 await prisma.step.create({data:{
  id:surveyStepId,title:"WEB3 Изолированная анкета",authorId:owner.id,
  type:"SURVEY",surveySlug:slug,
 }});
 await prisma.stepOnDay.create({data:{
  id:surveyLinkId,dayId:F.dayId,stepId:surveyStepId,order:2,
 }});
 let browser:Awaited<ReturnType<typeof chromium.launch>>|null=null;
 try {
  const chrome=R+"/.local-browser-mcp/.cache/browsers/chromium_headless_shell-1247/chrome-headless-shell-mac-arm64/chrome-headless-shell";
  ensure(existsSync(chrome),"BROWSER_NOT_INSTALLED");
  browser=await chromium.launch({headless:true,executablePath:chrome,
    args:["--no-sandbox","--disable-gpu","--disable-background-networking"],
    env:{PATH:"/opt/homebrew/bin:/usr/bin:/bin",
      HOME:R+"/.local-browser-mcp/.cache/home",
      XDG_CACHE_HOME:R+"/.local-browser-mcp/.cache/tmp"}});
  const ctx=await browser.newContext({viewport:{width:1280,height:800},serviceWorkers:"block"});
  await ctx.route("**/*",r=>{
   const u=new URL(r.request().url());
   if(u.protocol!=="http:"||u.hostname!=="127.0.0.1"||
     !["3103","5183"].includes(u.port))
    return r.abort();
   return r.continue();
  });
  const page=await ctx.newPage();
  // Browser cookie and CSRF origin must be Vite5183, identical to actual
  // Refactor sessions. The Vite proxy forwards only /api/v1 to own Hono3103.
  const root=await page.goto("http://127.0.0.1:5183/login",{
   waitUntil:"domcontentloaded",timeout:16000,
  });
  ensure(root?.status()===200,"REFRACTOR_VITE_NOT_READY");
  // The strict own-port 5183 harness uses the same genuine Hono Bearer
  // transport as prior WEB3 real-SQL acceptance. No synthetic cookies,
  // forged Origin or token logging; every endpoint enforces normal ACL.
  let token="";
  const login=async(actor:typeof owner)=>{
   const receipt=await page.evaluate(async u=>{
    const response=await fetch("/api/v1/auth/login",{method:"POST",
     headers:{"content-type":"application/json"},
     body:JSON.stringify(u)});
    const json=await response.json().catch(()=>null);
    return {status:response.status,token:json?.data?.accessToken??null};
   },{username:actor.username,password:actor.password});
   ensure(receipt.status===200&&typeof receipt.token==="string"&&
    receipt.token.length>30,"BEARER_LOGIN_"+receipt.status);
   token=receipt.token;
  };
  const read=async(path:string)=>page.evaluate(async payload=>{
   const res=await fetch(payload.path,{method:"GET",credentials:"include",
    cache:"no-store",headers:{authorization:"Bearer "+payload.token}});
   return {status:res.status,body:await res.json().catch(()=>null)};
  },{path,token});
  const post=async(path:string,body:Record<string,unknown>)=>
   page.evaluate(async payload=>{
    const res=await fetch(payload.path,{method:"POST",credentials:"include",
     headers:{"content-type":"application/json",authorization:"Bearer "+payload.token},
     body:JSON.stringify(payload.body)});
    return {status:res.status,body:await res.json().catch(()=>null)};
   },{path,body,token});
  await login(owner);
  const templatePath="/api/v1/surveys/"+slug+"?stepId="+surveyStepId;
  const initial=await read(templatePath);
  ensure(initial.status===200&&initial.body?.data?.template?.slug===slug&&
    initial.body?.data?.response===null,"TEMPLATE_OR_PRIVATE_READ");
  ensure(await prisma.userStep.count({where:{stepOnDayId:surveyLinkId}})===0,
    "READ_CREATED_PROGRESS");
  const trainingPath="/api/v1/training/day?"+new URLSearchParams({
    courseType:F.courseType,dayOnCourseId:F.dayOnCourseId,createIfMissing:"true",
  });
  const day=await read(trainingPath);
  const survey=day.body?.data?.steps?.find((step:{id:string})=>step.id===surveyStepId);
  const wrong=day.body?.data?.steps?.find((step:{id:string})=>step.id===F.stepIds[1]);
  ensure(day.status===200&&survey?.userStepId&&survey?.locked===false&&
    survey?.surveySlug===slug&&wrong?.userStepId,"INITIAL_BINDING_FAILED");
  console.log("WEB3_SURVEY_REAL_HONO_TEMPLATE_NO_PREMATURE_PROGRESS_PASS");
  const responsePath="/api/v1/surveys/"+slug+"/response";
  const payload={courseId:F.courseIds[0],stepId:surveyStepId,
   userStepId:survey.userStepId,answers:{concern:"Волнуется, когда ухожу"}};
  const bad=await post(responsePath,{...payload,userStepId:wrong.userStepId});
  ensure(bad.status===400&&bad.body?.success===false&&
    bad.body?.code==="USER_STEP_NOT_FOUND"&&
    await prisma.surveyResponse.count({where:{stepId:surveyStepId}})===0,
    "WRONG_OCCURRENCE_NOT_REJECTED");
  const wrongRow=await prisma.userStep.findUnique({where:{id:wrong.userStepId}});
  ensure(wrongRow?.status!=="COMPLETED","WRONG_EXAM_PROGRESS_CHANGED");
  console.log("WEB3_SURVEY_REAL_HONO_WRONG_STEP_REJECTED_PASS");
  const saved=await post(responsePath,payload);
  ensure(saved.status===200&&saved.body?.success===true,"SURVEY_SUBMIT_FAILED_"+saved.status);
  const answer=await read(templatePath);
  const persisted=await prisma.surveyResponse.findUnique({
    where:{userId_stepId:{userId:owner.id,stepId:surveyStepId}},
  });
  const bound=await prisma.userStep.findUnique({where:{id:survey.userStepId}});
  ensure(answer.status===200&&answer.body?.data?.response?.answers?.concern===
   "Волнуется, когда ухожу"&&answer.body.data.response.canEdit===true&&
   persisted?.answers&&bound?.status==="COMPLETED","SAVE_GET_OR_STEP_NOT_COMPLETE");
  console.log("WEB3_SURVEY_REAL_HONO_SUBMIT_SQL_GET_PASS");
  const edited=await post(responsePath,{...payload,answers:{concern:"Теперь спокойно ждёт"}});
  const reread=await read(templatePath);
  ensure(edited.status===200&&reread.body?.data?.response?.answers?.concern===
    "Теперь спокойно ждёт"&&
    await prisma.surveyResponse.count({where:{stepId:surveyStepId}})===1,
    "EDIT_WINDOW_UPDATE_NOT_PERSISTED");
  console.log("WEB3_SURVEY_REAL_HONO_EDIT_WITHIN_WINDOW_PASS");
  // DIARY Web/mobile-equivalent: actual registered HTTP POST -> WORK PG ->
  // GET, same physical day; update must be an upsert, never two entries.
  const diaryPath="/api/v1/training/diary?"+new URLSearchParams({
    courseId:F.courseIds[0],upToDayOnCourseId:F.dayOnCourseId,
  });
  ensure(await prisma.diaryEntry.count({where:{userId:owner.id,dayId:F.dayId}})===0,
    "PREEXISTING_DIARY_FIXTURE");
  const blank=await post("/api/v1/training/diary",{
    dayOnCourseId:F.dayOnCourseId,content:"   ",
  });
  ensure(blank.status===400&&await prisma.diaryEntry.count({
    where:{userId:owner.id,dayId:F.dayId},
  })===0,"DIARY_INVALID_WROTE_DATA");
  const diaryInitial=await read(diaryPath);
  ensure(diaryInitial.status===200&&diaryInitial.body?.data?.entries?.length===0,
    "DIARY_EMPTY_OWNER_READ");
  const firstNote="Собака выполнила упражнение, чувствует себя уверенно";
  const diarySave=await post("/api/v1/training/diary",{
    dayOnCourseId:F.dayOnCourseId,content:firstNote,
  });
  const diaryRead=await read(diaryPath);
  const savedNotes=await prisma.diaryEntry.findMany({where:{userId:owner.id,dayId:F.dayId}});
  ensure(diarySave.status===200&&diaryRead.status===200&&
    diaryRead.body?.data?.entries?.length===1&&
    diaryRead.body.data.entries[0].content===firstNote&&
    diaryRead.body.data.entries[0].dayOnCourseId===F.dayOnCourseId&&
    diaryRead.body.data.entries[0].dayTitle==="День 1. Спокойная прогулка"&&
    savedNotes.length===1&&savedNotes[0].content===firstNote,
    "DIARY_SQL_CREATE_GET_MISMATCH");
  const updatedNote="Улучшилось внимание, поводок больше не натянут";
  const diaryUpdated=await post("/api/v1/training/diary",{
    dayOnCourseId:F.dayOnCourseId,content:updatedNote,
  });
  const diaryAgain=await read(diaryPath);
  const latestNotes=await prisma.diaryEntry.findMany({where:{userId:owner.id,dayId:F.dayId}});
  ensure(diaryUpdated.status===200&&diaryAgain.status===200&&
    diaryAgain.body?.data?.entries?.length===1&&
    diaryAgain.body.data.entries[0].content===updatedNote&&
    latestNotes.length===1&&latestNotes[0].id===savedNotes[0].id&&
    latestNotes[0].content===updatedNote,"DIARY_UPSERT_RELOAD_MISMATCH");
  console.log("WEB3_DIARY_REAL_HONO_POST_SQL_GET_UPSERT_PASS");
  await login(foreign);
  const foreignDiary=await read(diaryPath);
  ensure(foreignDiary.status===200&&Array.isArray(foreignDiary.body?.data?.entries)&&
    foreignDiary.body.data.entries.length===0&&
    await prisma.diaryEntry.count({where:{userId:owner.id,dayId:F.dayId}})===1,
    "FOREIGN_DIARY_PRIVACY_LEAK");
  console.log("WEB3_DIARY_REAL_HONO_CROSS_USER_READ_ISOLATED_PASS");
  const foreignGet=await read(templatePath);
  const foreignPost=await post(responsePath,payload);
  ensure(foreignGet.status===200&&foreignGet.body?.data?.response===null&&
    [400,402,403].includes(foreignPost.status)&&foreignPost.body?.success===false,
    "FOREIGN_OWNER_DATA_LEAK");
  await login(owner);
  const exp=await prisma.surveyResponse.findUnique({
    where:{userId_stepId:{userId:owner.id,stepId:surveyStepId}},
  });
  ensure(exp?.id,"EXPIRE_FIXTURE_NOT_FOUND");
  await prisma.surveyResponse.update({where:{id:exp.id},
    data:{submittedAt:new Date(Date.now()-26*3600_000)}});
  const expired=await post(responsePath,{...payload,answers:{concern:"Подмена ответа"}});
  const expiredGet=await read(templatePath);
  ensure(expired.status===423&&expired.body?.code==="SURVEY_EDIT_WINDOW_EXPIRED"&&
    expiredGet.body?.data?.response?.canEdit===false&&
    expiredGet.body.data.response.answers.concern==="Теперь спокойно ждёт",
    "EXPIRED_24H_ACCEPTED");
  console.log("WEB3_SURVEY_REAL_HONO_OWNER_FOREIGN_AND_24H_PASS");
  await ctx.close();
 }finally {if(browser)await browser.close();}
};
const run=async()=>{
 try{
  if(process.argv[2]==="cleanup")await clean();
  else if(process.argv[2]==="run")await execute();
  else throw Error("WEB3_SURVEY_WRONG_MODE");
 }finally{await prisma.$disconnect();}
};
void run().catch(e=>{
  console.error("WEB3_SURVEY_REAL_HTTP_FAILED",e instanceof Error?e.message:"unknown");
  process.exitCode=1;
});
