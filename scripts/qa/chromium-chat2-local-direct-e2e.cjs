"use strict";
const fs=require("node:fs"),cp=require("node:child_process"),{Client}=require("pg");
const {chromium}=require("../../.local-pg-scratch/qa-playwright/node_modules/playwright-core");
const users=JSON.parse(fs.readFileSync(".local-pg-scratch/qa-browser-accounts-20261029.json","utf8"));
const user=users.find(x=>x.role==="USER"),trainer=users.find(x=>x.role==="TRAINER");
if(!user||!trainer||user.id===trainer.id||trainer.username==="lana")throw Error("UNSAFE_QA_DIRECT_ACTORS");
const pid=cp.execFileSync("lsof",["-t","-nP","-iTCP:3001","-sTCP:LISTEN"],{encoding:"utf8"}).trim().split("\n")[0];
const raw=cp.execFileSync("ps",["eww","-p",pid,"-o","command="],{encoding:"utf8"}).match(/(?:^|\s)DATABASE_URL=([^\s]+)/)?.[1];
const u=new URL(raw);if(u.hostname!=="127.0.0.1"||u.port!=="55921"||u.pathname!=="/gafus_refactor_real_work_20261024")throw Error("REFUSE_NONLOCAL_QA_DB");
const first="QA: локальное сообщение Chat2 20261029",second="QA: ответ Chat2 между тестовыми аккаунтами";
let roomId=null;const done=[],http=[];
async function db(fn){const c=new Client({connectionString:raw});await c.connect();try{return await fn(c)}finally{await c.end()}}
async function state(){return db(async c=>{
 const r=await c.query('SELECT c.id,c.kind,c."directKey",c."createdById" FROM "Chat2Conversation" c WHERE c.kind=$1 AND c.id IN (SELECT "conversationId" FROM "Chat2Member" WHERE "userId"=$2) AND c.id IN (SELECT "conversationId" FROM "Chat2Member" WHERE "userId"=$3)',['DIRECT',user.id,trainer.id]);
 const rooms=r.rows;const messages=roomId?await c.query('SELECT id,"authorId",text,"deletedAt" FROM "Chat2Message" WHERE "conversationId"=$1 ORDER BY sequence',[roomId]):{rows:[]};
 return {rooms,messages:messages.rows};
})}
async function cleanup(){
 if(!roomId)return;
 const c=new Client({connectionString:raw});await c.connect();try{
 await c.query("BEGIN");
 try{
 const rows=await c.query('SELECT id,kind,"createdById" FROM "Chat2Conversation" WHERE id=$1 FOR UPDATE',[roomId]);
 if(rows.rowCount===0){await c.query("COMMIT");return}
 if(rows.rowCount!==1||rows.rows[0].kind!=="DIRECT")throw Error("REFUSE_NONQA_CHAT");
 const members=await c.query('SELECT "userId" FROM "Chat2Member" WHERE "conversationId"=$1',[roomId]);
 if(members.rowCount!==2||members.rows.some(x=>x.userId!==user.id&&x.userId!==trainer.id))throw Error("REFUSE_NONQA_MEMBERS");
 const msg=await c.query('SELECT "authorId",text FROM "Chat2Message" WHERE "conversationId"=$1',[roomId]);
 if(msg.rows.some(x=>![user.id,trainer.id].includes(x.authorId)||![first,second].includes(x.text)))throw Error("REFUSE_UNRELATED_CHAT_CONTENT");
 const media=await c.query('SELECT count(*)::int n FROM "Chat2Media" WHERE "conversationId"=$1',[roomId]);
 const reportRelation=await c.query("SELECT to_regclass('public.\"Chat2Report\"') AS reg");
 let reportCount=0;
 if(reportRelation.rows[0].reg!==null){
   const reports=await c.query('SELECT count(*)::int n FROM "Chat2Report" WHERE "conversationId"=$1',[roomId]);
   reportCount=reports.rows[0].n;
 }
 if(media.rows[0].n!==0||reportCount!==0)throw Error("REFUSE_ROOM_MEDIA_OR_REPORTS");
 await c.query('DELETE FROM "Chat2Conversation" WHERE id=$1 AND kind=$2',[roomId,'DIRECT']);
 await c.query("COMMIT");
 }catch(e){await c.query("ROLLBACK").catch(()=>{});throw e}
 }finally{await c.end()}
 if((await state()).rooms.length)throw Error("QA_CHAT2_ROOM_CLEANUP_READBACK_FAILED");
 console.log("QA_DIRECT_CHAT_OWN_ROOM_CLEANUP_SQL_ZERO");
}
async function login(p,actor){
 await p.goto("http://127.0.0.1:5173/login");await p.locator("#login-name").fill(actor.username);await p.locator("#login-password").fill(actor.password);
 await p.getByRole("button",{name:"Войти",exact:true}).click();await p.waitForURL("**/courses",{timeout:12500});
}
(async()=>{
 const saved=await state();
 if(saved.rooms.length>1||saved.messages.length)throw Error("REFUSE_EXISTING_NONEMPTY_QA_DIRECT_ROOM");
 if(saved.rooms.length===1) {
  if(saved.rooms[0].kind!=="DIRECT"||saved.rooms[0].createdById!==user.id)throw Error("REFUSE_EXISTING_NOT_OWN_QA_ROOM");
  roomId=saved.rooms[0].id;
  const ownMemberships=await db(c=>c.query('SELECT "userId" FROM "Chat2Member" WHERE "conversationId"=$1',[roomId]));
  if(ownMemberships.rowCount!==2||ownMemberships.rows.some(x=>![user.id,trainer.id].includes(x.userId)))throw Error("REFUSE_ROOM_WITH_OTHER_MEMBERS");
  console.log("QA_REUSE_ALREADY_CREATED_EMPTY_DIRECT_ROOM_CONFIRMED");
 }
 const browser=await chromium.launch({headless:true,executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"});
 try{
 for(const [actor,viewport,w,h] of [[user,"desktop",1280,800],[trainer,"mobile",390,844]]){
 const ctx=await browser.newContext({viewport:{width:w,height:h}});
 await ctx.route("**/*",r=>{const url=new URL(r.request().url());return ["127.0.0.1","localhost"].includes(url.hostname)||["data:","blob:"].includes(url.protocol)?r.continue():r.abort("blockedbyclient")});
 const page=await ctx.newPage(),responses=[];page.on("response",r=>{const p=new URL(r.url()).pathname;if(p.startsWith("/api/v1/chats")&&r.request().method()!=="GET")responses.push({method:r.request().method(),status:r.status(),path:p})});
 try{
 await login(page,actor);await page.goto("http://127.0.0.1:5173/chats");
 await page.getByRole("heading",{name:"Сообщения",exact:true}).waitFor({timeout:12000});
 const cookieDecline=page.getByRole("button",{name:"Отклонить",exact:true});
 if(await cookieDecline.isVisible().catch(()=>false)){
   await cookieDecline.click({timeout:4500});
   console.log("QA_COOKIE_BANNER_DISMISSED_BY_REAL_CLICK",viewport);
 }
 if(viewport==="desktop"){
  if(!roomId){
    await page.getByRole("button",{name:"Новое сообщение"}).click();
    await page.getByRole("textbox",{name:"Поиск"}).fill(trainer.username);
    const found=page.locator("button").filter({hasText:trainer.username}).first();
    await found.waitFor({timeout:13000});
    const creating=page.waitForResponse(r=>r.request().method()==="POST" && new URL(r.url()).pathname==="/api/v1/chats/direct",{timeout:13000});
    await found.click();
    const reply=await creating;
    if(reply.status()!==201)throw Error("QA_DIRECT_ROOM_CREATION_HTTP_NOT_201");
    const created=await state();if(created.rooms.length!==1||created.rooms[0].createdById!==user.id)throw Error("QA_DIRECT_CREATE_SQL_NOT_OWN_ROOM");
    roomId=created.rooms[0].id;
    console.log("QA_CHAT2_OWN_DIRECT_CREATED_HTTP201");
  } else {
    const hit=page.locator("button").filter({hasText:trainer.username}).first();
    await hit.waitFor({timeout:13000});await hit.click();
  }
  const textBox=page.getByRole("textbox",{name:"Текст сообщения"});await textBox.waitFor({timeout:14000});
  await textBox.fill(first);
  const send=page.getByRole("button",{name:"Отправить сообщение"});
  console.log("QA_CHAT2_SEND_BUTTON_AFTER_FILL",{disabled:await send.isDisabled(),inputLength:(await textBox.inputValue()).length});
  const acknowledgement=page.waitForResponse(r=>r.request().method()==="POST" && /^\/api\/v1\/chats\/[A-Za-z0-9_-]+\/messages$/.test(new URL(r.url()).pathname),{timeout:13000});
  await send.click({timeout:7000});
  const messageReceipt=await acknowledgement;
  if(messageReceipt.status()!==201)throw Error("QA_CHAT2_MESSAGE_SERVER_NOT_201_"+messageReceipt.status());
  await page.getByText(first,{exact:true}).waitFor({timeout:11500});
  const r=await state();
  if(r.rooms.length!==1||r.messages.length!==1||r.messages[0].authorId!==user.id||r.messages[0].text!==first)throw Error("QA_CHAT2_SQL_SEND_NOT_PROVEN");
  done.push({viewport,action:"send in pre-created QA direct room",ownRoom:true,firstSQL:true,pass:true});
 }else{
  await page.getByText(first,{exact:true}).first().waitFor({timeout:12000});
  const entry=page.locator("button").filter({hasText:first}).first();
  await entry.click();
  await page.getByRole("textbox",{name:"Текст сообщения"}).waitFor({timeout:12000});
  await page.getByText(first,{exact:true}).last().waitFor({timeout:10000});
  const box=page.getByRole("textbox",{name:"Текст сообщения"});await box.fill(second);
  const receipt=page.waitForResponse(r=>r.request().method()==="POST" && /^\/api\/v1\/chats\/[A-Za-z0-9_-]+\/messages$/.test(new URL(r.url()).pathname),{timeout:13000});
  await page.getByRole("button",{name:"Отправить сообщение"}).click({timeout:8000});
  const response=await receipt;
  if(response.status()!==201)throw Error("QA_CHAT2_REPLY_HTTP_NOT_201_"+response.status());
  await page.getByText(second,{exact:true}).last().waitFor({timeout:12000});
  const r=await state();if(r.rooms.length!==1||r.messages.length!==2||r.messages[1].authorId!==trainer.id||r.messages[1].text!==second)throw Error("QA_CHAT2_REPLY_SQL_FAILED");
  done.push({viewport,action:"read and reply to QA DM",secondSQL:true,pass:true});
 }
 http.push({viewport,responses});console.log("REAL_CHAT2_QA_STEP",JSON.stringify(done.at(-1)));
 }catch(e){console.log("REAL_CHAT2_QA_STEP_ERROR",JSON.stringify({viewport,error:String(e.message).slice(0,170),http:responses.slice(-6)}));throw e}
 finally{await ctx.close()}
 }
 }finally{await browser.close()}
})().catch(e=>{console.log("REAL_CHAT2_QA_ERROR",String(e.message).slice(0,190));process.exitCode=1}).finally(async()=>{
 try{await cleanup()}catch(e){console.log("QA_CHAT2_CLEANUP_ERROR",String(e.message).slice(0,180));process.exitCode=1}
 fs.writeFileSync(".local-pg-scratch/qa-logs/browser-20261029/chat2-local-direct-e2e.json",JSON.stringify({done,http,roomCreated:!!roomId},null,2));
});
