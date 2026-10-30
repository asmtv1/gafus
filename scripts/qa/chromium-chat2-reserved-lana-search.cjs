"use strict";
const fs=require("fs"),cp=require("child_process"),{Client}=require("pg");
const {chromium}=require("../../.local-pg-scratch/qa-playwright/node_modules/playwright-core");
const actor=JSON.parse(fs.readFileSync(".local-pg-scratch/qa-browser-accounts-20261029.json","utf8")).find(a=>a.role==="USER");
const pid=cp.execFileSync("lsof",["-t","-nP","-iTCP:3003","-sTCP:LISTEN"],{encoding:"utf8"}).trim().split("\n")[0];
const cmd=cp.execFileSync("ps",["eww","-p",pid,"-o","command="],{encoding:"utf8"});
const raw=cmd.match(/(?:^|\s)DATABASE_URL=([^\s]+)/)?.[1],u=new URL(raw);
if(u.hostname!=="127.0.0.1"||u.port!=="55921"||u.pathname!=="/gafus_refactor_real_work_20261024"||!actor)throw Error("REFUSE_NONLOCAL_QA_DB");
(async()=>{
 const db=new Client({connectionString:raw});await db.connect();let nameExists=false;
 try{const q=await db.query('SELECT count(*)::int n FROM "User" WHERE username=$1',["lana"]);nameExists=q.rows[0].n===1}
 finally{await db.end()}
 if(!nameExists)throw Error("LANA_ABSENT_FROM_ISOLATED_TEST_CLONE_CANNOT_VERIFY");
 const b=await chromium.launch({headless:true,executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"});
 try{
 const c=await b.newContext({viewport:{width:390,height:844}});let network=[],unsafeWrites=0;
 await c.route("**/*",r=>{const url=new URL(r.request().url());return ["127.0.0.1","localhost"].includes(url.hostname)||["data:","blob:"].includes(url.protocol)?r.continue():r.abort("blockedbyclient")});
 const p=await c.newPage();
 p.on("request",r=>{const x=new URL(r.url()).pathname;if(x.startsWith("/api/v1/chats/")&&r.method()!=="GET")unsafeWrites++});
 await p.goto("http://127.0.0.1:5173/login");
 await p.locator("#login-name").fill(actor.username);await p.locator("#login-password").fill(actor.password);
 await p.getByRole("button",{name:"Войти",exact:true}).click();await p.waitForURL("**/courses",{timeout:13000});
 await p.goto("http://127.0.0.1:5173/chats");await p.getByRole("heading",{name:"Сообщения",exact:true}).waitFor({timeout:13000});
 const cookie=p.getByRole("button",{name:"Отклонить",exact:true});if(await cookie.isVisible().catch(()=>false))await cookie.click();
 await p.getByRole("button",{name:"Новое сообщение"}).click();
 const input=p.getByRole("textbox",{name:"Поиск"});
 const wait=p.waitForResponse(r=>r.request().method()==="GET" && new URL(r.url()).pathname==="/api/v1/chats/users" && new URL(r.url()).searchParams.get("q")==="lana",{timeout:13000});
 await input.fill("lana");const response=await wait;
 const payload=await response.json();
 const matches=(payload?.data??[]).map(x=>x.username);
 const strictFiltered=matches.every(x=>x.toLowerCase()!=="lana");
 await p.getByRole("heading",{name:"Написать пользователю"}).waitFor({timeout:12000});
 const pageShowsForbidden=await p.locator("button").filter({hasText:/^lana$/i}).count()===0;
 if(response.status()!==200||!payload.success||!strictFiltered||!pageShowsForbidden||unsafeWrites!==0)throw Error("QA_LANA_SEARCH_BYPASS_OR_WRITE");
 console.log("QA_LANA_DIRECT_SEARCH_UI_DENIED_PASS",{qaMobile:390,apiHttp200:true,reservedTargetExists:true,excludedFromSearch:true,uiNoDirectAction:true,chatWrites:0});
 fs.writeFileSync(".local-pg-scratch/qa-logs/browser-20261029/chat2-lana-search-gate.json",JSON.stringify({http:200,reservedExisting:true,searchExcluded:true,uiNoDirectAction:true,noMutations:true},null,2));
 await c.close();
 }finally{await b.close()}
})().catch(e=>{console.log("QA_LANA_SEARCH_READONLY_ERROR",String(e.message).slice(0,200));process.exitCode=1});
