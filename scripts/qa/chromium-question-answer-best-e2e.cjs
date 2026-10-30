"use strict";
const fs=require("node:fs"),cp=require("node:child_process"),{Client}=require("pg");
const {chromium}=require("../../.local-pg-scratch/qa-playwright/node_modules/playwright-core");
const accounts=JSON.parse(fs.readFileSync(".local-pg-scratch/qa-browser-accounts-20261029.json","utf8"));
const user=accounts.find(x=>x.role==="USER"),trainer=accounts.find(x=>x.role==="TRAINER");
if(!user||!trainer||user.id===trainer.id)throw Error("WRONG_QA_ACCOUNTS");
const pid=cp.execFileSync("lsof",["-t","-nP","-iTCP:3001","-sTCP:LISTEN"],{encoding:"utf8"}).trim().split("\n")[0];
const env=cp.execFileSync("ps",["eww","-p",pid,"-o","command="],{encoding:"utf8"});
const raw=env.match(/(?:^|\s)DATABASE_URL=([^\s]+)/)?.[1],dbu=new URL(raw);
if(dbu.hostname!=="127.0.0.1"||dbu.port!=="55921"||dbu.pathname!=="/gafus_refactor_real_work_20261024")throw Error("REFUSE_NONLOCAL_WORK_DB");
const title="QA: вопрос и лучший ответ 20261029";
const responseText="QA: синтетический ответ кинолога для проверки выбора лучшего ответа.";
let questionId=null,answerId=null;
const events=[],checkpoints=[];
async function dbRead(){const c=new Client({connectionString:raw});await c.connect();try{
 const q=questionId?await c.query('SELECT id,"authorId",title,"bestAnswerId","deletedAt" FROM "Question" WHERE id=$1',[questionId]):{rows:[],rowCount:0};
 const a=questionId?await c.query('SELECT id,"authorId",body,"deletedAt" FROM "QuestionAnswer" WHERE "questionId"=$1 AND body=$2',[questionId,responseText]):{rows:[],rowCount:0};
 return {questionCount:q.rowCount,owned:q.rows[0]?.authorId===user.id,titleMatches:q.rows[0]?.title===title,
 bestAnswerId:q.rows[0]?.bestAnswerId||null,questionDeleted:!!q.rows[0]?.deletedAt,answerCount:a.rowCount,answerOwned:a.rows[0]?.authorId===trainer.id,answerId:a.rows[0]?.id};
}finally{await c.end()}}
async function login(ctx,account,viewport){
 const page=await ctx.newPage();
 await page.goto("http://127.0.0.1:5173/login",{waitUntil:"domcontentloaded"});
 await page.locator("#login-name").fill(account.username);
 await page.locator("#login-password").fill(account.password);
 await page.getByRole("button",{name:"Войти",exact:true}).click();
 await page.waitForURL("**/courses",{timeout:13500});
 if(!(await ctx.cookies()).some(x=>x.name==="gafus_access"))throw Error(viewport+"_LOGIN_FAILED");
 return page;
}
function record(page,who){
 page.on("response",r=>{const u=new URL(r.url());if(u.pathname.startsWith("/api/v1/questions")&&r.request().method()!=="GET"){
  events.push({role:who,method:r.request().method(),status:r.status(),path:u.pathname});
 }});
}
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"});
 let userCtx,trainerCtx;
 try{
  userCtx=await browser.newContext({viewport:{width:390,height:844}});
  trainerCtx=await browser.newContext({viewport:{width:1280,height:800}});
  for(const ctx of [userCtx,trainerCtx])await ctx.route("**/*",r=>{const url=new URL(r.request().url());return ["localhost","127.0.0.1"].includes(url.hostname)||["data:","blob:"].includes(url.protocol)?r.continue():r.abort("blockedbyclient")});
  const u=await login(userCtx,user,"mobile");
  record(u,"USER");
  // Reuse ONLY the exact unfinished local QA publication from the prior
  // interrupted attempt; never create a duplicate question or reward event.
  const preflight=new Client({connectionString:raw});await preflight.connect();
  let existing=[];
  try{const r=await preflight.query('SELECT id,"authorId","deletedAt" FROM "Question" WHERE title=$1 AND "authorId"=$2 ORDER BY "createdAt" DESC',[title,user.id]);existing=r.rows;}
  finally{await preflight.end();}
  if(existing.some(x=>x.deletedAt===null)){
    if(existing.filter(x=>x.deletedAt===null).length!==1)throw Error("AMBIGUOUS_QA_PUBLICATION");
    questionId=existing.find(x=>x.deletedAt===null).id;
    await u.goto("http://127.0.0.1:5173/questions/"+questionId);
    await u.getByRole("button",{name:"Удалить вопрос"}).waitFor({timeout:13000});
    console.log("QA_QUESTION_RESUMED_OWN_UNFINISHED_LOCAL_ONLY");
  }else{
    await u.goto("http://127.0.0.1:5173/questions/new");
    await u.getByRole("heading",{name:"Задать вопрос"}).waitFor({timeout:13000});
    await u.locator("#question-title").fill(title);
    await u.locator("#question-body").fill("Это синтетический вопрос о поведении собаки исключительно для локальной проверки опубликованных ответов и отметки лучшего ответа.");
    await u.locator("#question-tags").fill("qa, тест");
    await u.getByRole("button",{name:"Опубликовать вопрос"}).click();
    await u.waitForURL(url=>/^\/questions\/[a-zA-Z0-9_-]+$/.test(new URL(url).pathname)&&new URL(url).pathname!=="/questions/new",{timeout:13000});
    questionId=new URL(u.url()).pathname.split("/").pop();
  }
  let proof=await dbRead();
  if(!proof.owned||!proof.titleMatches)throw Error("QA_QUESTION_SQL_NOT_OWNED");
  checkpoints.push({viewport:"mobile",role:"USER",action:"question POST",ownerSQL:true});
  console.log("QA_QUESTION_CREATED_MOBILE",JSON.stringify(checkpoints.at(-1)));
  const t=await login(trainerCtx,trainer,"desktop");
  record(t,"TRAINER");
  await t.goto("http://127.0.0.1:5173/questions/"+questionId);
  await t.locator("#question-reply").waitFor({timeout:12000});
  await t.locator("#question-reply").fill(responseText);
  const answerButton=t.getByRole("button",{name:"Опубликовать ответ"});
  console.log("QA_TRAINER_ANSWER_BEFORE_CLICK",JSON.stringify({
    enabled:await answerButton.isEnabled(),visible:await answerButton.isVisible(),
    button:await answerButton.evaluate(el=>({disabled:el.disabled,rect:el.getBoundingClientRect().toJSON(),
      style:{pointer:getComputedStyle(el).pointerEvents,display:getComputedStyle(el).display},
      outer:el.outerHTML.slice(0,260)})),
    tour:(await t.getByRole("button",{name:"Пропустить"}).count())
  }));
  if(await t.getByRole("button",{name:"Пропустить"}).count()){
    const skip=t.getByRole("button",{name:"Пропустить"}).first();
    if(await skip.isVisible())await skip.click({timeout:5000});
  }
  await t.waitForTimeout(200);
  console.log("QA_ANSWER_HIT_TARGET",JSON.stringify(await answerButton.evaluate(el=>{
    const r=el.getBoundingClientRect(),node=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);
    const chain=[];let n=node;
    while(n&&chain.length<4){chain.push({tag:n.tagName,role:n.getAttribute("role"),className:String(n.className).slice(0,100),text:(n.textContent||"").slice(0,120)});n=n.parentElement}
    return {hit:chain,sameElement:node===el,scrollY:scrollY,bodyHeight:document.body.scrollHeight}
  })));
  await answerButton.click({timeout:5000});
  await t.getByRole("status").filter({hasText:"Ответ отправлен."}).waitFor({timeout:11000});
  proof=await dbRead();answerId=proof.answerId;
  if(proof.answerCount!==1||!proof.answerOwned)throw Error("QA_TRAINER_ANSWER_SQL_BAD");
  checkpoints.push({viewport:"desktop",role:"TRAINER",action:"answer POST",ownerSQL:true});
  console.log("QA_TRAINER_ANSWER_DESKTOP",JSON.stringify(checkpoints.at(-1)));
  await u.reload({waitUntil:"domcontentloaded"});
  const answerCard=u.locator(".web4-question-answer-card").filter({hasText:responseText});
  await answerCard.waitFor({timeout:13000});
  await answerCard.locator("summary[aria-label^='Ещё действия с ответом']").click();
  const best=answerCard.getByRole("button",{name:"Выбрать лучший ответ"});
  await best.waitFor({timeout:9000});
  await best.click();
  await u.waitForTimeout(750);
  proof=await dbRead();
  if(proof.bestAnswerId!==answerId)throw Error("QA_BEST_ANSWER_SQL_FAILED");
  checkpoints.push({viewport:"mobile",role:"USER",action:"choose best answer",bestSQL:true});
  console.log("QA_BEST_ANSWER_MOBILE",JSON.stringify(checkpoints.at(-1)));
  await u.getByRole("button",{name:"Удалить вопрос"}).click();
  await u.getByRole("button",{name:"Да, удалить вопрос"}).click();
  await u.waitForURL("**/questions",{timeout:13000});
  proof=await dbRead();
  if(!proof.questionDeleted)throw Error("QA_QUESTION_SOFT_DELETE_NOT_CONFIRMED");
  checkpoints.push({viewport:"mobile",role:"USER",action:"soft-delete own question",sqlDeleted:true});
  console.log("QA_QA_QUESTION_DELETED",JSON.stringify(checkpoints.at(-1)));
  console.log("QUESTION_ANSWER_BEST_E2E_PASS",JSON.stringify({steps:checkpoints.length,answerIdMatch:true,finalSoftDeleted:true,requests:events.filter(x=>x.method!=="GET")}));
 } finally {await userCtx?.close();await trainerCtx?.close();await browser.close()}
})().catch(e=>{console.log("QUESTION_ANSWER_BEST_E2E_ERROR",String(e.message).slice(0,240));process.exitCode=1}).finally(async()=>{
 const final=await dbRead().catch(()=>null);
 const out={checkpoints,events,final:final?{owned:final.owned,answerOwned:final.answerOwned,questionDeleted:final.questionDeleted,answerExists:final.answerCount===1,bestAnswerMatches:final.bestAnswerId===answerId}:null,questionId,answerId};
 fs.writeFileSync(".local-pg-scratch/qa-logs/browser-20261029/question-answer-best-e2e.json",JSON.stringify(out,null,2));
 if(final?.questionCount===1&&final.owned&&final.titleMatches&&!final.questionDeleted){
  console.log("UNFINISHED_SYNTHETIC_QUESTION_REQUIRES_QA_SCOPED_CLEANUP");
  process.exitCode=1;
 }
});
