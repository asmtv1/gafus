/**
 * AG1 TR013 final missing producer edge:
 * ACTUAL registered Hono -> ACTUAL getVisibleSteps Core -> synthetic Prisma.
 * Signed JWT/auth/rate are real in-process; no Core mock, real DB/Redis,
 * loopback server, browser, TLS, native device, mutations or media writes.
 */
import { randomBytes } from "node:crypto";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type * as PrismaModule from "@gafus/prisma";

const m=vi.hoisted(()=>({
  stepFind:vi.fn(),session:vi.fn(),registration:vi.fn(),
  write:vi.fn(),otherRead:vi.fn(),limited:false,rateKeys:[] as string[],
}));
vi.mock("@hono-rate-limiter/redis",()=>({
  RedisStore:class {
    windowMs=60_000;
    init(o:{windowMs:number}){this.windowMs=o.windowMs;}
    async increment(key:string){
      m.rateKeys.push(key);
      return {totalHits:m.limited?101:1,resetTime:new Date(Date.now()+this.windowMs)};
    }
    async decrement(){return undefined;}
    async resetKey(){return undefined;}
  },
}));
vi.mock("@gafus/prisma",async original=>{
  const actual=await original<typeof PrismaModule>();
  return {...actual,prisma:{
    ...actual.prisma,
    user:{...actual.prisma.user,findUnique:m.session},
    step:{...actual.prisma.step,findMany:m.stepFind,create:m.write,
      update:m.write,updateMany:m.write,delete:m.write,deleteMany:m.write},
    stepTemplate:{...actual.prisma.stepTemplate,findMany:m.otherRead,
      create:m.write,update:m.write,delete:m.write},
    $transaction:m.write,
  }};
});
vi.mock("@gafus/core/services/auth",async original=>({
  ...await original<object>(),isRegistrationCompleted:m.registration,
}));
// Never mock @gafus/core/services/trainerStep. The actual package is required.
import { app } from "../../app";
import { generateAccessToken } from "@gafus/auth/jwt";
import { getVisibleSteps as actualCore } from "@gafus/core/services/trainerStep";
import {
  visibleStepSchema, TR013_VISIBLE_STEPS_PROPOSED_PATH,
} from "../../../../../apps/trainer-panel/src/trainer-vite/tr013VisibleStepsRead20261022";

const SECRET="SECRET_TR013_STUDENT_EMAIL_TOKEN_INTERNAL_OWNER_COST";
const actors={
  A:{id:"trainer-joined-A",username:"trainer_a",role:"TRAINER"},
  B:{id:"trainer-joined-B",username:"trainer_b",role:"TRAINER"},
  ADMIN:{id:"admin-joined",username:"admin",role:"ADMIN"},
  MOD:{id:"moderator-joined",username:"moderator",role:"MODERATOR"},
  USER:{id:"member-joined",username:"member",role:"USER"},
  PARTNER:{id:"partner-joined",username:"partner",role:"PARTNER"},
} as const;
const token:Record<string,string>={};
const dt=(x:string)=>new Date(x);
type Course={id:string;name:string;shortDesc:string;logoImg:string;authorEmail:string};
type DayLink={id:string;order:number;privateProgress:string;course:Course};
type StepLink={id:string;order:number;privateNote:string;day:{
  id:string;studentNotes:string;dayLinks:DayLink[];
}};
type Row={
  id:string;title:string;description:string;durationSec:number|null;
  estimatedDurationSec:number|null;type:string;videoUrl:string|null;
  imageUrls:string[];pdfUrls:string[];checklist:null;surveySlug:string|null;
  isDailyCourse:boolean;authorId:string;createdAt:Date;updatedAt:Date;
  author:{username:string;email:string;profile:{
    fullName:string|null;privatePhone:string;
  }|null};
  stepLinks:StepLink[];privateMedicalNote:string;privateMediaToken:string;
};
const nested:StepLink[]=[{
  id:"step-link-private",order:29,privateNote:SECRET,
  day:{id:"day-private",studentNotes:SECRET,dayLinks:[{
    id:"day-link-private",order:72,privateProgress:SECRET,
    course:{id:"course-shared",name:"Public name",shortDesc:"Summary",
      logoImg:"/assets/logo.png",authorEmail:SECRET},
  }]},
}];
const make=(id:string,owner:string,part:Partial<Row>={}):Row=>({
  id,title:"Step "+id,description:"Description "+id,
  durationSec:120,estimatedDurationSec:null,type:"TRAINING",
  videoUrl:null,imageUrls:["/img/"+id+".png"],pdfUrls:[],
  checklist:null,surveySlug:null,isDailyCourse:false,authorId:owner,
  createdAt:dt("2026-10-20T08:00:00.000Z"),
  updatedAt:dt("2026-10-21T08:00:00.000Z"),
  author:{username:"user_"+owner,email:SECRET,
    profile:{fullName:"Trainer "+owner,privatePhone:SECRET}},
  stepLinks:nested,privateMedicalNote:SECRET,privateMediaToken:SECRET,
  ...part,
});
const records:Row[]=[
  make("A-regular-old",actors.A.id,{
    createdAt:dt("2026-10-17T08:00:00.000Z")}),
  make("B-regular",actors.B.id,{
    createdAt:dt("2026-10-21T08:00:00.000Z")}),
  make("A-daily",actors.A.id,{isDailyCourse:true,
    createdAt:dt("2026-10-19T08:00:00.000Z")}),
  make("A-regular-new",actors.A.id,{
    createdAt:dt("2026-10-22T08:00:00.000Z"),
    author:{username:"user_"+actors.A.id,email:SECRET,profile:null}}),
  make("B-daily",actors.B.id,{isDailyCourse:true,
    createdAt:dt("2026-10-22T09:00:00.000Z")}),
];
const coreSelect={
  id:true,title:true,description:true,durationSec:true,
  estimatedDurationSec:true,type:true,videoUrl:true,videoUrls:true,
  imageUrls:true,pdfUrls:true,checklist:true,surveySlug:true,
  isDailyCourse:true,authorId:true,createdAt:true,updatedAt:true,
  author:{select:{username:true,profile:{select:{fullName:true}}}},
  stepLinks:{include:{day:{include:{dayLinks:{include:{
    course:{select:{id:true,name:true,shortDesc:true,logoImg:true}},
  }}}}}},
};
const coreQuery=(ownerId:string|undefined,daily:boolean)=>({
  where:{...(ownerId?{authorId:ownerId}:{}),isDailyCourse:daily},
  select:coreSelect,orderBy:{createdAt:"desc"},
});
const sorted=(owner:string|undefined,daily:boolean)=>
  records.filter(x=>x.isDailyCourse===daily&&(!owner||x.authorId===owner))
    .sort((a,b)=>b.createdAt.getTime()-a.createdAt.getTime());
const storageRead=async(query:{
  where:{authorId?:string;isDailyCourse:boolean};
  select:Record<string,unknown>;
  orderBy:{createdAt:string};
})=>{
  // Actually assert Core's full query; a mock cannot manufacture owner scope.
  expect(query).toEqual(coreQuery(query.where.authorId,query.where.isDailyCourse));
  return sorted(query.where.authorId,query.where.isDailyCourse).map(row=>{
    // Apply Prisma's explicit top-level scalars, nested author SELECT, and
    // the actual broad stepLinks/day/dayLinks INCLUDE with narrowed course.
    const projected:Record<string,unknown>={};
    for(const [key,include] of Object.entries(query.select)){
      if(include===true)projected[key]=row[key as keyof Row];
    }
    const authorSelect=(query.select.author as {select:{
      username:boolean;profile:{select:{fullName:boolean}};
    }}).select;
    projected.author={
      ...(authorSelect.username?{username:row.author.username}:{}),
      profile:row.author.profile&&authorSelect.profile.select.fullName
        ?{fullName:row.author.profile.fullName}:null,
    };
    projected.stepLinks=row.stepLinks.map(link=>({
      id:link.id,order:link.order,privateNote:link.privateNote,
      day:{id:link.day.id,studentNotes:link.day.studentNotes,
        dayLinks:link.day.dayLinks.map(dayLink=>({
          id:dayLink.id,order:dayLink.order,privateProgress:dayLink.privateProgress,
          course:{
            id:dayLink.course.id,name:dayLink.course.name,
            shortDesc:dayLink.course.shortDesc,logoImg:dayLink.course.logoImg,
          },
        })),
      },
    }));
    return projected;
  });
};
const request=(who:string,suffix="")=>
  app.request(TR013_VISIBLE_STEPS_PROPOSED_PATH+suffix,{
    method:"GET",
    headers:who?{authorization:"Bearer "+(token[who]??who)}:{},
  });
const privateHeaders=(r:Response)=>{
  const cc=(r.headers.get("cache-control")??"")
    .toLowerCase().split(",").map(x=>x.trim());
  expect(cc).toContain("private");expect(cc).toContain("no-store");
  expect(cc).not.toContain("public");
  expect(r.headers.get("referrer-policy")).toBe("no-referrer");
};
const noWrites=()=>{
  expect(m.write).not.toHaveBeenCalled();
  expect(m.otherRead).not.toHaveBeenCalled();
};
const queryWas=(ownerId:string|undefined,daily:boolean)=>
  expect(m.stepFind).toHaveBeenCalledExactlyOnceWith(coreQuery(ownerId,daily));
const fields=[
  "id","title","description","durationSec","estimatedDurationSec","type",
  "videoUrl","imageUrls","pdfUrls","checklist","surveySlug","isDailyCourse",
  "authorId","createdAt","updatedAt","author","stepLinks",
].sort();
const assertDto=(input:unknown)=>{
  const v=input as Record<string,unknown>;
  expect(visibleStepSchema.safeParse(input).success).toBe(true);
  expect(Object.keys(v).sort()).toEqual(fields);
  const author=v.author as Record<string,unknown>;
  expect(Object.keys(author).sort()).toEqual(["profile","username"]);
  if(author.profile!==null){
    expect(Object.keys(author.profile as Record<string,unknown>))
      .toEqual(["fullName"]);
  }
  const link=(v.stepLinks as Record<string,unknown>[])[0]!;
  expect(Object.keys(link)).toEqual(["day"]);
  const day=link.day as Record<string,unknown>;
  expect(Object.keys(day)).toEqual(["dayLinks"]);
  const dl=(day.dayLinks as Record<string,unknown>[])[0]!;
  expect(Object.keys(dl)).toEqual(["course"]);
  expect(Object.keys(dl.course as Record<string,unknown>).sort())
    .toEqual(["id","logoImg","name","shortDesc"]);
  expect(v.createdAt).toMatch(/Z$/);
  expect(v.updatedAt).toMatch(/Z$/);
  expect(JSON.stringify(v)).not.toContain(SECRET);
};
beforeAll(async()=>{
  process.env.JWT_SECRET=randomBytes(48).toString("hex");
  for(const [name,actor] of Object.entries(actors))
    token[name]=await generateAccessToken(actor);
});
beforeEach(()=>{
  vi.clearAllMocks();
  m.limited=false;m.rateKeys.length=0;
  m.registration.mockResolvedValue(true);
  m.session.mockImplementation(async ({ where }: { where: { id: string } }) => {
    const actor = Object.values(actors).find((candidate) => candidate.id === where.id);
    return actor ? {sessionsRevokedAt:null,registrationPending:false,role:actor.role} : null;
  });
  m.stepFind.mockImplementation(storageRead);
});
describe("TR013 registered visible steps Hono -> ACTUAL Core -> synthetic Prisma",()=>{
  it("binds actual packaged Core export, never a mocked getVisibleSteps",()=>{
    expect(typeof actualCore).toBe("function");noWrites();
  });
  it("A -> B -> A owner read, default daily false, Core query + strict nested DTO",async()=>{
    const seen:string[]=[];
    for(const who of ["A","B","A"] as const){
      const res=await request(who);
      expect(res.status).toBe(200);privateHeaders(res);
      const body=await res.json();
      expect(Object.keys(body).sort()).toEqual(["data","success"]);
      const ids=sorted(actors[who].id,false).map(x=>x.id);
      expect(body.data.map((x:{id:string})=>x.id)).toEqual(ids);
      for(const step of body.data){
        assertDto(step);
        expect(step.authorId).toBe(actors[who].id);
        expect(step.isDailyCourse).toBe(false);
        seen.push(step.id);
      }
      queryWas(actors[who].id,false);noWrites();
      vi.clearAllMocks();
    }
    expect(seen).toEqual(["A-regular-new","A-regular-old","B-regular",
      "A-regular-new","A-regular-old"]);
  });
  it.each(["ADMIN","MOD"] as const)(
    "%s mixed author regular list uses Core WHERE only isDailyCourse",async who=>{
      const res=await request(who);
      expect(res.status).toBe(200);privateHeaders(res);
      const body=await res.json();
      expect(body.data.map((x:{id:string})=>x.id))
        .toEqual(sorted(undefined,false).map(x=>x.id));
      for(const x of body.data)assertDto(x);
      queryWas(undefined,false);noWrites();
    });
  it.each(["A","B","ADMIN","MOD"] as const)(
    "%s daily=true honors Core owner-or-mixed predicate, same DTO",async who=>{
      const elevated=who==="ADMIN"||who==="MOD";
      const res=await request(who,"?isDailyCourse=true");
      expect(res.status).toBe(200);privateHeaders(res);
      const body=await res.json();
      const owner=elevated?undefined:actors[who].id;
      expect(body.data.map((x:{id:string})=>x.id))
        .toEqual(sorted(owner,true).map(x=>x.id));
      for(const x of body.data){
        assertDto(x);expect(x.isDailyCourse).toBe(true);
      }
      queryWas(owner,true);noWrites();
    });
  it("explicit daily=false preserves default Core arguments",async()=>{
    const res=await request("A","?isDailyCourse=false");
    expect(res.status).toBe(200);privateHeaders(res);
    const body=await res.json();
    expect(body.data.map((x:{id:string})=>x.id))
      .toEqual(["A-regular-new","A-regular-old"]);
    queryWas(actors.A.id,false);noWrites();
  });
  it("Core 0 rows remains confirmed 200 [] without an admin fallback",async()=>{
    m.stepFind.mockResolvedValueOnce([]);
    const res=await request("B","?isDailyCourse=true");
    expect(res.status).toBe(200);privateHeaders(res);
    expect(await res.json()).toEqual({success:true,data:[]});
    queryWas(actors.B.id,true);noWrites();
  });
  it("real Core Prisma error is masked 500 not false [] or private stack",async()=>{
    m.stepFind.mockRejectedValueOnce(new Error(
      SECRET+" PRIVATE_SQL_ERROR actor=trainer-joined-A",
    ));
    const res=await request("A");
    expect(res.status).toBe(500);privateHeaders(res);
    const body=await res.json();
    expect(body).toEqual({
      success:false,code:"INTERNAL_SERVER_ERROR",
      error:"Внутренняя ошибка сервера",
    });
    expect(JSON.stringify(body)).not.toContain(SECRET);
    queryWas(actors.A.id,false);noWrites();
  });
  it.each(["foreign","daily","invalidDate","badNested","unsorted"] as const)(
    "malformed Prisma response %s: route denies success even with actual Core",async mode=>{
      const raw=await storageRead(coreQuery(actors.A.id,false));
      if(mode==="foreign")m.stepFind.mockResolvedValueOnce([
        make("B-injected",actors.B.id),
      ]);
      if(mode==="daily")m.stepFind.mockResolvedValueOnce([
        make("A-wrong-daily",actors.A.id,{isDailyCourse:true}),
      ]);
      if(mode==="invalidDate")m.stepFind.mockResolvedValueOnce([
        make("A-invalid-date",actors.A.id,{createdAt:new Date(NaN)}),
      ]);
      if(mode==="badNested")m.stepFind.mockResolvedValueOnce([
        {...raw[0],stepLinks:[{day:{dayLinks:[{course:{
          id:"course-shared",name:"Course",shortDesc:"Short",
        }}]}}]},
      ]);
      if(mode==="unsorted")m.stepFind.mockResolvedValueOnce(
        [...raw].reverse(),
      );
      const res=await request("A");
      expect(res.status).toBe(500);privateHeaders(res);
      const body=await res.json();
      expect(body).toEqual({
        success:false,code:"INTERNAL_SERVER_ERROR",
        error:"Внутренняя ошибка сервера",
      });
      expect(JSON.stringify(body)).not.toContain(SECRET);
      queryWas(actors.A.id,false);noWrites();
    });
  it.each(["USER","PARTNER"] as const)(
    "%s forbidden before Core/Prisma",async who=>{
      const res=await request(who);
      expect(res.status).toBe(403);privateHeaders(res);
      expect(await res.json()).toEqual({
        success:false,code:"FORBIDDEN",error:"Недостаточно прав",
      });
      expect(m.stepFind).not.toHaveBeenCalled();noWrites();
    });
  it.each(["","invalid.jwt"])(
    "missing/bad JWT 401 before limiter/Core: %s",async who=>{
      const res=await request(who);
      expect(res.status).toBe(401);privateHeaders(res);
      expect(await res.json()).toEqual({
        success:false,code:"UNAUTHORIZED",error:"Не авторизован",
      });
      expect(m.rateKeys).toHaveLength(0);
      expect(m.stepFind).not.toHaveBeenCalled();noWrites();
    });
  it("pending registration preserves distinct 401 before Core",async()=>{
    m.registration.mockResolvedValueOnce(false);
    const res=await request("A");
    expect(res.status).toBe(401);privateHeaders(res);
    expect(await res.json()).toMatchObject({
      success:false,code:"REGISTRATION_PENDING",
    });
    expect(m.stepFind).not.toHaveBeenCalled();noWrites();
  });
  it("rate-limited 429 before actual Core, private headers",async()=>{
    m.limited=true;
    const res=await request("A");
    expect(res.status).toBe(429);privateHeaders(res);
    expect(await res.json()).toEqual({
      success:false,code:"RATE_LIMITED",error:"Слишком много запросов",
    });
    expect(m.stepFind).not.toHaveBeenCalled();noWrites();
  });
  it.each([
    "?isDailyCourse=yes","?isDailyCourse=1","?isDailyCourse=",
    "?isDailyCourse=true&isDailyCourse=false",
    "?ownerId=trainer-joined-B","?authorId=trainer-joined-B",
    "?isAdmin=true","?isAdminOrModerator=true","?page=1",
  ])("unsupported query %s yields BAD_QUERY before Core",async suffix=>{
    const res=await request("A",suffix);
    expect(res.status).toBe(400);privateHeaders(res);
    expect(await res.json()).toEqual({
      success:false,code:"BAD_QUERY",error:"Некорректный запрос",
    });
    expect(m.stepFind).not.toHaveBeenCalled();noWrites();
  });
});
