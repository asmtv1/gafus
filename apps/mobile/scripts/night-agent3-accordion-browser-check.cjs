/**
 * Agent 3: synthetic RN-Web presentation smoke for AccordionStep styles.
 * This tests the extracted styles/status UI in real Chromium, NOT Expo auth,
 * native navigation/timers or an iOS/Android device. All work is local.
 */
const { build } = require("esbuild");
const WebSocket = require("ws");
const { spawn } = require("node:child_process");
const { createServer } = require("node:http");
const { mkdtempSync, writeFileSync, readFileSync, rmSync } = require("node:fs");
const { resolve, join } = require("node:path");
const sleep = ms => new Promise(done => setTimeout(done, ms));
const local = mkdtempSync(resolve(process.cwd(), ".agent3-accordion-web-"));
const chromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const sitePort=48675, cdpPort=48676;
const html=`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;overflow-x:hidden"><main id="root"></main><script src="/app.js"></script></body></html>`;
writeFileSync(join(local,"index.html"),html);
const fixture = `
import React,{useState} from "react";
import {createRoot} from "react-dom/client";
import {View,Text,Pressable} from "react-native";
import {WEB,styles,STEP_STATUS_CONFIG} from "./apps/mobile/src/features/training/components/AccordionStep.presentation";
function Preview(){
 const [status,setStatus]=useState("NOT_STARTED");
 const selected=STEP_STATUS_CONFIG[status];
 return <View style={{width:"100%",maxWidth:480,padding:12,alignSelf:"center"}} testID="preview">
  <View testID="step" style={[styles.container,{backgroundColor:selected.backgroundColor}]}>
    <View style={styles.surfaceContent}>
      <View style={styles.header}><Text style={styles.stepTitleLine}>Шаг тренировки</Text></View>
      <Text testID="status" style={{color:selected.foregroundColor}}>Состояние: {status}</Text>
      <Text testID="timer" style={styles.timerDisplay}>00:05</Text>
      <Pressable accessibilityRole="button" testID="action" onPress={()=>setStatus("IN_PROGRESS")}>
        <Text>Начать</Text>
      </Pressable>
    </View>
  </View>
 </View>;
}
createRoot(document.getElementById("root")).render(<Preview/>);`;
let browser, socket, server, failed=0;
const jobs=new Map();let counter=0;
function rpc(method,params={},sessionId){
  const id=++counter;
  return new Promise((resolve,reject)=>{
    jobs.set(id,{resolve,reject});
    socket.send(JSON.stringify({id,method,params,...sessionId?{sessionId}:{}}));
  });
}
async function snapshot(sessionId){
 const {result}=await rpc("Runtime.evaluate",{
  expression:`(() => {
   const preview=document.querySelector('[data-testid="preview"]');
   const step=document.querySelector('[data-testid="step"]');
   const action=document.querySelector('[data-testid="action"]');
   const text=document.querySelector('[data-testid="status"]');
   const timer=document.querySelector('[data-testid="timer"]');
   return {
    viewport:innerWidth, scrollWidth:document.documentElement.scrollWidth,
    preview:!!preview, step:!!step, status:text?.textContent,
    timer:timer?.textContent, action:!!action,
    background:step?getComputedStyle(step).backgroundColor:null,
    stepWidth:step?.getBoundingClientRect().width,
    timerFontSize:timer?getComputedStyle(timer).fontSize:null,
    body:document.body?.innerText?.slice(0,300),
   }
  })()`,
  returnByValue:true,
 },sessionId);return result.value;
}
async function main(){
 await build({
  stdin:{contents:fixture,resolveDir:process.cwd(),sourcefile:"night-agent3-accordion-fixture.tsx",loader:"tsx"},
  bundle:true,platform:"browser",format:"iife",outfile:join(local,"app.js"),
  alias:{"react-native":"react-native-web","@/shared/config":"./apps/mobile/src/shared/config/index.ts",
    "react":"./apps/mobile/node_modules/react","react-dom":"./apps/mobile/node_modules/react-dom"},
  define:{"process.env.NODE_ENV":'"production"'},
  banner:{js:'var process = {env:{NODE_ENV:"production"}};'},
  logLevel:"silent",
 });
 server=createServer((req,res)=>{
  res.setHeader("Content-Type",req.url==="/app.js"?"text/javascript":"text/html");
  res.end(readFileSync(join(local,req.url==="/app.js"?"app.js":"index.html")));
 });
 await new Promise((done,reject)=>server.listen(sitePort,"127.0.0.1",err=>err?reject(err):done()));
 browser=spawn(chromePath,["--headless=new","--disable-gpu","--no-first-run",
  "--no-sandbox","--disable-extensions","--disable-background-networking",
  `--remote-debugging-port=${cdpPort}`,`--user-data-dir=${join(local,"chrome")}`,"about:blank"],
  {stdio:"ignore"});
 let url;
 for(let i=0;i<50;i++){
  try{url=(await (await fetch(`http://127.0.0.1:${cdpPort}/json/version`)).json()).webSocketDebuggerUrl;break}
  catch{await sleep(140)}
 }
 if(!url)throw Error("Chrome CDP unavailable");
 socket=new WebSocket(url);
 socket.on("message",raw=>{
  const m=JSON.parse(raw.toString());
  if(m.method==="Runtime.exceptionThrown")console.error("CHROME_EXCEPTION",JSON.stringify(m.params).slice(0,1500));
  if(m.id&&jobs.has(m.id)){
   const j=jobs.get(m.id);jobs.delete(m.id);
   m.error?j.reject(new Error(JSON.stringify(m.error))):j.resolve(m.result);
  }
 });
 await new Promise((done,reject)=>{socket.once("open",done);socket.once("error",reject)});
 for(const width of [1280,390]){
  const {targetId}=await rpc("Target.createTarget",{url:"about:blank"});
  const {sessionId}=await rpc("Target.attachToTarget",{targetId,flatten:true});
  await rpc("Runtime.enable",{},sessionId);
  await rpc("Emulation.setDeviceMetricsOverride",{width,height:width<500?844:800,deviceScaleFactor:1,mobile:width<500},sessionId);
  await rpc("Page.navigate",{url:`http://127.0.0.1:${sitePort}/`},sessionId);
  let before;
  for(let i=0;i<35;i++){await sleep(140);before=await snapshot(sessionId);if(before?.status?.includes("NOT_STARTED"))break}
  if(!before?.preview||!before?.action||!before?.timer||before.scrollWidth>width+2)failed++;
  await rpc("Runtime.evaluate",{expression:"document.querySelector('[data-testid=action]')?.click()"},sessionId);
  let after;
  for(let i=0;i<18;i++){await sleep(110);after=await snapshot(sessionId);if(after?.status?.includes("IN_PROGRESS"))break}
  if(!after?.status?.includes("IN_PROGRESS")||after.scrollWidth>width+2)failed++;
  console.log(JSON.stringify({width,before,after}));
  await rpc("Target.closeTarget",{targetId});
 }
 console.log(`AGENT3_ACCORDION_SYNTHETIC_CHROME_FAILURES=${failed}`);
}
main().catch(e=>{failed++;console.error(e)}).finally(async()=>{
 try{if(socket?.readyState===WebSocket.OPEN)await rpc("Browser.close")}catch{}
 try{socket?.terminate()}catch{}
 try{browser?.kill("SIGTERM")}catch{}
 try{await new Promise(done=>server?.close(done)??done())}catch{}
 await sleep(320);
 rmSync(local,{recursive:true,force:true,maxRetries:15,retryDelay:250});
 process.exitCode=failed?1:0;
});
