"use strict";
const fs=require("node:fs");
const {chromium}=require("../../.local-pg-scratch/qa-playwright/node_modules/playwright-core");
const actor=JSON.parse(fs.readFileSync(".local-pg-scratch/qa-browser-accounts-20261029.json","utf8")).find(x=>x.role==="ADMIN");
if(!actor)throw Error("MISSING_QA_ADMIN");
let rootPage=null,initial=null,afterToggle=null;
const proof=[],requests=[];
const endpoint="/api/v1/admin/feature-flags";
async function read(p) {
 const result=await p.evaluate(async path=>{
  const r=await fetch(path,{credentials:"same-origin"});
  const data=await r.json().catch(()=>null);
  return {http:r.status,data:data?.data??null};
 },endpoint);
 if(result.http!==200||!result.data?.revision)throw Error("FLAGS_READ_HTTP_NOT_OK");
 return result.data;
}
async function put(p,draft){
 return p.evaluate(async({path,payload})=>{
  const r=await fetch(path,{credentials:"same-origin",method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
  return {http:r.status};
 },{path:endpoint,payload:draft});
}
async function login(p){
 await p.goto("http://127.0.0.1:5173/login");
 await p.locator("#login-name").fill(actor.username);
 await p.locator("#login-password").fill(actor.password);
 await p.getByRole("button",{name:"Войти",exact:true}).click();
 await p.waitForURL("**/courses",{timeout:13000});
}
async function toggleInUi(p,toValue){
 await p.goto("http://127.0.0.1:5173/main-panel/feature-flags",{waitUntil:"domcontentloaded"});
 await p.getByRole("heading",{name:"Флаги мобильного приложения"}).waitFor({timeout:14000});
 const fieldset=p.getByRole("group",{name:"Режим ревью"});
 const checkbox=fieldset.getByRole("checkbox",{name:"Подсказка об оплате"});
 await checkbox.waitFor({timeout:11000});
 if(await checkbox.isChecked()===toValue)throw Error("FLAGS_UI_ALREADY_AT_TARGET");
 if(toValue)await checkbox.check();else await checkbox.uncheck();
 p.once("dialog",d=>d.accept());
 await p.getByRole("button",{name:"Сохранить флаги"}).click();
 await p.getByText("Настройки проверены повторным чтением с сервера").waitFor({timeout:12000});
}
async function safeRestore(){
 if(!initial||!rootPage)return;
 const current=await read(rootPage);
 const target=initial.review.iosRuCardPaymentHint;
 if(current.review.iosRuCardPaymentHint===target){console.log("QA_FEATURE_FLAG_RESTORED_OR_UNCHANGED");return}
 if(!afterToggle||current.revision!==afterToggle.revision||current.review.iosRuCardPaymentHint!==!target)
   throw Error("REFUSE_CONCURRENT_UNRELATED_FEATURE_FLAG_CHANGE");
 const payload={revision:current.revision,iosReviewVersion:initial.iosReviewVersion,
  released:initial.released,review:initial.review,global:initial.global,rewardedAds:initial.rewardedAds};
 const response=await put(rootPage,payload);
 if(response.http!==200)throw Error("EMERGENCY_QA_FLAGS_RESTORE_HTTP_"+response.http);
 const restored=await read(rootPage);
 if(restored.review.iosRuCardPaymentHint!==target)throw Error("EMERGENCY_QA_FLAGS_RESTORE_READBACK_FAILED");
 console.log("QA_FLAGS_ONLY_OWN_TOGGLE_RESTORED_EMERGENCY");
}
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"});
 try{
 const desktop=await browser.newContext({viewport:{width:1280,height:800}});
 await desktop.route("**/*",r=>{const u=new URL(r.request().url());return ["127.0.0.1","localhost"].includes(u.hostname)||["data:","blob:"].includes(u.protocol)?r.continue():r.abort("blockedbyclient")});
 rootPage=await desktop.newPage();rootPage.on("response",r=>{const x=new URL(r.url()).pathname;if(x===endpoint&&r.request().method()==="PUT")requests.push({viewport:"desktop",status:r.status(),method:"PUT"})});
 await login(rootPage);
 initial=await read(rootPage);
 const before=initial.review.iosRuCardPaymentHint;
 if(typeof before!=="boolean")throw Error("QA_FLAGS_SCHEMA_NOT_BOOLEAN");
 await toggleInUi(rootPage,!before);
 afterToggle=await read(rootPage);
 if(afterToggle.revision!==initial.revision+1||afterToggle.review.iosRuCardPaymentHint===before)throw Error("QA_FLAGS_DESKTOP_SAVE_READBACK_FAILED");
 proof.push({viewport:"desktop",action:"review hint toggle",http200:requests.some(x=>x.status===200),casRevision:afterToggle.revision,pass:true});
 console.log("QA_ADMIN_FLAGS_DESKTOP_PASS",JSON.stringify(proof.at(-1)));
 const mobile=await browser.newContext({viewport:{width:390,height:844}});
 await mobile.route("**/*",r=>{const u=new URL(r.request().url());return ["127.0.0.1","localhost"].includes(u.hostname)||["data:","blob:"].includes(u.protocol)?r.continue():r.abort("blockedbyclient")});
 const mp=await mobile.newPage();
 try{
 await login(mp);
 const seen=await read(mp);
 if(seen.revision!==afterToggle.revision||seen.review.iosRuCardPaymentHint!==!before)throw Error("QA_MOBILE_FLAGS_READBACK_FAILED");
 await toggleInUi(mp,before);
 const restored=await read(mp);
 if(restored.revision!==afterToggle.revision+1||restored.review.iosRuCardPaymentHint!==before)throw Error("QA_FLAGS_MOBILE_RESTORE_FAILED");
 const comparable=o=>JSON.stringify({released:o.released,review:o.review,global:o.global,iosReviewVersion:o.iosReviewVersion,rewardedAds:o.rewardedAds});
 if(comparable(restored)!==comparable(initial))throw Error("QA_FLAGS_NOT_PRECISELY_RESTORED");
 proof.push({viewport:"mobile",action:"read then restore review flag",casRevision:restored.revision,sqlOrApiStateMatch:true,pass:true});
 console.log("QA_ADMIN_FLAGS_MOBILE_RESTORED_PASS",JSON.stringify(proof.at(-1)));
 }finally{await mobile.close()}
 }finally{
 try{await safeRestore()}catch(e){console.log("QA_ADMIN_FLAGS_RESTORE_BLOCKED",String(e.message).slice(0,180));process.exitCode=1}
 fs.writeFileSync(".local-pg-scratch/qa-logs/browser-20261029/admin-feature-flags-e2e.json",JSON.stringify({proof,requests,originalRevision:initial?.revision??null,allPass:proof.length===2},null,2));
 await browser.close();
 }
})().catch(e=>{console.log("QA_ADMIN_FLAGS_E2E_ERROR",String(e.message).slice(0,220));process.exitCode=1});
