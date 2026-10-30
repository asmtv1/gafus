/** AG1 → AG2 G2 minimal Vite: existing FOUR W1 POST auth/cookie/Origin/CSRF actual Hono.
 * CORE EMAIL/PASSWORD + JWT identity are injected; never real SQL, email, JWT or browser.
 * HTTP captures opt-in only to AG1-owned, project-contained scratch. */
import {Hono} from "hono";
import {beforeEach,describe,it,expect,vi} from "vitest";
import {mkdirSync,writeFileSync} from "node:fs";
import {join} from "node:path";
const m=vi.hoisted(()=>({verify:vi.fn(),reg:vi.fn(),emailRequest:vi.fn(),emailConfirm:vi.fn(),passwordSet:vi.fn(),passwordChange:vi.fn()}));
vi.mock("@gafus/auth/jwt",()=>({verifyAccessToken:m.verify,assertCompletedUser:vi.fn(),generateAccessToken:vi.fn(),generateRefreshToken:vi.fn(),verifyRefreshToken:vi.fn()}));
vi.mock("@gafus/auth",()=>({InvalidPasswordResetTokenError:class extends Error{}}));
vi.mock("@gafus/core/services/auth",()=>({isRegistrationCompleted:m.reg,requestEmailChange:m.emailRequest,confirmEmailChangeByToken:m.emailConfirm,setPassword:m.passwordSet,changePassword:m.passwordChange,REGISTRATION_CHANNEL:{WEB:"WEB",IOS:"IOS",ANDROID:"ANDROID"}}));
vi.mock("@gafus/core/services/appFeatureFlags",()=>({APP_FEATURE_MOBILE_VK_LOGIN_IOS:"mobile_vk_login_ios",getMobileFeatureFlagEnabled:vi.fn()}));
vi.mock("@gafus/logger",()=>({createWebLogger:()=>({info:vi.fn(),error:vi.fn(),warn:vi.fn(),debug:vi.fn()})}));
import {authRoutes} from "./auth";
import {corsMiddleware} from "../../middleware/cors";
const CAPTURE="/Users/asmtv1/Desktop/gafus-refactor/apps/api/.g1-ag2-w1-fourpost-ag1-20261017/captures";
const enabled=process.env.G1_AG2_FOURPOST_CAPTURE_DIR===CAPTURE&&process.env.TMPDIR?.startsWith("/Users/asmtv1/Desktop/gafus-refactor/apps/api/.g1-ag2-w1-fourpost-ag1-20261017/tmp/");
const secret="SyntheticNewPass2",current="CurrentPass3",token="x".repeat(43),mail="new@sample.test";
const options=[
 {id:"EC_REQUEST",path:"/email-change-request",body:{newEmail:mail},fn:"emailRequest"},
 {id:"EC_CONFIRM",path:"/email-change-confirm",body:{token},fn:"emailConfirm"},
 {id:"PWD_SET",path:"/set-password",body:{newPassword:secret},fn:"passwordSet"},
 {id:"PWD_CHANGE",path:"/change-password",body:{currentPassword:current,newPassword:secret},fn:"passwordChange"},
] as const;
type Route=typeof options[number];type Scenario={name:string;origin?:string;mode?:"bearer"|"cookie"|"guest"|"badScheme"|"bothValid"|"bothInvalidBearer"|"expired"|"pending";body?:unknown;raw?:string;contentType?:string;method?:string;csrfHeader?:string};
function makeApp(){const app=new Hono();app.use("/api/v1/auth/*",corsMiddleware);app.route("/api/v1/auth",authRoutes);return app;}
function calls(route:Route){return m[route.fn].mock.calls.length;}
async function send(route:Route,scenario:Scenario){
 const method=scenario.method??"POST",path="/api/v1/auth"+route.path;
 const mode=scenario.mode??"bearer",hdr:Record<string,string>={};
 if(mode==="bearer")hdr.authorization="Bearer synthetic-A";
 else if(mode==="cookie")hdr.cookie="gafus_access=synthetic-A";
 else if(mode==="badScheme")hdr.authorization="Basic wrong";
 else if(mode==="bothValid"){hdr.cookie="gafus_access=synthetic-B";hdr.authorization="Bearer synthetic-A";}
 else if(mode==="bothInvalidBearer"){hdr.cookie="gafus_access=synthetic-A";hdr.authorization="Bearer synthetic-invalid";}
 else if(mode==="expired")hdr.authorization="Bearer synthetic-expired";
 else if(mode==="pending")hdr.authorization="Bearer synthetic-pending";
 if(scenario.origin!==undefined)hdr.origin=scenario.origin;
 if(scenario.csrfHeader!==undefined)hdr["x-csrf-token"]=scenario.csrfHeader;
 const bodyText=scenario.raw??JSON.stringify(scenario.body??route.body);
 if(method==="POST")hdr["content-type"]=scenario.contentType??"application/json";
 const before=calls(route);
 const response=await makeApp().request("http://test.local"+path,{method,headers:hdr,...(method==="POST"?{body:bodyText}:{})});
 const responseText=await response.text();let obj:unknown;try{obj=JSON.parse(responseText)}catch{obj=null}
 for(const sensitive of [secret,current,token,"SYNTHETIC_PG_FAILURE"]){expect(responseText).not.toContain(sensitive);}
 if(method==="POST"){
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(response.headers.get("referrer-policy")).toBe("no-referrer");
 }
 return {routeId:route.id,scenario:scenario.name,method,path,status:response.status,body:obj,
  request:{authMode:mode,origin:scenario.origin??null,csrfHeaderProvided:Boolean(scenario.csrfHeader),contentType:hdr["content-type"]??null,bodyFieldNames:Object.keys(scenario.body??route.body),secrets:"OMITTED",authorizationValue:"OMITTED",cookieValue:"OMITTED"},
  responseHeaders:{"cache-control":response.headers.get("cache-control"),"referrer-policy":response.headers.get("referrer-policy"),"access-control-allow-origin":response.headers.get("access-control-allow-origin"),"access-control-allow-credentials":response.headers.get("access-control-allow-credentials"),"set-cookie":response.headers.get("set-cookie")===null?null:"PRESENT_REDACTED","retry-after":response.headers.get("retry-after")},
  coreCallDelta:calls(route)-before};
}
async function save(id:string,records:Awaited<ReturnType<typeof send>>[],notes:string[]=[]){mkdirSync(CAPTURE,{recursive:true});writeFileSync(join(CAPTURE,id+".json"),JSON.stringify({caseId:id,provenance:"ACTUAL_HONO_AUTH_ROUTES_CORS_ORIGIN_VALIDATION_MIDDLEWARE__CORE_AND_JWT_MOCKED",transport:"IN_PROCESS_NOT_TCP",sql:false,externalMail:false,appRateLimiterMounted:false,observations:records,notes},null,2)+"\n",{flag:"wx"});}
beforeEach(()=>{
 vi.clearAllMocks();m.verify.mockImplementation(async(s:string)=>s==="synthetic-A"||s==="synthetic-B"||s==="synthetic-pending"?{id:s.split("-").at(-1),username:"synthetic",role:"USER"}:null);
 m.reg.mockImplementation(async(id:string)=>id!=="pending");
 for(const fn of [m.emailRequest,m.emailConfirm,m.passwordSet,m.passwordChange])fn.mockResolvedValue(undefined);
});
(enabled?describe:describe.skip)("Four W1 POST methods after shared auth.ts / CORS: exact cookie+Bearer+Origin / CSRF",()=>{
 for(const route of options){
  it(`${route.id} valid Bearer without Origin accepted; no auth cookie needed`,async()=>{
   const x=await send(route,{name:"bearer_without_origin"});expect(x.status).toBe(200);expect(x.body).toEqual({success:true});expect(x.coreCallDelta).toBe(1);await save(route.id+"_01",[x]);
  });
  it(`${route.id} cookie missing Origin: 403 on protected, public confirm remains token capability`,async()=>{
   const x=await send(route,{name:"cookie_missing_origin",mode:"cookie"});expect(x.status).toBe(route.id==="EC_CONFIRM"?200:403);expect(x.coreCallDelta).toBe(route.id==="EC_CONFIRM"?1:0);await save(route.id+"_02",[x]);
  });
  it(`${route.id} cookie exact HTTPS trusted origin accepted, substring attacker denied if protected`,async()=>{
   const good=await send(route,{name:"cookie_trusted_origin",mode:"cookie",origin:"https://gafus.ru"});
   const evil=await send(route,{name:"cookie_bad_substring_origin",mode:"cookie",origin:"https://gafus.ru.attacker.invalid"});
   expect(good.status).toBe(200);expect(evil.status).toBe(route.id==="EC_CONFIRM"?200:403);
   expect(good.responseHeaders["access-control-allow-origin"]).toBe("https://gafus.ru");
   expect(evil.responseHeaders["access-control-allow-origin"]).toBeNull();await save(route.id+"_03",[good,evil]);
  });
  it(`${route.id} localhost cookie Origin: denied protected even though CORS permits local browser origin`,async()=>{
   const x=await send(route,{name:"cookie_localhost_not_trusted",mode:"cookie",origin:"http://localhost:3000"});
   expect(x.status).toBe(route.id==="EC_CONFIRM"?200:403);
   expect(x.responseHeaders["access-control-allow-origin"]).toBe("http://localhost:3000");
   await save(route.id+"_04",[x],["LOCALHOST CORS allow DOES NOT equal CSRF cookie origin allow"]);
  });
  it(`${route.id} valid Bearer wins over B cookie and bad Origin; do not fall back to cookie for invalid Bearer`,async()=>{
   const a=await send(route,{name:"valid_bearer_priority",mode:"bothValid",origin:"https://evil.invalid"});
   const b=await send(route,{name:"invalid_bearer_no_cookie_fallback",mode:"bothInvalidBearer",origin:"https://gafus.ru"});
   const bad=await send(route,{name:"invalid_authorization_scheme",mode:"badScheme",origin:"https://gafus.ru"});
   expect(a.status).toBe(200);expect(b.status).toBe(route.id==="EC_CONFIRM"?200:401);expect(bad.status).toBe(route.id==="EC_CONFIRM"?200:401);
   if(route.id!=="EC_CONFIRM"){expect(m[route.fn].mock.calls[0]?.[0]).toBe("A");}
   await save(route.id+"_05",[a,b,bad],["Public confirm bypasses JWT auth: token possession controls owner; Authorization irrelevant"]);
  });
  it(`${route.id} synthetic stale/pending JWT and unauthenticated guest`,async()=>{
   const a=await send(route,{name:"stale_jwt",mode:"expired"});
   const b=await send(route,{name:"registration_pending",mode:"pending"});
   const c=await send(route,{name:"guest",mode:"guest"});
   for(const x of [a,b,c])expect(x.status).toBe(route.id==="EC_CONFIRM"?200:401);
   if(route.id!=="EC_CONFIRM")expect((b.body as {code?:string}).code).toBe("REGISTRATION_PENDING");
   await save(route.id+"_06",[a,b,c]);
  });
  it(`${route.id} CSRF header alone not sufficient for ambient cookie auth`,async()=>{
   const x=await send(route,{name:"csrf_header_no_origin",mode:"cookie",csrfHeader:"synthetic-csrf"});
   expect(x.status).toBe(route.id==="EC_CONFIRM"?200:403);await save(route.id+"_07",[x],["No CSRF token is inspected; strict Origin is the current cookie-mutating guard"]);
  });
  it(`${route.id} invalid request body handled by actual Zod validator before Core`,async()=>{
   const invalid=route.id==="EC_REQUEST"?{newEmail:"x"}:route.id==="EC_CONFIRM"?{token:"short"}:route.id==="PWD_SET"?{newPassword:"tiny"}:{currentPassword:"",newPassword:secret};
   const x=await send(route,{name:"invalid_json_fields",body:invalid});expect(x.status).toBe(400);expect(x.coreCallDelta).toBe(0);await save(route.id+"_08",[x]);
  });
  it(`${route.id} failure after Core dispatch sanitizes operational error as 503`,async()=>{
   m[route.fn].mockRejectedValueOnce(Error("SYNTHETIC_PG_FAILURE"));const x=await send(route,{name:"fake_core_unavailable"});expect(x.status).toBe(503);expect((x.body as {code:string}).code).toBe(route.id.startsWith("PWD")?"PASSWORD_OPERATION_UNAVAILABLE":"EMAIL_CHANGE_UNAVAILABLE");await save(route.id+"_09",[x]);
  });
  it(`${route.id} guest GET never invokes POST mutation`,async()=>{
   const x=await send(route,{name:"unsupported_GET",mode:"guest",method:"GET"});expect(x.status).toBe(404);expect(x.coreCallDelta).toBe(0);await save(route.id+"_10",[x]);
  });
 }
});
