/**
 * AG1-001 meaningful read composition: REAL Hono + signed JWT +
 * application + ACTUAL Core consultation listed/eligibility functions.
 * Prisma, Redis rate store and queue are pre-import mocks; no SQL/network.
 */
import { randomBytes } from "node:crypto";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type * as PrismaModule from "@gafus/prisma";

const m = vi.hoisted(() => ({
  cynologists:vi.fn(), bookings:vi.fn(), session:vi.fn(),
  registration:vi.fn(), write:vi.fn(), queueAdd:vi.fn(),
  throttle:false, reads:[] as string[], rateKeys:[] as string[],
}));
vi.mock("@hono-rate-limiter/redis",()=>({
  RedisStore:class {
    windowMs=60000;
    init(v:{windowMs:number}){this.windowMs=v.windowMs;}
    async increment(key:string){
      m.rateKeys.push(key);
      return {totalHits:m.throttle?101:1,resetTime:new Date(Date.now()+this.windowMs)};
    }
    async decrement(){return undefined;}
    async resetKey(){return undefined;}
  },
}));
// Consultation package barrel imports queues eagerly. Always intercept before
// importing real Core/app, never allow real queue/Redis constructor or connect.
vi.mock("@gafus/queues",()=>{
  const fakeQueue={add:m.queueAdd,remove:m.write,getJob:m.write};
  const known:Record<string,unknown>={
    connection:Object.freeze({mockRedis:true}),
    consultationMailQueue:fakeQueue,
    consultationReminderQueue:fakeQueue,
    consultationSlaQueue:fakeQueue,
    CONSULTATION_MAIL_JOB_ID:(id:string)=>"consultation-mail:"+id,
    CONSULTATION_REMINDER_JOB_ID:(id:string)=>"consultation-reminder:"+id,
    CONSULTATION_SLA_JOB_ID:(id:string)=>"consultation-sla:"+id,
    removeConsultationReminderJob:m.write,removeConsultationSlaJob:m.write,
  };
  return new Proxy(known,{
    get:(obj,key)=>typeof key==="string"?obj[key]:undefined,
  });
});
vi.mock("ioredis",()=>({
  default:class {constructor(){throw Error("REAL_REDIS_FORBIDDEN");}},
  Redis:class {constructor(){throw Error("REAL_REDIS_FORBIDDEN");}},
}));
vi.mock("@gafus/prisma",async original=>{
  const db=await original<typeof PrismaModule>();
  return {...db,prisma:{
    ...db.prisma,
    user:{...db.prisma.user,findUnique:m.session},
    consultationCynologist:{
      ...db.prisma.consultationCynologist,findMany:m.cynologists,
      update:m.write,create:m.write,delete:m.write,updateMany:m.write,
    },
    consultationBooking:{
      ...db.prisma.consultationBooking,findFirst:m.bookings,
      update:m.write,create:m.write,delete:m.write,
    },
    $transaction:m.write,
  }};
});
vi.mock("@gafus/core/services/auth",async original=>({
  ...await original<object>(),isRegistrationCompleted:m.registration,
}));
// @gafus/core/services/consultation is intentionally NOT mocked.
import { app } from "../../app";
import { generateAccessToken } from "@gafus/auth/jwt";
import {
  getConsultationBookingEligibility,
  listListedCynologists,
} from "@gafus/core/services/consultation";

const actors={
  A:{id:"owner_A",username:"a",role:"USER"},
  B:{id:"owner_B",username:"b",role:"USER"},
} as const;
const tokens:Record<string,string>={};
const rows=[
  {id:"cyn-A",userId:"trainer_A",slotDurationMin:45,user:{
    username:"trainer_a",profile:{fullName:"Кинолог А",avatarUrl:null,about:"О занятиях"},
    email:"private@example.invalid",phone:"+70000000000",
  }},
  {id:"cyn-B",userId:"trainer_B",slotDurationMin:60,user:{
    username:"trainer_b",profile:null,
    email:"hidden@example.invalid",
  }},
];
const expectedCatalog=[
  {id:"cyn-A",userId:"trainer_A",username:"trainer_a",displayName:"Кинолог А",
    avatarUrl:null,about:"О занятиях",slotDurationMin:45},
  {id:"cyn-B",userId:"trainer_B",username:"trainer_b",displayName:null,
    avatarUrl:null,about:null,slotDurationMin:60},
];
const request=(who:string)=>app.request("/api/v1/consultations/cynologists",{
  method:"GET",
  headers:who?{authorization:"Bearer "+(tokens[who]??who)}:{},
});
const noWrites=()=>{
  expect(m.write).not.toHaveBeenCalled();
  expect(m.queueAdd).not.toHaveBeenCalled();
};
beforeAll(async()=>{
  process.env.JWT_SECRET=randomBytes(48).toString("hex");
  for(const [name,actor] of Object.entries(actors)){
    tokens[name]=await generateAccessToken(actor);
  }
});
beforeEach(()=>{
  vi.clearAllMocks();
  m.throttle=false;
  m.reads.length=0;
  m.rateKeys.length=0;
  m.registration.mockResolvedValue(true);
  m.session.mockImplementation(async ({where}:{where:{id:string}}) => {
    const matched=Object.values(actors).find((candidate)=>candidate.id===where.id);
    return matched ? {sessionsRevokedAt:null,registrationPending:false,role:matched.role} : null;
  });
  m.cynologists.mockImplementation(async()=>{
    m.reads.push("catalog");
    return rows;
  });
  m.bookings.mockImplementation(async(q:{where:{clientId:string;status:unknown}})=>{
    const owner=q.where.clientId;
    if(typeof q.where.status==="object"){
      m.reads.push("eligibility:"+owner+":active");
      return owner===actors.B.id?{id:"booking_B"}:null;
    }
    m.reads.push("eligibility:"+owner+":completed");
    return null;
  });
});

describe("AG1-001 registered Hono consultation catalog -> real dual-Core",()=>{
  it("A B A exact JSON, owner-specific booking eligibility, Core select and order",async()=>{
    expect(typeof listListedCynologists).toBe("function");
    expect(typeof getConsultationBookingEligibility).toBe("function");
    for(const [who,owner,reason] of [
      ["A",actors.A.id,null],["B",actors.B.id,"ACTIVE_BOOKING"],
      ["A",actors.A.id,null],
    ] as const){
      m.reads.length=0;
      const r=await request(who);
      expect(r.status).toBe(200);
      expect(r.headers.get("cache-control")).toBe("no-store");
      const body=await r.json();
      expect(body).toMatchObject({success:true,data:expectedCatalog,
        bookingEligibility:{canBook:reason===null,reason}});
      expect(Object.keys(body).sort())
        .toEqual(["bookingEligibility","data","success"]);
      expect(JSON.stringify(body)).not.toContain("private@example.invalid");
      expect(JSON.stringify(body)).not.toContain("hidden@example.invalid");
      expect(m.cynologists).toHaveBeenCalledWith({
        where:{isListed:true},select:{
          id:true,userId:true,slotDurationMin:true,user:{select:{
            username:true,profile:{select:{fullName:true,avatarUrl:true,about:true}},
          }},
        },orderBy:{id:"asc"},
      });
      expect(m.bookings).toHaveBeenCalledWith(expect.objectContaining({
        where:{clientId:owner,status:{in:[
          "PENDING_TRAINER_CONFIRMATION","CONFIRMED",
        ]}},
        select:{id:true},
      }));
      expect(m.reads).toEqual(reason===null
        ?["catalog","eligibility:"+owner+":active","eligibility:"+owner+":completed"]
        :["catalog","eligibility:"+owner+":active"]);
      noWrites();
    }
  });
  it("catalog error aborts before second Core read, preserves existing 500",async()=>{
    m.cynologists.mockRejectedValueOnce(new Error("SYNTHETIC_QUERY_FAULT"));
    const r=await request("A");
    expect(r.status).toBe(500);
    // The route's pre-existing shared privacy middleware runs before catalog.
    expect(r.headers.get("cache-control")).toBe("private, no-store");
    expect(await r.json()).toEqual({
      success:false,error:"Внутренняя ошибка сервера",
    });
    expect(m.bookings).not.toHaveBeenCalled();
    noWrites();
  });
  it("eligibility error after catalog uses original 500 and no side effects",async()=>{
    m.bookings.mockRejectedValueOnce(new Error("SYNTHETIC_ELIGIBILITY_FAULT"));
    const r=await request("A");
    expect(r.status).toBe(500);
    // The catalog was read; the original route already set no-store.
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect(await r.json()).toEqual({
      success:false,error:"Внутренняя ошибка сервера",
    });
    expect(m.cynologists).toHaveBeenCalledOnce();
    expect(m.bookings).toHaveBeenCalledOnce();
    noWrites();
  });
  it("guest/forged JWT never invokes either Core read",async()=>{
    for(const who of ["","bad.jwt"]){
      const r=await request(who);
      expect(r.status).toBe(401);
    }
    expect(m.cynologists).not.toHaveBeenCalled();
    expect(m.bookings).not.toHaveBeenCalled();
    noWrites();
  });
  it("limiter and pending account are blocked before real Core reads",async()=>{
    m.throttle=true;
    expect((await request("A")).status).toBe(429);
    m.throttle=false;
    m.registration.mockResolvedValueOnce(false);
    expect((await request("B")).status).toBe(401);
    expect(m.cynologists).not.toHaveBeenCalled();
    expect(m.bookings).not.toHaveBeenCalled();
    noWrites();
  });
});
