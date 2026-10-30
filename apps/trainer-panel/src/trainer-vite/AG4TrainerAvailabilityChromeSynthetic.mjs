import {createServer} from "vite";
import puppeteer from "puppeteer";
import {mkdirSync,existsSync,writeFileSync} from "node:fs";
import {resolve} from "node:path";
const root="/Users/asmtv1/Desktop/gafus-refactor";
const dir=resolve(root,"apps/trainer-panel/src/vite-preparation/.ag4-trainer-availability-chrome-v2-20261017");
if(existsSync(dir))throw Error("AG4_AVAILABILITY_CHROME_ALREADY_EXISTS");
mkdirSync(dir);
for(const sub of ["profile","tmp","cache","crashes"])mkdirSync(resolve(dir,sub));
process.env.TMPDIR=resolve(dir,"tmp")+"/";
const vite=await createServer({
 configFile:resolve(root,"apps/trainer-panel/src/vite-preparation/vite.config.ts"),
 server:{host:"127.0.0.1",port:4181,strictPort:true}
});
let browser;
const results=[];
try{
 await vite.listen();
 browser=await puppeteer.launch({
  executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  userDataDir:resolve(dir,"profile"),headless:true,
  args:["--no-first-run","--no-default-browser-check","--disable-sync",
   "--disable-background-networking","--disable-extensions","--disable-component-update",
   "--disk-cache-dir="+resolve(dir,"cache"),"--crash-dumps-dir="+resolve(dir,"crashes")]
 });
 for(const {label,width,height} of [
  {label:"desktop1280",width:1280,height:810},
  {label:"mobile360",width:360,height:760}
 ]){
  const page=await browser.newPage(),errs=[];
  page.on("pageerror",err=>errs.push(String(err)));
  page.on("request",r=>{
   if(!r.url().startsWith("http://127.0.0.1:4181/") &&
      !r.url().startsWith("data:"))errs.push("FOREIGN_REQUEST "+r.url());
  });
  await page.setViewport({width,height,deviceScaleFactor:1});
  await page.evaluateOnNewDocument(()=>{
   let reads=0,writes=0;
   let endTime="12:00";
   const fixture=()=>({
    slotDurationMin:30,
    rules:[{id:"rule-1",weekday:1,startTime:"09:00",endTime,isWorkingDay:true}],
    dayOffs:[{id:"off-1",date:"2026-10-21",reason:"Отпуск"}],
    exceptions:[{id:"ex-1",startAtUtc:"2026-10-22T12:00:00Z",
      endAtUtc:"2026-10-22T13:00:00Z",reason:"Другое время"}]
   });
   const f=async(path,opts)=>{
    if(String(path)!=="/api/v1/consultations/trainer/availability")
      throw Error("WRONG_API_PATH");
    if(opts?.method==="PUT"){
     writes++;
     const body=JSON.parse(String(opts.body));
     if(body.rules?.length!==1||body.rules[0]?.endTime!=="13:30")
      throw Error("INVALID_PUT_BODY");
     endTime=body.rules[0].endTime;
     return new Response(JSON.stringify({success:true,data:{}}),{
      status:200,headers:{"cache-control":"private, no-store"}});
    }
    if(opts?.method==="GET"){
     reads++;
     return new Response(JSON.stringify({success:true,data:fixture()}),{
      status:200,headers:{"cache-control":"private, no-store"}});
    }
    throw Error("MUTATION_OUT_OF_SCOPE");
   };
   Object.defineProperty(window,"__AG4_TRAINER_TEST_SESSION__",{value:{
    actor:{id:"trainer-chrome",role:"TRAINER"},token:"synthetic-never-real-JWT",
    fetchImpl:f
   }});
   Object.defineProperty(window,"__AG4_AVAILABILITY_COUNTS__",{value:()=>({reads,writes,endTime})});
  });
  await page.goto("http://127.0.0.1:4181/main-panel/consultations/availability",{
   waitUntil:"networkidle0"
  });
  await page.waitForFunction(()=>document.body.textContent?.includes("Продолжительность слота: 30 мин."));
  const initial=await page.evaluate(()=>({
   body:document.body.textContent,width:document.documentElement.scrollWidth,
   intervals:document.querySelectorAll("fieldset").length,
   calls:window.__AG4_AVAILABILITY_COUNTS__()
  }));
  if(initial.intervals!==1||initial.calls.reads!==1||initial.calls.writes!==0||
   !initial.body.includes("Отпуск")||!initial.body.includes("Другое время")||
   initial.width>width)throw Error("BAD_INIT "+label+JSON.stringify(initial));
  await page.screenshot({path:resolve(dir,label+"-initial.png"),fullPage:true});
  await page.$eval('input[aria-label="Окончание 1"]',el=>{
   const native=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set;
   native.call(el,"13:30");
   el.dispatchEvent(new Event("input",{bubbles:true}));
   el.dispatchEvent(new Event("change",{bubbles:true}));
  });
  const btn=await page.evaluate(()=>{
   const b=[...document.querySelectorAll("button")]
    .find(x=>x.textContent?.trim()==="Сохранить расписание");
   if(!b)return false;b.click();return true;
  });
  if(!btn)throw Error("NO_SAVE_BUTTON");
  await page.waitForFunction(()=>document.body.textContent?.includes("Расписание подтверждено сервером"));
  const final=await page.evaluate(()=>({
   counts:window.__AG4_AVAILABILITY_COUNTS__(),
   width:document.documentElement.scrollWidth,
   time:document.querySelector('input[aria-label="Окончание 1"]')?.value,
   message:document.body.textContent?.includes("Расписание подтверждено сервером")
  }));
  if(final.counts.reads!==2||final.counts.writes!==1||
    final.counts.endTime!=="13:30"||final.time!=="13:30"||
    !final.message||final.width>width||errs.length)
    throw Error("BAD_SAVE "+label+JSON.stringify({final,errs}));
  await page.screenshot({path:resolve(dir,label+"-verified.png"),fullPage:true});
  results.push({label,width,height,initialGET:1,verifiedGET:2,PUT:1,
    readback:true,errors:errs,horizontalOverflow:final.width>width,
    scope:"actual Chrome/Vite UI + injected HTTP mock; no SQL/TLS/backend mutation"});
  await page.close();
 }
 writeFileSync(resolve(dir,"evidence.json"),JSON.stringify({
  kind:"AG4_TRAINER_AVAILABILITY_CHROME_SYNTHETIC_V1",
  timestampUTC:new Date().toISOString(),results
 },null,2)+"\n");
 console.log("AG4_AVAILABILITY_CHROME_PASS",JSON.stringify(results));
}finally{
 if(browser)await browser.close();
 await vite.close();
}
