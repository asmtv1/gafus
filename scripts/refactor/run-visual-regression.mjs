/** Self-contained local-only Vite + Playwright screenshot regression runner.
 * Independent from the Hono server, external API and production data.
 * Example: pnpm --dir apps/web-vite test:visual
 */
import { spawn } from "node:child_process";
import { realpathSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as sleep } from "node:timers/promises";
import { connect } from "node:net";

const root="/Users/asmtv1/Desktop/gafus-refactor";
const here=resolve(fileURLToPath(import.meta.url),"..");
if(realpathSync(resolve(here,"../.."))!==root||
   !realpathSync(process.cwd()).startsWith(root+"/")&&realpathSync(process.cwd())!==root)
 throw new Error("Visual test must run inside the approved Refactor root");
// Exact copies are pinned before accepting screenshot baselines.
const { spawnSync }=await import("node:child_process");
const check=spawnSync(process.execPath,
 [resolve(root,"scripts/refactor/check-vite-assets.mjs")],
 {cwd:root,stdio:"inherit"});
if(check.status!==0)throw new Error("Legacy UI assets have diverged");
const port=5187;
// A foreign visual Vite on this fixed port could satisfy readiness and
// produce a misleading PASS. Refuse before opening another Vite or snapshots.
const foreignListener=await new Promise(resolve=>{
 const socket=connect({host:"127.0.0.1",port});
 let settled=false;
 const done=occupied=>{
  if(settled)return;
  settled=true;
  socket.destroy();
  resolve(occupied);
 };
 socket.setTimeout(1500,()=>done(true));
 socket.once("connect",()=>done(true));
 socket.once("error",error=>done(error?.code!=="ECONNREFUSED"));
});
if(foreignListener)throw Error("VISUAL_RUNNER_DENIED:port_5187_occupied");
const origin=`http://127.0.0.1:${port}`;
const browser=resolve(root,".local-browser-mcp/.cache/browsers/chromium_headless_shell-1247/chrome-headless-shell-mac-arm64/chrome-headless-shell");
if(!existsSync(browser)||!realpathSync(browser).startsWith(root+"/"))
 throw new Error("The isolated Refactor Chromium is missing. See docs/refactor/UI_VISUAL_PARITY.md");
const cwd=resolve(root,"apps/web-vite");
const env={...process.env,GAFUS_VISUAL_PORT:String(port)};
let server;
let interrupted=false;
const stop=()=>{
 if(!server||server.exitCode!==null||server.signalCode!==null)return;
 server.kill("SIGTERM");
};
for(const name of ["SIGINT","SIGTERM"])
 process.on(name,()=>{interrupted=true;stop();});
try{
 server=spawn("pnpm",["exec","vite","--config","vite.config.mjs",
  "--host","127.0.0.1","--port",String(port),"--strictPort"],
  {cwd,env,stdio:["ignore","pipe","pipe"]});
 let logs="";
 server.stdout.on("data",x=>{logs+=(String(x)).slice(-400);logs=logs.slice(-3200);});
 server.stderr.on("data",x=>{logs+=(String(x)).slice(-400);logs=logs.slice(-3200);});
 let ready=false;
 for(let i=0;i<80;i++){
  if(interrupted)throw Error("Visual runner interrupted");
  if(server.exitCode!==null)throw Error(`Vite quit early: ${logs}`);
  try{
   const controller=new AbortController();
   const wait=setTimeout(()=>controller.abort(),600);
   try{
    const response=await fetch(origin+"/",{signal:controller.signal});
    if(response.ok){ready=true;break;}
   }finally{clearTimeout(wait);}
  }catch{ /* loopback server not ready yet */ }
  await sleep(180);
 }
 if(!ready)throw Error(`Vite did not start: ${logs}`);
 const args=[resolve(root,"scripts/refactor/visual-regression.mjs")];
 if(process.argv.includes("--update"))args.push("--update");
 const result=await new Promise((done,reject)=>{
  const child=spawn(process.execPath,args,{cwd:root,env,stdio:"inherit"});
  child.once("error",reject);
  child.once("exit",(code,signal)=>done({code,signal}));
 });
 if(result.code!==0)process.exitCode=result.code??1;
}finally{
 stop();
 if(server&&server.exitCode===null)await Promise.race([
  new Promise(done=>server.once("exit",done)), sleep(2500)
 ]);
}
