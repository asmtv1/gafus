"use strict";
const fs=require("fs"),cp=require("child_process"),{Client}=require("pg"),{chromium}=require("../../.local-pg-scratch/qa-playwright/node_modules/playwright-core");
const people=JSON.parse(fs.readFileSync(".local-pg-scratch/qa-browser-accounts-20261029.json","utf8"));
const admin=people.find(x=>x.role==="ADMIN"),target=people.find(x=>x.role==="USER");
if(!admin||!target||target.id===admin.id)throw Error("REFUSE_QA_ROLES");
const pid=cp.execFileSync("lsof",["-t","-nP","-iTCP:3001","-sTCP:LISTEN"],{encoding:"utf8"}).trim().split("\n")[0];
const ps=cp.execFileSync("ps",["eww","-p",pid,"-o","command="],{encoding:"utf8"}),raw=ps.match(/(?:^|\s)DATABASE_URL=([^\s]+)/)?.[1],u=new URL(raw);
if(u.hostname!=="127.0.0.1"||u.port!=="55921"||u.pathname!=="/gafus_refactor_real_work_20261024")throw Error("REFUSE_NONLOCAL_WORK_DB");
const marker="QA_LOCAL_ADMIN_TEST_20261029";
let original=null,changed=false;const results=[];
async function db(fn){const c=new Client({connectionString:raw});await c.connect();try{return await fn(c)}finally{await c.end()}}
async function actorState(){return db(async c=>{const r=await c.query('SELECT id,username,role,phone,email FROM "User" WHERE id=$1',[target.id]);if(r.rowCount!==1||r.rows[0].role!=="USER"||r.rows[0].username!==target.username)throw Error("REFUSE_UNRELATED_QA_TARGET");return r.rows[0]})}
async function restore(){
 if(!original)return;
 const now=await actorState();
 if(now.phone===original.phone){console.log("QA_ADMIN_PHONE_ALREADY_ORIGIN");return}
 if(now.phone!==marker)throw Error("REFUSE_RESTORE_NONQA_PHONE_VALUE");
 const n=await db(c=>c.query('UPDATE "User" SET phone=$1 WHERE id=$2 AND phone=$3 AND username=$4 AND role=$5',[original.phone,target.id,marker,target.username,"USER"]));
 if(n.rowCount!==1||(await actorState()).phone!==original.phone)throw Error("QA_ADMIN_PHONE_CLEANUP_NOT_EXACT");
 console.log("QA_ADMIN_ONLY_SYNTHETIC_PHONE_NULL_RESTORED");
}
async function start(browser,vp){
 const ctx=await browser.newContext({viewport:vp==="mobile"?{width:390,height:844}:{width:1280,height:800}});
 await ctx.route("**/*",r=>{const u=new URL(r.request().url());return ["127.0.0.1","localhost"].includes(u.hostname)||["data:","blob:"].includes(u.protocol)?r.continue():r.abort("blockedbyclient")});
 const page=await ctx.newPage(),events=[];page.on("response",r=>{const path=new URL(r.url()).pathname;if(path.includes("/api/v1/admin/users")&&r.request().method()!=="GET")events.push({method:r.request().method(),status:r.status(),pathCategory:"admin-user-update"})});
 await page.goto("http://127.0.0.1:5173/main-panel/users");
 await page.getByRole("heading",{name:"Админ-панель GAFUS"}).waitFor({timeout:12500});
 await page.getByRole("textbox",{name:"Логин"}).fill(admin.username);await page.getByRole("textbox",{name:"Пароль"}).fill(admin.password);
 await page.getByRole("button",{name:"Войти",exact:true}).click();
 if(vp==="mobile")await page.getByRole("button",{name:"Открыть меню"}).click({timeout:12000});
 const adminNav=page.getByRole("navigation",{name:"Разделы админ-панели"});
 await adminNav.getByRole("link",{name:"Пользователи",exact:true}).click({timeout:12000});
 await page.getByRole("heading",{name:/Пользователи платформы/}).waitFor({timeout:14000});
 const search=page.getByRole("textbox",{name:"Поиск"});await search.fill(target.username);
 const row=page.locator("tbody tr").filter({hasText:"@"+target.username});await row.waitFor({timeout:10000});
 return {page,ctx,row,events};
}
(async()=>{
 original=await actorState();if(original.phone!==null)throw Error("REFUSE_QA_TARGET_PHONE_NOT_NULL");
 const b=await chromium.launch({headless:true,executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"});
 try{
 const first=await start(b,"mobile");try{
 await first.row.getByRole("button",{name:"Изменить"}).click();
 const editor=first.page.locator(".user-editor");await editor.waitFor({timeout:9000});
 await editor.getByRole("textbox",{name:"Телефон"}).fill(marker);
 first.page.once("dialog",d=>d.accept());
 const ack=first.page.waitForResponse(r=>r.request().method()==="PATCH" && /\/api\/v1\/admin\/users\/[^/]+$/.test(new URL(r.url()).pathname),{timeout:14000});
 await editor.getByRole("button",{name:"Сохранить",exact:true}).click();
 const response=await ack;
 if(response.status()!==200)throw Error("QA_ADMIN_UPDATE_HTTP_"+response.status());
 changed=true;
 if((await actorState()).phone!==marker)throw Error("QA_ADMIN_UI_PHONE_NOT_SQL_PERSISTED");
 results.push({viewport:"mobile",action:"patch QA USER phone",http200:true,sqlReadback:true,pass:true});
 console.log("QA_ADMIN_USER_PHONE_MOBILE_MUTATION_PASS",JSON.stringify(results.at(-1)));
 }finally{await first.ctx.close()}
 const second=await start(b,"desktop");try{
 await second.row.getByRole("button",{name:"Изменить"}).click();
 const editor=second.page.locator(".user-editor");await editor.waitFor({timeout:9000});
 if(await editor.getByRole("textbox",{name:"Телефон"}).inputValue()!==marker)throw Error("QA_ADMIN_MOBILE_READBACK_NOT_UPDATED");
 await editor.getByRole("button",{name:"Отмена"}).click();
 results.push({viewport:"desktop",action:"read QA USER phone and cancel edit",readback:true,noWrites:true,pass:true});
 console.log("QA_ADMIN_USER_PHONE_DESKTOP_READBACK_PASS",JSON.stringify(results.at(-1)));
 }finally{await second.ctx.close()}
 }finally{await b.close()}
})().catch(e=>{console.log("QA_ADMIN_USER_PHONE_E2E_ERROR",String(e.message).slice(0,240));process.exitCode=1}).finally(async()=>{
 try{await restore()}catch(e){console.log("QA_ADMIN_USER_PHONE_RESTORE_ERROR",String(e.message).slice(0,210));process.exitCode=1}
 fs.writeFileSync(".local-pg-scratch/qa-logs/browser-20261029/admin-user-phone-edit.json",JSON.stringify({results,modifiedOwnQA:changed,restoredOriginalPhone:original?.phone===null},null,2));
});
