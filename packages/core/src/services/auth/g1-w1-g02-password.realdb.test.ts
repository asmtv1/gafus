/** AG4 ACTIVE W1 G02 isolated PG14 only. Real Prisma, real bcrypt, fake mail.
 * A precise opt-in URL guard prevents accidental access to any other database.
 * All fixtures UUID-owned and deleted; no production/secrets/network providers.
 */
import {randomUUID} from "node:crypto";
import bcrypt from "bcryptjs";
import {afterAll,afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import type {PrismaClient} from "@gafus/prisma";
const URL_EXPECTED="postgresql://g02_password_owner@127.0.0.1:55453/gafus_w1_g02_password_ag1_20261017?schema=public";
const supplied=process.env.W1_G02_REAL_DATABASE_URL;
if(supplied&&supplied!==URL_EXPECTED)throw Error("W1 G02 isolated AG4 PG lease URL mismatch");
const m=vi.hoisted(()=>({mail:vi.fn(),injectRefreshAfterUpdate:false,changeBarrier:false,changeId:"",changeArrivals:0,waiting:[] as (()=>void)[]}));
async function pauseBoth(){m.changeArrivals++;
 await new Promise<void>((resolve,reject)=>{
  const timer=setTimeout(()=>reject(Error("G02_CONCURRENCY_BARRIER_TIMEOUT")),9000);
  m.waiting.push(()=>{clearTimeout(timer);resolve();});
  if(m.changeArrivals===2){const wake=m.waiting.splice(0);for(const go of wake)go();}
 });
}
vi.mock("@gafus/prisma",async()=>{
 const {createRequire}=await import("node:module");
 const r=createRequire(new URL("../../../../prisma/package.json",import.meta.url));
 const Client=r("@prisma/client").PrismaClient;
 const url=process.env.W1_G02_REAL_DATABASE_URL;
 if(!url)return {prisma:{}};
 if(url!=="postgresql://g02_password_owner@127.0.0.1:55453/gafus_w1_g02_password_ag1_20261017?schema=public")throw Error("Refusing non-AG4 G02 DB URL");
 const db=new Client({datasources:{db:{url}}});
 const proxy=new Proxy(db,{get(target,key){
  if(key==="user")return new Proxy(target.user,{get(d,field){
   if(field==="findUnique")return async(args:unknown)=>{
    const value=await d.findUnique(args);
    const a=args as {where?:{id?:string};select?:{password?:boolean;passwordSetAt?:boolean}};
    if(m.changeBarrier&&a.where?.id===m.changeId&&a.select?.password===true&&a.select?.passwordSetAt===true)await pauseBoth();
    return value;
   };
   const fn=Reflect.get(d,field);return typeof fn==="function"?fn.bind(d):fn;
  }});
  if(key==="$transaction")return (fn:(tx:unknown)=>Promise<unknown>,opts?:unknown)=>target.$transaction(async(tx:unknown)=>{
   if(!m.injectRefreshAfterUpdate)return fn(tx);
   const wrapped=new Proxy(tx as object,{get(t,k){
    if(k==="refreshToken")return new Proxy(Reflect.get(t,k),{get(d,field){
      if(field==="updateMany")return async(args:unknown)=>{await d.updateMany(args);throw Error("SYNTH_FAIL_AFTER_SQL_REFRESH_UPDATE");};
      const v=Reflect.get(d,field);return typeof v==="function"?v.bind(d):v;
    }});
    const v=Reflect.get(t,k);return typeof v==="function"?v.bind(t):v;
   }});
   return fn(wrapped);
  },opts as never);
  const val=Reflect.get(target,key);return typeof val==="function"?val.bind(target):val;
 }});
 return {prisma:proxy};
});
vi.mock("@gafus/logger",()=>({createWebLogger:()=>({info:vi.fn(),warn:vi.fn(),error:vi.fn(),success:vi.fn()})}));
vi.mock("./transactionalAuthMail",()=>({sendPasswordChangedNoticeEmail:m.mail,sendUsernameChangedNoticeEmail:vi.fn(),sendWelcomeEmailAfterRegistration:vi.fn()}));
vi.mock("./passwordReset",()=>({resetPasswordByToken:vi.fn()}));
vi.mock("./registerUserWithCredentials",()=>({registerUserWithCredentials:vi.fn()}));
import {prisma} from "@gafus/prisma";
import {setPassword,changePassword} from "./authService";
import {sessionIsCurrent} from "./identityReadService";
const db=prisma as PrismaClient;
(supplied?describe:describe.skip)("W1 G02 / AG4 real isolated PG14, real bcrypt, fake mail",()=>{
 let owner="",foreign="";
 const fresh=()=>({old:"OldPass9Strong",next:"NextPass8Strong",other:"OtherPass7Strong"});
 beforeEach(async()=>{
  vi.clearAllMocks();m.injectRefreshAfterUpdate=false;m.changeBarrier=false;m.changeId="";m.changeArrivals=0;m.waiting=[];
  owner=randomUUID();foreign=randomUUID();m.mail.mockResolvedValue(undefined);
  const oldHash=await bcrypt.hash(fresh().old,12);
  await db.user.createMany({data:[
   {id:owner,username:`g02-${owner}`,email:`g02-${owner}@example.test`,password:"vk-test-only",passwordSetAt:null},
   {id:foreign,username:`g02-${foreign}`,email:`g02-${foreign}@example.test`,password:oldHash,passwordSetAt:new Date("2025-01-01T00:00:00Z")},
  ]});
  await db.refreshToken.createMany({data:[
   {userId:owner,tokenHash:`g02-test-hash-a-${owner}`,expiresAt:new Date("2030-01-01")},
   {userId:owner,tokenHash:`g02-test-hash-a2-${owner}`,expiresAt:new Date("2030-01-01")},
   {userId:foreign,tokenHash:`g02-test-hash-b-${foreign}`,expiresAt:new Date("2030-01-01")},
  ]});
  await db.session.create({data:{userId:owner,sessionToken:`g02-test-session-${owner}`,expires:new Date("2030-01-01")}});
 });
 afterEach(async()=>{
  m.injectRefreshAfterUpdate=false;m.changeBarrier=false;
  if(owner&&foreign){const ids=[owner,foreign];await db.session.deleteMany({where:{userId:{in:ids}}});await db.refreshToken.deleteMany({where:{userId:{in:ids}}});await db.user.deleteMany({where:{id:{in:ids}}});}
 });
 afterAll(async()=>{await db.$disconnect();});
 const user=async(id:string)=>db.user.findUniqueOrThrow({where:{id}});
 const tokens=async(id:string)=>db.refreshToken.findMany({where:{userId:id},select:{revokedAt:true}});
 it("PG01: first set commits bcrypt hash+revokeStamp+all refresh A only",async()=>{
  const stale=Date.now()-1000;expect(await sessionIsCurrent({sub:owner,authenticatedAt:stale})).toBe(true);
  await setPassword(owner,fresh().next);const a=await user(owner),b=await user(foreign);
  expect(a.password).not.toBe(fresh().next);expect(await bcrypt.compare(fresh().next,a.password)).toBe(true);
  expect(a.passwordSetAt).toBeInstanceOf(Date);expect(a.sessionsRevokedAt?.getTime()).toBe(a.passwordSetAt?.getTime());
  expect((await tokens(owner)).every(t=>t.revokedAt?.getTime()===a.sessionsRevokedAt?.getTime())).toBe(true);
  expect((await tokens(foreign))[0]?.revokedAt).toBeNull();expect(b.sessionsRevokedAt).toBeNull();
  expect(await sessionIsCurrent({sub:owner,authenticatedAt:stale})).toBe(false);
  expect(await sessionIsCurrent({sub:owner,authenticatedAt:a.sessionsRevokedAt!.getTime()+1000})).toBe(true);
 });
 it("PG02: repeated & simultaneous set requests only first succeeds, no second revocation",async()=>{
  const results=await Promise.allSettled([setPassword(owner,fresh().next),setPassword(owner,fresh().other)]);
  expect(results.filter(x=>x.status==="fulfilled")).toHaveLength(1);
  expect(results.filter(x=>x.status==="rejected")).toHaveLength(1);
  const a=await user(owner);expect(a.sessionsRevokedAt).toBeInstanceOf(Date);
  expect((await tokens(owner)).every(x=>x.revokedAt!==null)).toBe(true);
  await expect(setPassword(owner,fresh().next)).rejects.toThrow("уже установлен");
 });
 it("PG03: current password checked using real bcrypt; new B hash, old JWT+refresh revoked",async()=>{
  const was=Date.now()-1000;await changePassword(foreign,fresh().old,fresh().next);
  const b=await user(foreign);expect(await bcrypt.compare(fresh().old,b.password)).toBe(false);
  expect(await bcrypt.compare(fresh().next,b.password)).toBe(true);
  expect(b.sessionsRevokedAt?.getTime()).toBe(b.passwordSetAt?.getTime());
  expect((await tokens(foreign))[0]?.revokedAt?.getTime()).toBe(b.sessionsRevokedAt?.getTime());
  expect(await sessionIsCurrent({sub:foreign,authenticatedAt:was})).toBe(false);
  expect((await tokens(owner)).every(x=>x.revokedAt===null)).toBe(true);
 });
 it("PG04: wrong current/VK-only/invalid new never revoke or change hash",async()=>{
  const before=(await user(foreign)).password;
  await expect(changePassword(foreign,"INCORRECT",fresh().next)).rejects.toThrow("Неверный текущий пароль");
  await expect(changePassword(owner,fresh().old,fresh().next)).rejects.toThrow("Сначала установите пароль");
  await expect(changePassword(foreign,fresh().old,"weak")).rejects.toThrow();
  expect((await user(foreign)).password).toBe(before);
  expect((await tokens(foreign))[0]?.revokedAt).toBeNull();
 });
 it("PG05: synchronized 2 concurrent change passwords with same old: one ACK and one refresh revocation",async()=>{
  m.changeId=foreign;m.changeBarrier=true;
  const results=await Promise.allSettled([changePassword(foreign,fresh().old,fresh().next),changePassword(foreign,fresh().old,fresh().other)]);
  expect(results.filter(x=>x.status==="fulfilled")).toHaveLength(1);
  expect(results.filter(x=>x.status==="rejected")).toHaveLength(1);
  const b=await user(foreign);expect(b.sessionsRevokedAt).toBeInstanceOf(Date);
  expect((await tokens(foreign))[0]?.revokedAt?.getTime()).toBe(b.sessionsRevokedAt?.getTime());
 });
 it("PG06: injected throw AFTER SQL refresh UPDATE rolls back credentials and tokens",async()=>{
  const initial=(await user(foreign)).password;
  m.injectRefreshAfterUpdate=true;
  await expect(changePassword(foreign,fresh().old,fresh().next)).rejects.toThrow("SYNTH_FAIL_AFTER_SQL_REFRESH_UPDATE");
  m.injectRefreshAfterUpdate=false;
  expect((await user(foreign)).password).toBe(initial);
  expect((await user(foreign)).sessionsRevokedAt).toBeNull();
  expect((await tokens(foreign))[0]?.revokedAt).toBeNull();
 });
 it("PG07: notification failure after commit is nonfatal, no email provider called",async()=>{
  m.mail.mockRejectedValueOnce(Error("SYNTHETIC_MAIL_FAILURE"));
  await changePassword(foreign,fresh().old,fresh().next);
  expect((await user(foreign)).sessionsRevokedAt).toBeInstanceOf(Date);
  expect((await tokens(foreign))[0]?.revokedAt).toBeInstanceOf(Date);
 });
});
