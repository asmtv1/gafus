"use strict";
const fs=require("node:fs"),cp=require("node:child_process"),{Client}=require("pg");
const {chromium}=require("../../.local-pg-scratch/qa-playwright/node_modules/playwright-core");
const roles=JSON.parse(fs.readFileSync(".local-pg-scratch/qa-browser-accounts-20261029.json","utf8"));
const user=roles.find(a=>a.role==="USER"),trainer=roles.find(a=>a.role==="TRAINER");
if(!user||!trainer||user.id===trainer.id||trainer.username==="lana")throw Error("QA_ROLES_UNSAFE");
const pid=cp.execFileSync("lsof",["-t","-nP","-iTCP:3003","-sTCP:LISTEN"],{encoding:"utf8"}).trim().split("\n")[0];
const ps=cp.execFileSync("ps",["eww","-p",pid,"-o","command="],{encoding:"utf8"});
const raw=ps.match(/(?:^|\s)DATABASE_URL=([^\s]+)/)?.[1],port=ps.match(/(?:^|\s)API_PORT=([^\s]+)/)?.[1],flag=ps.match(/(?:^|\s)CHAT2_API_ENABLED=([^\s]+)/)?.[1],u=new URL(raw);
if(u.hostname!=="127.0.0.1"||u.port!=="55921"||u.pathname!=="/gafus_refactor_real_work_20261024"||port!=="3003"||flag!=="enabled")throw Error("QA_DB_ORIGIN_NOT_ISOLATED");
const name="QA Группа исключительно локальная 20261029",first="QA-текст в тестовой группе: только localhost",second="QA-мобильный ответ тестового тренера";
const pass=[],http=[];
async function db(action){const c=new Client({connectionString:raw});await c.connect();try{return await action(c)}finally{await c.end()}}
async function group(){return db(c=>c.query('SELECT id,kind,visibility,name,"createdById" FROM "Chat2Conversation" WHERE name=$1 AND "createdById"=$2',[name,user.id]))}
async function verifyMembers(id){return db(c=>c.query('SELECT "userId" FROM "Chat2Member" WHERE "conversationId"=$1',[id]))}
async function msgs(id){return db(c=>c.query('SELECT "authorId",text FROM "Chat2Message" WHERE "conversationId"=$1 ORDER BY sequence',[id]))}
async function cleanup(){
 const found=await group();
 if(!found.rowCount){console.log("QA_GROUP_NONE_TO_CLEAN");return}
 if(found.rowCount!==1||found.rows[0].kind!=="GROUP"||found.rows[0].name!==name)throw Error("REFUSE_NON_QA_GROUP");
 const id=found.rows[0].id;
 await db(async c=>{
  await c.query("BEGIN");
  try{
   const room=await c.query('SELECT id,kind,"createdById",name FROM "Chat2Conversation" WHERE id=$1 FOR UPDATE',[id]);
   if(room.rowCount!==1||room.rows[0].createdById!==user.id||room.rows[0].kind!=="GROUP"||room.rows[0].name!==name)throw Error("REFUSE_CONCURRENT_GROUP_CHANGE");
   const members=await c.query('SELECT "userId" FROM "Chat2Member" WHERE "conversationId"=$1',[id]);
   if(members.rows.some(m=>![user.id,trainer.id].includes(m.userId)))throw Error("REFUSE_GROUP_HAS_EXTERNAL_MEMBERS");
   const messages=await c.query('SELECT "authorId",text FROM "Chat2Message" WHERE "conversationId"=$1',[id]);
   if(messages.rows.some(m=>!([user.id,trainer.id].includes(m.authorId)&&[first,second].includes(m.text))))throw Error("REFUSE_GROUP_HAS_UNRELATED_MESSAGES");
   const media=await c.query('SELECT count(*)::int n FROM "Chat2Media" WHERE "conversationId"=$1',[id]);
   if(media.rows[0].n!==0)throw Error("REFUSE_GROUP_MEDIA");
   const reportsExists=await c.query("SELECT to_regclass('public.\\\"Chat2Report\\\"') AS reg");
   if(reportsExists.rows[0].reg){const q=await c.query('SELECT count(*)::int n FROM "Chat2Report" WHERE "conversationId"=$1',[id]);if(q.rows[0].n)throw Error("REFUSE_GROUP_REPORTS")}
   const deleted=await c.query('DELETE FROM "Chat2Conversation" WHERE id=$1 AND "createdById"=$2 AND kind=$3',[id,user.id,"GROUP"]);
   if(deleted.rowCount!==1)throw Error("QA_GROUP_CLEANUP_DELETE_COUNT");
   await c.query("COMMIT");
  }catch(e){await c.query("ROLLBACK").catch(()=>{});throw e}
 });
 if((await group()).rowCount)throw Error("QA_GROUP_CLEANUP_READBACK_FAIL");
 console.log("QA_LOCAL_GROUP_OWN_CLEANUP_SQL_ZERO");
}
async function login(p,a){await p.goto("http://127.0.0.1:5173/login");await p.locator("#login-name").fill(a.username);await p.locator("#login-password").fill(a.password);await p.getByRole("button",{name:"Войти",exact:true}).click();await p.waitForURL("**/courses",{timeout:12000});}
async function setupBrowser(b,a,viewport){
 const c=await b.newContext({viewport:viewport==="mobile"?{width:390,height:844}:{width:1280,height:800}});
 await c.route("**/*",r=>{const q=new URL(r.request().url());return ["127.0.0.1","localhost"].includes(q.hostname)||["data:","blob:"].includes(q.protocol)?r.continue():r.abort("blockedbyclient")});
 const p=await c.newPage(),events=[];
 p.on("response",r=>{const q=new URL(r.url()).pathname;if(q.startsWith("/api/v1/chats")&&r.request().method()!=="GET")events.push({method:r.request().method(),status:r.status(),path:q})});
 await login(p,a);await p.goto("http://127.0.0.1:5173/chats");
 await p.getByRole("heading",{name:"Сообщения",exact:true}).waitFor({timeout:14000});
 const cookie=p.getByRole("button",{name:"Отклонить",exact:true});if(await cookie.isVisible().catch(()=>false))await cookie.click({timeout:4500});
 return {c,p,events};
}
(async()=>{
 if((await group()).rowCount)throw Error("REFUSE_PREEXISTING_LOCAL_QA_GROUP");
 const b=await chromium.launch({headless:true,executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"});
 try{
  for(const [a,viewport] of [[user,"desktop"],[trainer,"mobile"]]){
   const {c,p,events}=await setupBrowser(b,a,viewport);
   try{
    if(viewport==="desktop"){
     await p.getByRole("button",{name:"Создать группу"}).click();
     const form=p.locator("form").filter({has:p.getByRole("heading",{name:"Новый групповой чат"})});
     await form.getByRole("textbox",{name:/Название/}).fill(name);
     await form.getByRole("textbox",{name:/Описание/}).fill("Только локальная безопасная QA-группа");
     await form.getByRole("button",{name:"Создать чат"}).click();
     await p.waitForResponse(r=>r.request().method()==="POST"&&new URL(r.url()).pathname==="/api/v1/chats/groups",{timeout:11500}).catch(()=>undefined);
     const state=await group();if(state.rowCount!==1||state.rows[0].kind!=="GROUP"||state.rows[0].visibility!=="PUBLIC")throw Error("QA_GROUP_NOT_CREATED_PUBLIC");
     const id=state.rows[0].id;
     const composer=p.getByRole("textbox",{name:"Текст сообщения"});await composer.waitFor({timeout:12000});
     await composer.fill(first);
     const ack=p.waitForResponse(r=>r.request().method()==="POST"&&/^\/api\/v1\/chats\/[A-Za-z0-9_-]+\/messages$/.test(new URL(r.url()).pathname),{timeout:12000});
     await p.getByRole("button",{name:"Отправить сообщение"}).click({timeout:7500});
     if((await ack).status()!==201)throw Error("QA_GROUP_SEND_HTTP_NOT_201");
     const m=await msgs(id);if(m.rowCount!==1||m.rows[0].authorId!==user.id||m.rows[0].text!==first)throw Error("QA_GROUP_MSG_NOT_PERSISTED");
     pass.push({viewport,createAndFirstMessage:true,pass:true});
    }else{
     await p.getByRole("button",{name:"Найти сообщества"}).click();
     await p.getByRole("textbox",{name:"Поиск"}).fill(name);
     const row=p.locator("div").filter({hasText:name}).filter({has:p.getByRole("button",{name:"Вступить"})}).last();
     const join=row.getByRole("button",{name:"Вступить"});
     await join.waitFor({timeout:12000});
     const ack=p.waitForResponse(r=>r.request().method()==="POST"&&/\/api\/v1\/chats\/[A-Za-z0-9_-]+\/join$/.test(new URL(r.url()).pathname),{timeout:13000});
     await join.click({timeout:8500});const res=await ack;
     if(![200,201].includes(res.status()))throw Error("QA_GROUP_JOIN_HTTP_"+res.status());
     const state=await group(),id=state.rows[0]?.id;
     const members=await verifyMembers(id);
     if(members.rowCount!==2||members.rows.some(m=>![user.id,trainer.id].includes(m.userId)))throw Error("QA_GROUP_JOIN_MEMBERS_NOT_TWO");
     const composer=p.getByRole("textbox",{name:"Текст сообщения"});await composer.waitFor({timeout:14000});
     await p.getByText(first,{exact:true}).last().waitFor({timeout:12000});
     await composer.fill(second);
     const send=p.waitForResponse(r=>r.request().method()==="POST"&&/\/api\/v1\/chats\/[A-Za-z0-9_-]+\/messages$/.test(new URL(r.url()).pathname),{timeout:12000});
     await p.getByRole("button",{name:"Отправить сообщение"}).click({timeout:8000});
     if((await send).status()!==201)throw Error("QA_GROUP_MOBILE_SEND_HTTP_NOT_201");
     const m=await msgs(id);
     if(m.rowCount!==2||m.rows[1].authorId!==trainer.id||m.rows[1].text!==second)throw Error("QA_GROUP_REPLY_SQL_FAILED");
     pass.push({viewport,joinAndReply:true,pass:true});
    }
    http.push({viewport,events});
    console.log("QA_CHAT2_GROUP_E2E_STEP",JSON.stringify(pass.at(-1)));
   }finally{await c.close()}
  }
 }finally{await b.close()}
})().catch(e=>{console.log("QA_CHAT2_GROUP_E2E_ERROR",String(e.message).slice(0,340));process.exitCode=1}).finally(async()=>{
 try{await cleanup()}catch(e){console.log("QA_CHAT2_GROUP_CLEANUP_ERROR",String(e.message).slice(0,210));process.exitCode=1}
 fs.writeFileSync(".local-pg-scratch/qa-logs/browser-20261029/chat2-local-group-e2e.json",JSON.stringify({pass,http},null,2));
});
