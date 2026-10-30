"use strict";
const fs=require("fs"),cp=require("child_process"),{Client}=require("pg");
const {chromium}=require("../../.local-pg-scratch/qa-playwright/node_modules/playwright-core");
const actors=JSON.parse(fs.readFileSync(".local-pg-scratch/qa-browser-accounts-20261029.json","utf8"));
const voter=actors.find(x=>x.role==="TRAINER"),owner=actors.find(x=>x.role==="USER");
if(!voter||!owner||voter.id===owner.id)throw Error("QA_ACTOR_INVALID");
const pid=cp.execFileSync("lsof",["-t","-nP","-iTCP:3001","-sTCP:LISTEN"],{encoding:"utf8"}).trim().split("\n")[0],raw=cp.execFileSync("ps",["eww","-p",pid,"-o","command="],{encoding:"utf8"}).match(/(?:^|\s)DATABASE_URL=([^\s]+)/)?.[1],u=new URL(raw);
if(u.hostname!=="127.0.0.1"||u.port!=="55921"||u.pathname!=="/gafus_refactor_real_work_20261024")throw Error("REFUSE_UNSAFE_QA_DB");
const title="QA Моменты локальная викторина 20261029",question="QA Викторина какая команда выполняется первой 20261029?";
async function state(){const c=new Client({connectionString:raw});await c.connect();try{
 const result=await c.query('SELECT p.id,p.status,p."authorId",poll.id AS "pollId",poll."isQuiz" FROM "FeedPost" p JOIN "FeedPostRevision" rev ON rev."postId"=p.id JOIN "FeedPoll" poll ON poll."postId"=p.id WHERE rev.text=$1',[title]);
 if(result.rowCount!==1||result.rows[0].authorId!==owner.id||!result.rows[0].isQuiz)throw Error("REFUSE_OTHER_POST");
 const votes=await c.query('SELECT "userId" FROM "FeedPollVote" WHERE "pollId"=$1',[result.rows[0].pollId]);
 if(!votes.rows.some(r=>r.userId===voter.id))throw Error("QA_TRAINER_VOTE_MISSING");
 return {postId:result.rows[0].id,status:result.rows[0].status,votes:votes.rows.map(r=>r.userId)};
}finally{await c.end()}}
const checks=[];
(async()=>{
 const before=await state();
 const browser=await chromium.launch({headless:true,executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"});
 try{
 const ctx=await browser.newContext({viewport:{width:390,height:844}});
 await ctx.route("**/*",r=>{const x=new URL(r.request().url());return ["127.0.0.1","localhost"].includes(x.hostname)||["data:","blob:"].includes(x.protocol)?r.continue():r.abort("blockedbyclient")});
 const p=await ctx.newPage();
 try{
 await p.goto("http://127.0.0.1:5173/login");
 await p.locator("#login-name").fill(voter.username);
 await p.locator("#login-password").fill(voter.password);
 await p.getByRole("button",{name:"Войти",exact:true}).click();
 await p.waitForURL("**/courses",{timeout:12000});
 await p.goto("http://127.0.0.1:5173/moments/"+before.postId);
 const panel=p.locator('section[aria-label="Опрос"]');
 await panel.getByRole("heading",{name:question}).waitFor({timeout:14500});
 const fieldset=panel.locator("fieldset").first();
 const server=await p.evaluate(async id=>{
  const r=await fetch("/api/v1/feed/posts/"+id+"/poll",{credentials:"same-origin",cache:"no-store"});
  const payload=await r.json().catch(()=>null);const d=payload?.data??{};
  return {http:r.status,myVoteCount:Array.isArray(d.myOptionIds)?d.myOptionIds.length:null,isQuiz:d.isQuiz??null,closed:d.closed??null};
 },before.postId);
 const ui={fieldsetDisabled:await fieldset.isDisabled(),radioDisabled:await panel.locator('fieldset input[type="radio"]').first().isDisabled(),buttonNames:await panel.locator('button').allTextContents()};
 console.log("QA_QUIZ_READONLY_UI_SERVER_DIAG",JSON.stringify({server,ui}));
 if(!(await panel.locator('fieldset input[type="radio"]').first().isDisabled()))throw Error("QA_QUIZ_RADIO_STILL_ENABLED_AFTER_VOTE");
 for(const name of ["Проголосовать","Изменить голос","Отменить голос","Сохранить выбор"]){
  if(await panel.getByRole("button",{name,exact:true}).count())throw Error("QA_QUIZ_MUTATION_BUTTON_VISIBLE");
 }
 const after=await state();
 if(after.votes.length!==before.votes.length||after.votes.some(x=>!before.votes.includes(x)))throw Error("QA_QUIZ_READONLY_CHANGED_VOTES");
 checks.push({mobile:true,quizVoteImmutable:true,disabledOptions:true,postOwnerQA:true,sqlVoteUnchanged:true,foreignVotePreserved:true,pass:true});
 console.log("QA_QUIZ_IMMUTABILITY_READONLY_PASS",JSON.stringify(checks[0]));
 }finally{await ctx.close()}
 }finally{await browser.close()}
})().catch(e=>{console.log("QA_QUIZ_READONLY_ERROR",String(e.message).slice(0,220));process.exitCode=1}).finally(()=>{
 fs.writeFileSync(".local-pg-scratch/qa-logs/browser-20261029/feed-quiz-immutable-readonly.json",JSON.stringify({checks},null,2));
});
