// @vitest-environment node
/**
 * AG4 independent AG3-PROFILE-031 PETS-TAB READ-ONLY CONTRACT: actual mounted
 * Hono GET /api/v1/pets with signed JWT; mock Core, Prisma identity and Redis
 * limiter ONLY. No Mobile source changes, no UI acceptance or real network/DB.
 * Existing pet create/edit/gallery and G05 prior suites are not repeated.
 */
import {randomBytes} from "node:crypto";
import {beforeAll,afterAll,beforeEach,expect,it,vi} from "vitest";
import {z} from "zod/v3";
import type * as PrismaModule from "@gafus/prisma";
import type * as PetModule from "@gafus/core/services/pets";

const m=vi.hoisted(()=>({
  pets:vi.fn(),session:vi.fn(),registration:vi.fn(),
  denied:false,keys:[] as string[],
}));
vi.mock("@hono-rate-limiter/redis",()=>({RedisStore:class{
  windowMs=60_000;
  init(options:{windowMs:number}){this.windowMs=options.windowMs;}
  async increment(key:string){m.keys.push(key);return {
    totalHits:m.denied?101:1,resetTime:new Date(Date.now()+this.windowMs),
  };}
  async decrement(){return undefined;}
  async resetKey(){return undefined;}
}}));
vi.mock("@gafus/prisma",async(original)=>{
  const mod=await original<typeof PrismaModule>();
  return {...mod,prisma:{...mod.prisma,user:{...mod.prisma.user,
    findUnique:m.session}}};
});
vi.mock("@gafus/core/services/auth",async(original)=>({
  ...await original<object>(),isRegistrationCompleted:m.registration,
}));
vi.mock("@gafus/core/services/pets",async(original)=>({
  ...await original<typeof PetModule>(),getUserPets:m.pets,
}));
// Original Hono GET now binds the dedicated Core petRead barrel, not pets index.
vi.mock("@gafus/core/services/petRead",async(original)=>({
  ...await original<object>(),getUserPets:m.pets,
}));
const appPath="../../../api/src/app";
const {app}=await vi.importActual<{
 app:{request:(path:string,init?:RequestInit)=>Promise<Response>},
}>(appPath);
const {generateAccessToken}=await vi.importActual<{
 generateAccessToken:(input:{id:string;username:string;role:
 "USER"|"ADMIN"})=>Promise<string>,
}>("@gafus/auth/jwt");
const owners={
 A:{id:"owner_A",username:"owner_a",role:"USER" as const},
 B:{id:"owner_B",username:"owner_b",role:"USER" as const},
 ADMIN:{id:"admin_1",username:"admin",role:"ADMIN" as const},
};
const tokens:Record<string,string>={};
const PII="PRIVATE_MEDICAL_NOTE_FOR_OWNER_A";
const pet=(id:string,ownerId:string)=>({
 id,ownerId,name:"Собака "+id,type:"DOG",breed:"Метис",
 breedKey:null,birthDate:"2021-08-09T00:00:00.000Z",
 heightCm:null,weightKg:11.2,targetWeightKg:null,
 neckGirthCm:null,muzzleGirthCm:null,bellyGirthCm:null,
 photoUrl:null,showInProfile:false,notes:PII,
 createdAt:"2026-10-20T09:00:00.000Z",updatedAt:"2026-10-20T09:00:00.000Z",
 awards:[{id:"private-award",petId:id,date:"2026-10-01T00:00:00.000Z"}],
});
const result=async(who:keyof typeof owners,url="/api/v1/pets")=>
  app.request(url,{method:"GET",headers:{authorization:"Bearer "+tokens[who]}});
const privateHeaders=(response:Response)=>{
 const directives=(response.headers.get("cache-control")??"").toLowerCase()
   .split(",").map(x=>x.trim());
 expect(directives).toContain("private");
 expect(directives).toContain("no-store");
 expect(directives).not.toContain("public");
 expect(response.headers.get("referrer-policy")).toBe("no-referrer");
};
/** Test-only expected Mobile Pet view. Not a claimed installed client parser. */
const mobilePet=z.object({
 id:z.string().min(1),name:z.string().min(1),type:z.enum(["DOG","CAT"]),
 breed:z.string().nullable(),birthDate:z.string().nullable(),
 heightCm:z.number().nullable(),weightKg:z.number().nullable(),
 targetWeightKg:z.number().nullable().optional(),
 neckGirthCm:z.number().nullable(),muzzleGirthCm:z.number().nullable(),
 bellyGirthCm:z.number().nullable(),photoUrl:z.string().nullable(),
 showInProfile:z.boolean(),notes:z.string().nullable(),
 createdAt:z.string().min(1),ownerId:z.string().min(1),
}).passthrough();
/** Only synthetic owner boundary check; does not pretend current Mobile has it. */
function projectReadForOwner(raw:unknown,ownerId:string){
 const envelope=z.object({success:z.literal(true),data:z.array(mobilePet)}).parse(raw);
 if(envelope.data.some(x=>x.ownerId!==ownerId))throw Error("FOREIGN_OWNER_PET");
 return envelope.data.map(x=>({
  id:x.id,name:x.name,type:x.type,breed:x.breed,birthDate:x.birthDate,
  weightKg:x.weightKg,notes:x.notes,showInProfile:x.showInProfile,
 }));
}
beforeAll(async()=>{
 vi.stubEnv("JWT_SECRET",randomBytes(48).toString("hex"));
 for(const [name,actor] of Object.entries(owners)){
  tokens[name]=await generateAccessToken(actor);
 }
});
afterAll(()=>vi.unstubAllEnvs());
beforeEach(()=>{
 vi.clearAllMocks();m.denied=false;m.keys.length=0;
 m.registration.mockResolvedValue(true);
 m.session.mockImplementation(async ({ where }: { where: { id: string } }) => {
    const actor = Object.values(owners).find((candidate) => candidate.id === where.id);
    return actor ? {sessionsRevokedAt:null,registrationPending:false,role:actor.role} : null;
  });
 m.pets.mockImplementation(async(ownerId:string,opts:{throwOnError:boolean})=>{
  if(!opts.throwOnError)throw Error("HARD_FAILURE_MUST_NOT_BE_EMPTY_LIST");
  return ownerId===owners.ADMIN.id?[]:[pet("pet_"+ownerId,ownerId)];
 });
});

it("registered Hono GET under REAL signed USER A JWT: Core owner and strict failure, no-store",async()=>{
 const r=await result("A");
 expect(r.status).toBe(200);privateHeaders(r);
 expect(m.pets).toHaveBeenCalledExactlyOnceWith(owners.A.id,{throwOnError:true});
 const raw=await r.json();
 const rows=projectReadForOwner(raw,owners.A.id);
 expect(rows).toMatchObject([{id:"pet_owner_A",name:"Собака pet_owner_A",type:"DOG"}]);
 expect(JSON.stringify(rows)).toContain(PII); // own private notes are expected in owner-only response
 expect(m.keys.length).toBeGreaterThan(0);
});
it("signed USER B gets B only after A; raw response never contains A medical notes or awards",async()=>{
 const a=await result("A");await a.json();
 m.pets.mockResolvedValueOnce([pet("pet_owner_B","owner_B")]);
 const b=await result("B");
 expect(b.status).toBe(200);privateHeaders(b);
 const raw=await b.json();
 expect(projectReadForOwner(raw,owners.B.id)).toMatchObject([{id:"pet_owner_B"}]);
 expect(JSON.stringify(raw)).not.toContain("pet_owner_A");
 expect(m.pets.mock.calls).toEqual([
  [owners.A.id,{throwOnError:true}],[owners.B.id,{throwOnError:true}],
 ]);
});
it("ADMIN does NOT impersonate USER A: same JWT owner-only list returns real empty200",async()=>{
 const r=await result("ADMIN");
 expect(r.status).toBe(200);privateHeaders(r);
 expect(await r.json()).toEqual({success:true,data:[]});
 expect(m.pets).toHaveBeenCalledExactlyOnceWith(owners.ADMIN.id,{throwOnError:true});
});
it("guest/malformed bearer blocked 401 before Core, private headers preserved",async()=>{
 for(const header of [undefined,"Bearer invalid.jwt"]){
  const r=await app.request("/api/v1/pets",{
   headers:header?{authorization:header}:{},
  });
  expect(r.status).toBe(401);privateHeaders(r);
  expect((await r.json() as {success?:unknown}).success).not.toBe(true);
 }
 expect(m.pets).not.toHaveBeenCalled();
});
it("rate limited GET returns early 429 with private headers, no Core list read",async()=>{
 m.denied=true;
 const r=await result("A");
 expect(r.status).toBe(429);privateHeaders(r);
 expect(m.pets).not.toHaveBeenCalled();
});
it("actual Core list error 500 must not be projected as [] by Hono",async()=>{
 m.pets.mockRejectedValueOnce(Error(PII));
 const r=await result("A");
 expect(r.status).toBe(500);privateHeaders(r);
 const body=await r.text();
 expect(body).not.toContain(PII);
 expect(body).not.toContain("data\":[]");
 expect(m.pets).toHaveBeenCalledWith(owners.A.id,{throwOnError:true});
});
it("valid no-pet user is 200 [], distinct from Core failure",async()=>{
 m.pets.mockResolvedValueOnce([]);
 const r=await result("A");
 expect(r.status).toBe(200);privateHeaders(r);
 expect(await r.json()).toEqual({success:true,data:[]});
});
it("raw Prisma relation/owner fields exist in actual API: MOBILE MUST validate before storing",async()=>{
 const r=await result("A");const raw=await r.json() as {data:Record<string,unknown>[]};
 expect(raw.data[0]?.ownerId).toBe(owners.A.id);
 expect(raw.data[0]?.awards).toEqual(expect.any(Array));
 expect(raw.data[0]?.notes).toBe(PII);
 const projected=projectReadForOwner(raw,owners.A.id);
 expect(JSON.stringify(projected)).not.toContain("private-award");
 expect(JSON.stringify(projected)).not.toContain("ownerId");
});
it("malformed / foreign Core row is NOT safe for proposed client even if Hono blindly returns 200",async()=>{
 m.pets.mockResolvedValueOnce([pet("foreignPet",owners.B.id)]);
 const r=await result("A");
 expect(r.status).toBe(200); // Core trusted by server: negative evidence, not a success claim
 const raw=await r.json();
 expect(()=>projectReadForOwner(raw,owners.A.id)).toThrow("FOREIGN_OWNER_PET");
});
it("malformed DTO does not become empty-list success in proposed strict view",async()=>{
 m.pets.mockResolvedValueOnce([{...pet("petA",owners.A.id),type:"FERRET"}]);
 const r=await result("A");
 expect(r.status).toBe(200);
 const raw=await r.json();
 expect(()=>projectReadForOwner(raw,owners.A.id)).toThrow();
});
