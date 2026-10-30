import {createServer} from "vite";
import puppeteer from "puppeteer";
import {mkdirSync,writeFileSync,existsSync} from "node:fs";
import {resolve} from "node:path";
const root="/Users/asmtv1/Desktop/gafus-refactor";
const artifacts=resolve(root,"apps/trainer-panel/src/vite-preparation/.ag4-reject-chrome-20261017");
if(existsSync(artifacts))throw Error("AG4_CHROME_ARTIFACT_ALREADY_EXISTS");
mkdirSync(artifacts,{recursive:false});
for(const dir of ["profile","cache","tmp","crashes"])mkdirSync(resolve(artifacts,dir));
process.env.TMPDIR=resolve(artifacts,"tmp")+"/";
const server=await createServer({
 configFile:resolve(root,"apps/trainer-panel/src/vite-preparation/vite.config.ts"),
 server:{host:"127.0.0.1",port:4178,strictPort:true},
});
let browser;
const findings=[];
try{
 await server.listen();
 browser=await puppeteer.launch({
   executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
   headless:true,userDataDir:resolve(artifacts,"profile"),
   args:["--no-first-run","--no-default-browser-check","--disable-extensions",
      "--disable-sync","--disable-background-networking","--disable-component-update",
      "--disk-cache-dir="+resolve(artifacts,"cache"),"--crash-dumps-dir="+resolve(artifacts,"crashes")],
 });
 for(const cfg of [
  {mode:"desktop",width:1280,height:850,initial:"CONFIRMED",
   trigger:"Отменить встречу",accept:"Да, отменить встречу",reason:"  Клиенту предложено другое время  "},
  {mode:"mobile360",width:360,height:760,initial:"PENDING_TRAINER_CONFIRMATION",
   trigger:"Отклонить заявку",accept:"Да, отклонить",reason:""}
 ]){
  const page=await browser.newPage();
  const errors=[];
  page.on("pageerror",e=>errors.push(String(e)));
  page.on("request",req=>{
   if(!req.url().startsWith("http://127.0.0.1:4178/"))errors.push("NON_LOCAL_REQUEST "+req.url());
  });
  await page.setViewport({width:cfg.width,height:cfg.height,deviceScaleFactor:1});
  await page.evaluateOnNewDocument((initial)=>{
   let state=initial,reason="";
   let postCount=0,getCount=0;
   const row=()=>({
      id:"synthetic-booking-chrome",status:state,
      slot:{id:"slot-chrome",startAtUtc:"2026-10-21T09:00:00.000Z",
        endAtUtc:"2026-10-21T10:00:00.000Z",status:state==="CANCELLED_BY_TRAINER"?"FREE":"BOOKED"},
      cynologistUserId:"trainer-chrome",cancelReason:reason||null,
      confirmationDeadlineAt:"2026-10-20T09:00:00.000Z",
      createdAt:"2026-10-17T10:00:00.000Z"
   });
   const requests={get:()=>({postCount,getCount,state,reason})};
   Object.defineProperty(window,"__AG4_REJECT_BROWSER_EVIDENCE__",{value:requests});
   const fakeFetch=async(path,init)=>{
     const url=String(path);
     const isPost=init?.method==="POST";
     if(url.endsWith("/reject")&&isPost){
      postCount++;
      const body=JSON.parse(String(init.body));
      if(typeof body.reason!=="string"||body.reason.length>500)
        throw Error("BAD_POST_REASON");
      state="CANCELLED_BY_TRAINER";reason=body.reason;
      return new Response(JSON.stringify({success:true,data:{bookingId:"synthetic-booking-chrome"}}),
       {status:200,headers:{"cache-control":"private, no-store"}});
     }
     if(url.endsWith("/trainer/bookings")&&!isPost){
      getCount++;
      return new Response(JSON.stringify({success:true,data:[row()]}),
       {status:200,headers:{"cache-control":"private, no-store"}});
     }
     throw Error("UNEXPECTED_ENDPOINT "+url);
   };
   Object.defineProperty(window,"__AG4_TRAINER_TEST_SESSION__",{
      value:{actor:{role:"TRAINER",id:"trainer-chrome"},token:"synthetic-not-real-jwt",fetchImpl:fakeFetch}
   });
  },cfg.initial);
  await page.goto("http://127.0.0.1:4178/main-panel/consultations",{waitUntil:"networkidle0"});
  await page.waitForFunction(()=>document.body.textContent?.includes("Данные получены: 1"));
  const click=async text=>{
   const matched=await page.evaluate(text=>{
     const node=[...document.querySelectorAll("button")].find(x=>x.textContent?.trim()===text);
     if(!node)return false;node.click();return true;
   },text);
   if(!matched)throw Error("BUTTON_NOT_FOUND "+cfg.mode+" "+text);
  };
  const before=await page.evaluate(()=>window.__AG4_REJECT_BROWSER_EVIDENCE__.get());
  if(before.postCount!==0||before.getCount!==1)throw Error("BAD_INITIAL_FETCH "+cfg.mode);
  await click(cfg.trigger);
  await page.waitForSelector('textarea[aria-label="Причина отклонения или отмены"]');
  if(cfg.reason.trim())await page.type("textarea",cfg.reason);
  const confirmation=await page.evaluate(()=>{
   const textarea=document.querySelector("textarea");
   return {maxlength:textarea?.maxLength,visible:!!textarea,
    text:document.body.textContent?.includes("клиент получит уведомление")};
  });
  if(confirmation.maxlength!==500||!confirmation.text)throw Error("FORM_NOT_VALID "+cfg.mode);
  await page.screenshot({path:resolve(artifacts,cfg.mode+"-confirm.png"),fullPage:true});
  const beforeAccept=await page.evaluate(()=>window.__AG4_REJECT_BROWSER_EVIDENCE__.get());
  if(beforeAccept.postCount!==0)throw Error("MUTATION_BEFORE_CONFIRMATION");
  await click(cfg.accept);
  await page.waitForFunction(()=>document.body.textContent?.includes("CANCELLED_BY_TRAINER"));
  const after=await page.evaluate(()=>{
   const s=window.__AG4_REJECT_BROWSER_EVIDENCE__.get();
   return {...s,docWidth:document.documentElement.scrollWidth,
      viewportWidth:window.innerWidth,hasList:!!document.querySelector("li[data-booking-id]"),
      hasAction:[...document.querySelectorAll("button")].some(x=>
        x.textContent?.includes("Отклонить заявку")||x.textContent?.includes("Отменить встречу"))};
  });
  if(after.postCount!==1||after.getCount!==2||after.state!=="CANCELLED_BY_TRAINER"||
    !after.hasList||after.hasAction||after.docWidth>cfg.width)
      throw Error("BROWSER_ASSERTION_FAILED "+cfg.mode+" "+JSON.stringify(after));
  if(cfg.reason.trim()&&after.reason!==cfg.reason.trim())
     throw Error("REASON_TRIM_FAILED "+cfg.mode);
  if(errors.length)throw Error("BROWSER_ERRORS "+cfg.mode+" "+errors.join(";"));
  await page.screenshot({path:resolve(artifacts,cfg.mode+"-verified.png"),fullPage:true});
  findings.push({mode:cfg.mode,width:cfg.width,height:cfg.height,initial:cfg.initial,
    confirmation,after,consoleErrors:errors,transport:"synthetic Vite browser fetch in Chrome; no actual JWT, TLS or PG"});
  await page.close();
 }
 writeFileSync(resolve(artifacts,"browser-evidence.json"),
   JSON.stringify({kind:"AG4_TRAINER_REJECT_CHROME_SOURCE_SYNTHETIC_V1",
    generatedUTC:new Date().toISOString(),chromeExecutable:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    origin:"http://127.0.0.1:4178",findings},null,2)+"\n");
 console.log("AG4_CHROME_SYNTHETIC_PASS",JSON.stringify(findings));
 console.log("CHROME_ARTIFACT_ROOT",artifacts);
}finally{
 if(browser)await browser.close();
 await server.close();
}
