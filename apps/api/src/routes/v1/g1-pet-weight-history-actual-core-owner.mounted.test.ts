/**
 * AG1/V98: registered Hono GET /pets/:petId/weight -> ACTUAL existing
 * getPetWeightHistory Core -> synthetic owner-enforcing Prisma reads.
 * No Core mock, no SQL, HTTP socket, real Redis, device or mutations.
 */
import { randomBytes } from "node:crypto";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type * as PrismaModule from "@gafus/prisma";
import { LoggerFactory, UnifiedLogger } from "@gafus/logger";

const m = vi.hoisted(() => ({
  session: vi.fn(), registration: vi.fn(),
  petFind: vi.fn(), weightFind: vi.fn(), mutation: vi.fn(),
  throttle: false, rateKeys: [] as string[],
}));
vi.mock("@hono-rate-limiter/redis", () => ({
  RedisStore: class {
    windowMs = 60_000;
    init(o:{windowMs:number}) { this.windowMs=o.windowMs; }
    async increment(key:string) {
      m.rateKeys.push(key);
      return { totalHits: m.throttle ? 101 : 1,
        resetTime: new Date(Date.now()+this.windowMs) };
    }
    async decrement(){return undefined;}
    async resetKey(){return undefined;}
  },
}));
vi.mock("@gafus/prisma", async original => {
  const a=await original<typeof PrismaModule>();
  return {...a,prisma:{
    ...a.prisma,
    user:{...a.prisma.user,findUnique:m.session},
    pet:{...a.prisma.pet,findFirst:m.petFind,
      create:m.mutation,update:m.mutation,updateMany:m.mutation,
      delete:m.mutation,deleteMany:m.mutation},
    petWeightEntry:{...a.prisma.petWeightEntry,
      findMany:m.weightFind,findFirst:m.mutation,
      create:m.mutation,update:m.mutation,delete:m.mutation,
      deleteMany:m.mutation},
    $transaction:m.mutation,
  }};
});
vi.mock("@gafus/core/services/auth",async original=>({
  ...await original<object>(),isRegistrationCompleted:m.registration,
}));
// Import actual registered app and Core source / compiled package, NOT Core mocks.
import { app } from "../../app";
import { getPetWeightHistory } from "@gafus/core/services/pets";
import { generateAccessToken } from "@gafus/auth/jwt";

const A="pet_owner_A";
const B="pet_owner_B";
const PET_A="pet_a";
const PET_B="pet_b";
const PET_EMPTY="pet_a_empty";
const PET_TARGET="pet_a_target_only";
const actors={
  A:{id:A,username:"owner_a",role:"USER"},
  B:{id:B,username:"owner_b",role:"USER"},
  ADMIN:{id:"pet_admin_1",username:"pet_admin",role:"ADMIN"},
} as const;
const tokens:Record<string,string>={};
const SECRET="SYNTHETIC_PRIVATE_PET_WEIGHT_DB_TOKEN_EMAIL";
type PetRow={
  id:string;ownerId:string;
  weightKg:number|null;targetWeightKg:number|null;
  notes:string;name:string;
};
type Entry={
  id:string;petId:string;ownerId:string;weightKg:number;
  measuredAt:Date;createdAt:Date;
};
const dbPets:PetRow[]=[
  {id:PET_A,ownerId:A,weightKg:null,targetWeightKg:null,
    notes:"private A "+SECRET,name:"A"},
  {id:PET_B,ownerId:B,weightKg:28.75,targetWeightKg:25.5,
    notes:"private B "+SECRET,name:"B"},
  {id:PET_EMPTY,ownerId:A,weightKg:18.4,targetWeightKg:null,
    notes:"empty history secret "+SECRET,name:"A empty"},
  {id:PET_TARGET,ownerId:A,weightKg:null,targetWeightKg:23.1,
    notes:"target-only secret "+SECRET,name:"A target"},
];
const when=(str:string)=>new Date(str);
const dbEntries:Entry[]=[
  {id:"a-late",petId:PET_A,ownerId:A,weightKg:19.25,
    measuredAt:when("2026-10-05T10:00:00.000Z"),
    createdAt:when("2026-10-07T10:00:00.000Z")},
  {id:"b-private",petId:PET_B,ownerId:B,weightKg:29.1,
    measuredAt:when("2026-10-03T10:00:00.000Z"),
    createdAt:when("2026-10-03T11:00:00.000Z")},
  {id:"a-first-created",petId:PET_A,ownerId:A,weightKg:19.6,
    measuredAt:when("2026-10-05T10:00:00.000Z"),
    createdAt:when("2026-10-05T11:00:00.000Z")},
  {id:"a-earlier",petId:PET_A,ownerId:A,weightKg:20.1,
    measuredAt:when("2026-09-01T10:00:00.000Z"),
    createdAt:when("2026-09-02T10:00:00.000Z")},
  // Deliberately impossible under the real composite FK, but proves the
  // synthetic repository must also scope WEIGHT rows by ownerId.
  {id:"b-corrupt-same-pet",petId:PET_A,ownerId:B,weightKg:99.9,
    measuredAt:when("2026-08-01T10:00:00.000Z"),
    createdAt:when("2026-08-02T10:00:00.000Z")},
];
const expectedA=["a-earlier","a-first-created","a-late"];
const request=(who:string,petId=PET_A,query="")=>
  app.request("/api/v1/pets/"+petId+"/weight"+query,{
    method:"GET",
    headers:who?{authorization:"Bearer "+(tokens[who]??who)}:{},
  });
const privateHeaders=(r:Response)=>{
  const values=(r.headers.get("cache-control")??"")
    .toLowerCase().split(",").map(x=>x.trim());
  expect(values).toContain("private");
  expect(values).toContain("no-store");
  expect(values).not.toContain("public");
  expect(r.headers.get("referrer-policy")).toBe("no-referrer");
};
const noWrites=()=>expect(m.mutation).not.toHaveBeenCalled();
const ownerLookup=(id:string,ownerId:string)=>{
  expect(m.petFind).toHaveBeenCalledWith({
    where:{id,ownerId},
    select:{id:true,targetWeightKg:true,weightKg:true},
  });
};
const historyLookup=(petId:string,ownerId:string)=>{
  expect(m.weightFind).toHaveBeenCalledWith({
    where:{petId,ownerId},
    orderBy:[{measuredAt:"asc"},{createdAt:"asc"}],
  });
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
  m.rateKeys.length=0;
  m.registration.mockResolvedValue(true);
  // JWT verification now enforces live DB role equality. A synthetic
  // session fixture must return the real role of the requested actor.
  m.session.mockImplementation(async ({where}:{where:{id:string}}) => ({
    sessionsRevokedAt:null,registrationPending:false,
    role:Object.values(actors).find(actor=>actor.id===where.id)?.role ?? "USER",
  }));
  m.petFind.mockImplementation(async(q:{
    where:{id:string;ownerId:string};
    select:{id:boolean;targetWeightKg:boolean;weightKg:boolean};
  })=>{
    const row=dbPets.find(x=>x.id===q.where.id&&x.ownerId===q.where.ownerId);
    if(!row)return null;
    return {id:row.id,targetWeightKg:row.targetWeightKg,weightKg:row.weightKg};
  });
  m.weightFind.mockImplementation(async(q:{
    where:{petId:string;ownerId:string};
    orderBy:[{measuredAt:string},{createdAt:string}];
  })=>{
    const scoped=dbEntries.filter(x=>
      x.petId===q.where.petId && x.ownerId===q.where.ownerId);
    return scoped.sort((a,b)=>
      a.measuredAt.getTime()-b.measuredAt.getTime() ||
      a.createdAt.getTime()-b.createdAt.getTime()
    );
  });
});

describe("V98 real registered pet weight GET -> actual Core owner history",()=>{
  it("A->B->A JWT actor-scoped history, measuredAt then createdAt ASC, nullable weights",async()=>{
    expect(typeof getPetWeightHistory).toBe("function");
    const cases=[
      ["A",PET_A,A,null,null,expectedA],
      ["B",PET_B,B,25.5,28.75,["b-private"]],
      ["A",PET_A,A,null,null,expectedA],
    ] as const;
    for(const [who,petId,ownerId,target,current,ids] of cases){
      const r=await request(who,petId);
      expect(r.status).toBe(200);privateHeaders(r);
      const body=await r.json();
      expect(Object.keys(body).sort()).toEqual(["data","success"]);
      expect(body.success).toBe(true);
      expect(Object.keys(body.data).sort())
        .toEqual(["currentWeightKg","entries","targetWeightKg"]);
      expect(body.data.targetWeightKg).toBe(target);
      expect(body.data.currentWeightKg).toBe(current);
      expect(body.data.entries.map((row:{id:string})=>row.id)).toEqual(ids);
      for(const entry of body.data.entries as Record<string,unknown>[]){
        expect(entry.ownerId).toBe(ownerId);
        expect(entry.petId).toBe(petId);
        expect(typeof entry.measuredAt).toBe("string");
        expect(typeof entry.createdAt).toBe("string");
        expect(Number.isFinite(Date.parse(entry.measuredAt as string))).toBe(true);
        expect(Number.isFinite(Date.parse(entry.createdAt as string))).toBe(true);
      }
      expect(JSON.stringify(body)).not.toContain(SECRET);
      expect(JSON.stringify(body)).not.toContain("b-corrupt-same-pet");
      expect(JSON.stringify(body)).not.toContain(
        ownerId===A?"b-private":"a-first-created"
      );
      ownerLookup(petId,ownerId);
      historyLookup(petId,ownerId);
      noWrites();
    }
    expect(m.petFind.mock.calls.map(([q])=>q.where.ownerId)).toEqual([A,B,A]);
    expect(m.weightFind).toHaveBeenCalledTimes(3);
  });
  it("empty history of owned pet is 200 [] with independent nullable current/target",async()=>{
    const r=await request("A",PET_EMPTY);
    expect(r.status).toBe(200);privateHeaders(r);
    expect(await r.json()).toEqual({
      success:true,data:{targetWeightKg:null,currentWeightKg:18.4,entries:[]},
    });
    ownerLookup(PET_EMPTY,A);
    historyLookup(PET_EMPTY,A);
    noWrites();
  });
  it("current=null and target=numeric remain distinct from missing and empty history",async()=>{
    const r=await request("A",PET_TARGET);
    expect(r.status).toBe(200);privateHeaders(r);
    expect(await r.json()).toEqual({
      success:true,data:{targetWeightKg:23.1,currentWeightKg:null,entries:[]},
    });
    ownerLookup(PET_TARGET,A);
    historyLookup(PET_TARGET,A);
    noWrites();
  });
  it("concurrent reversed B-before-A history read stays scoped to each signed actor",async()=>{
    const existing=m.weightFind.getMockImplementation()!;
    const pending=new Map<string,()=>void>();
    m.weightFind.mockImplementation((query:{
      where:{petId:string;ownerId:string};
    })=>new Promise(resolve=>{
      pending.set(query.where.ownerId,()=>resolve(existing(query)));
    }));
    const a=request("A",PET_A);
    const b=request("B",PET_B);
    await vi.waitFor(()=>expect(pending.size).toBe(2));
    pending.get(B)!();
    pending.get(A)!();
    const [ra,rb]=await Promise.all([a,b]);
    expect([ra.status,rb.status]).toEqual([200,200]);
    privateHeaders(ra);privateHeaders(rb);
    const [dataA,dataB]=await Promise.all([ra.json(),rb.json()]);
    expect(dataA.data.entries.map((x:{id:string})=>x.id)).toEqual(expectedA);
    expect(dataB.data.entries.map((x:{id:string})=>x.id)).toEqual(["b-private"]);
    for(const item of dataA.data.entries)expect(item.ownerId).toBe(A);
    for(const item of dataB.data.entries)expect(item.ownerId).toBe(B);
    ownerLookup(PET_A,A);ownerLookup(PET_B,B);
    historyLookup(PET_A,A);historyLookup(PET_B,B);
    noWrites();
  });
  it("USER cannot spoof another owner's history using query parameters",async()=>{
    const r=await request("A",PET_B,"?ownerId="+B+"&userId="+B);
    expect(r.status).toBe(404);privateHeaders(r);
    expect(await r.json()).toEqual({
      success:false,error:"Питомец не найден",
    });
    ownerLookup(PET_B,A);
    expect(m.weightFind).not.toHaveBeenCalled();
    noWrites();
  });
  it("foreign A reading B pet and B reading A pet yields masked 404 before history",async()=>{
    for(const [who,id,ownerId] of [
      ["A",PET_B,A],["B",PET_A,B],
    ] as const){
      const r=await request(who,id);
      expect(r.status).toBe(404);privateHeaders(r);
      expect(await r.json()).toEqual({
        success:false,error:"Питомец не найден",
      });
      ownerLookup(id,ownerId);
    }
    expect(m.weightFind).not.toHaveBeenCalled();
    noWrites();
  });
  it("ADMIN / query ownerId cannot impersonate weight history owner",async()=>{
    const r=await request("ADMIN",PET_A,"?ownerId="+A+"&userId="+A);
    expect(r.status).toBe(404);privateHeaders(r);
    expect(await r.json()).toEqual({
      success:false,error:"Питомец не найден",
    });
    ownerLookup(PET_A,actors.ADMIN.id);
    expect(m.weightFind).not.toHaveBeenCalled();
    noWrites();
  });
  it("malformed unknown petId safely follows existing 404, no history query",async()=>{
    const id="malformed-id";
    const r=await request("A",id);
    expect(r.status).toBe(404);privateHeaders(r);
    expect(await r.json()).toEqual({
      success:false,error:"Питомец не найден",
    });
    ownerLookup(id,A);
    expect(m.weightFind).not.toHaveBeenCalled();
    noWrites();
  });
  it("first owner lookup database failure returns generic 500, not missing or 200",async()=>{
    const failure=new Error(SECRET+" "+A+" private@example.invalid");
    failure.stack="SyntheticDbError: "+SECRET+" stack owner "+A;
    const log=LoggerFactory.getAllLoggers().get("web:api-error");
    expect(log).toBeInstanceOf(UnifiedLogger);
    const spy=vi.spyOn(log as UnifiedLogger,"error");
    try {
      m.petFind.mockRejectedValueOnce(failure);
      const r=await request("A");
      expect(r.status).toBe(500);privateHeaders(r);
      const body=await r.json();
      expect(body).toMatchObject({
        success:false,code:"INTERNAL_SERVER_ERROR",
        error:"Внутренняя ошибка сервера",
      });
      expect(JSON.stringify([body,spy.mock.calls])).not.toContain(SECRET);
      expect(JSON.stringify([body,spy.mock.calls])).not.toContain("private@example.invalid");
      expect(JSON.stringify([body,spy.mock.calls])).not.toContain(A);
      expect(m.weightFind).not.toHaveBeenCalled();
      noWrites();
    }finally{spy.mockRestore();}
  });
  it("history query DB error after found owner is generic 500, never false empty",async()=>{
    m.weightFind.mockRejectedValueOnce(
      new Error(SECRET+" "+A+" private@example.invalid")
    );
    const r=await request("A");
    expect(r.status).toBe(500);privateHeaders(r);
    const body=await r.json();
    expect(body).toMatchObject({
      success:false,code:"INTERNAL_SERVER_ERROR",
      error:"Внутренняя ошибка сервера",
    });
    expect(JSON.stringify(body)).not.toContain(SECRET);
    ownerLookup(PET_A,A);
    historyLookup(PET_A,A);
    expect(m.weightFind).toHaveBeenCalledOnce();
    noWrites();
  });
  it.each(["measuredAt","createdAt"] as const)(
    "malformed stored %s must fail closed as generic 500, not a bad success DTO",async(
      key,
    )=>{
    const original=m.weightFind.getMockImplementation()!;
    m.weightFind.mockImplementationOnce(async(query:unknown)=>{
      const valid=await original(query);
      return valid.map((entry:Entry,i:number)=>i===0
        ? {...entry,[key]:new Date(Number.NaN)}:entry);
    });
    const r=await request("A");
    expect(r.status).toBe(500);privateHeaders(r);
    const body=await r.json();
    expect(body).toMatchObject({
      success:false,code:"INTERNAL_SERVER_ERROR",
      error:"Внутренняя ошибка сервера",
    });
    expect(JSON.stringify(body)).not.toContain(SECRET);
    ownerLookup(PET_A,A);
    historyLookup(PET_A,A);
    noWrites();
  });
  it("malformed Prisma response containing another owner's same-pet row fails closed",async()=>{
    const original=m.weightFind.getMockImplementation()!;
    m.weightFind.mockImplementationOnce(async(query:unknown)=>{
      const valid=await original(query);
      const foreign=dbEntries.find(x=>x.id==="b-corrupt-same-pet")!;
      return [...valid,foreign];
    });
    const r=await request("A");
    expect(r.status).toBe(500);privateHeaders(r);
    const body=await r.json();
    expect(body).toMatchObject({
      success:false,code:"INTERNAL_SERVER_ERROR",
      error:"Внутренняя ошибка сервера",
    });
    expect(JSON.stringify(body)).not.toContain("b-corrupt-same-pet");
    expect(JSON.stringify(body)).not.toContain(SECRET);
    ownerLookup(PET_A,A);
    historyLookup(PET_A,A);
    noWrites();
  });
  it.each(["weightKg","targetWeightKg"] as const)(
    "malformed nullable pet %s non-finite Float is generic 500, not null in a 200",async(key)=>{
      const valid=m.petFind.getMockImplementation()!;
      m.petFind.mockImplementationOnce(async(query:unknown)=>{
        const row=await valid(query);
        return {...row,[key]:Number.NaN};
      });
      const r=await request("A");
      expect(r.status).toBe(500);privateHeaders(r);
      const body=await r.json();
      expect(body).toMatchObject({
        success:false,code:"INTERNAL_SERVER_ERROR",
        error:"Внутренняя ошибка сервера",
      });
      expect(m.weightFind).toHaveBeenCalledOnce();
      expect(JSON.stringify(body)).not.toContain(SECRET);
      ownerLookup(PET_A,A);
      noWrites();
    },
  );
  it("guest/invalid JWT and pending registration 401 precede pet medical reads",async()=>{
    for(const who of ["","bad.jwt"]){
      const r=await request(who);
      expect(r.status).toBe(401);privateHeaders(r);
    }
    m.registration.mockResolvedValueOnce(false);
    const pending=await request("A");
    expect(pending.status).toBe(401);privateHeaders(pending);
    expect(await pending.json()).toMatchObject({code:"REGISTRATION_PENDING"});
    expect(m.petFind).not.toHaveBeenCalled();
    expect(m.weightFind).not.toHaveBeenCalled();
    noWrites();
  });
  it("429 rate limit before pet medical reads, private headers retained",async()=>{
    m.throttle=true;
    const r=await request("A");
    expect(r.status).toBe(429);privateHeaders(r);
    expect(m.petFind).not.toHaveBeenCalled();
    expect(m.weightFind).not.toHaveBeenCalled();
    noWrites();
  });
});
