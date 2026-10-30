/**
 * AG1 TR014 missing read producer: registered actual Hono -> ACTUAL existing
 * getDailyCourseBundles Core -> synthetic Prisma. Real signed JWT, auth middleware,
 * original limiter wiring; no fake Core, real SQL, Redis, HTTP socket or writes.
 */
import { randomBytes } from "node:crypto";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type * as PrismaModule from "@gafus/prisma";

const m = vi.hoisted(() => ({
  find: vi.fn(), session: vi.fn(), registration: vi.fn(), write: vi.fn(),
  unrelated: vi.fn(), rateKeys: [] as string[], limited: false,
}));
vi.mock("@hono-rate-limiter/redis", () => ({
  RedisStore: class {
    windowMs = 60000;
    init(opts: { windowMs: number }) { this.windowMs = opts.windowMs; }
    async increment(key: string) {
      m.rateKeys.push(key);
      return { totalHits: m.limited ? 101 : 1,
        resetTime: new Date(Date.now() + this.windowMs) };
    }
    async decrement() { return undefined; }
    async resetKey() { return undefined; }
  },
}));
vi.mock("@gafus/prisma", async (original) => {
  const actual = await original<typeof PrismaModule>();
  return { ...actual, prisma: {
    ...actual.prisma,
    user: { ...actual.prisma.user, findUnique: m.session },
    dailyCourseBundle: { ...actual.prisma.dailyCourseBundle,
      findMany: m.find, create: m.write, update: m.write,
      delete: m.write, deleteMany: m.write },
    dailyCourseBundleStep: { ...actual.prisma.dailyCourseBundleStep,
      createMany: m.write, deleteMany: m.write },
    step: { ...actual.prisma.step, findMany: m.unrelated },
    dailyCourseSchedule: { ...actual.prisma.dailyCourseSchedule,
      findMany: m.unrelated, create: m.write, update: m.write },
    $transaction: m.write,
  }};
});
vi.mock("@gafus/core/services/auth", async original => ({
  ...await original<object>(), isRegistrationCompleted: m.registration,
}));
// NO vi.mock for @gafus/core/services/dailyCourse.
import { app } from "../../app";
import { generateAccessToken } from "@gafus/auth/jwt";
import { getDailyCourseBundles as actualCore } from "@gafus/core/services/dailyCourse";
import {
  bundleSchema, readDailyBundles, TR014_PROPOSED_PATH,
} from "../../../../../apps/trainer-panel/src/trainer-vite/tr014DailyBundlesRead20261022";

const SECRET="AG1_TR014_PRIVATE_EMAIL_STUDENT_PROGRESS_MEDIA_SECRET";
const actors={
 A:{id:"tr014-trainer-A",username:"trainerA",role:"TRAINER"},
 B:{id:"tr014-trainer-B",username:"trainerB",role:"TRAINER"},
 ADMIN:{id:"tr014-admin",username:"admin",role:"ADMIN"},
 MOD:{id:"tr014-mod",username:"moderator",role:"MODERATOR"},
 USER:{id:"tr014-user",username:"user",role:"USER"},
 PARTNER:{id:"tr014-partner",username:"partner",role:"PARTNER"},
} as const;
const tokens:Record<string,string>={};
type Link={id:string;order:number;privateReview:string;
  step:{id:string;title:string;type:string;privateMediaUrl:string}};
type Stored={id:string;title:string;equipment:string;description:string;
  type:string;authorId:string;updatedAt:Date;privateCost:string;
  author:{username:string;email:string};stepLinks:Link[]};
const make=(id:string,owner:string,time:string,orders:number[]):Stored=>({
  id,title:"Bundle "+id,equipment:"leash",description:"For dogs",
  type:"TRAINING",authorId:owner,updatedAt:new Date(time),
  privateCost:SECRET,
  author:{username:"account_"+owner,email:SECRET},
  stepLinks:orders.map(n=>({
    id:id+"-link-"+n,order:n,privateReview:SECRET,
    step:{id:id+"-step-"+n,title:"Step "+n,type:"PRACTICE",privateMediaUrl:SECRET},
  })),
});
const storage:Stored[]=[
  make("A-older",actors.A.id,"2026-10-18T01:00:00.000Z",[1,2]),
  make("B-private",actors.B.id,"2026-10-20T01:00:00.000Z",[1]),
  make("A-newer",actors.A.id,"2026-10-22T01:00:00.000Z",[]),
];
const request=(who:string,suffix="",opts?:{method:string;body?:string})=>
  app.request(TR014_PROPOSED_PATH+suffix,{
    method:opts?.method??"GET",
    headers:{
      ...(who?{authorization:"Bearer "+(tokens[who]??who)}:{}),
      ...(opts?.body!==undefined?{"content-type":"application/json"}:{}),
    },
    ...(opts?.body!==undefined?{body:opts.body}:{}),
  });
const privateHeaders=(r:Response)=>{
  const cc=(r.headers.get("cache-control")??"").toLowerCase()
    .split(",").map(x=>x.trim());
  expect(cc).toContain("private");
  expect(cc).toContain("no-store");
  expect(cc).not.toContain("public");
  expect(r.headers.get("referrer-policy")).toBe("no-referrer");
};
const noWrites=()=>{
  expect(m.write).not.toHaveBeenCalled();
  expect(m.unrelated).not.toHaveBeenCalled();
};
const assertedQuery=(owner?:string)=>{
  const args=m.find.mock.calls.at(-1)?.[0];
  expect(args).toEqual({
    where:owner?{authorId:owner}:{},
    orderBy:{updatedAt:"desc"},
    select:{
      id:true,title:true,equipment:true,description:true,
      type:true,authorId:true,
      author:{select:{username:true}},
      stepLinks:{
        orderBy:{order:"asc"},
        select:{id:true,order:true,step:{select:{
          id:true,title:true,type:true,
        }}},
      },
    },
  });
};
beforeAll(async()=>{
  process.env.JWT_SECRET=randomBytes(48).toString("hex");
  for(const [name,actor] of Object.entries(actors))
    tokens[name]=await generateAccessToken(actor);
});
beforeEach(()=>{
  vi.clearAllMocks(); m.limited=false; m.rateKeys.length=0;
  m.session.mockImplementation(async ({ where }: { where: { id: string } }) => {
    const actor = Object.values(actors).find((candidate) => candidate.id === where.id);
    return actor ? {sessionsRevokedAt:null,registrationPending:false,role:actor.role} : null;
  });
  m.registration.mockResolvedValue(true);
  m.find.mockImplementation(async ({where}:{
    where:{authorId?:string};
  }) => storage
    .filter(x=>!where.authorId||x.authorId===where.authorId)
    .sort((a,b)=>b.updatedAt.getTime()-a.updatedAt.getTime())
    .map(x=>({...x,stepLinks:[...x.stepLinks].sort((a,b)=>a.order-b.order)}))
  );
});

describe("AG1 TR014 actual Hono -> actual Core -> synthetic Prisma bundles",()=>{
  it("real Core is imported, no mock of Core module",()=>{
    expect(typeof actualCore).toBe("function");
  });
  it("TRAINER A->B->A own bundles, source fields and step order",async()=>{
    for(const [who,want] of [
      ["A",["A-newer","A-older"]],["B",["B-private"]],
      ["A",["A-newer","A-older"]],
    ] as const) {
      m.find.mockClear();
      const r=await request(who);
      expect(r.status).toBe(200);privateHeaders(r);
      const body=await r.json();
      expect(Object.keys(body).sort()).toEqual(["data","success"]);
      const data=body.data.map((x:unknown)=>bundleSchema.parse(x));
      expect(data.map((x: {id:string})=>x.id)).toEqual(want);
      for(const item of data){
        expect(item.stepsCount).toBe(item.steps.length);
        expect(item.steps.map((x:{order:number})=>x.order))
          .toEqual([...item.steps.map((x:{order:number})=>x.order)].sort((a:number,b:number)=>a-b));
        expect(Object.keys(item).sort()).toEqual([
          "authorId","authorUsername","description","equipment","id","steps",
          "stepsCount","title","type",
        ]);
      }
      expect(JSON.stringify(body)).not.toContain(SECRET);
      expect(m.find).toHaveBeenCalledTimes(1);
      assertedQuery(actors[who].id);noWrites();
    }
  });
  it.each(["ADMIN","MOD"] as const)(
    "%s retains existing elevated mixed-author policy",async who=>{
      const r=await request(who);
      expect(r.status).toBe(200);privateHeaders(r);
      const result=await r.json();
      expect(result.data.map((x:{id:string})=>x.id)).toEqual([
        "A-newer","B-private","A-older",
      ]);
      const ids=result.data.map((x:{authorId:string})=>x.authorId);
      expect(new Set(ids).size).toBe(2);
      expect(JSON.stringify(result)).not.toContain(SECRET);
      assertedQuery();noWrites();
    });
  it("empty owned collection is real success []",async()=>{
    m.find.mockResolvedValueOnce([]);
    const r=await request("A");
    expect(r.status).toBe(200);privateHeaders(r);
    expect(await r.json()).toEqual({success:true,data:[]});
    assertedQuery(actors.A.id);noWrites();
  });
  it("AG4 existing consumer read can parse actual registered Hono response",async()=>{
    const abort=new AbortController();
    const result=await readDailyBundles({
      enabled:true,role:"TRAINER",actorId:actors.A.id,
      signal:abort.signal,isCurrent:()=>true,
      transport:async(path,signal)=>{
        expect(path).toBe(TR014_PROPOSED_PATH);
        expect(signal).toBe(abort.signal);
        const response=await request("A");
        return {status:response.status,
          headers:{
            "cache-control":response.headers.get("cache-control")??"",
            "referrer-policy":response.headers.get("referrer-policy")??"",
          },
          body:await response.json()};
      },
    });
    expect(result.map(x=>x.id)).toEqual(["A-newer","A-older"]);
    noWrites();
  });
  it.each(["USER","PARTNER"] as const)(
    "%s blocked 403 before Core/storage",async who=>{
      const r=await request(who);
      expect(r.status).toBe(403);privateHeaders(r);
      expect(await r.json()).toMatchObject({code:"FORBIDDEN"});
      expect(m.find).not.toHaveBeenCalled();noWrites();
    });
  it.each(["","invalid.jwt"])("guest or bad JWT 401 before Core %s",async who=>{
    const r=await request(who);
    expect(r.status).toBe(401);privateHeaders(r);
    expect(await r.json()).toMatchObject({code:"UNAUTHORIZED"});
    expect(m.find).not.toHaveBeenCalled();
    expect(m.rateKeys).toHaveLength(0);noWrites();
  });
  it("pending registration remains 401 without querying Core",async()=>{
    m.registration.mockResolvedValueOnce(false);
    const r=await request("A");
    expect(r.status).toBe(401);privateHeaders(r);
    expect(await r.json()).toMatchObject({code:"REGISTRATION_PENDING"});
    expect(m.find).not.toHaveBeenCalled();noWrites();
  });
  it("rate limited 429 before Core with private response",async()=>{
    m.limited=true;
    const r=await request("A");
    expect(r.status).toBe(429);privateHeaders(r);
    expect(await r.json()).toMatchObject({code:"RATE_LIMITED"});
    expect(m.find).not.toHaveBeenCalled();noWrites();
  });
  it.each(["?ownerId="+actors.B.id,"?isAdmin=true","?page=1",
    "?authorId=a&authorId=b","?x=1",
  ])("unexpected query %s returns 400 without reads",async query=>{
    const r=await request("A",query);
    expect(r.status).toBe(400);privateHeaders(r);
    expect(await r.json()).toMatchObject({code:"BAD_QUERY"});
    expect(m.find).not.toHaveBeenCalled();noWrites();
  });
  it("there is no authorized mutation endpoint on TR014",async()=>{
    const r=await request("A","",{method:"POST",body:'{"title":"bad"}'});
    expect([404,405]).toContain(r.status);
    privateHeaders(r);
    expect(m.find).not.toHaveBeenCalled();noWrites();
  });
  it("Prisma DB throw cannot turn into false empty 200",async()=>{
    m.find.mockRejectedValueOnce(Error(SECRET));
    const r=await request("A");
    expect(r.status).toBe(500);privateHeaders(r);
    const body=await r.json();
    expect(body).toMatchObject({code:"INTERNAL_SERVER_ERROR"});
    expect(JSON.stringify(body)).not.toContain(SECRET);
    noWrites();
  });
  it("synthetic wrong-owner source row fails 500 for TRAINER",async()=>{
    m.find.mockResolvedValueOnce([storage[1]]);
    const r=await request("A");
    expect(r.status).toBe(500);privateHeaders(r);
    expect(await r.json()).toMatchObject({code:"INTERNAL_SERVER_ERROR"});
    noWrites();
  });
  it.each(["invalidStepsCount","badAuthorUsername","unorderedSteps","missingStepId"] as const)(
    "malformed actual Core projection %s fails closed 500",async kind=>{
      const stored=structuredClone(storage[0]!);
      if(kind==="invalidStepsCount"){
        // Core derives stepsCount correctly; emulate a corrupt stepLinks shape
        stored.stepLinks={length:-1} as unknown as Stored["stepLinks"];
      }
      if(kind==="badAuthorUsername")
        stored.author.username=null as unknown as string;
      if(kind==="unorderedSteps")
        stored.stepLinks.reverse();
      if(kind==="missingStepId")stored.stepLinks[0]!.step.id="";
      m.find.mockResolvedValueOnce([stored]);
      const r=await request("A");
      expect(r.status).toBe(500);privateHeaders(r);
      expect(await r.json()).toMatchObject({code:"INTERNAL_SERVER_ERROR"});
      noWrites();
    });
});
