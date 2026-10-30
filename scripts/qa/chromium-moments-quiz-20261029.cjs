"use strict";
const fs=require("fs"),cp=require("child_process"),{Client}=require("pg");
const {chromium}=require("../../.local-pg-scratch/qa-playwright/node_modules/playwright-core");
const accounts=JSON.parse(fs.readFileSync(".local-pg-scratch/qa-browser-accounts-20261029.json","utf8"));
const owner=accounts.find(a=>a.role==="USER"),voter=accounts.find(a=>a.role==="TRAINER");
if(!owner||!voter||owner.id===voter.id)throw Error("QA_ACTORS_NOT_DISTINCT");
const pid=cp.execFileSync("lsof",["-t","-nP","-iTCP:3001","-sTCP:LISTEN"],{encoding:"utf8"}).trim().split("\n")[0];
const ps=cp.execFileSync("ps",["eww","-p",pid,"-o","command="],{encoding:"utf8"}),raw=ps.match(/(?:^|\s)DATABASE_URL=([^\s]+)/)?.[1],u=new URL(raw);
if(u.hostname!=="127.0.0.1"||u.port!=="55921"||u.pathname!=="/gafus_refactor_real_work_20261024"||!ps.includes("FEED_ENABLED=true")||!ps.includes("GAFUS_ISOLATED_NONPROD_S3=enabled")||!ps.includes("GAFUS_ISOLATED_S3_ENDPOINT=http://127.0.0.1:9000")||!ps.includes("CLOUDRU_MEDIA_JOBS_ENABLED=false"))throw Error("REFUSE_UNISOLATED_FEED_BACKEND");
const text="QA Моменты локальная викторина 20261029",question="QA Викторина какая команда выполняется первой 20261029?",choice1="QA Вариант правильный",choice2="QA Вариант неправильный";const checks=[];let originalPostIds=new Set();
async function db(action){const c=new Client({connectionString:raw});await c.connect();try{return await action(c)}finally{await c.end()}}
async function findPost(){return db(c=>c.query('SELECT p.id,p.status,p."deletedAt",p."authorId" FROM "FeedPost" p JOIN "FeedPostRevision" r ON r."postId"=p.id WHERE r.text=$1 AND p."authorId"=$2',[text,owner.id]))}
async function pollState(id){return db(async c=>{
 const p=await c.query('SELECT id,question,"postId" FROM "FeedPoll" WHERE "postId"=$1',[id]);
 if(p.rowCount!==1)return {poll:p.rows,votes:[],options:[]};
 const opts=await c.query('SELECT id,text FROM "FeedPollOption" WHERE "pollId"=$1 ORDER BY position',[p.rows[0].id]);
 const votes=await c.query('SELECT v."userId",s."optionId" FROM "FeedPollVote" v LEFT JOIN "FeedPollVoteSelection" s ON s."pollId"=v."pollId" AND s."userId"=v."userId" WHERE v."pollId"=$1',[p.rows[0].id]);
 return {poll:p.rows,options:opts.rows,votes:votes.rows};
})}
async function cleanup(){
 let found=await findPost();
 if(found.rowCount===0){
  const newDrafts=await db(c=>c.query('SELECT id,status,version FROM "FeedPost" WHERE "authorId"=$1',[owner.id]));
  const created=newDrafts.rows.filter(row=>!originalPostIds.has(row.id));
  if(created.length===0){console.log("QA_FEED_POLL_NO_NEW_POST_TO_CLEAN");return}
  if(created.length!==1||created[0].status!=="draft"||created[0].version!==0)throw Error("REFUSE_UNVERIFIED_NEW_POST_CLEANUP");
  const id=created[0].id;
  await db(async c=>{await c.query("BEGIN");try{
   const verify=await c.query('SELECT id,status,version,"authorId" FROM "FeedPost" WHERE id=$1 FOR UPDATE',[id]);
   if(verify.rowCount!==1||verify.rows[0].authorId!==owner.id||verify.rows[0].status!=="draft"||verify.rows[0].version!==0)throw Error("REFUSE_OTHER_DRAFT");
   for(const table of ["FeedPostRevision","FeedPoll","FeedMediaAsset","FeedComment","FeedUpload"]){
    const count=await c.query('SELECT count(*)::int n FROM "'+table+'" WHERE "postId"=$1',[id]);
    if(count.rows[0].n!==0)throw Error("REFUSE_NONEMPTY_NEW_DRAFT_"+table);
   }
   const d=await c.query('DELETE FROM "FeedPost" WHERE id=$1 AND "authorId"=$2',[id,owner.id]);
   if(d.rowCount!==1)throw Error("QA_DRAFT_REMOVE_FAILED");
   await c.query("COMMIT");
  }catch(e){await c.query("ROLLBACK").catch(()=>{});throw e}});
  console.log("QA_FEED_ONLY_NEW_UNPUBLISHED_EMPTY_DRAFT_CLEANED");return;
 }
 if(found.rowCount!==1||found.rows[0].authorId!==owner.id)throw Error("REFUSE_OTHER_FEED_POST");
 const postId=found.rows[0].id;
 await db(async c=>{await c.query("BEGIN");try{
  const p=await c.query('SELECT id,"authorId" FROM "FeedPost" WHERE id=$1 FOR UPDATE',[postId]);
  if(p.rowCount!==1||p.rows[0].authorId!==owner.id)throw Error("REFUSE_DIFFERENT_OWNER");
  const rev=await c.query('SELECT text FROM "FeedPostRevision" WHERE "postId"=$1',[postId]);
  if(rev.rows.some(r=>![text,""].includes(r.text)))throw Error("REFUSE_UNKNOWN_FEED_REVISIONS");
  for(const [table,col] of [["FeedMediaAsset","postId"],["FeedComment","postId"],["FeedPostReaction","postId"],["FeedUpload","postId"],["FeedNotification","postId"]]){
   const query='SELECT count(*)::int n FROM "'+table+'" WHERE "'+col+'"=$1';
   const r=await c.query(query,[postId]);if(r.rows[0].n!==0)throw Error("REFUSE_POST_HAS_ADDITIONAL_"+table);
  }
  const votes=await c.query('SELECT "userId" FROM "FeedPollVote" WHERE "pollId" IN (SELECT id FROM "FeedPoll" WHERE "postId"=$1)',[postId]);
  if(votes.rows.some(v=>v.userId!==voter.id))throw Error("REFUSE_POST_HAS_UNRELATED_VOTES");
  const deleted=await c.query('DELETE FROM "FeedPost" WHERE id=$1 AND "authorId"=$2',[postId,owner.id]);
  if(deleted.rowCount!==1)throw Error("QA_POST_DELETE_SQL_COUNT");
  await c.query("COMMIT");
 }catch(e){await c.query("ROLLBACK").catch(()=>{});throw e}});
 if((await findPost()).rowCount)throw Error("QA_POST_NOT_CLEAN");
 console.log("QA_FEED_ONLY_OWN_POLL_POST_CLEANED_SQL_ZERO");
}
async function session(browser,actor,vp){
 const ctx=await browser.newContext({viewport:vp==="mobile"?{width:390,height:844}:{width:1280,height:800}});
 await ctx.route("**/*",r=>{const u=new URL(r.request().url());return ["127.0.0.1","localhost"].includes(u.hostname)||["data:","blob:"].includes(u.protocol)?r.continue():r.abort("blockedbyclient")});
 const p=await ctx.newPage();await p.goto("http://127.0.0.1:5173/login");
 await p.locator("#login-name").fill(actor.username);await p.locator("#login-password").fill(actor.password);
 await p.getByRole("button",{name:"Войти",exact:true}).click();await p.waitForURL("**/courses",{timeout:14000});
 const consent=p.getByRole("button",{name:"Отклонить",exact:true});if(await consent.isVisible().catch(()=>false))await consent.click({timeout:3500});
 return {p,ctx};
}
(async()=>{
 if((await findPost()).rowCount)throw Error("REFUSE_PREEXISTING_QA_FEED_TITLE");
 originalPostIds=new Set((await db(c=>c.query('SELECT id FROM "FeedPost" WHERE "authorId"=$1',[owner.id]))).rows.map(r=>r.id));
 const browser=await chromium.launch({headless:true,executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"});
 try{
 const a=await session(browser,owner,"desktop");
 try{
  const p=a.p;await p.goto("http://127.0.0.1:5173/moments/new");
  await p.getByRole("heading",{name:"Новая публикация"}).waitFor({timeout:13000});
  await p.getByRole("textbox",{name:"Текст публикации"}).fill(text);
  await p.getByRole("button",{name:"+ Добавить опрос"}).click();
  const poll=p.locator('section[aria-label="Редактор опроса"]');await poll.waitFor({timeout:8000});
  await poll.getByRole("textbox",{name:"Вопрос",exact:true}).fill(question);
  await poll.getByRole("textbox",{name:"Вариант ответа 1"}).fill(choice1);
  await poll.getByRole("textbox",{name:"Вариант ответа 2"}).fill(choice2);
  await poll.getByRole("checkbox",{name:"Викторина с правильным ответом"}).check();
  await poll.getByRole("radio",{name:"Правильный вариант 1"}).check();
  const feedHttp=[];
  p.on("response",r=>{const path=new URL(r.url()).pathname;if(path.startsWith("/api/v1/feed")&&r.request().method()!=="GET")feedHttp.push({method:r.request().method(),status:r.status(),pathKind:path.split("/").slice(4,7).join("/")})});
  await p.getByRole("button",{name:"Опубликовать",exact:true}).click();
  try {
   await p.waitForURL(url=>/^\/moments\/[A-Za-z0-9_-]+$/.test(new URL(url).pathname)&&new URL(url).pathname!=="/moments/new",{timeout:30000});
  }catch(e){
   const alerts=await p.locator("[role=alert]").allTextContents().catch(()=>[]);
   console.log("QA_FEED_POLL_PUBLISH_DIAG",JSON.stringify({requests:feedHttp,visibleErrors:alerts.map(t=>t.slice(0,140)),path:new URL(p.url()).pathname}));
   throw e;
  }
  console.log("QA_FEED_POLL_PUBLISH_WRITES",JSON.stringify(feedHttp));
  const found=await findPost();if(found.rowCount!==1||found.rows[0].status!=="published")throw Error("QA_FEED_NOT_PUBLISHED");
  const pollData=await pollState(found.rows[0].id);
  if(pollData.poll.length!==1||pollData.poll[0].question!==question||pollData.options.length!==2||pollData.votes.length)throw Error("QA_POLL_SQL_NOT_MATCH");
  const postId=found.rows[0].id;
  const quiz=await db(c=>c.query('SELECT "isQuiz", "allowMultiple" FROM "FeedPoll" WHERE "postId"=$1',[postId]));
  if(quiz.rowCount!==1||quiz.rows[0].isQuiz!==true||quiz.rows[0].allowMultiple!==false)throw Error("QA_FEED_QUIZ_MODE_SQL_WRONG");
  checks.push({viewport:"desktop",action:"publish 2-answer quiz",published:true,sqlQuiz:true,pass:true});
  console.log("QA_FEED_POLL_STEP_PASS",JSON.stringify(checks.at(-1)));
  const v=await session(browser,voter,"mobile");
  try{
   await v.p.goto("http://127.0.0.1:5173/moments/"+postId);
   const pollUI=v.p.locator('section[aria-label="Опрос"]');
   await pollUI.getByRole("heading",{name:question}).waitFor({timeout:14000});
   await pollUI.getByRole("radio",{name:choice1}).check();
   await pollUI.getByRole("button",{name:"Проголосовать"}).click();
   await v.p.waitForFunction(() => {
     const node=document.querySelector('section[aria-label="Опрос"] input[type="radio"]');
     return node && node.disabled;
   },{timeout:14000});
   const saved=await pollState(postId);
   if(saved.votes.length!==1||saved.votes[0].userId!==voter.id)throw Error("QA_QUIZ_VOTE_SQL_MISSING");
   if(await pollUI.getByRole("button",{name:"Изменить голос"}).count()||await pollUI.getByRole("button",{name:"Отменить голос"}).count()||await pollUI.getByRole("button",{name:"Проголосовать"}).count())throw Error("QA_QUIZ_VOTE_MUTABLE_BUTTON_LEAK");
   checks.push({viewport:"mobile",action:"quiz single vote and immutable controls",sqlVote:true,changeDisabled:true,pass:true});
   console.log("QA_FEED_POLL_STEP_PASS",JSON.stringify(checks.at(-1)));
  }finally{await v.ctx.close()}
  const quizUI=p.locator('section[aria-label="Опрос"]');
  await quizUI.getByRole("button",{name:"Завершить опрос"}).click();
  await quizUI.getByRole("button",{name:"Да, завершить"}).click();
  await quizUI.getByText("Опрос завершён").waitFor({timeout:15000});
  const closed=await db(c=>c.query('SELECT "endDate", "isQuiz" FROM "FeedPoll" WHERE "postId"=$1',[postId]));
  if(closed.rowCount!==1||!closed.rows[0].endDate||closed.rows[0].isQuiz!==true)throw Error("QA_QUIZ_OWNER_CLOSE_SQL_NOT_PERSISTED");
  checks.push({viewport:"desktop",action:"owner closes quiz",sqlClosed:true,pass:true});
  console.log("QA_FEED_POLL_STEP_PASS",JSON.stringify(checks.at(-1)));
  await p.getByRole("button",{name:"Действия с публикацией"}).click();
  const panel=p.getByRole("group",{name:"Действия с публикацией"});await panel.waitFor({timeout:12000});
  p.once("dialog",d=>d.accept());
  await panel.getByRole("button",{name:"Удалить публикацию"}).click();
  await p.waitForURL("http://127.0.0.1:5173/moments",{timeout:12000});
  const final=await findPost();
  if(final.rowCount!==1||(final.rows[0].deletedAt===null&&final.rows[0].status!=="deleted"))throw Error("QA_FEED_SOFT_DELETE_NOT_CONFIRMED");
  checks.push({viewport:"desktop",action:"delete only own published QA moment",uiDeleted:true,sqlDeleted:true,pass:true});
  console.log("QA_FEED_POLL_STEP_PASS",JSON.stringify(checks.at(-1)));
 }finally{await a.ctx.close()}
 }finally{await browser.close()}
})().catch(e=>{console.log("QA_FEED_POLL_ERROR",String(e.message).slice(0,330));process.exitCode=1}).finally(async()=>{
 try{await cleanup()}catch(e){console.log("QA_FEED_POLL_CLEANUP_ERROR",String(e.message).slice(0,220));process.exitCode=1}
 fs.writeFileSync(".local-pg-scratch/qa-logs/browser-20261029/feed-quiz-e2e.json",JSON.stringify({checks},null,2));
});
