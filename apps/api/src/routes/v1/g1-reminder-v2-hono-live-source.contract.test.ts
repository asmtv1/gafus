/** Gated route candidate only: signed JWT, synthetic limiter, mocked Core; NO SQL. */
import { randomBytes } from "node:crypto";
import { Hono } from "hono";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
const m=vi.hoisted(()=>({keyed:vi.fn(),legacy:vi.fn(),lookup:vi.fn(),rate:false}));
vi.mock("@gafus/prisma",()=>({prisma:{user:{findUnique:async()=>({
  sessionsRevokedAt:null,registrationPending:false, role: "USER",
})}}}));
vi.mock("@gafus/core/services/auth",()=>({isRegistrationCompleted:async()=>true}));
vi.mock("@gafus/core/services/reminders",()=>({
  getReminders:vi.fn().mockResolvedValue([]),
  updateReminder:vi.fn(),deleteReminder:vi.fn(),
  createReminder:m.legacy,
  createReminderAG4:m.keyed,lookupReminderAG4:m.lookup,
  ReminderConflictError:class ReminderConflictError extends Error {code="REMINDER_IDEMPOTENCY_CONFLICT"; },
  ReminderUnknownError:class ReminderUnknownError extends Error {code="REMINDER_OPERATION_UNKNOWN"; },
  ReminderInvalidError:class ReminderInvalidError extends Error {code="REMINDER_IDEMPOTENCY_INVALID"; },
  ReminderCapError:class ReminderCapError extends Error {
    code="REMINDER_LIMIT_REACHED";
    constructor(){super("Максимум 5 напоминаний");}
  },
}));
import { generateAccessToken } from "@gafus/auth/jwt";
import { authMiddleware } from "../../middleware/auth";
import { remindersRoutes } from "./reminders";
const uuid="ccfd24d0-985e-4f63-bc0f-44cc90b912e1";
const url="http://local.test/api/v1/reminders";
const draft={name:"Training",reminderTime:"09:30",reminderDays:"3,1"};
let tokenA="",tokenB="";
beforeAll(async()=>{
  process.env.JWT_SECRET=randomBytes(48).toString("hex");
  tokenA=await generateAccessToken({id:"owner-A",username:"a",role:"USER"});
  tokenB=await generateAccessToken({id:"owner-B",username:"b",role:"USER"});
});
beforeEach(()=>{vi.clearAllMocks();m.rate=false;
  m.legacy.mockResolvedValue({id:"legacy",name:"Training"});
  m.keyed.mockResolvedValue({kind:"created",reminder:{id:"keyed",name:"Training"}});
  m.lookup.mockResolvedValue({status:"COMMITTED",reminder:{id:"keyed"}});
});
function app(){const h=new Hono();
  h.use("/api/v1/reminders/*",async(c,next)=>{
    c.header("Cache-Control","private, no-store");c.header("Referrer-Policy","no-referrer");
    await next();c.header("Cache-Control","private, no-store");
  });
  h.use("/api/v1/reminders/*",async(c,next)=>{
    if(m.rate)return c.json({success:false,code:"RATE_LIMITED"},429);
    await next();
  });
  h.use("/api/v1/reminders/*",authMiddleware);
  h.route("/api/v1/reminders",remindersRoutes);return h;
}
const request=(method:"POST"|"GET",jwt:string|null,key?:string,cookie=false,origin?:string,body:unknown=draft)=>
  app().request(method==="POST"?url:`${url}/operations/${key??uuid}`,{
    method,headers:{...(jwt?cookie?{cookie:`gafus_access=${jwt}`}:{authorization:`Bearer ${jwt}`}:{ }),
    ...(method==="POST"?{"Content-Type":"application/json"}:{}),
    ...(key&&method==="POST"?{"Idempotency-Key":key}:{}),
    ...(origin?{origin}:{})},
    ...(method==="POST"?{body:JSON.stringify(body)}:{})
  });
const privateResponse=(res:Response)=>{
  expect(res.headers.get("cache-control")).toContain("no-store");
  expect(res.headers.get("referrer-policy")).toBe("no-referrer");
};
describe("AG4-approved Reminder V2 applied route + mounted signed JWT and mock Core",()=>{
  it("R01 legacy keyless keeps original Core signature and 200 DTO",async()=>{
    const r=await request("POST",tokenA);expect(r.status).toBe(200);privateResponse(r);
    expect((await r.json()).data.id).toBe("legacy");
    expect(m.legacy).toHaveBeenCalledWith("owner-A","Training","09:30","3,1",undefined);
    expect(m.keyed).not.toHaveBeenCalled();
  });
  it("R02 keyed accepts UUID header but never forged owner from body",async()=>{
    const r=await request("POST",tokenA,uuid,false,undefined,{...draft,ownerId:"owner-B"});
    expect(r.status).toBe(200);privateResponse(r);
    expect(m.keyed).toHaveBeenCalledWith("owner-A",{...draft,timezone:undefined},uuid);
    expect(m.legacy).not.toHaveBeenCalled();
  });
  it("R03 replay same response, not new keyless record",async()=>{
    m.keyed.mockResolvedValueOnce({kind:"idempotent_replay",reminder:{id:"keyed"}});
    const r=await request("POST",tokenA,uuid);expect(r.status).toBe(200);
    expect((await r.json()).data.id).toBe("keyed");expect(m.legacy).not.toHaveBeenCalled();
  });
  it("R04 conflicting payload 409 structured no details",async()=>{
    const {ReminderConflictError}=await import("@gafus/core/services/reminders");
    m.keyed.mockRejectedValueOnce(new ReminderConflictError());
    const r=await request("POST",tokenA,uuid);expect(r.status).toBe(409);privateResponse(r);
    expect((await r.json()).code).toBe("REMINDER_IDEMPOTENCY_CONFLICT");
  });
  it("R05 expiry/lost ACK UNKNOWN 409; no auto retry",async()=>{
    const {ReminderUnknownError}=await import("@gafus/core/services/reminders");
    m.keyed.mockRejectedValueOnce(new ReminderUnknownError());
    const r=await request("POST",tokenA,uuid);expect(r.status).toBe(409);
    expect((await r.json()).code).toBe("REMINDER_OPERATION_UNKNOWN");
    expect(m.keyed).toHaveBeenCalledTimes(1);
  });
  it("R06 invalid UUID 400 and cap 400 typed errors",async()=>{
    const {ReminderInvalidError,ReminderCapError}=await import("@gafus/core/services/reminders");
    m.keyed.mockRejectedValueOnce(new ReminderInvalidError());
    const invalid=await request("POST",tokenA,"invalid");expect(invalid.status).toBe(400);
    expect((await invalid.json()).code).toBe("REMINDER_IDEMPOTENCY_INVALID");
    m.keyed.mockRejectedValueOnce(new ReminderCapError());
    const cap=await request("POST",tokenA,uuid);expect(cap.status).toBe(400);
    privateResponse(cap);
    expect(await cap.json()).toEqual({
      success:false,code:"REMINDER_LIMIT_REACHED",error:"Максимум 5 напоминаний",
    });
  });
  it("R07 owner-scoped GET committed; foreign/expired UNKNOWN404",async()=>{
    const ok=await request("GET",tokenA);expect(ok.status).toBe(200);privateResponse(ok);
    expect((await ok.json()).data.reminder.id).toBe("keyed");
    expect(m.lookup).toHaveBeenCalledWith("owner-A",uuid);
    const {ReminderUnknownError}=await import("@gafus/core/services/reminders");
    m.lookup.mockRejectedValueOnce(new ReminderUnknownError());
    const missing=await request("GET",tokenB);expect(missing.status).toBe(404);
    expect((await missing.json()).code).toBe("REMINDER_OPERATION_UNKNOWN");
    expect(m.keyed).not.toHaveBeenCalled();
  });
  it("R08 invalid key GET400, internal failure sanitized500",async()=>{
    const {ReminderInvalidError}=await import("@gafus/core/services/reminders");
    m.lookup.mockRejectedValueOnce(new ReminderInvalidError());
    const invalid=await request("GET",tokenA,"INVALID");expect(invalid.status).toBe(400);
    expect((await invalid.json()).code).toBe("REMINDER_IDEMPOTENCY_INVALID");
    m.lookup.mockRejectedValueOnce(new Error("PRIVATE_OPERATION_KEY"));
    const error=await request("GET",tokenA);expect(error.status).toBe(500);
    expect(await error.text()).not.toContain("PRIVATE_OPERATION_KEY");
  });
  it("R09 auth pre-route 401 private and cookie foreign Origin 403",async()=>{
    const missing=await request("POST",null,uuid);expect(missing.status).toBe(401);privateResponse(missing);
    const denied=await request("POST",tokenA,uuid,true,"https://evil.invalid");
    expect(denied.status).toBe(403);privateResponse(denied);expect(m.keyed).not.toHaveBeenCalled();
  });
  it("R10 synthetic upstream limiter 429 before JWT remains private",async()=>{
    m.rate=true;const blocked=await request("POST",null,uuid);
    expect(blocked.status).toBe(429);privateResponse(blocked);
    expect(m.legacy).not.toHaveBeenCalled();expect(m.keyed).not.toHaveBeenCalled();
  });
  it("R11 legacy keyless limit preserves historic 400 message",async()=>{
    m.legacy.mockRejectedValueOnce(new Error("Максимум 5 напоминаний"));
    const res=await request("POST",tokenA);
    expect(res.status).toBe(400);privateResponse(res);
    expect(await res.json()).toEqual({success:false,error:"Максимум 5 напоминаний"});
    expect(m.keyed).not.toHaveBeenCalled();
  });
  it("R12 unexpected keyed Core error remains 500 without body or key details",async()=>{
    m.keyed.mockRejectedValueOnce(new Error("PRIVATE_DB_FAIL_SECRET_RECEIPT"));
    const res=await request("POST",tokenA,uuid);expect(res.status).toBe(500);
    privateResponse(res);
    const text=await res.text();
    expect(JSON.parse(text)).toEqual({success:false,error:"Внутренняя ошибка"});
    expect(text).not.toContain("PRIVATE_DB_FAIL_SECRET_RECEIPT");
    expect(text).not.toContain(uuid);
  });
  it("R13 unexpected keyless Core error remains private sanitized 500",async()=>{
    m.legacy.mockRejectedValueOnce(new Error("PRIVATE_LEGACY_DB_FAIL"));
    const res=await request("POST",tokenA);expect(res.status).toBe(500);
    privateResponse(res);
    const text=await res.text();
    expect(text).not.toContain("PRIVATE_LEGACY_DB_FAIL");
    expect(JSON.parse(text)).toEqual({success:false,error:"Внутренняя ошибка"});
  });
  it("R14 current wire requires optional header; G05 pet create uses body",async()=>{
    const {readFileSync}=await import("node:fs");
    const remind=readFileSync(new URL("./reminders.ts",import.meta.url),"utf8");
    const pet=readFileSync(new URL("./pets.ts",import.meta.url),"utf8");
    expect(remind).toContain('c.req.header("Idempotency-Key")');
    expect(remind).not.toContain('c.req.valid("json").clientRequestId');
    expect(pet).toContain("clientRequestId: z");
    expect(pet).toContain('c.req.header("Idempotency-Key") !== undefined');
  });
  it("R11 actual shared app.ts private middleware precedes existing limiter/auth",async()=>{
    const {readFileSync}=await import("node:fs");
    const app=readFileSync(new URL("../../app.ts",import.meta.url),"utf8");
    const start=app.indexOf('app.use("/api/v1/reminders/*", async (c, next) => {');
    const limit=app.indexOf('app.use("/api/v1/reminders/*", apiRateLimiter)');
    const auth=app.indexOf('app.use("/api/v1/reminders/*", authMiddleware)');
    expect(start).toBeGreaterThan(0);expect(start).toBeLessThan(limit);
    expect(limit).toBeLessThan(auth);
  });

});
