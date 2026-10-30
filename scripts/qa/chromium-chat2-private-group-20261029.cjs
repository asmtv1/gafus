"use strict";
const fs=require("fs"),cp=require("child_process"),{Client}=require("pg");
const {chromium}=require("../../.local-pg-scratch/qa-playwright/node_modules/playwright-core");
const accounts=JSON.parse(fs.readFileSync(".local-pg-scratch/qa-browser-accounts-20261029.json","utf8"));
const owner=accounts.find(x=>x.role==="USER"),invitee=accounts.find(x=>x.role==="TRAINER");
if(!owner||!invitee||owner.id===invitee.id||invitee.username==="lana")throw Error("REFUSE_UNKNOWN_QA_ACTORS");
const pid=cp.execFileSync("lsof",["-t","-nP","-iTCP:3003","-sTCP:LISTEN"],{encoding:"utf8"}).split("\n")[0],ps=cp.execFileSync("ps",["eww","-p",pid,"-o","command="],{encoding:"utf8"}),raw=ps.match(/(?:^|\s)DATABASE_URL=([^\s]+)/)?.[1],url=new URL(raw);
if(url.hostname!=="127.0.0.1"||url.port!=="55921"||url.pathname!=="/gafus_refactor_real_work_20261024"||!ps.includes("API_PORT=3003")||!ps.includes("CHAT2_API_ENABLED=enabled"))throw Error("REFUSE_UNSAFE_DB_OR_CHAT_SERVICE");
const name="QA PRIVATE group 20261029 unique",msg="QA private-message from synthetic trainer 20261029";const results=[];
async function db(f){const c=new Client({connectionString:raw});await c.connect();try{return await f(c)}finally{await c.end()}}
async function group(){return db(c=>c.query('SELECT id,kind,visibility,name,"createdById" FROM "Chat2Conversation" WHERE name=$1 AND "createdById"=$2',[name,owner.id]))}
async function members(id){return db(c=>c.query('SELECT "userId",role FROM "Chat2Member" WHERE "conversationId"=$1',[id]))}
async function cleanup(){
 const found=await group();
 if(found.rowCount===0){console.log("QA_PRIVATE_GROUP_NONE_TO_CLEAN");return}
 if(found.rowCount!==1||found.rows[0].kind!=="GROUP"||found.rows[0].visibility!=="PRIVATE")throw Error("REFUSE_UNRELATED_GROUP");
 const id=found.rows[0].id;
 await db(async c=>{await c.query("BEGIN");try{
  const record=await c.query('SELECT id,kind,visibility,"createdById",name FROM "Chat2Conversation" WHERE id=$1 FOR UPDATE',[id]);
  if(record.rowCount!==1||record.rows[0].createdById!==owner.id||record.rows[0].kind!=="GROUP"||record.rows[0].visibility!=="PRIVATE"||record.rows[0].name!==name)throw Error("REFUSE_GROUP_CHANGED");
  const actors=await c.query('SELECT "userId" FROM "Chat2Member" WHERE "conversationId"=$1',[id]);
  if(actors.rows.some(a=>![owner.id,invitee.id].includes(a.userId)))throw Error("REFUSE_NON_QA_MEMBER");
  const msgs=await c.query('SELECT "authorId",text FROM "Chat2Message" WHERE "conversationId"=$1',[id]);
  if(msgs.rows.some(m=>m.authorId!==invitee.id||m.text!==msg))throw Error("REFUSE_UNKNOWN_MESSAGE");
  const media=await c.query('SELECT count(*)::int n FROM "Chat2Media" WHERE "conversationId"=$1',[id]);
  const reports=await c.query('SELECT count(*)::int n FROM "Chat2Report" WHERE "conversationId"=$1',[id]);
  if(media.rows[0].n!==0||reports.rows[0].n!==0)throw Error("REFUSE_GROUP_WITH_MEDIA_OR_REPORT");
  const done=await c.query('DELETE FROM "Chat2Conversation" WHERE id=$1 AND "createdById"=$2 AND kind=$3 AND visibility=$4',[id,owner.id,"GROUP","PRIVATE"]);
  if(done.rowCount!==1)throw Error("CLEANUP_NOT_ONE");
  await c.query("COMMIT");
 }catch(e){await c.query("ROLLBACK").catch(()=>{});throw e}});
 if((await group()).rowCount)throw Error("OWN_GROUP_CLEANUP_FAILED");
 console.log("QA_PRIVATE_GROUP_SQL_ZERO_ONLY_OWN_FIXTURE");
}
async function openBrowser(browser,actor,vp){
 const ctx=await browser.newContext({viewport:vp==="desktop"?{width:1280,height:800}:{width:390,height:844}});
 await ctx.route("**/*",r=>{const u=new URL(r.request().url());return ["127.0.0.1","localhost"].includes(u.hostname)||["data:","blob:"].includes(u.protocol)?r.continue():r.abort("blockedbyclient")});
 const p=await ctx.newPage();
 await p.goto("http://127.0.0.1:5173/login");
 await p.locator("#login-name").fill(actor.username);await p.locator("#login-password").fill(actor.password);
 await p.getByRole("button",{name:"Войти",exact:true}).click();await p.waitForURL("**/courses",{timeout:12500});
 await p.goto("http://127.0.0.1:5173/chats");
 await p.getByRole("heading",{name:"Сообщения",exact:true}).waitFor({timeout:12000});
 const consent=p.getByRole("button",{name:"Отклонить",exact:true});
 if(await consent.isVisible().catch(()=>false))await consent.click({timeout:3500});
 return {ctx,p};
}
async function api(p,path,method="GET",body=null){
 return p.evaluate(async ({path,method,body})=>{
  const r=await fetch(path,{method,credentials:"same-origin",cache:"no-store",headers:method==="GET"?{}:{"Content-Type":"application/json"},...(method==="GET"?{}:{body:JSON.stringify(body??{})})});
  const d=await r.json().catch(()=>null);return {http:r.status,code:d?.code??null,data:d?.data??null};
 },{path,method,body});
}
(async()=>{
 if((await group()).rowCount!==0)throw Error("REFUSE_EXISTING_SAME_NAME_GROUP");
 const b=await chromium.launch({headless:true,executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"});
 try{
 const a=await openBrowser(b,owner,"desktop");
 try{
  await a.p.getByRole("button",{name:"Создать группу"}).click();
  const form=a.p.locator("form").filter({has:a.p.getByRole("heading",{name:"Новый групповой чат"})});
  await form.getByRole("textbox",{name:/Название/}).fill(name);
  await form.getByRole("combobox",{name:"Кому виден"}).selectOption("PRIVATE");
  const pending=a.p.waitForResponse(r=>r.request().method()==="POST"&&new URL(r.url()).pathname==="/api/v1/chats/groups",{timeout:13000});
  await form.getByRole("button",{name:"Создать чат"}).click();
  if((await pending).status()!==201)throw Error("PRIVATE_CREATE_HTTP_NOT201");
  const g=await group();if(g.rowCount!==1||g.rows[0].kind!=="GROUP"||g.rows[0].visibility!=="PRIVATE")throw Error("PRIVATE_CREATE_DB_FAILED");
  const id=g.rows[0].id;
  results.push({action:"owner UI create private group",viewport:"desktop",http:201,sqlPrivate:true,pass:true});
  console.log("QA_CHAT2_PRIVATE_STEP_PASS",JSON.stringify(results.at(-1)));
  const x=await openBrowser(b,invitee,"mobile");
  try{
   const list=await api(x.p,"/api/v1/chats/discover?q="+encodeURIComponent(name));
   const details=await api(x.p,"/api/v1/chats/"+id);
   const join=await api(x.p,"/api/v1/chats/"+id+"/join","POST",{});
   const send=await api(x.p,"/api/v1/chats/"+id+"/messages","POST",{clientMessageId:"f335f711-f234-4a02-b4b3-211cab380e3a",text:msg,attachmentIds:[]});
   if(list.http!==200||list.data?.some(y=>y.id===id)||![403,404].includes(details.http)||join.http!==403||![403,404].includes(send.http)||(await members(id)).rowCount!==1)throw Error("PRIVATE_PREINVITE_ACCESS_LEAK_"+JSON.stringify({list:list.http,details:details.http,join:join.http,send:send.http}));
   results.push({action:"uninvited trainer cannot discover/join/read/send",viewport:"mobile",undiscoverable:true,joinedNo:false,denyHttp:true,pass:true});
   console.log("QA_CHAT2_PRIVATE_STEP_PASS",JSON.stringify(results.at(-1)));
  }finally{await x.ctx.close()}
  await a.p.getByRole("textbox",{name:"Текст сообщения"}).waitFor({timeout:12500});
  await a.p.locator("summary[aria-label='Настройки чата']").click({timeout:12000});
  const lookup=a.p.getByRole("textbox",{name:"Поиск пользователя"});
  await lookup.waitFor({timeout:13000});await lookup.fill(invitee.username);
  const invite=a.p.getByRole("button",{name:"＋ "+invitee.username,exact:true});
  await invite.waitFor({timeout:14500});
  const posted=a.p.waitForResponse(r=>r.request().method()==="POST"&&new URL(r.url()).pathname==="/api/v1/chats/"+id+"/invite",{timeout:13000});
  await invite.click();if((await posted).status()!==200)throw Error("PRIVATE_INVITE_HTTP_NOT200");
  const membership=await members(id);if(membership.rowCount!==2||membership.rows.some(z=>![owner.id,invitee.id].includes(z.userId)))throw Error("PRIVATE_INVITE_SQL_INVALID");
  results.push({action:"owner UI invite QA trainer",viewport:"desktop",http:200,members:2,pass:true});
  console.log("QA_CHAT2_PRIVATE_STEP_PASS",JSON.stringify(results.at(-1)));
  const v=await openBrowser(b,invitee,"mobile");
  try{
   const direct=await api(v.p,"/api/v1/chats/"+id);
   if(direct.http!==200)throw Error("PRIVATE_INVITEE_NOW_CANNOT_READ");
   const ready=v.p.getByText(name,{exact:true}).first();await ready.waitFor({timeout:14000});await ready.click();
   const composer=v.p.getByRole("textbox",{name:"Текст сообщения"});await composer.waitFor({timeout:12000});
   await composer.fill(msg);
   const reply=v.p.waitForResponse(r=>r.request().method()==="POST"&&new URL(r.url()).pathname==="/api/v1/chats/"+id+"/messages",{timeout:13000});
   await v.p.getByRole("button",{name:"Отправить сообщение"}).click({timeout:11000});
   if((await reply).status()!==201)throw Error("PRIVATE_INVITEE_MSG_NOT201");
   const messages=await db(c=>c.query('SELECT "authorId",text FROM "Chat2Message" WHERE "conversationId"=$1',[id]));
   if(messages.rowCount!==1||messages.rows[0].authorId!==invitee.id||messages.rows[0].text!==msg)throw Error("PRIVATE_MESSAGE_SQL_INVALID");
   results.push({action:"invited trainer reads/sends via UI",viewport:"mobile",http:201,sqlMessage:true,pass:true});
   console.log("QA_CHAT2_PRIVATE_STEP_PASS",JSON.stringify(results.at(-1)));
  }finally{await v.ctx.close()}
 }finally{await a.ctx.close()}
 }finally{await b.close()}
})().catch(e=>{console.log("QA_CHAT2_PRIVATE_ERROR",String(e.message).slice(0,290));process.exitCode=1}).finally(async()=>{
 try{await cleanup()}catch(e){console.log("QA_CHAT2_PRIVATE_OWN_CLEANUP_ERROR",String(e.message).slice(0,260));process.exitCode=1}
 fs.writeFileSync(".local-pg-scratch/qa-logs/browser-20261029/chat2-private-group-e2e.json",JSON.stringify({results},null,2));
});
