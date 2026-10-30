/** AG4 ACTIVE W1 isolated PostgreSQL: real Core, real Prisma SQL, FAKE mail only.
 * No production, no schema mutations; test fixtures are only this test's UUID users.
 */
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@gafus/prisma";

const targetUrl="postgresql://w1_email_owner@127.0.0.1:55452/gafus_w1_email22ec_ag1_20261017?schema=public";
const url=process.env.W1_REAL_DATABASE_URL;
if(url){
 const u=new URL(url);
 if(url!==targetUrl||u.hostname!=="127.0.0.1"||u.port!=="55452"||u.pathname!=="/gafus_w1_email22ec_ag1_20261017"||u.username!=="w1_email_owner")throw new Error("W1 isolated lease URL mismatch");
}
const m=vi.hoisted(()=>({mail:vi.fn(),requestBarrier:false,barrierOwner:"",deleteArrived:0,deleteWaiting:[] as (()=>void)[],confirmBarrier:false,confirmToken:"",confirmArrived:0,confirmWaiting:[] as (()=>void)[],failTxnDelete:false}));
const waitBoth=async(kind:"request"|"confirm")=>{
 const countKey=kind==="request"?"deleteArrived":"confirmArrived";
 const waitKey=kind==="request"?"deleteWaiting":"confirmWaiting";
 m[countKey]++;
 await new Promise<void>((resolve,reject)=>{
   const timer=setTimeout(()=>reject(new Error("TEST_BARRIER_TIMEOUT")),6500);
   m[waitKey].push(()=>{clearTimeout(timer);resolve();});
   if(m[countKey]===2){const signals=m[waitKey].splice(0);for(const run of signals)run();}
 });
};
vi.mock("@gafus/prisma",async()=>{
 const {createRequire}=await import("node:module");
 const r=createRequire(new URL("../../../../prisma/package.json",import.meta.url));
 const Real=r("@prisma/client").PrismaClient;
 const u=process.env.W1_REAL_DATABASE_URL;
 // Importable by the ordinary Core test suite: an unset opt-in MUST NOT
 // instantiate a DB client or consult .env; describe.skip then keeps it inert.
 if(!u)return {prisma: {}};
 if(u!=="postgresql://w1_email_owner@127.0.0.1:55452/gafus_w1_email22ec_ag1_20261017?schema=public")throw new Error("Explicit exact W1 DB guard required");
 const client=new Real({datasources:{db:{url:u}}});
 const tokenDelegate=new Proxy(client.emailChangeToken,{get(t,k){
   if(k==="deleteMany")return async(args:unknown)=>{
     const result=await t.deleteMany(args as never);
     const owner=(args as {where?:{userId?:string}})?.where?.userId;
     if(m.requestBarrier&&owner===m.barrierOwner)await waitBoth("request");
     return result;
   };
   const v=Reflect.get(t,k);return typeof v==="function"?v.bind(t):v;
 }});
 const proxied=new Proxy(client,{get(t,k){
   if(k==="emailChangeToken")return tokenDelegate;
   if(k==="$transaction")return (fn:(tx:unknown)=>unknown, opts?:unknown)=>t.$transaction((tx:unknown)=>{
     if(!m.confirmBarrier&&!m.failTxnDelete)return fn(tx);
     const proxiedTx=new Proxy(tx as object,{get(x,key){
       if(key==="emailChangeToken")return new Proxy(Reflect.get(x,key),{get(d,op){
         if(op==="deleteMany"&&m.failTxnDelete)return async(args:unknown)=>{
           await d.deleteMany(args);
           throw new Error("SYNTHETIC_TX_AFTER_DELETE_FAILURE");
         };
         if(op==="findUnique")return async(args:unknown)=>{
           const result=await d.findUnique(args);
           if(m.confirmBarrier&&m.confirmArrived<2&&(args as {where:{token:string}}).where.token===m.confirmToken)await waitBoth("confirm");
           return result;
         };
         const v=Reflect.get(d,op);return typeof v==="function"?v.bind(d):v;
       }});
       const v=Reflect.get(x,key);return typeof v==="function"?v.bind(x):v;
     }});return fn(proxiedTx);
   },opts as never);
   const v=Reflect.get(t,k);return typeof v==="function"?v.bind(t):v;
 }});
 return {prisma:proxied};
});
vi.mock("@gafus/logger",()=>({createWebLogger:()=>({info:vi.fn(),warn:vi.fn(),error:vi.fn()})}));
vi.mock("./transactionalAuthMail",()=>({getPublicWebBaseUrl:()=>"https://synthetic.invalid",sendEmailChangeConfirmEmail:m.mail,sendPasswordResetLinkEmail:vi.fn()}));
import {prisma} from "@gafus/prisma";
import { requestEmailChange,confirmEmailChangeByToken } from "./emailAccountFlows";
const db=prisma as PrismaClient;
(url?describe:describe.skip)("W1 isolated PG14 email-change source integration, fake email",()=>{
 let owner="",foreign="";let ownerEmail="",foreignEmail="";
 let mailed:string[]=[];
 beforeEach(async()=>{
  vi.clearAllMocks();m.requestBarrier=false;m.barrierOwner="";m.deleteArrived=0;m.deleteWaiting=[];m.confirmBarrier=false;m.confirmToken="";m.confirmArrived=0;m.confirmWaiting=[];m.failTxnDelete=false;mailed=[];
  owner=randomUUID();foreign=randomUUID();ownerEmail=`w1-test-${owner}@example.test`;foreignEmail=`w1-test-${foreign}@example.test`;
  m.mail.mockImplementation(async (_to:string,link:string)=>{mailed.push(new URL(link).searchParams.get("token")??"");});
  await db.user.createMany({data:[{id:owner,username:`w1-${owner}`,email:ownerEmail,password:"W1 SYNTHETIC NO LOGIN"},{id:foreign,username:`w1-${foreign}`,email:foreignEmail,password:"W1 SYNTHETIC NO LOGIN"}]});
 });
 afterEach(async()=>{
  m.requestBarrier=false;m.confirmBarrier=false;m.failTxnDelete=false;
  if(owner&&foreign){await db.emailChangeToken.deleteMany({where:{userId:{in:[owner,foreign]}}});await db.user.deleteMany({where:{id:{in:[owner,foreign]}}});}
 });
 afterAll(async()=>{await db.$disconnect();});
 function email(label:string){return `w1-${label}-${owner}@example.test`;}
 const rows=async()=>db.emailChangeToken.findMany({where:{userId:owner},select:{token:true,newEmail:true,expiresAt:true}});
 it("W1-DB-01: isolated identity and single request->confirm, replay no second update",async()=>{
  const target=email("single");await requestEmailChange(owner,target);
  const one=await rows();expect(one).toHaveLength(1);expect(mailed).toHaveLength(1);
  expect(one[0]?.token).toBe(mailed[0]);expect((await db.user.findUnique({where:{id:owner}}))?.email).toBe(ownerEmail);
  await confirmEmailChangeByToken(mailed[0]!);
  expect((await db.user.findUnique({where:{id:owner}}))?.email).toBe(target);
  expect(await rows()).toHaveLength(0);await expect(confirmEmailChangeByToken(mailed[0]!)).rejects.toThrow("недействительна");
  expect((await db.user.findUnique({where:{id:foreign}}))?.email).toBe(foreignEmail);
 });
 it("W1-DB-02: mail failure must not destroy previously sent valid token",async()=>{
  const first=email("first"),second=email("second");await requestEmailChange(owner,first);const old=mailed[0]!;
  m.mail.mockRejectedValueOnce(new Error("SYNTHETIC_MAIL_DOWN"));
  await expect(requestEmailChange(owner,second)).rejects.toThrow();
  const after=await rows();expect(after).toHaveLength(1);expect(after[0]?.token).toBe(old);
  await confirmEmailChangeByToken(old);expect((await db.user.findUnique({where:{id:owner}}))?.email).toBe(first);
 });
 it("W1-DB-03: two synchronized real SQL requests -> only one active token",async()=>{
  m.requestBarrier=true;m.barrierOwner=owner;
  const responses=await Promise.allSettled([requestEmailChange(owner,email("one")),requestEmailChange(owner,email("two"))]);
  expect(responses.map(x=>x.status)).toEqual(["fulfilled","fulfilled"]);
  expect(await rows()).toHaveLength(1);
  expect(mailed).toHaveLength(2);
 });
 it("W1-DB-04: two concurrent confirmations of same token get only one success",async()=>{
  await requestEmailChange(owner,email("concurrent"));const t=mailed[0]!;
  m.confirmBarrier=true;m.confirmToken=t;
  const responses=await Promise.allSettled([confirmEmailChangeByToken(t),confirmEmailChangeByToken(t)]);
  expect(responses.filter(x=>x.status==="fulfilled")).toHaveLength(1);
  expect(await rows()).toHaveLength(0);
  expect((await db.user.findUnique({where:{id:owner}}))?.email).toBe(email("concurrent"));
 });
 it("W1-DB-05: second user takes target before confirmation -> conflict/no owner update",async()=>{
  const target=email("occupied");await requestEmailChange(owner,target);const t=mailed[0]!;
  await db.user.update({where:{id:foreign},data:{email:target}});
  await expect(confirmEmailChangeByToken(t)).rejects.toThrow("уже занят");
  expect((await db.user.findUnique({where:{id:owner}}))?.email).toBe(ownerEmail);expect(await rows()).toHaveLength(1);
 });
 it("W1-DB-07: actual SQL rollback after token delete keeps user and token unchanged",async()=>{
  const target=email("rollback");await requestEmailChange(owner,target);const t=mailed[0]!;
  m.failTxnDelete=true;
  await expect(confirmEmailChangeByToken(t)).rejects.toThrow("SYNTHETIC_TX_AFTER_DELETE_FAILURE");
  m.failTxnDelete=false;
  expect((await db.user.findUnique({where:{id:owner}}))?.email).toBe(ownerEmail);
  expect(await rows()).toHaveLength(1);
  expect((await rows())[0]?.token).toBe(t);
 });
 it("W1-DB-06: expired token and cross-account ownership",async()=>{
  const target=email("expired");await requestEmailChange(owner,target);const t=mailed[0]!;
  await db.emailChangeToken.update({where:{token:t},data:{expiresAt:new Date(Date.now()-1000)}});
  await expect(confirmEmailChangeByToken(t)).rejects.toThrow("недействительна");
  expect((await db.user.findUnique({where:{id:owner}}))?.email).toBe(ownerEmail);
  expect((await db.user.findUnique({where:{id:foreign}}))?.email).toBe(foreignEmail);
 });
});
