/** W1 G02: actual Hono POST methods/Zod/Origin/Auth middleware. Core/password/DB injected.
 * No real JWT/SQL/network/mail; passwords never written to captures. */
import {Hono} from "hono";
import {mkdirSync,writeFileSync} from "node:fs";
import {resolve} from "node:path";
import {beforeEach,describe,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({set:vi.fn(),change:vi.fn(),verify:vi.fn(),reg:vi.fn(),passwordSet:false,passwordHash:"OLD",operational:false,callCount:0}));
vi.mock("@gafus/auth/jwt",()=>({verifyAccessToken:m.verify,assertCompletedUser:vi.fn(),generateAccessToken:vi.fn(),generateRefreshToken:vi.fn(),verifyRefreshToken:vi.fn()}));
vi.mock("@gafus/auth",()=>({InvalidPasswordResetTokenError:class extends Error{}}));
vi.mock("@gafus/core/services/auth",()=>({setPassword:m.set,changePassword:m.change,isRegistrationCompleted:m.reg,REGISTRATION_CHANNEL:{WEB:"WEB",IOS:"IOS",ANDROID:"ANDROID"}}));
vi.mock("@gafus/core/services/appFeatureFlags",()=>({APP_FEATURE_MOBILE_VK_LOGIN_IOS:"mobile_vk_login_ios",getMobileFeatureFlagEnabled:vi.fn()}));
vi.mock("@gafus/logger",()=>({createWebLogger:()=>({info:vi.fn(),error:vi.fn(),warn:vi.fn(),debug:vi.fn()})}));
import {authRoutes} from "./auth";
const ROOT="/Users/asmtv1/Desktop/gafus-refactor/apps/api/.w1-g02-ag1-isolated-20261017/captures";
const enabled=process.env.W1_G02_CAPTURE_DIR===ROOT&&process.env.TMPDIR?.startsWith("/Users/asmtv1/Desktop/gafus-refactor/apps/api/.w1-g02-ag1-isolated-20261017/tmp/");
const SET="NewPass2Alpha",CUR="OldPass1Alpha",BAD="DefinitelyWrong3";
type Op={route:"set"|"change";method?:string;actor?:"A"|"B"|"guest"|"cookie"|"badBearer";body?:unknown;raw?:string;contentType?:string;origin?:string};
function routeApp(){const app=new Hono();app.route("/api/v1/auth",authRoutes);return app;}
async function run(op:Op){
 const method=op.method??"POST",path=`/api/v1/auth/${op.route}-password`,body=op.raw??(op.body===undefined?undefined:JSON.stringify(op.body));
 const headers:Record<string,string>={};
 const who=op.actor??"A";
 if(who==="cookie")headers.cookie="gafus_access=synthetic-A";
 else if(who==="badBearer")headers.authorization="Basic SYNTH";
 else if(who!=="guest")headers.authorization=`Bearer synthetic-${who}`;
 if(op.origin)headers.origin=op.origin;
 if(body!==undefined)headers["content-type"]=op.contentType??"application/json";
 const res=await routeApp().request(`http://test.local${path}`,{method,headers,...(body===undefined?{}:{body})});
 if(method==="POST"){
   expect(res.headers.get("cache-control"),path).toBe("no-store");
   expect(res.headers.get("referrer-policy"),path).toBe("no-referrer");
 }
 const text=await res.text();let json:unknown=null;try{json=JSON.parse(text)}catch{}
 // Even errors MUST NEVER echo provided credentials nor internal driver errors.
 for(const secret of [SET,CUR,BAD,"FAKE_PRISMA_CONNECTION_UNAVAILABLE"]){expect(text).not.toContain(secret);}
 return {method,path,principal:who,request:{fieldNames:op.body&&typeof op.body==="object"?Object.keys(op.body):[],rawContentType:headers["content-type"]??null,bodyLength:body?.length??0,secretValues:"REDACTED_NOT_CAPTURED"},response:{status:res.status,headers:{"cache-control":res.headers.get("cache-control"),"referrer-policy":res.headers.get("referrer-policy"),"content-type":res.headers.get("content-type"),"retry-after":res.headers.get("retry-after")},json},effects:{setCalls:m.set.mock.calls.length,changeCalls:m.change.mock.calls.length}};
}
async function receipt(id:string,obs:Awaited<ReturnType<typeof run>>[],notes:string[]=[]){
 mkdirSync(ROOT,{recursive:true});const x={caseId:id,origin:"REAL_HONO_PASSWORD_POST_AUTH_ZOD__INJECTED_CORE_BCRYPT_DATABASE_AND_TOKEN_STORE",transport:"IN_PROCESS_NOT_TCP",isRealJwt:false,isRealSQL:false,isRealMail:false,appRedisLimiterNotMounted:true,observations:obs,notes};
 writeFileSync(resolve(ROOT,id+".json"),JSON.stringify(x,null,2)+"\n",{flag:"wx"});
}
beforeEach(()=>{
 vi.clearAllMocks();m.passwordSet=false;m.passwordHash="OLD";m.callCount=0;m.operational=false;
 m.verify.mockImplementation(async (token:string)=>token==="synthetic-A"?{id:"A",username:"a",role:"USER"}:token==="synthetic-B"?{id:"B",username:"b",role:"USER"}:null);
 m.reg.mockResolvedValue(true);
 m.set.mockImplementation(async(id:string,_pass:string)=>{m.callCount++;if(m.operational)throw Error("FAKE_PRISMA_CONNECTION_UNAVAILABLE");if(m.passwordSet)throw Error("Пароль уже установлен, используйте смену пароля");m.passwordSet=true;m.passwordHash="NEW";});
 m.change.mockImplementation(async(id:string,old:string,_pass:string)=>{m.callCount++;if(m.operational)throw Error("FAKE_PRISMA_CONNECTION_UNAVAILABLE");if(!m.passwordSet)throw Error("Сначала установите пароль");if(old!==CUR||m.passwordHash!=="OLD")throw Error("Неверный текущий пароль");m.passwordHash="NEW";});
});
(enabled?describe:describe.skip)("G02 password method-specific current Hono transport (mock Core)",()=>{
 it("SP-01 signed principal A set password success only A",async()=>{const r=await run({route:"set",body:{newPassword:SET}});expect(r.response.status).toBe(200);expect(m.set).toHaveBeenCalledWith("A",SET);await receipt("SP-01",[r]);});
 it("SP-02 unauthenticated guest 401 zero mutations",async()=>{const r=await run({route:"set",actor:"guest",body:{newPassword:SET}});expect(r.response.status).toBe(401);expect(m.set).not.toHaveBeenCalled();await receipt("SP-02",[r]);});
 it("SP-03 malformed Authorization scheme 401",async()=>{const r=await run({route:"set",actor:"badBearer",body:{newPassword:SET}});expect(r.response.status).toBe(401);await receipt("SP-03",[r]);});
 it("SP-04 invalid new password length/casing/digit prevents Core",async()=>{const xs=[];for(const pass of ["short","weakpassword123","NODIGITALPHAS","a".repeat(101)])xs.push(await run({route:"set",body:{newPassword:pass}}));expect(xs.every(x=>x.response.status===400)).toBe(true);expect(m.set).not.toHaveBeenCalled();await receipt("SP-04",xs);});
 it("SP-05 already has password conflicts with no mutation",async()=>{m.passwordSet=true;const r=await run({route:"set",body:{newPassword:SET}});expect(r.response.status).toBe(400);await receipt("SP-05",[r]);});
 it("SP-06 operational Core failure safe 503 not raw driver",async()=>{m.operational=true;const r=await run({route:"set",body:{newPassword:SET}});expect(r.response.status).toBe(503);expect((r.response.json as {code:string}).code).toBe("PASSWORD_OPERATION_UNAVAILABLE");await receipt("SP-06",[r]);});
 it("SP-07 asserted foreign userId ignored JWT A controls principal",async()=>{const r=await run({route:"set",body:{newPassword:SET,userId:"B",role:"ADMIN"}});expect(r.response.status).toBe(200);expect(m.set).toHaveBeenCalledWith("A",SET);await receipt("SP-07",[r]);});
 it("SP-08 ambient cookie with hostile Origin denied 403",async()=>{const r=await run({route:"set",actor:"cookie",origin:"https://evil.invalid",body:{newPassword:SET}});expect(r.response.status).toBe(403);expect(m.set).not.toHaveBeenCalled();await receipt("SP-08",[r]);});
 it("SP-09 malformed JSON/type missing rejects without mutation",async()=>{const xs=await Promise.all([run({route:"set",raw:"{oops"}),run({route:"set",body:{newPassword:SET},contentType:"text/plain"}),run({route:"set",body:{}})]);expect(xs.every(x=>x.response.status>=400)).toBe(true);expect(m.set).not.toHaveBeenCalled();await receipt("SP-09",xs);});
 it("CP-01 correct current password changes only principal",async()=>{m.passwordSet=true;const r=await run({route:"change",body:{currentPassword:CUR,newPassword:SET}});expect(r.response.status).toBe(200);expect(m.change).toHaveBeenCalledWith("A",CUR,SET);await receipt("CP-01",[r]);});
 it("CP-02 invalid current password returns domain error 400",async()=>{m.passwordSet=true;const r=await run({route:"change",body:{currentPassword:BAD,newPassword:SET}});expect(r.response.status).toBe(400);await receipt("CP-02",[r]);});
 it("CP-03 no initial password needs set",async()=>{const r=await run({route:"change",body:{currentPassword:CUR,newPassword:SET}});expect(r.response.status).toBe(400);await receipt("CP-03",[r]);});
 it("CP-04 invalid new/current fields blocked by schema",async()=>{const xs=await Promise.all([run({route:"change",body:{currentPassword:"",newPassword:SET}}),run({route:"change",body:{currentPassword:CUR,newPassword:"weak"}}),run({route:"change",body:{newPassword:SET}})]);expect(xs.every(x=>x.response.status===400)).toBe(true);expect(m.change).not.toHaveBeenCalled();await receipt("CP-04",xs);});
 it("CP-05 guest 401, no password change",async()=>{const r=await run({route:"change",actor:"guest",body:{currentPassword:CUR,newPassword:SET}});expect(r.response.status).toBe(401);expect(m.change).not.toHaveBeenCalled();await receipt("CP-05",[r]);});
 it("CP-06 invalid Authorization scheme 401",async()=>{const r=await run({route:"change",actor:"badBearer",body:{currentPassword:CUR,newPassword:SET}});expect(r.response.status).toBe(401);await receipt("CP-06",[r]);});
 it("CP-07 unexpected DB exception masked to 503",async()=>{m.passwordSet=true;m.operational=true;const r=await run({route:"change",body:{currentPassword:CUR,newPassword:SET}});expect(r.response.status).toBe(503);expect((r.response.json as {code:string}).code).toBe("PASSWORD_OPERATION_UNAVAILABLE");await receipt("CP-07",[r]);});
 it("CP-08 repeat old-password submit fails on second attempt",async()=>{m.passwordSet=true;const first=await run({route:"change",body:{currentPassword:CUR,newPassword:SET}});const second=await run({route:"change",body:{currentPassword:CUR,newPassword:SET}});expect([first.response.status,second.response.status]).toEqual([200,400]);await receipt("CP-08",[first,second],["Core injected; real SQL concurrent CAS tested separately only with AG4 lease"]);});
 it("CP-09 cookie hostile Origin forbidden before Core",async()=>{const r=await run({route:"change",actor:"cookie",origin:"https://attacker.invalid",body:{currentPassword:CUR,newPassword:SET}});expect(r.response.status).toBe(403);expect(m.change).not.toHaveBeenCalled();await receipt("CP-09",[r]);});
 it("CP-10 forged user ID/body extra fields cannot select other owner",async()=>{m.passwordSet=true;const r=await run({route:"change",body:{currentPassword:CUR,newPassword:SET,userId:"B"}});expect(r.response.status).toBe(200);expect(m.change).toHaveBeenCalledWith("A",CUR,SET);await receipt("CP-10",[r]);});
 it("CP-11 GET wrong verb 404, no Core call",async()=>{const r=await run({route:"change",method:"GET"});expect(r.response.status).toBe(404);expect(m.change).not.toHaveBeenCalled();await receipt("CP-11",[r]);});
});
