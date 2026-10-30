"use strict";
const fs=require("node:fs"),cp=require("node:child_process"),{Client}=require("pg");
const {chromium}=require("../../.local-pg-scratch/qa-playwright/node_modules/playwright-core");
const users=JSON.parse(fs.readFileSync(".local-pg-scratch/qa-browser-accounts-20261029.json","utf8"));
const qa=users.find(a=>a.role==="USER"),tr=users.find(a=>a.role==="TRAINER");
if(!qa||!tr||qa.id===tr.id||tr.username==="lana")throw Error("REFUSE_QA_ROLES");
const pid=cp.execFileSync("lsof",["-t","-nP","-iTCP:3003","-sTCP:LISTEN"],{encoding:"utf8"}).trim().split("\n")[0];
const processText=cp.execFileSync("ps",["eww","-p",pid,"-o","command="],{encoding:"utf8"});
const raw=processText.match(/(?:^|\s)DATABASE_URL=([^\s]+)/)?.[1];
const url=new URL(raw);if(url.hostname!=="127.0.0.1"||url.port!=="55921"||url.pathname!=="/gafus_refactor_real_work_20261024"||!processText.includes("CHAT2_API_ENABLED=enabled"))throw Error("REFUSE_NONLOCAL_QA_DB");
const original="QA edit-delete original Chat2 synthetic",edited="QA edit-delete edited Chat2 synthetic";
let roomId=null,messageId=null;const evidence=[];
async function db(fn){const c=new Client({connectionString:raw});await c.connect();try{return await fn(c)}finally{await c.end()}}
async function room(){return db(c=>c.query('SELECT id,kind,"createdById" FROM "Chat2Conversation" WHERE kind=$1 AND id IN (SELECT "conversationId" FROM "Chat2Member" WHERE "userId"=$2) AND id IN (SELECT "conversationId" FROM "Chat2Member" WHERE "userId"=$3)',['DIRECT',qa.id,tr.id]))}
async function message(){return db(c=>c.query('SELECT id,text,"authorId","editedAt","deletedAt" FROM "Chat2Message" WHERE "conversationId"=$1 ORDER BY sequence',[roomId]))}
async function cleanup(){
 if(!roomId){const x=await room();if(x.rowCount===1&&x.rows[0].createdById===qa.id)roomId=x.rows[0].id;else if(x.rowCount)throw Error("REFUSE_CLEANUP_UNEXPECTED_ROOM");else return}
 await db(async c=>{
 await c.query("BEGIN");
 try{
 const r=await c.query('SELECT id,kind,"createdById" FROM "Chat2Conversation" WHERE id=$1 FOR UPDATE',[roomId]);
 if(!r.rowCount){await c.query("COMMIT");return}
 if(r.rowCount!==1||r.rows[0].kind!=="DIRECT"||r.rows[0].createdById!==qa.id)throw Error("REFUSE_ROOM_NOT_OWN_QA");
 const m=await c.query('SELECT "userId" FROM "Chat2Member" WHERE "conversationId"=$1',[roomId]);
 if(m.rowCount!==2||m.rows.some(x=>![qa.id,tr.id].includes(x.userId)))throw Error("REFUSE_UNKNOWN_ROOM_MEMBERS");
 const records=await c.query('SELECT "authorId",text,"deletedAt" FROM "Chat2Message" WHERE "conversationId"=$1',[roomId]);
 if(records.rows.some(x=>x.authorId!==qa.id||!([original,edited].includes(x.text)||(x.text===""&&!!x.deletedAt))))throw Error("REFUSE_UNKNOWN_CHAT_MESSAGE");
 const media=await c.query('SELECT count(*)::int n FROM "Chat2Media" WHERE "conversationId"=$1',[roomId]);
 if(media.rows[0].n!==0)throw Error("REFUSE_QA_ROOM_WITH_MEDIA");
 const reports=await c.query("SELECT to_regclass('public.\\\"Chat2Report\\\"') AS reg");
 if(reports.rows[0].reg){const count=await c.query('SELECT count(*)::int n FROM "Chat2Report" WHERE "conversationId"=$1',[roomId]);if(count.rows[0].n)throw Error("REFUSE_QA_ROOM_WITH_REPORTS")}
 await c.query('DELETE FROM "Chat2Conversation" WHERE id=$1 AND kind=$2 AND "createdById"=$3',[roomId,"DIRECT",qa.id]);
 await c.query("COMMIT");
 }catch(e){await c.query("ROLLBACK").catch(()=>{});throw e}
 });
 if((await room()).rowCount)throw Error("QA_ROOM_DELETE_NOT_CONFIRMED");
 console.log("CHAT2_EDIT_DELETE_LOCAL_OWN_ROOM_CLEANED_ZERO");
}
async function ctx(b,a,viewport){
 const c=await b.newContext({viewport:viewport==="mobile"?{width:390,height:844}:{width:1280,height:800}});
 await c.route("**/*",r=>{const u=new URL(r.request().url());return ["127.0.0.1","localhost"].includes(u.hostname)||["data:","blob:"].includes(u.protocol)?r.continue():r.abort("blockedbyclient")});
 const p=await c.newPage();await p.goto("http://127.0.0.1:5173/login");await p.locator("#login-name").fill(a.username);await p.locator("#login-password").fill(a.password);await p.getByRole("button",{name:"Войти",exact:true}).click();await p.waitForURL("**/courses",{timeout:12000});await p.goto("http://127.0.0.1:5173/chats");
 await p.getByRole("heading",{name:"Сообщения",exact:true}).waitFor({timeout:13000});
 const reject=p.getByRole("button",{name:"Отклонить",exact:true});if(await reject.isVisible().catch(()=>false))await reject.click({timeout:4500});
 return {c,p};
}
async function ack(p,method,reg,action,expected){
 const waiter=p.waitForResponse(r=>r.request().method()===method&&reg.test(new URL(r.url()).pathname),{timeout:12000});
 await action();const response=await waiter;if(response.status()!==expected)throw Error("QA_HTTP_NOT_EXPECTED_"+method+"_"+response.status());
 return response;
}
(async()=>{
 if((await room()).rowCount)throw Error("REFUSE_EXISTING_DIRECT_ROOM_FOR_QA_ACTORS");
 const b=await chromium.launch({headless:true,executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"});
 try{
 const first=await ctx(b,qa,"desktop");
 try{
 const p=first.p;
 await p.getByRole("button",{name:"Новое сообщение"}).click();
 await p.getByRole("textbox",{name:"Поиск"}).fill(tr.username);
 const hit=p.locator("button").filter({hasText:tr.username}).first();await hit.waitFor({timeout:12000});
 await ack(p,"POST",/^\/api\/v1\/chats\/direct$/,()=>hit.click(),201);
 const r=await room();if(r.rowCount!==1||r.rows[0].createdById!==qa.id)throw Error("QA_DM_CREATE_SQL_FAILED");
 roomId=r.rows[0].id;
 const field=p.getByRole("textbox",{name:"Текст сообщения"});await field.waitFor({timeout:13000});await field.fill(original);
 await ack(p,"POST",/^\/api\/v1\/chats\/[^/]+\/messages$/,()=>p.getByRole("button",{name:"Отправить сообщение"}).click(),201);
 const msgs=await message();if(msgs.rowCount!==1||msgs.rows[0].text!==original||msgs.rows[0].authorId!==qa.id)throw Error("QA_DM_SEND_SQL_FAIL");
 messageId=msgs.rows[0].id;
 const bubble=p.locator('div[class*="bodyText"]').filter({hasText:original}).last();
 await bubble.waitFor({timeout:11000});
 await bubble.hover();
 await p.getByRole("button",{name:"Изменить",exact:true}).click({timeout:7000});
 await field.fill(edited);
 await ack(p,"PATCH",/^\/api\/v1\/chats\/[^/]+\/messages\/[^/]+$/,()=>p.getByRole("button",{name:"Сохранить сообщение"}).click(),200);
 const changed=await message();if(changed.rowCount!==1||changed.rows[0].text!==edited||!changed.rows[0].editedAt)throw Error("QA_DM_EDIT_SQL_NOT_PERSISTED");
 evidence.push({role:"USER",viewport:"desktop",createSendEdit:true,http:[201,201,200],sqlCorrect:true});
 console.log("QA_CHAT2_EDIT_STEP_PASS",JSON.stringify(evidence.at(-1)));
 }finally{await first.c.close()}
 const second=await ctx(b,tr,"mobile");
 try{
 const p=second.p,row=p.locator("button").filter({hasText:qa.username}).first();
 await row.waitFor({timeout:14000});await row.click();
 await p.getByRole("textbox",{name:"Текст сообщения"}).waitFor({timeout:12000});
 await p.getByText(edited,{exact:true}).last().waitFor({timeout:10000});
 if(await p.getByRole("button",{name:"Изменить",exact:true}).count())throw Error("NONOWNER_SEES_EDIT");
 const deny=await p.evaluate(async({roomId,messageId})=>{
  const res=await fetch("/api/v1/chats/"+encodeURIComponent(roomId)+"/messages/"+encodeURIComponent(messageId),{method:"PATCH",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify({text:"QATamper"})});
  return res.status;
 },{roomId,messageId});
 // Author-scoped updateMany deliberately returns 404 to avoid disclosing
 // another member's message/editability (not 403).
 if(deny!==404)throw Error("QA_NONOWNER_PATCH_NOT_NOT_FOUND_404_"+deny);
 const untouched=await message();if(untouched.rowCount!==1||untouched.rows[0].text!==edited||untouched.rows[0].deletedAt)throw Error("QA_NONOWNER_MUTATED_MESSAGE");
 evidence.push({role:"TRAINER",viewport:"mobile",noEditButton:true,nonownerEditNotFound404:true,sqlUnchanged:true});
 console.log("QA_CHAT2_NONOWNER_STEP_PASS",JSON.stringify(evidence.at(-1)));
 }finally{await second.c.close()}
 const third=await ctx(b,qa,"desktop");
 try{
 const p=third.p,row=p.locator("button").filter({hasText:tr.username}).first();await row.waitFor({timeout:13000});await row.click();
 await p.getByText(edited,{exact:true}).last().waitFor({timeout:12000});
 const editedBubble=p.locator('div[class*="bodyText"]').filter({hasText:edited}).last();
 await editedBubble.waitFor({timeout:12000});
 await editedBubble.hover();
 p.once("dialog",d=>d.accept());
 await ack(p,"DELETE",/^\/api\/v1\/chats\/[^/]+\/messages\/[^/]+$/,()=>p.getByRole("button",{name:"Удалить",exact:true}).click({timeout:7000}),200);
 const gone=await message();if(gone.rowCount!==1||!gone.rows[0].deletedAt)throw Error("QA_CHAT2_SOFT_DELETE_NOT_CONFIRMED");
 await p.getByText("Сообщение удалено",{exact:true}).last().waitFor({timeout:12000});
 evidence.push({role:"USER",viewport:"desktop",deleteSoft:true,http200:true,deletedSQL:true});
 console.log("QA_CHAT2_DELETE_STEP_PASS",JSON.stringify(evidence.at(-1)));
 }finally{await third.c.close()}
 }finally{await b.close()}
})().catch(e=>{console.log("QA_CHAT2_EDIT_DELETE_E2E_ERROR",String(e.message).slice(0,320));process.exitCode=1}).finally(async()=>{
 try{await cleanup()}catch(e){console.log("QA_CHAT2_EDIT_DELETE_CLEANUP_ERROR",String(e.message).slice(0,210));process.exitCode=1}
 fs.writeFileSync(".local-pg-scratch/qa-logs/browser-20261029/chat2-edit-delete-e2e.json",JSON.stringify({evidence},null,2));
});
