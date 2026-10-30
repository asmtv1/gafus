/** AG1 cont146: actual registered Hono source, synthetic Prisma SELECT boundary. */
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
 return {...actual,prisma:{...actual.prisma,
  user:{...actual.prisma.user,findUnique:state.user},
  trainerVideo:{...actual.prisma.trainerVideo,findMany:state.find}}};
});
vi.mock("@gafus/core/services/auth",async original=>({
 ...await original<object>(),isRegistrationCompleted:state.registration,
}));
import {app} from "../../app";
import {generateAccessToken} from "@gafus/auth/jwt";
const actors={
 A:{id:"vid_meta_trainer_a",username:"vidA",role:"TRAINER"},
 B:{id:"vid_meta_trainer_b",username:"vidB",role:"TRAINER"},
 ADMIN:{id:"vid_meta_admin",username:"vidAdmin",role:"ADMIN"},
 MOD:{id:"vid_meta_mod",username:"vidMod",role:"MODERATOR"},
 USER:{id:"vid_meta_user",username:"vidUser",role:"USER"},
 PARTNER:{id:"vid_meta_partner",username:"vidPartner",role:"PARTNER"},
} as const;
const tokens:Record<string,string>={};
const path="/api/v1/trainer/videos/metadata";
const privateInfo="ABSOLUTELY_PRIVATE_MEDIA_PATH";
const record={id:"v1",displayName:null,transcodingStatus:"PENDING",durationSec:null,
 createdAt:new Date("2026-10-22T10:00:00Z"),relativePath:privateInfo,
 hlsManifestPath:privateInfo,thumbnailPath:privateInfo,transcodingError:privateInfo,
 mimeType:privateInfo,originalName:privateInfo,trainerId:privateInfo};
const send=(who:string,url=path)=>app.request(url,{headers:who?{
 Authorization:"Bearer "+(tokens[who]??who),
}:{}});
const privacy=(r:Response)=>{
 expect(r.headers.get("cache-control")).toContain("no-store");
 expect(r.headers.get("referrer-policy")).toBe("no-referrer");
};
beforeAll(async()=>{
 process.env.JWT_SECRET=randomBytes(48).toString("hex");
 for(const [key,a] of Object.entries(actors))tokens[key]=await generateAccessToken(a);
});
beforeEach(()=>{
 vi.clearAllMocks();state.rate=1;
 state.registration.mockResolvedValue(true);
 state.user.mockImplementation(async ({where}:{where:{id:string}}) => {
    const matched=Object.values(actors).find((candidate)=>candidate.id===where.id);
    return matched ? {sessionsRevokedAt:null,registrationPending:false,role:matched.role} : null;
  });
 state.find.mockResolvedValue([record]);
});
describe("AG1 Trainer Videos strict metadata",()=>{
 it("TRAINER A/B own and ADMIN all confirmed Next/Core legacy policy",async()=>{
  for(const who of ["A","B","ADMIN"] as const){
   const response=await send(who);expect(response.status).toBe(200);privacy(response);
   const json=await response.json();
   expect(Object.keys(json.data.videos[0]).sort()).toEqual([
    "createdAt","displayName","durationSec","id","transcodingStatus"]);
   expect(json.data.videos[0].displayName).toBeNull();
   expect(json.data.videos[0].durationSec).toBeNull();
   expect(JSON.stringify(json)).not.toContain(privateInfo);
   expect(state.find).toHaveBeenLastCalledWith({
    where:who==="ADMIN"?undefined:{trainerId:actors[who].id},
    orderBy:{createdAt:"desc"},
    select:{id:true,displayName:true,transcodingStatus:true,durationSec:true,createdAt:true},
   });
  }
 });
 it("real empty success and masked unexpected SQL failure",async()=>{
  state.find.mockResolvedValueOnce([]);
  expect((await (await send("A")).json()).data).toEqual({videos:[]});
  state.find.mockRejectedValueOnce(Error(privateInfo));
  const bad=await send("B");expect(bad.status).toBe(500);privacy(bad);
  expect(JSON.stringify(await bad.json())).not.toContain(privateInfo);
 });
 it("MOD/USER/PARTNER deny, guest401, no owner/page query override",async()=>{
  for(const who of ["MOD","USER","PARTNER"]){
   const r=await send(who);expect(r.status).toBe(403);privacy(r);
  }
  expect((await send("")).status).toBe(401);
  for(const suffix of ["?trainerId=x","?page=1","?admin=true"])
   expect((await send("A",path+suffix)).status).toBe(400);
 });
 it("bad enum/source fails closed, rate429 stays private",async()=>{
  state.find.mockResolvedValueOnce([{...record,transcodingStatus:"UNKNOWN"}]);
  const bad=await send("A");expect(bad.status).toBe(500);privacy(bad);
  state.rate=101;
  const limited=await send("A");expect(limited.status).toBe(429);privacy(limited);
 });
});
