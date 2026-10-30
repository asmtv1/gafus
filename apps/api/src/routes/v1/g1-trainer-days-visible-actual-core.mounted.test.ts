/**
 * AG1 visible-days frozen producer: ACTUAL registered Hono ->
 * ACTUAL existing trainingDay.getVisibleDays Core -> synthetic Prisma.
 * Signed JWT/auth, privacy and rate middleware are actual in-process.
 * No Core mock, real SQL, HTTP server/browser/TLS/device or day writes.
 */
import { randomBytes } from "node:crypto";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type * as PrismaModule from "@gafus/prisma";

const m = vi.hoisted(() => ({
  find: vi.fn(), session: vi.fn(), registration: vi.fn(),
  write: vi.fn(), otherRead: vi.fn(),
  rateKeys: [] as string[], limited: false,
}));
vi.mock("@hono-rate-limiter/redis", () => ({
  RedisStore: class {
    windowMs = 60_000;
    init(o: { windowMs: number }) { this.windowMs = o.windowMs; }
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
    trainingDay: {
      ...actual.prisma.trainingDay,
      findMany: m.find, create: m.write, update: m.write,
      delete: m.write, deleteMany: m.write,
    },
    dayOnCourse: { ...actual.prisma.dayOnCourse,
      create: m.write, createMany: m.write,
      delete: m.write, deleteMany: m.write },
    stepOnDay: { ...actual.prisma.stepOnDay,
      create: m.write, delete: m.write, deleteMany: m.write },
    $transaction: m.write,
  }};
});
vi.mock("@gafus/core/services/auth", async original => ({
  ...await original<object>(),
  isRegistrationCompleted: m.registration,
}));
// NEVER mock @gafus/core/services/trainingDay.
import { app } from "../../app";
import { generateAccessToken } from "@gafus/auth/jwt";
import { getVisibleDays as actualCore } from "@gafus/core/services/trainingDay";

const PATH="/api/v1/trainer/days";
const SECRET="AG1_VISIBLE_DAYS_PRIVATE_EMAIL_STUDENT_NOTE_MEDIA_PROVIDER";
const actors={
  A:{id:"trainer-days-A",username:"trainer_a",role:"TRAINER"},
  B:{id:"trainer-days-B",username:"trainer_b",role:"TRAINER"},
  ADMIN:{id:"trainer-days-admin",username:"admin",role:"ADMIN"},
  MOD:{id:"trainer-days-moderator",username:"moderator",role:"MODERATOR"},
  USER:{id:"trainer-days-user",username:"user",role:"USER"},
  PARTNER:{id:"trainer-days-partner",username:"partner",role:"PARTNER"},
} as const;
const token:Record<string,string>={};
const date=(iso:string)=>new Date(iso);
type StepLink={
  id:string;order:number;privateProgress:string;
  step:{id:string;title:string;privateVideo:string};
};
type DayLink={
  id:string;order:number;privateAccess:string;
  course:{id:string;name:string;paymentSecret:string};
};
type Stored={
  id:string;title:string;equipment:string;description:string;type:string;
  authorId:string;showCoursePathExport:boolean;shareProgressAcrossCourses:boolean;
  createdAt:Date;updatedAt:Date;privateDiary:string;privateCost:string;
  author:{username:string;email:string;profile:{
    fullName:string|null;privatePhone:string;
  }|null};
  stepLinks:StepLink[];dayLinks:DayLink[];
};
const stepLinks=(prefix:string):StepLink[]=>[2,1].map(n=>({
  id:prefix+"-sl"+n,order:n,privateProgress:SECRET,
  step:{id:prefix+"-step"+n,title:"Step "+n,privateVideo:SECRET},
}));
const dayLinks=(prefix:string):DayLink[]=>[3,1].map(n=>({
  id:prefix+"-dl"+n,order:n,privateAccess:SECRET,
  course:{id:prefix+"-course"+n,name:"Course "+n,paymentSecret:SECRET},
}));
function day(id:string,owner:string,created:string,extras:Partial<Stored>={}):Stored{
  return {
    id,title:"Day "+id,equipment:"leash",description:"Daily plan",
    type:"regular",authorId:owner,
    showCoursePathExport:true,shareProgressAcrossCourses:false,
    createdAt:date(created),updatedAt:date("2026-10-22T12:00:00.000Z"),
    privateDiary:SECRET,privateCost:SECRET,
    author:{username:"account_"+owner,email:SECRET,
      profile:{fullName:"Trainer "+owner,privatePhone:SECRET}},
    stepLinks:stepLinks(id),dayLinks:dayLinks(id),...extras,
  };
}
const source:Stored[]=[
  day("A-old",actors.A.id,"2026-10-18T00:00:00.000Z"),
  day("B-one",actors.B.id,"2026-10-20T00:00:00.000Z"),
  day("A-new",actors.A.id,"2026-10-22T00:00:00.000Z",{
    author:{username:"a-new",email:SECRET,profile:null},
    stepLinks:[],dayLinks:[],
  }),
];
const request=(who:string,suffix="",method="GET")=>
  app.request(PATH+suffix,{method,headers:who?{
    authorization:"Bearer "+(token[who]??who),
  }:{}});
const assertPrivate=(r:Response)=>{
  const cc=(r.headers.get("cache-control")??"").toLowerCase()
    .split(",").map(x=>x.trim());
  expect(cc).toContain("private");
  expect(cc).toContain("no-store");
  expect(cc).not.toContain("public");
  expect(r.headers.get("referrer-policy")).toBe("no-referrer");
};
const noWrites=()=>{
  expect(m.write).not.toHaveBeenCalled();
  expect(m.otherRead).not.toHaveBeenCalled();
};
function assertCoreQuery(owner?:string){
  expect(m.find).toHaveBeenCalledExactlyOnceWith({
    where:owner?{authorId:owner}:{},
    include:{
      author:{select:{username:true,profile:{select:{fullName:true}}}},
      stepLinks:{
        include:{step:{select:{id:true,title:true}}},
        orderBy:{order:"asc"},
      },
      dayLinks:{
        include:{course:{select:{id:true,name:true}}},
        orderBy:{order:"asc"},
      },
    },
    orderBy:{createdAt:"desc"},
  });
}

beforeAll(async()=>{
  process.env.JWT_SECRET=randomBytes(48).toString("hex");
  for(const [alias,actor] of Object.entries(actors))
    token[alias]=await generateAccessToken(actor);
});
beforeEach(()=>{
  vi.clearAllMocks();m.limited=false;m.rateKeys.length=0;
  m.session.mockImplementation(async ({ where }: { where: { id: string } }) => {
    const actor = Object.values(actors).find((candidate) => candidate.id === where.id);
    return actor ? {sessionsRevokedAt:null,registrationPending:false,role:actor.role} : null;
  });
  m.registration.mockResolvedValue(true);
  m.find.mockImplementation(async (args:{where:{authorId?:string}})=>
    source
      .filter(row=>!args.where.authorId||row.authorId===args.where.authorId)
      .sort((a,b)=>b.createdAt.getTime()-a.createdAt.getTime())
      .map(row=>({
        ...row,
        stepLinks:[...row.stepLinks].sort((a,b)=>a.order-b.order),
        dayLinks:[...row.dayLinks].sort((a,b)=>a.order-b.order),
      })),
  );
});

describe("AG1 visible-days GET actual registered Hono → actual Core → synthetic Prisma",()=>{
  it("imports existing actual Core function; no source Core mock",()=>{
    expect(typeof actualCore).toBe("function");
  });
  it("TRAINER A→B→A: owns days, parent DESC, link ASC, ISO whitelist",async()=>{
    for(const [who,ids] of [
      ["A",["A-new","A-old"]],
      ["B",["B-one"]],
      ["A",["A-new","A-old"]],
    ] as const){
      m.find.mockClear();
      const r=await request(who);
      expect(r.status).toBe(200);assertPrivate(r);
      const body=await r.json();
      expect(Object.keys(body).sort()).toEqual(["data","success"]);
      expect(body.data.map((x:{id:string})=>x.id)).toEqual(ids);
      expect(m.find).toHaveBeenCalledTimes(1);
      assertCoreQuery(actors[who].id);
      for(const item of body.data){
        expect(Object.keys(item).sort()).toEqual([
          "author","authorId","createdAt","dayLinks","description",
          "equipment","id","shareProgressAcrossCourses",
          "showCoursePathExport","stepLinks","title","type","updatedAt",
        ]);
        expect(item.createdAt).toMatch(/Z$/);
        expect(item.updatedAt).toMatch(/Z$/);
        expect(item.stepLinks.map((x:{order:number})=>x.order))
          .toEqual([...item.stepLinks.map((x:{order:number})=>x.order)]
            .sort((a:number,b:number)=>a-b));
        expect(item.dayLinks.map((x:{order:number})=>x.order))
          .toEqual([...item.dayLinks.map((x:{order:number})=>x.order)]
            .sort((a:number,b:number)=>a-b));
      }
      expect(JSON.stringify(body)).not.toContain(SECRET);
      noWrites();
    }
  });
  it.each(["ADMIN","MOD"] as const)(
    "%s sees mixed-author list without client owner flags",async who=>{
      const r=await request(who);
      expect(r.status).toBe(200);assertPrivate(r);
      const body=await r.json();
      expect(body.data.map((x:{id:string})=>x.id))
        .toEqual(["A-new","B-one","A-old"]);
      expect(new Set(body.data.map((x:{authorId:string})=>x.authorId)).size).toBe(2);
      assertCoreQuery();
      expect(JSON.stringify(body)).not.toContain(SECRET);
      noWrites();
    });
  it("nested whitelist retains nullable author.profile and required relation keys",async()=>{
    const r=await request("A");
    const body=await r.json();
    expect(body.data[0].author).toEqual({username:"a-new",profile:null});
    const older=body.data[1];
    expect(older.author).toEqual({username:"account_"+actors.A.id,
      profile:{fullName:"Trainer "+actors.A.id}});
    expect(older.stepLinks).toEqual([
      {id:"A-old-sl1",order:1,step:{id:"A-old-step1",title:"Step 1"}},
      {id:"A-old-sl2",order:2,step:{id:"A-old-step2",title:"Step 2"}},
    ]);
    expect(older.dayLinks).toEqual([
      {id:"A-old-dl1",order:1,course:{id:"A-old-course1",name:"Course 1"}},
      {id:"A-old-dl3",order:3,course:{id:"A-old-course3",name:"Course 3"}},
    ]);
    noWrites();
  });
  it("legitimately empty DB output 200 [] not guessed, exactly one Core query",async()=>{
    m.find.mockResolvedValueOnce([]);
    const r=await request("A");
    expect(r.status).toBe(200);assertPrivate(r);
    expect(await r.json()).toEqual({success:true,data:[]});
    assertCoreQuery(actors.A.id);noWrites();
  });
  it.each(["USER","PARTNER"] as const)(
    "%s receives 403 before any Core read",async who=>{
      const r=await request(who);
      expect(r.status).toBe(403);assertPrivate(r);
      expect(await r.json()).toMatchObject({code:"FORBIDDEN"});
      expect(m.find).not.toHaveBeenCalled();noWrites();
    });
  it.each(["","invalid.jwt"])("guest/bad JWT 401 pre-limiter/Core: %s",async who=>{
    const r=await request(who);
    expect(r.status).toBe(401);assertPrivate(r);
    expect(await r.json()).toMatchObject({code:"UNAUTHORIZED"});
    expect(m.rateKeys).toHaveLength(0);
    expect(m.find).not.toHaveBeenCalled();noWrites();
  });
  it("registration-pending remains 401 (not rewritten) pre-Core",async()=>{
    m.registration.mockResolvedValueOnce(false);
    const r=await request("A");
    expect(r.status).toBe(401);assertPrivate(r);
    expect(await r.json()).toMatchObject({code:"REGISTRATION_PENDING"});
    expect(m.find).not.toHaveBeenCalled();noWrites();
  });
  it("rate429 is private and before Core",async()=>{
    m.limited=true;
    const r=await request("A");
    expect(r.status).toBe(429);assertPrivate(r);
    expect(await r.json()).toMatchObject({code:"RATE_LIMITED"});
    expect(m.find).not.toHaveBeenCalled();noWrites();
  });
  it.each(["?authorId="+actors.B.id,"?isAdmin=true","?page=1",
    "?x=1&x=2","?order=ASC","?role=ADMIN",
  ])("extra/duplicate query %s -> 400 pre-Core",async query=>{
    const r=await request("A",query);
    expect(r.status).toBe(400);assertPrivate(r);
    expect(await r.json()).toMatchObject({code:"BAD_QUERY"});
    expect(m.find).not.toHaveBeenCalled();noWrites();
  });
  it("no day mutation route on this new endpoint",async()=>{
    const r=await request("A","","POST");
    expect([404,405]).toContain(r.status);
    assertPrivate(r);
    expect(m.find).not.toHaveBeenCalled();noWrites();
  });
  it("Prisma failure -> masked 500, never false empty 200",async()=>{
    m.find.mockRejectedValueOnce(Error(SECRET));
    const r=await request("A");
    expect(r.status).toBe(500);assertPrivate(r);
    const body=await r.json();
    expect(body).toMatchObject({code:"INTERNAL_SERVER_ERROR"});
    expect(JSON.stringify(body)).not.toContain(SECRET);noWrites();
  });
  it("foreign source row for TRAINER fails closed 500 without leaking actor data",async()=>{
    m.find.mockResolvedValueOnce([source[1]]);
    const r=await request("A");
    expect(r.status).toBe(500);assertPrivate(r);
    expect(await r.json()).toMatchObject({code:"INTERNAL_SERVER_ERROR"});
    noWrites();
  });
  it.each(["invalidCreated","invalidUpdated","badOwner","badFlag",
    "badProfile","badStep","badCourse","wrongStepOrder","wrongDayOrder",
    "wrongParentOrder",
  ] as const)("malformed nested/source %s -> 500 no leaks",async kind=>{
    const row=structuredClone(source[0]!);
    if(kind==="invalidCreated")row.createdAt=new Date("invalid");
    if(kind==="invalidUpdated")row.updatedAt="not-date" as unknown as Date;
    if(kind==="badOwner")row.authorId="";
    if(kind==="badFlag")row.showCoursePathExport="true" as unknown as boolean;
    if(kind==="badProfile")row.author.profile={fullName:5} as unknown as Stored["author"]["profile"];
    if(kind==="badStep")row.stepLinks[0]!.step.id="";
    if(kind==="badCourse")row.dayLinks[0]!.course.name=undefined as unknown as string;
    if(kind==="wrongStepOrder")row.stepLinks.sort((a,b)=>b.order-a.order);
    if(kind==="wrongDayOrder")row.dayLinks.sort((a,b)=>b.order-a.order);
    if(kind==="wrongParentOrder"){
      m.find.mockResolvedValueOnce([source[0],source[2]]);
    } else m.find.mockResolvedValueOnce([row]);
    const r=await request("A");
    expect(r.status).toBe(500);assertPrivate(r);
    expect(await r.json()).toMatchObject({code:"INTERNAL_SERVER_ERROR"});
    noWrites();
  });
});
