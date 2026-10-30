"use strict";
const fs=require("node:fs"),cp=require("node:child_process"),{Client}=require("pg");
const {chromium}=require("../../.local-pg-scratch/qa-playwright/node_modules/playwright-core");
const actors=JSON.parse(fs.readFileSync(".local-pg-scratch/qa-browser-accounts-20261029.json","utf8"));
const admin=actors.find(x=>x.role==="ADMIN"),target=actors.find(x=>x.role==="USER");
if(!admin||!target||target.username!=="qa_preprod_user_20261029")throw Error("UNEXPECTED_QA_ACCOUNTS");
const ps=cp.execFileSync("ps",["eww","-p","4514","-o","command="],{encoding:"utf8",timeout:3000});
const conn=ps.match(/(?:^|\s)DATABASE_URL=([^\s]+)/)?.[1],u=new URL(conn||"file:/");
if(u.hostname!=="127.0.0.1"||u.port!=="55921"||u.pathname!=="/gafus_refactor_real_work_20261024")throw Error("REFUSE_NONLOCAL_WORK_DB");
async function getRole(){const c=new Client({connectionString:conn});await c.connect();try{
 const r=await c.query('select role from "User" where id=$1 and username=$2',[target.id,target.username]);
 if(r.rowCount!==1)throw Error("QA_OWNER_ROLE_LOOKUP_FAILED");return r.rows[0].role;
}finally{await c.end()}}
async function recover(){const c=new Client({connectionString:conn});await c.connect();try{
 await c.query('UPDATE "User" SET role=$1 WHERE id=$2 AND username=$3 AND role=$4',["USER",target.id,target.username,"MODERATOR"]);
}finally{await c.end()}}
const results=[];
(async()=>{
 if((await getRole())!=="USER")throw Error("QA_TARGET_ROLE_PRECONDITION_FAILED");
 const b=await chromium.launch({headless:true,executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"});
 try{
 for(const [vp,w,h,expectedBefore,desired] of [["desktop",1280,800,"USER","MODERATOR"],["mobile",390,844,"MODERATOR","USER"]]){
  const ctx=await b.newContext({viewport:{width:w,height:h}});
  await ctx.route("**/*",r=>{const u=new URL(r.request().url());return ["127.0.0.1","localhost"].includes(u.hostname)||["data:","blob:"].includes(u.protocol)?r.continue():r.abort("blockedbyclient")});
  const page=await ctx.newPage(),patch=[];
  page.on("response",r=>{const u=new URL(r.url());if(u.pathname==="/api/v1/admin/users/"+target.id&&r.request().method()==="PATCH")patch.push(r.status())});
  try{
   if((await getRole())!==expectedBefore)throw Error("QA_ROLE_STATE_DRIFT");
   await page.goto("http://127.0.0.1:5173/login");
   await page.locator("#login-name").fill(admin.username);await page.locator("#login-password").fill(admin.password);
   await page.getByRole("button",{name:"Войти",exact:true}).click();
   await page.waitForURL("**/courses",{timeout:10000});
   if(!(await ctx.cookies()).some(x=>x.name==="gafus_access"))throw Error("ADMIN_LOGIN_FAILED");
   await page.goto("http://127.0.0.1:5173/main-panel/users");
   await page.locator('#admin-root input[placeholder="Имя, почта, ID, промокод"]').waitFor({timeout:13000});
   await page.locator('#admin-root input[placeholder="Имя, почта, ID, промокод"]').fill(target.username);
   const row=page.locator('#admin-root tr').filter({hasText:target.username});
   await row.getByRole("button",{name:"Изменить"}).click({timeout:8000});
   const editor=page.locator("#admin-root .user-editor");
   await editor.getByRole("combobox",{name:"Роль"}).selectOption(desired);
   page.once("dialog",d=>d.accept());
   await editor.getByRole("button",{name:"Сохранить",exact:true}).click();
   await page.waitForTimeout(600);
   const dbRole=await getRole();
   const item={app:"Admin",viewport:vp,sourceRole:expectedBefore,targetRole:desired,statuses:patch,dbRole,
       pass:patch.includes(200)&&dbRole===desired};
   results.push(item);console.log("REAL_ADMIN_ROLE_MUTATION",item);
   if(!item.pass)throw Error("ADMIN_MUTATION_NOT_CONFIRMED");
  }finally{await ctx.close()}
 }
 }finally{await b.close()}
})().catch(e=>{console.log("ADMIN_QA_ROLE_MUTATION_ERROR",String(e.message).slice(0,200));process.exitCode=1}).finally(async()=>{
 const before=await getRole().catch(()=>null);
 if(before==="MODERATOR")await recover();
 const final=await getRole().catch(()=>null);
 fs.writeFileSync(".local-pg-scratch/qa-logs/browser-20261029/admin-role-mutation.json",JSON.stringify({results,finalUserRole:final,restored:final==="USER"},null,2));
 console.log("ADMIN_QA_ROLE_RESTORED",{role:final,pass:final==="USER"});
 if(final!=="USER")process.exitCode=1;
});
