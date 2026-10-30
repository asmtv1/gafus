/** Create a leased browser-only consultation fixture. No booking/real delivery/printed secrets. */
import { randomBytes } from "node:crypto";
import { realpathSync } from "node:fs";
import { chmod, mkdir, open, readFile } from "node:fs/promises";
import { join } from "node:path";
import bcrypt from "bcryptjs";
import { prisma } from "@gafus/prisma";
const ROOT="/Users/asmtv1/Desktop/gafus-refactor";
const PRIV=join(ROOT,".local-pg-scratch","consultations-browser");
const FIXTURE=join(PRIV,"lease.json");
const PREFIX="ag1_browser_cons_20261025_";
const API="http://127.0.0.1:3001/api/v1";
const obj=(v:unknown):Record<string,unknown>=>v&&typeof v==="object"&&!Array.isArray(v)?v as Record<string,unknown>:{};
function assert(v:unknown,name:string):asserts v{if(!v)throw Error("CONS_BROWSER_"+name);}
async function http(path:string,token?:string){const r=await fetch(API+path,{headers:token?{Authorization:"Bearer "+token}:{},signal:AbortSignal.timeout(10000)});return{status:r.status,body:obj(await r.json())};}
async function main(){
 assert(process.env.AG1_CONSULT_BROWSER_LEASE_SETUP==="1","EXPLICIT_SETUP_REQUIRED");
 assert(realpathSync(ROOT)===ROOT&&realpathSync(process.cwd()).startsWith(ROOT+"/"),"PHYSICAL_ROOT");
 const url=new URL(process.env.DATABASE_URL??"");
 assert(url.hostname==="127.0.0.1"&&url.port==="55921"&&url.pathname==="/gafus_refactor_real_work_20261024"&&url.username==="gafus_refactor_local_real","LOCAL_WORK_DB_ONLY");
 assert((await fetch("http://127.0.0.1:3001/ready",{signal:AbortSignal.timeout(3500)})).status===200,"ORIGINAL_HONO_READY");
 await mkdir(PRIV,{mode:0o700,recursive:true});
 assert(realpathSync(PRIV)===PRIV,"PRIVATE_FIXTURE_ROOT");
 await chmod(PRIV,0o700);
 let existing=false;
 try{const x=await readFile(FIXTURE);existing=x.length>0;}catch(e){if((e as NodeJS.ErrnoException).code!=="ENOENT")throw e;}
 assert(!existing,"LEASE_ALREADY_EXISTS_REFUSE_DUPLICATE");
 const tag=randomBytes(6).toString("hex");
 const trainerName=PREFIX+tag+"_trainer",userName=PREFIX+tag+"_client";
 const trainerPassword=randomBytes(32).toString("base64url"), userPassword=randomBytes(32).toString("base64url");
 let trainerId="",userId="",cynId="",createdLease=false;
 try{
  const trainer=await prisma.user.create({data:{username:trainerName,password:await bcrypt.hash(trainerPassword,10),role:"TRAINER",passwordSetAt:new Date(),registrationPending:false}});
  trainerId=trainer.id;
  const client=await prisma.user.create({data:{username:userName,password:await bcrypt.hash(userPassword,10),role:"USER",passwordSetAt:new Date(),registrationPending:false}});
  userId=client.id;
  await prisma.appSubscription.create({data:{userId,provider:"MANUAL",status:"ACTIVE",planCode:"THREE_MONTHS",
    currentPeriodStart:new Date(Date.now()-3600_000),currentPeriodEnd:new Date(Date.now()+90*86400_000),
    manualReason:"REFRACTOR WORK isolated synthetic AG2 browser consultation; no payment"}});
  const cyn=await prisma.consultationCynologist.create({data:{userId:trainerId,isListed:true,slotHorizonDays:14,
    slotDurationMin:30,bookingLeadTimeMin:5,confirmationSlaMin:1440}});cynId=cyn.id;
  for(let weekday=0;weekday<7;weekday++)await prisma.consultationAvailabilityRule.create({data:{cynologistId:cynId,weekday,startTime:"11:00",endTime:"17:00",isWorkingDay:true}});
  const signed=await fetch(API+"/auth/login",{method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({username:userName,password:userPassword}),signal:AbortSignal.timeout(10000)});
  const result=obj(await signed.json()),token=obj(result.data).accessToken;
  assert(signed.status===200&&typeof token==="string"&&token.length>30,"REAL_HONO_LOGIN");
  const my=await http("/consultations/my",token);
  const myItems=obj(my.body.data).items;
  assert(my.status===200&&Array.isArray(myItems)&&myItems.length===0,"REAL_MY_EMPTY");
  const catalog=await http("/consultations/cynologists",token);
  assert(catalog.status===200&&Array.isArray(catalog.body.data)&&catalog.body.data.some((x:unknown)=>obj(x).userId===trainerId),"REAL_SYNTHETIC_TRAINER_LISTED");
  const from=new Date(Date.now()+2*86400_000),to=new Date(Date.now()+8*86400_000);
  const uri=`/consultations/cynologists/${trainerId}/slots?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`;
  const calendar=await http(uri,token);
  const choices=calendar.body.data;
  assert(calendar.status===200&&Array.isArray(choices)&&choices.length>0,"REAL_GENERATED_FREE_SLOTS");
  const free=choices.find((x:unknown)=>obj(x).status==="FREE")??choices[0];
  const slotId=obj(free).id;
  assert(typeof slotId==="string"&&slotId.length>5,"FREE_SLOT_ID");
  const check=await http(`/consultations/cynologists/${trainerId}/slots/${slotId}/verify`,token);
  assert(check.status===200,"REAL_ENTITLED_SLOT_VERIFY");
  const row=await prisma.consultationSlot.findUnique({where:{id:slotId}});
  assert(row?.cynologistId===cynId&&row.status==="FREE","WORK_SQL_FREE_SLOT");
  assert((await prisma.consultationBooking.count({where:{clientId:userId}}))===0,"NO_PREBOOKING");
  const expiresAt=new Date(Date.now()+2*3600_000).toISOString();
  const payload={version:1,scope:"gafus-refactor-WORK-browser-consultation",marker:tag,
    createdAt:new Date().toISOString(),expiresAt,client:{id:userId,username:userName,password:userPassword},
    trainer:{id:trainerId,username:trainerName,password:trainerPassword,cynologistId:cynId},
    freeSlot:{id:slotId,startAtUtc:obj(free).startAtUtc,status:"FREE"},
    paths:{login:"http://127.0.0.1:5173/login",catalog:"http://127.0.0.1:5173/consultations",
      specialist:`http://127.0.0.1:5173/consultations/cynologists/${trainerId}`,
      schedule:`http://127.0.0.1:5173/consultations/cynologists/${trainerId}/slots`,
      booking:`http://127.0.0.1:5173/consultations/cynologists/${trainerId}/slots/${slotId}`,
      mine:"http://127.0.0.1:5173/consultations/my"},
    noDelivery:true,ownedOnly:true,cleanupState:"WAIT_AG2_DONE"};
  const fd=await open(FIXTURE,"wx",0o600);
  try{await fd.writeFile(JSON.stringify(payload)+"\n",{encoding:"utf8"});await fd.sync();}finally{await fd.close();}
  await chmod(FIXTURE,0o600);
  createdLease=true;
  console.warn("AG1_CONSULT_BROWSER_LEASE_CREATED=PASS");
  console.warn("AG1_CONSULT_REAL_LOGIN_MY_EMPTY_TRAINER_LISTED_FREE_SLOT_SQL=PASS");
  console.warn("AG1_CONSULT_FIXTURE_PRIVATE_PATH="+FIXTURE);
  console.warn("AG1_CONSULT_FIXTURE_CLIENT_PLAN=THREE_MONTHS_ACTIVE;TRAINER=TRAINER;BOOKINGS=0;SLOT=FREE");
  console.warn("AG1_CONSULT_FIXTURE_TTL_SECONDS=7200;DELIVERY=DISABLED_BY_NO_RECIPIENTS;NO_BOOKING_SENT");
 }finally{
  if(!createdLease){
   if(cynId)await prisma.consultationCynologist.deleteMany({where:{id:cynId,userId:trainerId}});
   for(const [id,name] of [[userId,userName],[trainerId,trainerName]])if(id){
    const row=await prisma.user.findUnique({where:{id},select:{username:true}});
    if(row?.username===name)await prisma.user.delete({where:{id}});
   }
   console.error("AG1_CONSULT_SETUP_FAILED_COMPENSATED");
  }
 }
}
void main().catch(e=>{process.exitCode=1;console.error("AG1_CONSULT_SETUP_FAILED_"+(e instanceof Error?e.name:"UNKNOWN"));}).finally(async()=>{await prisma.$disconnect();});
