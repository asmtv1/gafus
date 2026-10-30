"use strict";
const fs=require("fs"),cp=require("child_process"),{Client}=require("pg"),{chromium}=require("../../.local-pg-scratch/qa-playwright/node_modules/playwright-core");
const a=JSON.parse(fs.readFileSync(".local-pg-scratch/qa-browser-accounts-20261029.json","utf8")).find(x=>x.role==="TRAINER");
const pid=cp.execFileSync("lsof",["-t","-nP","-iTCP:3001","-sTCP:LISTEN"],{encoding:"utf8"}).trim().split("\n")[0],raw=cp.execFileSync("ps",["eww","-p",pid,"-o","command="],{encoding:"utf8"}).match(/(?:^|\s)DATABASE_URL=([^\s]+)/)?.[1],u=new URL(raw);
if(u.hostname!=="127.0.0.1"||u.port!=="55921"||!a)throw Error("UNSAFE_QA_DB");
const fakeId="c"+"a".repeat(24);
(async()=>{
 const db=new Client({connectionString:raw});await db.connect();try{const r=await db.query('SELECT count(*)::int n FROM "TrainerNote" WHERE id=$1',[fakeId]);if(r.rows[0].n)throw Error("REFUSE_EXISTING_NOTE_ID")}finally{await db.end()}
 const b=await chromium.launch({headless:true,executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"});
 try{
 const ctx=await b.newContext();await ctx.route("**/*",r=>{const u=new URL(r.request().url());return ["127.0.0.1","localhost"].includes(u.hostname)||["blob:","data:"].includes(u.protocol)?r.continue():r.abort("blockedbyclient")});
 const p=await ctx.newPage();await p.goto("http://127.0.0.1:5173/main-panel");
 await p.getByRole("heading",{name:"Вход в панель тренера"}).waitFor({timeout:13000});
 await p.getByRole("textbox",{name:"Логин"}).fill(a.username);await p.getByRole("textbox",{name:"Пароль"}).fill(a.password);
 await p.getByRole("button",{name:"Войти",exact:true}).click();
 await p.getByRole("navigation",{name:"Разделы панели тренера"}).waitFor({timeout:12000});
 const result=await p.evaluate(async fake=>{
  const res=await fetch("/api/v1/trainer/notes/manage/"+fake,{method:"DELETE",credentials:"include",cache:"no-store",headers:{"X-Gafus-Auth-Transport":"cookie"}});
  const json=await res.json().catch(()=>null);return {status:res.status,code:json?.code??null,success:json?.success??null,cache:res.headers.get("cache-control")};
 },fakeId);
 console.log("QA_MISSING_NOTE_DELETE_HTTP_CONTRACT",JSON.stringify(result));
 await ctx.close();
 }finally{await b.close()}
})().catch(e=>{console.log("QA_DELETE_GUARD_DIAG_ERROR",String(e.message).slice(0,190));process.exitCode=1});
