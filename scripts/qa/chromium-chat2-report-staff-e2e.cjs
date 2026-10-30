"use strict";
const fs=require("node:fs"),cp=require("node:child_process"),{Client}=require("pg");
const {chromium}=require("../../.local-pg-scratch/qa-playwright/node_modules/playwright-core");
const actors=Object.fromEntries(JSON.parse(fs.readFileSync(".local-pg-scratch/qa-browser-accounts-20261029.json","utf8")).filter(x=>["USER","TRAINER","ADMIN"].includes(x.role)).map(x=>[x.role,x]));
const [owner,reporter,admin]=[actors.USER,actors.TRAINER,actors.ADMIN];if(!owner||!reporter||!admin||new Set([owner.id,reporter.id,admin.id]).size!==3)throw Error("NOT_THREE_SYNTHETIC_QA_ROLES");
const pid=cp.execFileSync("lsof",["-t","-nP","-iTCP:3003","-sTCP:LISTEN"],{encoding:"utf8"}).trim().split("\n")[0];
const proc=cp.execFileSync("ps",["eww","-p",pid,"-o","command="],{encoding:"utf8"}),raw=proc.match(/(?:^|\s)DATABASE_URL=([^\s]+)/)?.[1],u=new URL(raw);
if(u.hostname!=="127.0.0.1"||u.port!=="55921"||u.pathname!=="/gafus_refactor_real_work_20261024"||!proc.includes("CHAT2_API_ENABLED=enabled"))throw Error("REFUSE_NONLOCAL_QA_CHAT_DB");
const content="QA Chat2 complaint only local 20261029",reasonText="QA purely synthetic complaint, reject after review";
let roomId=null,msgId=null,reportId=null;
const checks=[],http=[];
async function db(fn){const c=new Client({connectionString:raw});await c.connect();try{return await fn(c)}finally{await c.end()}}
async function rooms(){return db(c=>c.query('SELECT id,kind,"createdById" FROM "Chat2Conversation" WHERE kind=$1 AND id IN (SELECT "conversationId" FROM "Chat2Member" WHERE "userId"=$2) AND id IN (SELECT "conversationId" FROM "Chat2Member" WHERE "userId"=$3)',['DIRECT',owner.id,reporter.id]))}
async function reports(){return db(c=>c.query('SELECT id,"reporterId","conversationId","messageId",status,comment FROM "Chat2Report" WHERE "conversationId"=$1',[roomId]))}
async function cleanup(){
 if(!roomId){const r=await rooms();if(r.rowCount===1&&r.rows[0].createdById===owner.id)roomId=r.rows[0].id;else if(r.rowCount)throw Error("REFUSE_UNRELATED_ROOM");else return}
 await db(async c=>{
 await c.query("BEGIN");try{
 const r=await c.query('SELECT id,kind,"createdById" FROM "Chat2Conversation" WHERE id=$1 FOR UPDATE',[roomId]);
 if(!r.rowCount){await c.query("COMMIT");return}
 if(r.rowCount!==1||r.rows[0].kind!=="DIRECT"||r.rows[0].createdById!==owner.id)throw Error("REFUSE_UNRELATED_ROOM_OWNER");
 const members=await c.query('SELECT "userId" FROM "Chat2Member" WHERE "conversationId"=$1',[roomId]);
 if(members.rowCount!==2||members.rows.some(x=>![owner.id,reporter.id].includes(x.userId)))throw Error("REFUSE_UNKNOWN_ROOM_MEMBERS");
 const messages=await c.query('SELECT "authorId",text FROM "Chat2Message" WHERE "conversationId"=$1',[roomId]);
 if(messages.rowCount>1||messages.rows.some(x=>x.authorId!==owner.id||x.text!==content))throw Error("REFUSE_UNRELATED_ROOM_MESSAGES");
 const found=await c.query('SELECT id,"reporterId","messageId",comment,status FROM "Chat2Report" WHERE "conversationId"=$1',[roomId]);
 if(found.rowCount>1||found.rows.some(x=>x.reporterId!==reporter.id||x.messageId!==msgId||x.comment!==reasonText))throw Error("REFUSE_UNRELATED_REPORTS");
 const media=await c.query('SELECT count(*)::int n FROM "Chat2Media" WHERE "conversationId"=$1',[roomId]);
 if(media.rows[0].n)throw Error("REFUSE_ROOM_WITH_MEDIA");
 const del=await c.query('DELETE FROM "Chat2Conversation" WHERE id=$1 AND "createdById"=$2',[roomId,owner.id]);
 if(del.rowCount!==1)throw Error("QA_REPORT_ROOM_DELETE_COUNT");
 await c.query("COMMIT");
 }catch(e){await c.query("ROLLBACK").catch(()=>{});throw e}
 });
 if((await rooms()).rowCount)throw Error("QA_CHAT_REPORT_CLEANUP_READBACK_FAILED");
 console.log("QA_CHAT_REPORT_AND_OWN_ROOM_CLEANED_SQL_ZERO");
}
async function context(b,actor,viewport){
 const c=await b.newContext({viewport:viewport==="mobile"?{width:390,height:844}:{width:1280,height:800}});
 await c.route("**/*",r=>{const x=new URL(r.request().url());return ["127.0.0.1","localhost"].includes(x.hostname)||["data:","blob:"].includes(x.protocol)?r.continue():r.abort("blockedbyclient")});
 const p=await c.newPage(),events=[];
 p.on("response",r=>{const path=new URL(r.url()).pathname;if(path.startsWith("/api/v1/chats")&&r.request().method()!=="GET")events.push({method:r.request().method(),status:r.status(),path})});
 await p.goto("http://127.0.0.1:5173/login");
 await p.locator("#login-name").fill(actor.username);await p.locator("#login-password").fill(actor.password);
 await p.getByRole("button",{name:"Войти",exact:true}).click();await p.waitForURL("**/courses",{timeout:13000});
 await p.goto("http://127.0.0.1:5173/chats");
 await p.getByRole("heading",{name:"Сообщения",exact:true}).waitFor({timeout:13000});
 const decline=p.getByRole("button",{name:"Отклонить",exact:true});if(await decline.isVisible().catch(()=>false))await decline.click({timeout:3500});
 return {p,c,events};
}
async function ack(p,method,pattern,action,expected){
 const promise=p.waitForResponse(r=>r.request().method()===method&&pattern.test(new URL(r.url()).pathname),{timeout:14000});
 await action();const response=await promise;if(response.status()!==expected)throw Error("QA_EXPECTED_HTTP_"+expected+"_ACTUAL_"+response.status());
 return response;
}
(async()=>{
 const exists=await db(c=>c.query('SELECT to_regclass($1) report, (SELECT count(*)::int FROM "_prisma_migrations" WHERE migration_name=$2 AND finished_at IS NOT NULL) migration',['"Chat2Report"','20261027004500_chat2_reports']));
 if(!exists.rows[0].report||exists.rows[0].migration!==1)throw Error("CHAT2_REPORT_SCHEMA_NOT_VERIFIED");
 if((await rooms()).rowCount)throw Error("REFUSE_EXISTING_DIRECT");
 const b=await chromium.launch({headless:true,executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"});
 try{
 for(const [role,viewport] of [["USER","desktop"],["TRAINER","mobile"],["ADMIN","desktop"]]){
  const {p,c,events}=await context(b,actors[role],viewport);
  try{
   if(role==="USER"){
    await p.getByRole("button",{name:"Новое сообщение"}).click();
    await p.getByRole("textbox",{name:"Поиск"}).fill(reporter.username);
    const row=p.locator("button").filter({hasText:reporter.username}).first();await row.waitFor({timeout:13000});
    await ack(p,"POST",/^\/api\/v1\/chats\/direct$/,()=>row.click(),201);
    const r=await rooms();if(r.rowCount!==1||r.rows[0].createdById!==owner.id)throw Error("LOCAL_DM_CREATION_DB_FAILED");
    roomId=r.rows[0].id;
    const field=p.getByRole("textbox",{name:"Текст сообщения"});await field.waitFor({timeout:14000});await field.fill(content);
    await ack(p,"POST",/^\/api\/v1\/chats\/[^/]+\/messages$/,()=>p.getByRole("button",{name:"Отправить сообщение"}).click(),201);
    const messages=await db(c=>c.query('SELECT id,"authorId",text FROM "Chat2Message" WHERE "conversationId"=$1',[roomId]));
    if(messages.rowCount!==1||messages.rows[0].authorId!==owner.id||messages.rows[0].text!==content)throw Error("LOCAL_DM_MSG_NOT_STORED");
    msgId=messages.rows[0].id;
    // Staff moderation is never allowed to an ordinary USER, even if an own report exists.
    const rbac=await p.evaluate(async()=>{
      const res=await fetch("/api/v1/chats/moderation/reports",{credentials:"same-origin"});
      return res.status;
    });
    if(rbac!==403)throw Error("CHAT_STAFF_RBAC_USER_NOT_FORBIDDEN_"+rbac);
    checks.push({role,createAndSendHttp201:true,ownSQL:true,staffGET403:true,pass:true});
   }else if(role==="TRAINER"){
    const row=p.locator("button").filter({hasText:owner.username}).first();await row.waitFor({timeout:14000});await row.click();
    await p.getByText(content,{exact:true}).last().waitFor({timeout:13000});
    const btn=p.getByRole("button",{name:"Пожаловаться",exact:true});await btn.waitFor({timeout:8000});await btn.click();
    const form=p.locator("form").filter({hasText:"Жалоба на сообщение"});
    await form.getByRole("combobox",{name:"Причина"}).selectOption("OTHER");
    await form.getByRole("textbox",{name:"Комментарий (необязательно)"}).fill(reasonText);
    await ack(p,"POST",/^\/api\/v1\/chats\/[^/]+\/messages\/[^/]+\/report$/,()=>form.getByRole("button",{name:"Отправить"}).click(),201);
    await p.getByText("Жалоба отправлена модераторам.").waitFor({timeout:13000});
    const r=await reports();if(r.rowCount!==1||r.rows[0].reporterId!==reporter.id||r.rows[0].messageId!==msgId||r.rows[0].comment!==reasonText||r.rows[0].status!=="OPEN")throw Error("CHAT2_REPORT_SQL_NOT_OPEN");
    reportId=r.rows[0].id;
    checks.push({role,reportHttp201:true,ownReportedSQL:true,openStatus:true,pass:true});
   }else{
    await p.getByRole("button",{name:"Модерация жалоб"}).click();
    await p.getByRole("heading",{name:"Модерация GAFUS"}).waitFor({timeout:13000});
    const report=p.locator("article").filter({hasText:content}).filter({has:p.getByRole("button",{name:"Обработано"})});
    await report.waitFor({timeout:14000});
    p.once("dialog",d=>d.accept());
    await ack(p,"POST",/^\/api\/v1\/chats\/moderation\/reports\/[^/]+\/resolve$/,()=>report.getByRole("button",{name:"Отклонить"}).click(),200);
    const after=await reports();
    if(after.rowCount!==1||after.rows[0].id!==reportId||after.rows[0].status!=="REJECTED")throw Error("CHAT2_REPORT_ADMIN_RESOLUTION_SQL_FAILED");
    checks.push({role,staffQueueVisible:true,rejectHttp200:true,resolvedSQL:true,pass:true});
   }
   http.push({role,events});console.log("QA_CHAT2_MODERATION_STEP_PASS",JSON.stringify(checks.at(-1)));
  }finally{await c.close()}
 }
 }finally{await b.close()}
})().catch(e=>{console.log("QA_CHAT2_STAFF_MODERATION_E2E_ERROR",String(e.message).slice(0,300));process.exitCode=1}).finally(async()=>{
 try{await cleanup()}catch(e){console.log("QA_CHAT2_STAFF_MODERATION_CLEANUP_ERROR",String(e.message).slice(0,160));process.exitCode=1}
 fs.writeFileSync(".local-pg-scratch/qa-logs/browser-20261029/chat2-staff-report-e2e.json",JSON.stringify({checks,http,fullPass:checks.length===3},null,2));
});
