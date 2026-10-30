"use strict";
const fs=require("node:fs"),cp=require("node:child_process"),{Client}=require("pg");
const {chromium}=require("../../.local-pg-scratch/qa-playwright/node_modules/playwright-core");
const actor=JSON.parse(fs.readFileSync(".local-pg-scratch/qa-browser-accounts-20261029.json","utf8")).find(x=>x.role==="USER");
const pid=cp.execFileSync("lsof",["-t","-nP","-iTCP:3001","-sTCP:LISTEN"],{encoding:"utf8"}).trim().split("\n")[0];
const ps=cp.execFileSync("ps",["eww","-p",pid,"-o","command="],{encoding:"utf8"});
const raw=ps.match(/(?:^|\s)DATABASE_URL=([^\s]+)/)?.[1],u=new URL(raw);
if(!actor||u.hostname!=="127.0.0.1"||u.port!=="55921"||u.pathname!=="/gafus_refactor_real_work_20261024")throw Error("REFUSE_NONLOCAL_PG");
const petName="Куавесовый";
let petId=null;const evidence=[];
async function read(){
 if(!petId)return {count:0};
 const db=new Client({connectionString:raw});await db.connect();
 try{
 const p=await db.query('SELECT id,name,"ownerId","targetWeightKg" FROM "Pet" WHERE id=$1',[petId]);
 const weights=await db.query('SELECT id,"weightKg" FROM "PetWeightEntry" WHERE "petId"=$1',[petId]);
 return {count:p.rowCount,own:p.rows[0]?.ownerId===actor.id,name:p.rows[0]?.name,target:p.rows[0]?.targetWeightKg??null,entries:weights.rows.map(w=>({id:w.id,kg:w.weightKg}))};
 }finally{await db.end()}
}
async function cleanup(){
 if(!petId)return;
 const db=new Client({connectionString:raw});await db.connect();
 try{
 const p=await db.query('SELECT name,"ownerId",notes FROM "Pet" WHERE id=$1',[petId]);
 if(!p.rowCount)return;
 if(p.rows[0].ownerId!==actor.id||p.rows[0].name!==petName||p.rows[0].notes!=="Только локальная QA-проверка веса")throw Error("REFUSE_NONQA_PET_CLEANUP");
 const links=await db.query('SELECT count(*)::int n FROM "PetDocument" WHERE "petId"=$1',[petId]);
 if(links.rows[0].n)throw Error("REFUSE_PET_WITH_MEDIA_DOCS");
 await db.query('DELETE FROM "Pet" WHERE id=$1 AND "ownerId"=$2 AND name=$3',[petId,actor.id,petName]);
 console.log("ONLY_QA_PET_CLEANED_IN_LOCAL_DB");
 }finally{await db.end()}
}
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"});
 try{
 const c=await browser.newContext({viewport:{width:390,height:844}});
 await c.route("**/*",r=>{const v=new URL(r.request().url());return ["localhost","127.0.0.1"].includes(v.hostname)||["data:","blob:"].includes(v.protocol)?r.continue():r.abort("blockedbyclient")});
 const page=await c.newPage(),requests=[];
 page.on("response",r=>{const path=new URL(r.url()).pathname;if(path.startsWith("/api/v1/pets")&&r.request().method()!=="GET")requests.push({path,status:r.status(),method:r.request().method()})});
 await page.goto("http://127.0.0.1:5173/login");
 await page.locator("#login-name").fill(actor.username);
 await page.locator("#login-password").fill(actor.password);
 await page.getByRole("button",{name:"Войти",exact:true}).click();
 await page.waitForURL("**/courses",{timeout:12000});
 await page.goto("http://127.0.0.1:5173/profile/addPet");
 await page.getByRole("heading",{name:"Добавить питомца"}).waitFor({timeout:10000});
 await page.locator("#g05-name").fill(petName);
 await page.locator('input[name="petType"][value="DOG"]').check();
 await page.locator("#g05-breed").fill("Метис");
 await page.locator("#g05-birthDate").fill("15.03.2020");
 await page.locator("#g05-notes").fill("Только локальная QA-проверка веса");
 await page.getByRole("button",{name:"Добавить питомца",exact:true}).click();
 await page.getByRole("heading",{name:"Питомец создан"}).waitFor({timeout:8000}).catch(async e=>{
  console.log("QA_PET_CREATE_DIAG",JSON.stringify({
   posts:requests,
   alerts:(await page.locator("[role=alert]").allTextContents()).slice(0,5).map(x=>x.slice(0,180)),
   statuses:(await page.locator("[role=status]").allTextContents()).slice(0,4).map(x=>x.slice(0,150)),
   path:new URL(page.url()).pathname,formErrors:(await page.locator("form").allTextContents()).slice(-3).map(x=>x.slice(-210))
  }));throw e;
 });
 const link=await page.getByRole("link",{name:"Открыть карточку питомца"}).getAttribute("href");
 if(!/^\/pets\/[a-zA-Z0-9_-]+$/.test(link||""))throw Error("NO_QA_PET_ID");
 petId=link.split("/").pop();
 if(!(await read()).own)throw Error("QA_PET_NOT_OWNED");
 evidence.push({viewport:"mobile",action:"create",post201:requests.some(x=>x.method==="POST"&&x.status===201),sqlOwned:true});
 console.log("QA_WEB_PET_CREATED",JSON.stringify(evidence.at(-1)));
 await page.goto("http://127.0.0.1:5173"+link);
 const weight=page.getByRole("region",{name:"История веса питомца"});
 await weight.getByRole("button",{name:"История веса",exact:true}).click();
 await weight.getByLabel("Добавить измерение, кг").fill("14.6");
 await weight.getByRole("button",{name:"Сохранить вес",exact:true}).click();
 await weight.getByText("Измерение сохранено.").waitFor({timeout:11000});
 const afterWeight=await read();
 if(afterWeight.entries.length!==1||afterWeight.entries[0].kg!==14.6)throw Error("WEIGHT_SQL_NOT_CONFIRMED");
 evidence.push({viewport:"mobile",action:"weight add",weight:14.6,sqlRows:afterWeight.entries.length,pass:true});
 await weight.getByLabel("Целевой вес, кг (пусто — сбросить цель)").fill("12.2");
 await weight.getByRole("button",{name:"Сохранить цель"}).click();
 await weight.getByText("Цель обновлена.").waitFor({timeout:11000});
 if((await read()).target!==12.2)throw Error("TARGET_SQL_NOT_CONFIRMED");
 evidence.push({viewport:"mobile",action:"target set",target:12.2,pass:true});
 await weight.getByLabel("Целевой вес, кг (пусто — сбросить цель)").fill("");
 await weight.getByRole("button",{name:"Сохранить цель"}).click();
 await weight.getByText("Цель обновлена.").waitFor({timeout:11000});
 if((await read()).target!==null)throw Error("TARGET_CLEAR_NOT_SQL_CONFIRMED");
 evidence.push({viewport:"mobile",action:"target clear",target:null,pass:true});
 page.once("dialog",d=>d.accept());
 await weight.getByRole("button",{name:/Удалить измерение от/}).click();
 await weight.getByText("Измерение удалено.").waitFor({timeout:11000});
 if((await read()).entries.length)throw Error("WEIGHT_DELETE_NOT_SQL_CONFIRMED");
 evidence.push({viewport:"mobile",action:"weight delete",sqlAbsent:true,pass:true});
 await page.getByRole("button",{name:"Удалить питомца",exact:true}).click();
 await page.getByRole("button",{name:"Да, удалить",exact:true}).click();
 await page.waitForURL("**/pets",{timeout:13000});
 if((await read()).count!==0)throw Error("QA_PET_DELETED_NOT_SQL_CONFIRMED");
 evidence.push({viewport:"mobile",action:"pet delete",sqlAbsent:true,pass:true});
 console.log("WEB_PET_WEIGHT_FULL_E2E_PASS",JSON.stringify({steps:evidence.length,requests}));
 await c.close();
 }finally{await browser.close()}
})().catch(e=>{console.log("WEB_PET_WEIGHT_E2E_ERROR",String(e.message).slice(0,240));process.exitCode=1}).finally(async()=>{
 const pre=await read().catch(()=>({count:-1}));
 if(pre.count===1)try{await cleanup()}catch(e){console.log("PET_QA_ONLY_RECOVERY_FAILED",String(e.message).slice(0,150));process.exitCode=1}
 const final=await read().catch(()=>({count:-1}));
 fs.writeFileSync(".local-pg-scratch/qa-logs/browser-20261029/pet-weight-full-e2e.json",JSON.stringify({evidence,final:{count:final.count},fullPass:evidence.length===6&&evidence.every(x=>x.pass!==false)},null,2));
 if(final.count!==0)process.exitCode=1;
});
