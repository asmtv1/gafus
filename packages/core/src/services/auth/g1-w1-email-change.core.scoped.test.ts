import bcrypt from "bcryptjs";
/** W1: REAL Core emailAccountFlows functions, real email schema, fake Prisma/mail.
 * DO NOT interpret these tests as PostgreSQL transaction isolation or SMTP delivery.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
 users:new Map<string,string>(),
 tokens:new Map<string,{
   userId:string;newEmail:string;token:string;expiresAt:Date;createdAt:Date;
 }>(),
 mail:vi.fn(),notice:vi.fn(),deleteCalls:vi.fn(),createCalls:vi.fn(),
 updateCalls:vi.fn(),transactionCalls:vi.fn(),
 lock:Promise.resolve() as Promise<void>,
 failCreate:false,failDelete:false,failUpdate:false,passwordRequired:false,passwordHash:"",
}));
vi.mock("@gafus/prisma",()=>{
const fakeUser={
 findUnique: async ({where}:{where:{id?:string;email?:string}}) => {
   if(where.id) return m.users.has(where.id)?{id:where.id,email:m.users.get(where.id),
   password:m.passwordRequired&&where.id==="A"?m.passwordHash:"",
   passwordSetAt:m.passwordRequired&&where.id==="A"?new Date("2026-01-01"):null}:null;
   const entry=[...m.users.entries()].find(([,email])=>email===where.email);
   return entry?{id:entry[0]}:null;
 },
 update: async ({where,data}:{where:{id:string};data:{email:string}}) => {
   m.updateCalls(where.id,data.email);
   if(m.failUpdate)throw new Error("SYNTH_PRISMA_UPDATE_ERROR");
   m.users.set(where.id,data.email);return {id:where.id,email:data.email};
 },
};
const fakeToken={
 deleteMany: async ({where}:{where:{
   userId:string;token?:string|{not:string};
   OR?:{createdAt:Date|{lt:Date};token?:{lt:string}}[];
 }}) => {
   m.deleteCalls(where.userId);
   if(m.failDelete)throw new Error("SYNTH_PRISMA_DELETE_ERROR");
   let count=0;
   for(const [k,v] of m.tokens) {
     if(v.userId!==where.userId)continue;
     if(typeof where.token==="string"&&k!==where.token)continue;
     if(typeof where.token==="object"&&k===where.token.not)continue;
     if (where.OR && !where.OR.some(condition => {
       if (condition.createdAt instanceof Date) {
         return v.createdAt.getTime() === condition.createdAt.getTime() &&
           k < (condition.token?.lt ?? "");
       }
       return v.createdAt < condition.createdAt.lt;
     })) continue;
     m.tokens.delete(k);count++;
   }
   return {count};
 },
 create: async ({data}:{data:{userId:string;newEmail:string;token:string;expiresAt:Date}}) => {
   m.createCalls(data.userId,data.newEmail);
   if(m.failCreate)throw new Error("SYNTH_PRISMA_CREATE_ERROR");
   const row={...data,createdAt:new Date()};m.tokens.set(data.token,row);return row;
 },
 findUnique: async ({where}:{where:{token:string}}) => m.tokens.get(where.token)??null,
};
return {prisma:{user:fakeUser,emailChangeToken:fakeToken,
 $transaction:async(cb:(tx:unknown)=>Promise<void>)=>{
   m.transactionCalls();
   // Fake serialized owner-row lock; actual PG contention is tested separately.
   const previous=m.lock;let release!:()=>void;
   m.lock=new Promise<void>(r=>{release=r;});
   await previous;
   const userSnapshot=new Map(m.users),tokenSnapshot=new Map(m.tokens);
   try{return await cb({user:fakeUser,emailChangeToken:fakeToken,
     $queryRaw:async(_parts:TemplateStringsArray,id:string)=>m.users.has(id)?[{id}]:[]});}
   catch(e){m.users=new Map(userSnapshot);m.tokens=new Map(tokenSnapshot);throw e;}
   finally{release();}
 }
}};});
vi.mock("@gafus/logger",()=>({createWebLogger:()=>({info:vi.fn(),error:vi.fn(),warn:vi.fn()})}));
vi.mock("./transactionalAuthMail",()=>({getPublicWebBaseUrl:()=>"https://synthetic.invalid",sendEmailChangeConfirmEmail:m.mail,sendEmailChangedNoticeEmail:m.notice,sendPasswordResetLinkEmail:vi.fn()}));
import { requestEmailChange,confirmEmailChangeByToken } from "./emailAccountFlows";
const lastToken=()=>{
 const url=String(m.mail.mock.calls.at(-1)?.[1]??"");return new URL(url).searchParams.get("token")??"";
};
beforeEach(()=>{
 vi.clearAllMocks();m.users=new Map([["A","a@sample.test"],["B","b@sample.test"]]);m.tokens=new Map();m.lock=Promise.resolve();m.failCreate=false;m.failDelete=false;m.failUpdate=false;m.passwordRequired=false;
 m.passwordHash="";m.mail.mockResolvedValue(undefined);m.notice.mockResolvedValue(undefined);
});
describe("W1 real email Core orchestration under fake Prisma/mail",()=>{
 it("24h token is staged before the new-address delivery",async()=>{
  await requestEmailChange("A"," FRESH@SAMPLE.TEST ");
  expect(m.createCalls).toHaveBeenCalledWith("A","fresh@sample.test");
  const t=lastToken();expect(t).toMatch(/^[A-Za-z0-9_-]{43}$/);
  expect(m.tokens.get(t)?.newEmail).toBe("fresh@sample.test");
  expect(m.tokens.get(t)?.expiresAt.getTime()-Date.now()).toBeGreaterThan(23*3600000);
  expect(m.mail).toHaveBeenCalledTimes(1);expect(m.users.get("A")).toBe("a@sample.test");
  expect(m.transactionCalls).toHaveBeenCalledTimes(2);
 });
 it("password-protected account rejects missing or wrong current password before email",async()=>{
  m.passwordRequired=true;m.passwordHash=bcrypt.hashSync("CurrentPass123",4);
  await expect(requestEmailChange("A","fresh@sample.test")).rejects.toThrow("Неверный текущий пароль");
  await expect(requestEmailChange("A","fresh@sample.test","WrongPassword12")).rejects.toThrow("Неверный текущий пароль");
  expect(m.mail).not.toHaveBeenCalled();expect(m.tokens.size).toBe(0);
  await requestEmailChange("A","fresh@sample.test","CurrentPass123");
  expect(m.tokens.size).toBe(1);expect(m.mail).toHaveBeenCalledTimes(1);
 });
 it("successful confirmation notifies only old confirmed address",async()=>{
  await requestEmailChange("A","fresh@sample.test");
  await confirmEmailChangeByToken(lastToken());
  expect(m.notice).toHaveBeenCalledExactlyOnceWith("a@sample.test");
  expect(m.users.get("A")).toBe("fresh@sample.test");
 });
 it("old-address notification outage does not undo confirmed email",async()=>{
  m.notice.mockRejectedValueOnce(new Error("SYNTH_NOTICE_DOWN"));
  await requestEmailChange("A","fresh@sample.test");
  await confirmEmailChangeByToken(lastToken());
  expect(m.users.get("A")).toBe("fresh@sample.test");
 });
 it("sequential request invalidates old token; newest confirms once, replay invalid",async()=>{
  await requestEmailChange("A","first@sample.test");const first=lastToken();
  await requestEmailChange("A","second@sample.test");const next=lastToken();
  expect(first).not.toBe(next);
  expect(m.tokens.has(first)).toBe(false);
  expect(m.tokens.size).toBe(1);
  await expect(confirmEmailChangeByToken(first)).rejects.toThrow("недействительна");
  await confirmEmailChangeByToken(next);
  expect(m.users.get("A")).toBe("second@sample.test");expect(m.tokens.size).toBe(0);
  await expect(confirmEmailChangeByToken(next)).rejects.toThrow("недействительна");
 });
 it("mail failure retains previously issued and persisted token",async()=>{
  await requestEmailChange("A","first@sample.test");const old=lastToken();
  m.mail.mockRejectedValueOnce(new Error("SYNTH_SMTP_UNAVAILABLE"));
  await expect(requestEmailChange("A","new@sample.test")).rejects.toThrow("SYNTH_SMTP_UNAVAILABLE");
  expect(m.tokens.has(old)).toBe(true);expect(m.tokens.size).toBe(1);
  expect([...m.tokens.values()][0]?.newEmail).toBe("first@sample.test");
  expect(m.transactionCalls).toHaveBeenCalledTimes(4);
 });
 it("create failure rolls back token replacement; previously issued link remains",async()=>{
  await requestEmailChange("A","first@sample.test");m.failCreate=true;
  await expect(requestEmailChange("A","new@sample.test")).rejects.toThrow("SYNTH_PRISMA_CREATE_ERROR");
  expect(m.tokens.size).toBe(1);
  expect([...m.tokens.values()][0]?.newEmail).toBe("first@sample.test");
 });
 it("serialized fake owner lock leaves one token under concurrent requests",async()=>{
  const done=await Promise.allSettled([
   requestEmailChange("A","one@sample.test"),requestEmailChange("A","two@sample.test"),
  ]);
  expect(done.map(x=>x.status)).toEqual(["fulfilled","fulfilled"]);
  expect(m.tokens.size).toBe(1);expect(m.mail).toHaveBeenCalledTimes(2);
  expect(m.transactionCalls).toHaveBeenCalledTimes(4);
 });
 it("actual confirmation Core uses one $transaction for lookup, update, token delete",async()=>{
  await requestEmailChange("A","fresh@sample.test");const key=lastToken();
  await confirmEmailChangeByToken(key);
  expect(m.transactionCalls).toHaveBeenCalledTimes(3);
  expect(m.updateCalls).toHaveBeenCalledWith("A","fresh@sample.test");
  expect(m.tokens.size).toBe(0);
 });
 it("fake transaction rollback after user update failure restores old email and token",async()=>{
  await requestEmailChange("A","fresh@sample.test");const t=lastToken();m.failDelete=true;
  await expect(confirmEmailChangeByToken(t)).rejects.toThrow("SYNTH_PRISMA_DELETE_ERROR");
  expect(m.users.get("A")).toBe("a@sample.test");expect(m.tokens.has(t)).toBe(true);
 });
 it("valid token of A while B exists changes A only, even with no caller principal",async()=>{
  await requestEmailChange("A","fresh@sample.test");await confirmEmailChangeByToken(lastToken());
  expect(m.users.get("A")).toBe("fresh@sample.test");expect(m.users.get("B")).toBe("b@sample.test");
 });
 it("email now owned by B causes conflict; no update and token remains",async()=>{
  await requestEmailChange("A","fresh@sample.test");const t=lastToken();m.users.set("B","fresh@sample.test");
  await expect(confirmEmailChangeByToken(t)).rejects.toThrow("Этот email уже занят");
  expect(m.users.get("A")).toBe("a@sample.test");expect(m.tokens.has(t)).toBe(true);
 });
 it("expired token rejects inside transaction, does not change account",async()=>{
  await requestEmailChange("A","fresh@sample.test");const t=lastToken();m.tokens.get(t)!.expiresAt=new Date(Date.now()-1000);
  await expect(confirmEmailChangeByToken(t)).rejects.toThrow("недействительна");
  expect(m.users.get("A")).toBe("a@sample.test");expect(m.tokens.has(t)).toBe(true);
 });
});
