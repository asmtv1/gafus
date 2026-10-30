"use strict";
const fs=require("fs"),cp=require("child_process"),{Client}=require("pg"),{chromium}=require("../../.local-pg-scratch/qa-playwright/node_modules/playwright-core");
const people=JSON.parse(fs.readFileSync(".local-pg-scratch/qa-browser-accounts-20261029.json","utf8"));
const a=people.find(x=>x.role==="USER"),b=people.find(x=>x.role==="TRAINER");
if(!a||!b||a.id===b.id||b.username==="lana")throw Error("REFUSE_NON_QA_PEOPLE");
const pid=cp.execFileSync("lsof",["-t","-nP","-iTCP:3003","-sTCP:LISTEN"],{encoding:"utf8"}).trim().split("\n")[0];
const proc=cp.execFileSync("ps",["eww","-p",pid,"-o","command="],{encoding:"utf8"}),raw=proc.match(/(?:^|\s)DATABASE_URL=([^\s]+)/)?.[1],u=new URL(raw);
if(u.hostname!=="127.0.0.1"||u.port!=="55921"||u.pathname!=="/gafus_refactor_real_work_20261024")throw Error("REFUSE_REMOTE_DB");
const checks=[];let initialBlock=false;
async function db(fn){const c=new Client({connectionString:raw});await c.connect();try{return await fn(c)}finally{await c.end()}}
async function snapshot(){return db(async c=>{
 const blocked=await c.query('SELECT "blockerId","blockedId" FROM "Chat2Block" WHERE ("blockerId"=$1 AND "blockedId"=$2) OR ("blockerId"=$2 AND "blockedId"=$1)',[a.id,b.id]);
 const rooms=await c.query('SELECT id,kind,"createdById" FROM "Chat2Conversation" WHERE "directKey"=$1',['dm:'+ [a.id,b.id].sort().join(':')]);
 return {blocked:blocked.rows,rooms:rooms.rows};
})}
async function cleanup(){
 const x=await snapshot();
 if(x.blocked.some(z=>z.blockerId!==a.id||z.blockedId!==b.id))throw Error("REFUSE_OTHER_DIRECTION_BLOCK");
 await db(async c=>{
 await c.query("BEGIN");try{
 if(x.rooms.length>1)throw Error("REFUSE_MORE_THAN_ONE_DIRECT_ROOM");
 if(x.rooms.length===1){
  const r=x.rooms[0];
  if(r.kind!=="DIRECT"||r.createdById!==b.id)throw Error("REFUSE_UNKNOWN_DIRECT_OWNER");
  const members=await c.query('SELECT "userId" FROM "Chat2Member" WHERE "conversationId"=$1',[r.id]);
  const msg=await c.query('SELECT count(*)::int n FROM "Chat2Message" WHERE "conversationId"=$1',[r.id]);
  const media=await c.query('SELECT count(*)::int n FROM "Chat2Media" WHERE "conversationId"=$1',[r.id]);
  const reports=await c.query('SELECT count(*)::int n FROM "Chat2Report" WHERE "conversationId"=$1',[r.id]);
  if(members.rowCount!==2||members.rows.some(z=>![a.id,b.id].includes(z.userId))||msg.rows[0].n||media.rows[0].n||reports.rows[0].n)throw Error("REFUSE_ROOM_WITH_NONQA_CONTENT");
  await c.query('DELETE FROM "Chat2Conversation" WHERE id=$1 AND kind=$2 AND "createdById"=$3',[r.id,"DIRECT",b.id]);
 }
 if(x.blocked.length)await c.query('DELETE FROM "Chat2Block" WHERE "blockerId"=$1 AND "blockedId"=$2',[a.id,b.id]);
 await c.query("COMMIT");
 }catch(e){await c.query("ROLLBACK").catch(()=>{});throw e}
 });
 const final=await snapshot();if(final.rooms.length||final.blocked.length)throw Error("QA_BLOCK_CLEANUP_NOT_EMPTY");
 console.log("QA_DIRECT_BLOCK_PAIR_OWN_FIXTURES_ZERO");
}
async function browserContext(browser,actor){
 const ctx=await browser.newContext({viewport:{width:390,height:844}});
 await ctx.route("**/*",r=>{const u=new URL(r.request().url());return ["127.0.0.1","localhost"].includes(u.hostname)||["data:","blob:"].includes(u.protocol)?r.continue():r.abort("blockedbyclient")});
 const p=await ctx.newPage();
 await p.goto("http://127.0.0.1:5173/login");
 await p.locator("#login-name").fill(actor.username);await p.locator("#login-password").fill(actor.password);
 await p.getByRole("button",{name:"Войти",exact:true}).click();await p.waitForURL("**/courses",{timeout:13000});
 return {ctx,p};
}
async function post(page,endpoint,body){
 return page.evaluate(async({endpoint,body})=>{
 const res=await fetch(endpoint,{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
 const payload=await res.json().catch(()=>null);
 return {http:res.status,code:payload?.code??null};
 },{endpoint,body});
}
(async()=>{
 const original=await snapshot();if(original.rooms.length||original.blocked.length)throw Error("REFUSE_EXISTING_QA_RELATION");
 const browser=await chromium.launch({headless:true,executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"});
 try{
 const first=await browserContext(browser,a),second=await browserContext(browser,b);
 try{
 const yes=await post(first.p,"/api/v1/chats/block",{userId:b.id,blocked:true});
 const blocked=await snapshot();
 if(yes.http!==200||blocked.blocked.length!==1||blocked.blocked[0].blockerId!==a.id)throw Error("QA_BLOCK_NOT_PERSISTED");
 checks.push({step:"synthetic user blocked synthetic trainer",status:200,sql:true,pass:true});
 const forbidden=await post(second.p,"/api/v1/chats/direct",{userId:a.id});
 const during=await snapshot();
 if(forbidden.http!==403||during.rooms.length!==0)throw Error("QA_BLOCK_DID_NOT_FORBID_DM");
 checks.push({step:"blocked trainer cannot create direct",status:403,noRoom:true,pass:true});
 const undo=await post(first.p,"/api/v1/chats/block",{userId:b.id,blocked:false});
 if(undo.http!==200||(await snapshot()).blocked.length)throw Error("QA_UNBLOCK_NOT_PERSISTED");
 checks.push({step:"unblock QA pair",status:200,sqlEmpty:true,pass:true});
 const created=await post(second.p,"/api/v1/chats/direct",{userId:a.id});
 const after=await snapshot();
 if(created.http!==201||after.rooms.length!==1||after.rooms[0].createdById!==b.id||after.blocked.length)throw Error("QA_DIRECT_NOT_RESTORED");
 checks.push({step:"trainer direct permission restored",status:201,qaRoom:true,pass:true});
 for(const c of checks)console.log("QA_CHAT2_BLOCK_ACCESS_STEP_PASS",JSON.stringify(c));
 }finally{await first.ctx.close();await second.ctx.close()}
 }finally{await browser.close()}
})().catch(e=>{console.log("QA_CHAT2_BLOCK_ACCESS_ERROR",String(e.message).slice(0,230));process.exitCode=1}).finally(async()=>{
 try{await cleanup()}catch(e){console.log("QA_CHAT2_BLOCK_OWN_CLEANUP_ERROR",String(e.message).slice(0,200));process.exitCode=1}
 fs.writeFileSync(".local-pg-scratch/qa-logs/browser-20261029/chat2-block-qa-pair.json",JSON.stringify({checks},null,2));
});
