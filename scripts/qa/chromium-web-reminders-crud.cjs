"use strict";
const fs=require("node:fs"),cp=require("node:child_process"),{Client}=require("pg");
const {chromium}=require("../../.local-pg-scratch/qa-playwright/node_modules/playwright-core");
const account=JSON.parse(fs.readFileSync(".local-pg-scratch/qa-browser-accounts-20261029.json","utf8")).find(x=>x.role==="USER");
const pid=cp.execFileSync("lsof",["-t","-nP","-iTCP:3001","-sTCP:LISTEN"],{encoding:"utf8"}).trim().split("\n")[0];
const env=cp.execFileSync("ps",["eww","-p",pid,"-o","command="],{encoding:"utf8"}),raw=env.match(/(?:^|\s)DATABASE_URL=([^\s]+)/)?.[1],u=new URL(raw);
if(!account||u.hostname!=="127.0.0.1"||u.port!=="55921"||u.pathname!=="/gafus_refactor_real_work_20261024")throw Error("REFUSE_UNSAFE_PG");
const first="QA Напоминание только локальное",second="QA Напоминание изменено локально";let id=null;
const evidence=[],calls=[];
async function read(){const c=new Client({connectionString:raw});await c.connect();try{
 const q=await c.query('SELECT id,"userId",name,enabled,"reminderTime","lastSentAt" FROM "Reminder" WHERE "userId"=$1 AND name=ANY($2::text[])',[account.id,[first,second]]);
 return q.rows;
}finally{await c.end()}}
async function cleanup(){const rows=await read();
 if(!rows.length)return;
 if(rows.length!==1||!id||rows[0].id!==id||rows[0].userId!==account.id||rows[0].lastSentAt)throw Error("REFUSE_NONQA_REMINDER_CLEANUP");
 const c=new Client({connectionString:raw});await c.connect();try{
 const counts=await c.query('SELECT count(*)::int n FROM "TrainingReminderDelivery" WHERE "reminderId"=$1',[id]);
 if(counts.rows[0].n!==0)throw Error("REFUSE_QA_REMINDER_WITH_DELIVERY");
 const res=await c.query('DELETE FROM "Reminder" WHERE id=$1 AND "userId"=$2 AND name=ANY($3::text[]) AND "lastSentAt" IS NULL',[id,account.id,[first,second]]);
 if(res.rowCount!==1)throw Error("OWN_REMINDER_CLEANUP_ROW_COUNT_BAD");
 }finally{await c.end()}
 if((await read()).length)throw Error("OWN_REMINDER_CLEANUP_READBACK_BAD");
 console.log("QA_ONLY_REMINDER_CLEANUP_SQL_CONFIRMED");
}
async function login(ctx,p){
 await p.goto("http://127.0.0.1:5173/login");
 await p.locator("#login-name").fill(account.username);
 await p.locator("#login-password").fill(account.password);
 await p.getByRole("button",{name:"Войти",exact:true}).click();
 await p.waitForURL("**/courses",{timeout:13000});
}
(async()=>{
 if((await read()).length)throw Error("REFUSE_EXISTING_QA_REMINDER");
 const b=await chromium.launch({headless:true,executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"});
 try{
 for(const [vp,w,h,mode] of [["desktop",1280,800,"create-edit"],["mobile",390,844,"read-delete"]]){
 const c=await b.newContext({viewport:{width:w,height:h}});
 await c.route("**/*",r=>{const u=new URL(r.request().url());return ["127.0.0.1","localhost"].includes(u.hostname)||["data:","blob:"].includes(u.protocol)?r.continue():r.abort("blockedbyclient")});
 const page=await c.newPage();
 page.on("response",r=>{const x=new URL(r.url()).pathname;if(x.startsWith("/api/v1/reminders")&&r.request().method()!=="GET")calls.push({vp,method:r.request().method(),status:r.status(),path:x})});
 try{
 await login(c,page);
 await page.goto("http://127.0.0.1:5173/reminders");
 await page.getByRole("heading",{name:"Напоминания о тренировках",exact:true,level:1}).waitFor({timeout:13000});
 if(mode==="create-edit"){
  await page.getByRole("button",{name:/Добавить напоминание/}).click();
  const form=page.getByRole("form",{name:"Создать напоминание"});
  await form.getByLabel("Название").fill(first);
  await form.getByLabel("Время").fill("16:35");
  await form.getByRole("button",{name:"Создать напоминание"}).click();
  await page.getByText("Сохранено и подтверждено сервером.").waitFor({timeout:13000});
  const rows=await read();id=rows[0]?.id??null;
  if(rows.length!==1||!id||rows[0].reminderTime!=="16:35")throw Error("REMINDER_QA_CREATED_SQL_INVALID");
  const row=page.locator("[data-next-reminder-row]").filter({hasText:first});
  if(rows[0].enabled){
    // Styled Next switch intentionally hides the native checkbox.
    // Click the visible label surface, exactly as a user would.
    await row.locator("label").first().click();
    await page.waitForTimeout(950);
    const toggleProof=(await read())[0];
    console.log("QA_REMINDER_TOGGLE_DIAG",{enabled:toggleProof?.enabled,putRequests:calls.filter(x=>x.method==="PUT").map(x=>x.status)});
    if(toggleProof?.enabled!==false)throw Error("REMINDER_UI_SWITCH_DID_NOT_PERSIST_DISABLED");
  }
  if((await read())[0]?.enabled!==false)throw Error("QA_REMINDER_TOGGLE_OFF_SQL_NOT_CONFIRMED");
  await row.getByRole("button",{name:"Развернуть"}).click();
  const editor=page.getByRole("form",{name:"Изменить напоминание «"+first+"»"});
  await editor.getByLabel("Название").fill(second);
  await editor.getByLabel("Время").fill("18:20");
  await editor.getByRole("button",{name:"Сохранить изменения"}).click();
  // Renaming changes the identity matched by the former row locator.
  await page.locator("[data-next-reminder-row]").filter({hasText:second}).waitFor({timeout:13000});
  const updated=await read();
  if(updated.length!==1||updated[0].name!==second||updated[0].reminderTime!=="18:20"||updated[0].enabled)throw Error("REMINDER_QA_EDIT_SQL_INVALID");
  evidence.push({vp,action:"create-disable-edit",create200:calls.some(x=>x.method==="POST"&&x.status===200),toggleAndEdit200:calls.filter(x=>x.method==="PUT"&&x.status===200).length===2,sqlEnabled:false,pass:true});
 }else{
  const row=page.locator("[data-next-reminder-row]").filter({hasText:second});
  await row.waitFor({timeout:13000});
  const rows=await read();id=rows[0]?.id??id;
  if(rows.length!==1||rows[0].name!==second||rows[0].enabled)throw Error("REMINDER_QA_MOBILE_READBACK_FAILED");
  await row.getByRole("button",{name:"Удалить",exact:true}).click();
  await page.getByRole("group",{name:"Подтверждение удаления напоминания"}).getByRole("button",{name:"Да, удалить"}).click();
  await page.getByText("Напоминание удалено").waitFor({timeout:13000});
  if((await read()).length)throw Error("REMINDER_QA_DELETE_NOT_SQL_CONFIRMED");
  evidence.push({vp,action:"read-delete",delete200:calls.some(x=>x.method==="DELETE"&&x.status===200),sqlAbsent:true,pass:true});
 }
 console.log("REAL_WEB_REMINDER_QA_PASS",JSON.stringify(evidence.at(-1)));
 }finally{await c.close()}
 }
 }finally{await b.close()}
})().catch(e=>{console.log("REAL_WEB_REMINDER_QA_ERROR",String(e.message).slice(0,200));process.exitCode=1}).finally(async()=>{
 try{await cleanup()}catch(e){console.log("REMINDER_QA_CLEANUP_ERROR",String(e.message).slice(0,160));process.exitCode=1}
 const remaining=await read().catch(()=>null);
 fs.writeFileSync(".local-pg-scratch/qa-logs/browser-20261029/reminder-crud-e2e.json",JSON.stringify({evidence,calls,qaRowsRemaining:remaining?.length},null,2));
});
