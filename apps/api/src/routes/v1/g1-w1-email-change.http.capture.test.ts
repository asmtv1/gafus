/** W1 / EC-01..22: actual Hono auth route + real validators/middleware.
 * Core email flows/Prisma/mailer deliberately injected, NOT SQL, SMTP, real Redis or Next GET.
 * Opt-in evidence writer requires strictly project-owned sandbox scratch.
 */
import { Hono } from "hono";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
 verify:vi.fn(),registration:vi.fn(),request:vi.fn(),confirm:vi.fn(),
 failMail:false,failDb:false,failAfterConfirm:false,mailCount:0,next:0,
 users:new Map<string,string>(),pending:new Map<string,{owner:string;email:string;expires:number}>(),
 latest:new Map<string,string>(),
}));
vi.mock("@gafus/auth/jwt",()=>({verifyAccessToken:m.verify,assertCompletedUser:vi.fn(),generateAccessToken:vi.fn(),generateRefreshToken:vi.fn(),verifyRefreshToken:vi.fn()}));
vi.mock("@gafus/auth",()=>({InvalidPasswordResetTokenError:class extends Error{}}));
vi.mock("@gafus/core/services/auth",()=>({
 isRegistrationCompleted:m.registration, requestEmailChange:m.request,confirmEmailChangeByToken:m.confirm,
 REGISTRATION_CHANNEL:{WEB:"WEB",IOS:"IOS",ANDROID:"ANDROID"},
}));
vi.mock("@gafus/core/services/appFeatureFlags",()=>({APP_FEATURE_MOBILE_VK_LOGIN_IOS:"mobile_vk_login_ios",getMobileFeatureFlagEnabled:vi.fn()}));
vi.mock("@gafus/logger",()=>({createWebLogger:()=>({info:vi.fn(),error:vi.fn(),warn:vi.fn(),debug:vi.fn()})}));
import { authRoutes } from "./auth";
const BASE="/api/v1/auth",CAPTURE="/Users/asmtv1/Desktop/gafus-refactor/apps/api/.w1-email-ag1-isolated-20261017/captures";
const enabled=process.env.W1_CAPTURE_DIR===CAPTURE&&process.env.TMPDIR?.startsWith("/Users/asmtv1/Desktop/gafus-refactor/apps/api/.w1-email-ag1-isolated-20261017/tmp/");
const token=(idx:number)=>`W1_SYNTHETIC_TOKEN_${String(idx).padStart(26,"x")}`;
function createApp(){const app=new Hono();app.route(BASE,authRoutes);return app;}
function actor(name:"A"|"B"|"guest"|"cookie"="A",origin?:string){
 const headers:Record<string,string>={};
 if(name==="cookie")headers.cookie="gafus_access=synthetic-A";
 else if(name!=="guest")headers.authorization=`Bearer synthetic-${name}`;
 if(origin)headers.origin=origin;
 return headers;
}
function stats(){return {users:{A:m.users.get("A"),B:m.users.get("B")},pending:Array.from(m.pending.values()).map(t=>({owner:t.owner,email:t.email,expiresKnown:!!t.expires})).sort((a,b)=>a.email.localeCompare(b.email)),pendingCount:m.pending.size,requestCalls:m.request.mock.calls.length,confirmCalls:m.confirm.mock.calls.length,mailAttempts:m.mailCount};}
function scrub(s:string){return s.replace(/W1_SYNTHETIC_TOKEN_[x\d]+/g,"[SYNTHETIC_TOKEN_REDACTED]").replace(/synthetic-[AB]/g,"[SYNTH_BEARER]");}
type Op={method?:string;route:"request"|"confirm";actor?:"A"|"B"|"guest"|"cookie";body?:unknown;raw?:string;origin?:string;type?:string};
async function hit(o:Op){
 const method=o.method??"POST",path=`${BASE}/email-change-${o.route==='request'?'request':'confirm'}`;
 const input=o.raw??(o.body===undefined?undefined:JSON.stringify(o.body));
 const headers={...actor(o.actor,o.origin),...(input===undefined?{}:{"content-type":o.type??"application/json"})};
 const res=await createApp().request(`http://test.local${path}`,{method,headers,...(input===undefined?{}:{body:input})});
 if(method==="POST"){
   expect(res.headers.get("cache-control")).toBe("no-store");
   expect(res.headers.get("referrer-policy")).toBe("no-referrer");
 }
 const txt=await res.text();let json:unknown;try{json=JSON.parse(txt)}catch{json=null}
 return {method,path,principal:o.actor??"A",request:{contentType:headers["content-type" as keyof typeof headers]??null,body:input===undefined?null:scrub(input.slice(0,220)),byteLength:input?.length??0},response:{status:res.status,headers:{"cache-control":res.headers.get("cache-control"),"content-type":res.headers.get("content-type"),"retry-after":res.headers.get("retry-after"),"referrer-policy":res.headers.get("referrer-policy")},bodyText:scrub(txt),json},effects:stats()};
}
async function save(id:string,observations:Awaited<ReturnType<typeof hit>>[],notes:string[]=[]){
 expect(observations.length).toBeGreaterThan(0);
 mkdirSync(CAPTURE,{recursive:true});
 const rec={caseId:id,origin:"ACTUAL_HONO_AUTH_ROUTES_VALIDATORS_REAL_AUTH_MIDDLEWARE__CORE_EMAIL_PRISMA_MAIL_INJECTED",httpTransport:"IN_PROCESS_HONO_NOT_TCP",isActualSQL:false,isActualMailer:false,isActualRateLimiter:false,sourceBehavior:"Hono real; dependency-result/side-effect injected; Core source transactionality verified separately",observations,notes};
 writeFileSync(resolve(CAPTURE,`${id}.json`),JSON.stringify(rec,null,2)+"\n",{flag:"wx"});
}
beforeEach(()=>{
 vi.clearAllMocks();m.users=new Map([["A","a@sample.test"],["B","b@sample.test"]]);m.pending=new Map();m.latest=new Map();m.next=0;m.mailCount=0;m.failMail=false;m.failDb=false;m.failAfterConfirm=false;
 m.registration.mockResolvedValue(true);
 m.verify.mockImplementation(async(s:string)=>s==="synthetic-A"?{id:"A",username:"alice",role:"USER"}:s==="synthetic-B"?{id:"B",username:"bob",role:"USER"}:null);
 m.request.mockImplementation(async(id:string,email:string)=>{
  if(m.failDb)throw new Error("SYNTH_DB_DOWN");
  if(!m.users.has(id))throw new Error("Пользователь не найден");
  if(m.users.get(id)?.toLowerCase()===email)throw new Error("Этот email уже указан в профиле");
  if([...m.users.entries()].some(([who,v])=>who!==id&&v===email))throw new Error("Этот email уже занят");
  for(const [key,row] of m.pending)if(row.owner===id)m.pending.delete(key);
  const t=token(++m.next);m.pending.set(t,{owner:id,email,expires:Date.now()+86400000});m.latest.set(id,t);
  m.mailCount++;if(m.failMail)throw new Error("SYNTH_MAIL_UNAVAILABLE");
 });
 m.confirm.mockImplementation(async(t:string)=>{
  const x=m.pending.get(t.trim());if(!x||x.expires<Date.now())throw new Error("Ссылка недействительна или устарела");
  if([...m.users.entries()].some(([who,v])=>who!==x.owner&&v===x.email))throw new Error("Этот email уже занят");
  m.users.set(x.owner,x.email);for(const [key,row] of m.pending)if(row.owner===x.owner)m.pending.delete(key);
  if(m.failAfterConfirm)throw new Error("SYNTH_NETWORK_TIMEOUT_AFTER_WRITE");
 });
});
const mail="fresh@sample.test";
(enabled?describe:describe.skip)("W1 EC-01..22 actual Hono response methods, Core injected",()=>{
 it("EC-01 authenticated request 200, one model pending/mail, unchanged current email",async()=>{
  const x=await hit({route:"request",body:{newEmail:mail}});expect(x.response.status).toBe(200);expect(x.response.json).toEqual({success:true});expect(m.pending.size).toBe(1);expect(m.mailCount).toBe(1);expect(m.users.get("A")).toBe("a@sample.test");await save("EC-01",[x]);
 });
 it("EC-02 guest receives 401, no Core side effects",async()=>{const x=await hit({route:"request",actor:"guest",body:{newEmail:mail}});expect(x.response.status).toBe(401);expect(m.request).not.toHaveBeenCalled();await save("EC-02",[x],["Observe rather than invent no-store"]);});
 it("EC-03 extra claimed userId B must not displace JWT principal A",async()=>{const x=await hit({route:"request",body:{newEmail:mail,userId:"B",role:"ADMIN"}});expect(x.response.status).toBe(200);expect(m.request).toHaveBeenCalledWith("A",mail);expect(m.users.get("B")).toBe("b@sample.test");await save("EC-03",[x],["Zod object strips unknown ownership fields"]);});
 it("EC-04 empty, non-FQDN, malformed JSON, wrong MIME, oversized HTTP request",async()=>{
  const xs=await Promise.all([{route:"request",body:{newEmail:""}},{route:"request",body:{newEmail:"test@invalid"}},{route:"request",raw:"{broken"},{route:"request",raw:JSON.stringify({newEmail:mail}),type:"text/plain"},{route:"request",body:{newEmail:"x".repeat(1400)+"@example.com"}}].map(a=>hit(a as Op)));
  expect(xs.every(x=>x.response.status>=400)).toBe(true);expect(m.request).not.toHaveBeenCalled();await save("EC-04",xs,["Observe 400/413/415 from real Hono; MX DNS not asserted"]);
 });
 it("EC-05 current case-insensitive email conflict",async()=>{const x=await hit({route:"request",body:{newEmail:"  A@SAMPLE.TEST  "}});expect(x.response.status).toBe(400);expect(m.request).toHaveBeenCalledWith("A","a@sample.test");expect(m.pending.size).toBe(0);await save("EC-05",[x]);});
 it("EC-06 another user holds target: actual Hono 400 not guessed 409",async()=>{const x=await hit({route:"request",body:{newEmail:"b@sample.test"}});expect(x.response.status).toBe(400);expect(JSON.stringify(x.response.json)).not.toContain('"B"');await save("EC-06",[x]);});
 it("EC-07 sequential request replacement simulated in fake Core",async()=>{const a=await hit({route:"request",body:{newEmail:mail}});const first=m.latest.get("A")!;const b=await hit({route:"request",body:{newEmail:"last@sample.test"}});expect(m.pending.has(first)).toBe(false);expect(m.pending.size).toBe(1);expect(m.mailCount).toBe(2);await save("EC-07",[a,b],["DB/mailer modeled, no real transaction evidence"]);});
 it("EC-08 concurrency with fake Core cannot establish DB uniqueness",async()=>{const x=await Promise.all([hit({route:"request",body:{newEmail:"one@sample.test"}}),hit({route:"request",body:{newEmail:"two@sample.test"}})]);expect(x.every(a=>a.response.status===200)).toBe(true);await save("EC-08",x,["Fake Core serial in-memory; PostgreSQL race UNPROVEN; two mail attempts observed in model"]);});
 it("EC-09 injected mail failure now returns sanitized 503; fake Core old mutation remains modeled",async()=>{await hit({route:"request",body:{newEmail:mail}});const prev=m.latest.get("A")!;m.failMail=true;const failed=await hit({route:"request",body:{newEmail:"after@sample.test"}});expect(failed.response.status).toBe(503);expect((failed.response.json as {code:string}).code).toBe("EMAIL_CHANGE_UNAVAILABLE");expect(m.pending.has(prev)).toBe(false);expect(m.pending.size).toBe(1);await save("EC-09",[failed],["Core fake failure mirrors observed Core operation ordering, independently tested in real Core mock Prisma suite"]);});
 it("EC-10 injected storage error returns sanitized 503; Redis 429 not mounted",async()=>{m.failDb=true;const x=await hit({route:"request",body:{newEmail:mail}});expect(x.response.status).toBe(503);expect((x.response.json as {code:string}).code).toBe("EMAIL_CHANGE_UNAVAILABLE");await save("EC-10",[x],["Actual app authRateLimiter 10/15m is OUTER app.ts; not mounted here; no real Redis, 429, Retry-After or 503 proof"]);});
 it("EC-11 cookie transport with untrusted Origin blocked by actual authMiddleware",async()=>{const x=await hit({route:"request",actor:"cookie",origin:"https://evil.invalid",body:{newEmail:mail}});expect(x.response.status).toBe(403);expect(m.request).not.toHaveBeenCalled();await save("EC-11",[x],["Actual browser-auth source enforces Origin for ambient cookie POST"]);});
 it("EC-12 public guest possession token confirms owner A only",async()=>{await hit({route:"request",body:{newEmail:mail}});const x=await hit({route:"confirm",actor:"guest",body:{token:m.latest.get("A")}});expect(x.response.status).toBe(200);expect(m.users.get("A")).toBe(mail);expect(m.users.get("B")).toBe("b@sample.test");await save("EC-12",[x],["Public bearer-like token as source design; not auth JWT"]);});
 it("EC-13 invalid token input lengths/body reject before Core",async()=>{const xs=[];for(const body of [{},{token:"s".repeat(31)},{token:"z".repeat(129)},{token:27}])xs.push(await hit({route:"confirm",actor:"guest",body}));expect(xs.every(x=>x.response.status===400)).toBe(true);expect(m.confirm).not.toHaveBeenCalled();await save("EC-13",xs);});
 it("EC-14 expired token fails without email write (exact timestamp boundary not proven)",async()=>{await hit({route:"request",body:{newEmail:mail}});const k=m.latest.get("A")!;m.pending.get(k)!.expires=Date.now()-1;const x=await hit({route:"confirm",actor:"guest",body:{token:k}});expect(x.response.status).toBe(400);expect(m.users.get("A")).toBe("a@sample.test");await save("EC-14",[x],["Exact expiresAt == DB NOW boundary requires isolated PostgreSQL"]);});
 it("EC-15 first ACK then replay error in fake Core",async()=>{await hit({route:"request",body:{newEmail:mail}});const k=m.latest.get("A")!;const first=await hit({route:"confirm",actor:"guest",body:{token:k}});const second=await hit({route:"confirm",actor:"guest",body:{token:k}});expect([first.response.status,second.response.status]).toEqual([200,400]);await save("EC-15",[first,second]);});
 it("EC-16 concurrent same token is fake Core only; SQL atomicity not asserted",async()=>{await hit({route:"request",body:{newEmail:mail}});const k=m.latest.get("A")!;const xs=await Promise.all([hit({route:"confirm",actor:"guest",body:{token:k}}),hit({route:"confirm",actor:"guest",body:{token:k}})]);expect(xs.some(x=>x.response.status===200)).toBe(true);await save("EC-16",xs,["In-memory fake Core serial; do NOT promote as real DB serializability"]);});
 it("EC-17 session B present but token A updates A only (public confirm)",async()=>{await hit({route:"request",body:{newEmail:mail}});const x=await hit({route:"confirm",actor:"B",body:{token:m.latest.get("A")}});expect(x.response.status).toBe(200);expect(m.users.get("A")).toBe(mail);expect(m.users.get("B")).toBe("b@sample.test");await save("EC-17",[x]);});
 it("EC-18 conflict after token issuance fails and leaves token in fake Core",async()=>{await hit({route:"request",body:{newEmail:mail}});m.users.set("B",mail);const x=await hit({route:"confirm",actor:"guest",body:{token:m.latest.get("A")}});expect(x.response.status).toBe(400);expect(m.users.get("A")).toBe("a@sample.test");expect(m.pending.size).toBe(1);await save("EC-18",[x]);});
 it("EC-19 GET on Hono auth confirm route does not consume token; legacy Next GET still open",async()=>{await hit({route:"request",body:{newEmail:mail}});const x=await hit({route:"confirm",method:"GET",actor:"guest"});expect(x.response.status).toBe(404);expect(m.confirm).not.toHaveBeenCalled();await save("EC-19",[x],["THIS IS HONO GET only. Existing legacy Next GET /profile/confirm-email calls action during server render and remains security GAP"]);});
 it("EC-20 simulated write committed but timeout yields 503 ambiguous ACK",async()=>{await hit({route:"request",body:{newEmail:mail}});m.failAfterConfirm=true;const k=m.latest.get("A")!;const x=await hit({route:"confirm",actor:"guest",body:{token:k}});expect(x.response.status).toBe(503);expect((x.response.json as {code:string}).code).toBe("EMAIL_CHANGE_UNAVAILABLE");expect(m.users.get("A")).toBe(mail);await save("EC-20",[x],["Ambiguous ACK modeled with fake Core, no TCP/Postgres proof"]);});
 it("EC-21 raw token not reflected in HTTP response; observe cache/referrer headers",async()=>{await hit({route:"request",body:{newEmail:mail}});const k=m.latest.get("A")!;const x=await hit({route:"confirm",actor:"guest",body:{token:k}});expect(JSON.stringify(x.response)).not.toContain(k);await save("EC-21",[x],["Response checked only; URL telemetry, access logs, referrer, browser cache NOT covered"]);});
 it("EC-22 wrong verbs + oversized request have actual Hono statuses",async()=>{const xs=[];for(const op of [{method:"GET",route:"request"},{method:"PUT",route:"confirm"},{method:"DELETE",route:"request"},{method:"POST",route:"confirm",body:{token:"X".repeat(1150)}}])xs.push(await hit(op as Op));expect(xs.every(x=>x.response.status>=400)).toBe(true);expect(m.request).not.toHaveBeenCalled();expect(m.confirm).not.toHaveBeenCalled();await save("EC-22",xs,["Observe actual 404/405/413, no invented status"]);});
});
