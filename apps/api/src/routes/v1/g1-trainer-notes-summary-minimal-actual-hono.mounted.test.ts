/**
 * AG1 cont139: registered Hono -> actual Notes minimal SQL producer ->
 * synthetic Prisma transaction snapshot, with signed JWT. No Core old
 * getTrainerNotes mock or old content SELECT, no real SQL/Redis/socket.
 */
import { randomBytes } from "node:crypto";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type * as PrismaModule from "@gafus/prisma";
const state=vi.hoisted(()=>({
  user:vi.fn(),registration:vi.fn(),
  find:vi.fn(),count:vi.fn(),transaction:vi.fn(),
  write:vi.fn(),rateKeys:[] as string[],limited:false,
}));
vi.mock("@hono-rate-limiter/redis",()=>({
  RedisStore:class {
    windowMs=60000;
    init(o:{windowMs:number}){this.windowMs=o.windowMs;}
    async increment(key:string){
      state.rateKeys.push(key);
      return {totalHits:state.limited?101:1,
        resetTime:new Date(Date.now()+this.windowMs)};
    }
    async decrement(){return undefined;}
    async resetKey(){return undefined;}
  },
}));
vi.mock("@gafus/prisma",async original=>{
  const actual=await original<typeof PrismaModule>();
  return {...actual,prisma:{...actual.prisma,
    user:{...actual.prisma.user,findUnique:state.user},
    trainerNote:{...actual.prisma.trainerNote,
      findMany:vi.fn(()=>{throw Error("DIRECT_NOTES_READ_FORBIDDEN");}),
      count:vi.fn(()=>{throw Error("DIRECT_NOTES_COUNT_FORBIDDEN");}),
      create:state.write,update:state.write,delete:state.write,
    },
    trainerNoteEntry:{...actual.prisma.trainerNoteEntry,
      findMany:vi.fn(()=>{throw Error("PRIVATE_ENTRY_READ_FORBIDDEN");}),
      create:state.write,update:state.write},
    trainerNoteStudent:{...actual.prisma.trainerNoteStudent,
      findMany:vi.fn(()=>{throw Error("PRIVATE_STUDENT_READ_FORBIDDEN");}),
      create:state.write,delete:state.write},
    $transaction:state.transaction,
  }};
});
vi.mock("@gafus/core/services/auth",async original=>({
  ...await original<object>(),isRegistrationCompleted:state.registration,
}));
// No mock of the registered route / actual notes minimal read implementation.
import {app} from "../../app";
import {generateAccessToken} from "@gafus/auth/jwt";

const PATH="/api/v1/trainer/notes/summary";
const PRIVATE="CONFIDENTIAL_STUDENT_USER_EMAIL_ENTRY_CONTENT";
const actors={
  A:{id:"notes-actor-A",username:"trainerA",role:"TRAINER"},
  B:{id:"notes-actor-B",username:"trainerB",role:"TRAINER"},
  MOD:{id:"notes-actor-MOD",username:"moderator",role:"MODERATOR"},
  ADMIN:{id:"notes-actor-ADMIN",username:"admin",role:"ADMIN"},
  USER:{id:"notes-actor-USER",username:"user",role:"USER"},
  PARTNER:{id:"notes-actor-PARTNER",username:"partner",role:"PARTNER"},
} as const;
const jwt:Record<string,string>={};
type DbNote={
  id:string;trainerId:string;title:string|null;tags:string[];
  createdAt:Date;
  entries:{content:string}[];students:{studentId:string}[];
  privateNote:string;
};
const dbNotes:DbNote[]=[
  {id:"note-a1",trainerId:actors.A.id,title:"A first",tags:["focus","dog"],
    createdAt:new Date("2026-10-22T10:00:00Z"),
    entries:[{content:PRIVATE}],students:[{studentId:PRIVATE}],privateNote:PRIVATE},
  {id:"note-a2",trainerId:actors.A.id,title:null,tags:[],
    createdAt:new Date("2026-10-21T11:00:00Z"),
    entries:[{content:PRIVATE}],students:[{studentId:PRIVATE}],privateNote:PRIVATE},
  {id:"note-b1",trainerId:actors.B.id,title:"B's note",tags:["kennel"],
    createdAt:new Date("2026-10-20T11:00:00Z"),
    entries:[{content:PRIVATE}],students:[{studentId:PRIVATE}],privateNote:PRIVATE},
  {id:"note-mod",trainerId:actors.MOD.id,title:"Mod note",tags:["week"],
    createdAt:new Date("2026-10-19T11:00:00Z"),
    entries:[{content:PRIVATE}],students:[{studentId:PRIVATE}],privateNote:PRIVATE},
];
const send=(who:string,query="",method="GET")=>app.request(PATH+query,{
  method,headers:who?{authorization:"Bearer "+(jwt[who]??who)}:{},
});
function privateHeaders(response:Response){
  const cache=(response.headers.get("cache-control")??"").toLowerCase();
  expect(cache).toContain("private");expect(cache).toContain("no-store");
  expect(response.headers.get("referrer-policy")).toBe("no-referrer");
}
type Projection={
  id:string;title:string|null;tags:string[];createdAt:string;
};
const fields=["createdAt","id","tags","title"];
type Data={notes:Projection[];total:number;page:number;pageSize:number};
async function ok(response:Response):Promise<Data>{
  expect(response.status).toBe(200);privateHeaders(response);
  const payload=await response.json() as {success:boolean;data:Data};
  expect(Object.keys(payload).sort()).toEqual(["data","success"]);
  expect(payload.success).toBe(true);
  expect(Object.keys(payload.data).sort()).toEqual(["notes","page","pageSize","total"]);
  for(const note of payload.data.notes){
    expect(Object.keys(note).sort()).toEqual(fields);
    expect(note.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(Array.isArray(note.tags)).toBe(true);
  }
  const json=JSON.stringify(payload);
  expect(json).not.toContain(PRIVATE);
  expect(json).not.toContain("trainerId");
  expect(json).not.toContain("entries");
  expect(json).not.toContain("students");
  expect(json).not.toContain("entryCount");
  return payload.data;
}
function verifySql(expectedWhere:Record<string,string>,page=0,pageSize=50){
  expect(state.transaction).toHaveBeenCalledTimes(1);
  expect(state.find).toHaveBeenCalledExactlyOnceWith({
    where:expectedWhere,
    select:{id:true,title:true,tags:true,createdAt:true},
    orderBy:[{createdAt:"desc"},{id:"desc"}],
    skip:page*pageSize,
    take:pageSize,
  });
  expect(state.count).toHaveBeenCalledExactlyOnceWith({where:expectedWhere});
  expect(state.transaction.mock.calls[0]?.[1]).toEqual({
    isolationLevel:"RepeatableRead",
  });
  expect(state.write).not.toHaveBeenCalled();
}
beforeAll(async()=>{
  process.env.JWT_SECRET=randomBytes(48).toString("hex");
  for(const [label,actor] of Object.entries(actors))
    jwt[label]=await generateAccessToken(actor);
});
beforeEach(()=>{
  vi.clearAllMocks();state.limited=false;state.rateKeys.length=0;
  state.user.mockImplementation(async ({ where }: { where: { id: string } }) => {
    const actor = Object.values(actors).find((candidate) => candidate.id === where.id);
    return actor
      ? { sessionsRevokedAt: null, registrationPending: false, role: actor.role }
      : null;
  });
  state.registration.mockResolvedValue(true);
  state.transaction.mockImplementation(async(callback:(t:unknown)=>Promise<unknown>)=>{
    // One logical snapshot for BOTH list and count.
    const snapshot=dbNotes.map(row=>({...row}));
    const tx={
      trainerNote:{
        findMany:(args:{where:{trainerId?:string};skip:number;take:number})=>{
          state.find(args);
          return Promise.resolve(snapshot.filter(x=>
            !args.where.trainerId||x.trainerId===args.where.trainerId)
            .sort((a,b)=>b.createdAt.getTime()-a.createdAt.getTime())
            .slice(args.skip,args.skip+args.take));
        },
        count:(args:{where:{trainerId?:string}})=>{
          state.count(args);
          return Promise.resolve(snapshot.filter(x=>
            !args.where.trainerId||x.trainerId===args.where.trainerId).length);
        },
      },
    };
    return callback(tx);
  });
});
describe("AG1 cont139 actual Hono/notes-minimal producer synthetic Prisma",()=>{
  it("TRAINER A→B→A owner from JWT, no private fields",async()=>{
    for(const [who,expected] of [
      ["A",["note-a1","note-a2"]],
      ["B",["note-b1"]],
      ["A",["note-a1","note-a2"]],
    ] as const){
      state.transaction.mockClear();state.find.mockClear();state.count.mockClear();
      const rows=await ok(await send(who));
      expect(rows.notes.map(n=>n.id)).toEqual(expected);
      expect(rows.page).toBe(0);expect(rows.pageSize).toBe(50);
      expect(rows.total).toBe(expected.length);
      verifySql({trainerId:actors[who].id});
    }
  });
  it("MODERATOR permitted but ONLY its own notes",async()=>{
    const rows=await ok(await send("MOD"));
    expect(rows.notes.map(n=>n.id)).toEqual(["note-mod"]);
    verifySql({trainerId:actors.MOD.id});
  });
  it("ADMIN gets ALL notes, source date DESC",async()=>{
    const rows=await ok(await send("ADMIN"));
    expect(rows.notes.map(n=>n.id)).toEqual(
      ["note-a1","note-a2","note-b1","note-mod"]);
    expect(rows.total).toBe(4);
    verifySql({});
  });
  it("page=1,pageSize=2 gives consistent count 4 and second slice",async()=>{
    const rows=await ok(await send("ADMIN","?page=1&pageSize=2"));
    expect(rows).toMatchObject({total:4,page:1,pageSize:2});
    expect(rows.notes.map(n=>n.id)).toEqual(["note-b1","note-mod"]);
    verifySql({},1,2);
  });
  it("explicit page=1000 and pageSize=1 yields genuine 200 empty",async()=>{
    const rows=await ok(await send("A","?page=1000&pageSize=1"));
    expect(rows).toMatchObject({notes:[],total:2,page:1000,pageSize:1});
    verifySql({trainerId:actors.A.id},1000,1);
  });
  it("empty source for owner yields 200 without errors",async()=>{
    state.transaction.mockImplementationOnce(async(fn:(tx:unknown)=>Promise<unknown>)=>
      fn({trainerNote:{
        findMany:(args:unknown)=>{state.find(args);return Promise.resolve([]);},
        count:(args:unknown)=>{state.count(args);return Promise.resolve(0);},
      }}));
    const data=await ok(await send("A"));
    expect(data).toEqual({notes:[],total:0,page:0,pageSize:50});
    verifySql({trainerId:actors.A.id});
  });
  it.each(["USER","PARTNER"] as const)(
    "%s forbidden 403 before SQL/transaction",async who=>{
      const res=await send(who);
      expect(res.status).toBe(403);privateHeaders(res);
      expect(await res.json()).toMatchObject({code:"FORBIDDEN"});
      expect(state.transaction).not.toHaveBeenCalled();
    });
  it.each(["","bad.jwt"])("missing/bad JWT401 %s",async who=>{
    const res=await send(who);
    expect(res.status).toBe(401);privateHeaders(res);
    expect(await res.json()).toMatchObject({code:"UNAUTHORIZED"});
    expect(state.transaction).not.toHaveBeenCalled();
    expect(state.rateKeys).toHaveLength(0);
  });
  it("registration pending401 prior to SQL",async()=>{
    state.registration.mockResolvedValueOnce(false);
    const res=await send("A");
    expect(res.status).toBe(401);privateHeaders(res);
    expect(await res.json()).toMatchObject({code:"REGISTRATION_PENDING"});
    expect(state.transaction).not.toHaveBeenCalled();
  });
  it("rate limit429 before SQL with private headers",async()=>{
    state.limited=true;
    const res=await send("A");
    expect(res.status).toBe(429);privateHeaders(res);
    expect(await res.json()).toMatchObject({code:"RATE_LIMITED"});
    expect(state.transaction).not.toHaveBeenCalled();
  });
  it.each([
    "?trainerId=notes-actor-B","?studentId=studentA","?tags=focus",
    "?owner=A","?page=-1","?page=1001","?page=01","?page=1.1",
    "?pageSize=0","?pageSize=51","?pageSize=05","?page=1&page=2",
    "?pageSize=2&pageSize=3","?page=0&studentId=private",
  ])("invalid query %s -> 400, no SQL",async query=>{
    const res=await send("A",query);
    expect(res.status).toBe(400);privateHeaders(res);
    expect(await res.json()).toMatchObject({code:"BAD_QUERY"});
    expect(state.transaction).not.toHaveBeenCalled();
  });
  it("POST unsupported, no writes",async()=>{
    const r=await send("A","","POST");
    expect([404,405]).toContain(r.status);privateHeaders(r);
    expect(state.transaction).not.toHaveBeenCalled();
    expect(state.write).not.toHaveBeenCalled();
  });
  it("count SQL error masked500, not fake empty result",async()=>{
    state.transaction.mockRejectedValueOnce(Error(PRIVATE));
    const r=await send("A");
    expect(r.status).toBe(500);privateHeaders(r);
    const text=JSON.stringify(await r.json());
    expect(text).toContain("INTERNAL_SERVER_ERROR");
    expect(text).not.toContain(PRIVATE);
    expect(state.write).not.toHaveBeenCalled();
  });
  it.each(["date","tags","title","count"] as const)(
    "bad selected source shape %s => masked 500",async fault=>{
      const broken=dbNotes[0]!;
      const item:Record<string,unknown>={...broken};
      if(fault==="date")item.createdAt="bad-date";
      if(fault==="tags")item.tags=[PRIVATE,12];
      if(fault==="title")item.title=123;
      state.transaction.mockImplementationOnce(async(fn:(tx:unknown)=>Promise<unknown>)=>
        fn({trainerNote:{
          findMany:(args:unknown)=>{
            state.find(args);return Promise.resolve([item]);},
          count:(args:unknown)=>{
            state.count(args);return Promise.resolve(fault==="count"?-1:1);},
        }}));
      const r=await send("A");
      expect(r.status).toBe(500);privateHeaders(r);
      expect(await r.json()).toMatchObject({code:"INTERNAL_SERVER_ERROR"});
      expect(state.write).not.toHaveBeenCalled();
    });
});
