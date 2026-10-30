/** AG1 cont144 one distinct signed Hono + actual metadata producer proof. */
import {randomBytes} from "node:crypto";
import {beforeAll,beforeEach,describe,expect,it,vi} from "vitest";
import type * as PrismaModule from "@gafus/prisma";
const state=vi.hoisted(()=>({find:vi.fn(),user:vi.fn(),registration:vi.fn(),rate:1}));
vi.mock("@hono-rate-limiter/redis",()=>({RedisStore:class{
  windowMs=60000;
  init(c:{windowMs:number}){this.windowMs=c.windowMs;}
  async increment(){return {totalHits:state.rate,resetTime:new Date(Date.now()+this.windowMs)};}
  async decrement(){return undefined;}
  async resetKey(){return undefined;}
}}));
vi.mock("@gafus/prisma",async original=>{
 const actual=await original<typeof PrismaModule>();
 return {...actual,prisma:{...actual.prisma,user:{...actual.prisma.user,findUnique:state.user},
  article:{...actual.prisma.article,findMany:state.find}}};
});
vi.mock("@gafus/core/services/auth",async original=>({
  ...await original<object>(),isRegistrationCompleted:state.registration,
}));
import {app} from "../../app";
import {generateAccessToken} from "@gafus/auth/jwt";
const people={
 A:{id:"article_own_A",username:"artA",role:"TRAINER"},
 B:{id:"article_own_B",username:"artB",role:"TRAINER"},
 ADMIN:{id:"article_own_admin",username:"artAdmin",role:"ADMIN"},
 MOD:{id:"article_own_mod",username:"artMod",role:"MODERATOR"},
 USER:{id:"article_own_user",username:"artUser",role:"USER"},
 PARTNER:{id:"article_own_partner",username:"artPartner",role:"PARTNER"},
} as const;
const tokens:Record<string,string>={};
const uri="/api/v1/trainer/articles/own-summary";
const privateValue="NO_ARTICLE_PRIVATE_MEDIA_PII";
const base={id:"article1",title:"Training tips",slug:"training-tips",visibility:"PUBLIC",
  viewCount:8,createdAt:new Date("2026-10-20T10:00:00Z"),updatedAt:new Date("2026-10-21T10:00:00Z"),
  _count:{articleLikes:4},content:privateValue,description:privateValue,logoImg:privateValue,
  videoUrl:privateValue,authorId:privateValue};
const send=(who:string,url=uri)=>app.request(url,{headers:who?{
  Authorization:"Bearer "+(tokens[who]??who),
}:{}});
const headers=(r:Response)=>{
 expect(r.headers.get("cache-control")).toContain("no-store");
 expect(r.headers.get("referrer-policy")).toBe("no-referrer");
};
beforeAll(async()=>{
 process.env.JWT_SECRET=randomBytes(48).toString("hex");
 for(const [name,p] of Object.entries(people))tokens[name]=await generateAccessToken(p);
});
beforeEach(()=>{
 vi.clearAllMocks();
 state.rate=1;
 state.registration.mockResolvedValue(true);
 state.user.mockImplementation(async ({where}:{where:{id:string}}) => {
    const matched=Object.values(people).find((candidate)=>candidate.id===where.id);
    return matched ? {sessionsRevokedAt:null,registrationPending:false,role:matched.role} : null;
  });
 state.find.mockResolvedValue([base]);
});
describe("AG1 trainer OWN article metadata",()=>{
 it("TRAINER A→B and ADMIN only own source ID, strict select/order DTO",async()=>{
  for(const who of ["A","B","ADMIN"] as const){
   const r=await send(who);expect(r.status).toBe(200);headers(r);
   const dto=await r.json();
   expect(Object.keys(dto.data.articles[0]).sort()).toEqual([
     "createdAt","id","likeCount","slug","title","updatedAt","viewCount","visibility"]);
   expect(dto.data.articles[0].likeCount).toBe(4);
   expect(JSON.stringify(dto)).not.toContain(privateValue);
   expect(state.find).toHaveBeenLastCalledWith({
    where:{authorId:people[who].id},orderBy:[{createdAt:"desc"},{id:"desc"}],take:100,
    select:{id:true,title:true,slug:true,visibility:true,viewCount:true,
      createdAt:true,updatedAt:true,_count:{select:{articleLikes:true}}},
   });
  }
 });
 it("empty is genuine 200, errors mask source, no false empty on DB fail",async()=>{
  state.find.mockResolvedValueOnce([]);
  expect((await (await send("A")).json()).data).toEqual({articles:[]});
  state.find.mockRejectedValueOnce(Error("private SQL details"));
  const res=await send("A");expect(res.status).toBe(500);headers(res);
  expect(JSON.stringify(await res.json())).not.toContain("private SQL details");
 });
 it("denies nonstaff/MOD, guest and owner override",async()=>{
  for(const who of ["MOD","USER","PARTNER"]){const r=await send(who);expect(r.status).toBe(403);headers(r);}
  expect((await send("")).status).toBe(401);
  for(const q of ["?authorId=other","?page=1","?role=ADMIN"])
    expect((await send("A",uri+q)).status).toBe(400);
 });
 it("fails closed on invalid source and private limiter 429",async()=>{
  state.find.mockResolvedValueOnce([{...base,viewCount:-1}]);
  const bad=await send("B");expect(bad.status).toBe(500);headers(bad);
  state.rate=101;
  const denied=await send("A");expect(denied.status).toBe(429);headers(denied);
 });
});
