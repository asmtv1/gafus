/** W1 G02: real authService setPassword/changePassword functions with injected Prisma and fake mail.
 * In-process, no SQL, no real bcrypt hashes, no actual JWT/network/mail delivery.
 */
import {beforeEach,describe,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({
 state:new Map<string,{password:string;passwordSetAt:Date|null;sessionsRevokedAt:Date|null;email:string}>(),
 sessions:new Map<string,{userId:string;revokedAt:Date|null}>(),
 mail:vi.fn(),hash:vi.fn(),compare:vi.fn(),updateMany:vi.fn(),revoke:vi.fn(),txn:vi.fn(),faultRevoke:false,
}));
vi.mock("bcryptjs",()=>({default:{hash:(s:string,n:number)=>m.hash(s,n),compare:(s:string,h:string)=>m.compare(s,h)}}));
vi.mock("@gafus/prisma",()=>{
 const user={
  findUnique:async ({where}:{where:{id:string}})=>m.state.get(where.id)??null,
  update:async ({where,data}:{where:{id:string};data:{password:string;passwordSetAt:Date}})=>{
   const u=m.state.get(where.id);if(!u)throw Error("FAKE_USER_MISSING");
   m.state.set(where.id,{...u,...data});return m.state.get(where.id);
  },
  updateMany:async ({where,data}:{where:{id:string;passwordSetAt?:null|{not:null};password?:string};data:{password:string;passwordSetAt:Date;sessionsRevokedAt:Date}})=>{
   const u=m.state.get(where.id);if(!u)return {count:0};
   if(where.passwordSetAt===null&&u.passwordSetAt!==null)return {count:0};
   if(where.passwordSetAt&&typeof where.passwordSetAt==="object"&&u.passwordSetAt===null)return {count:0};
   if(where.password!==undefined&&u.password!==where.password)return {count:0};
   m.updateMany(where,data);m.state.set(where.id,{...u,...data});return {count:1};
  },
 };
 const refreshToken={updateMany:async({where,data}:{where:{userId:string;revokedAt:null};data:{revokedAt:Date}})=>{
  m.revoke(where,data);if(m.faultRevoke)throw Error("FAKE_DB_REVOKE_FAILURE");
  let count=0;for(const [id,row] of m.sessions)if(row.userId===where.userId&&row.revokedAt===null){m.sessions.set(id,{...row,revokedAt:data.revokedAt});count++;}return {count};
 }};
 const tx={user,refreshToken};
 return {prisma:{user,refreshToken,$transaction:async (fn:(tx:typeof tx)=>Promise<unknown>)=>{
  m.txn();const oldUsers=new Map(m.state),oldSessions=new Map(m.sessions);
  try{return await fn(tx);}catch(e){m.state=oldUsers;m.sessions=oldSessions;throw e;}
 }}};
});
vi.mock("@gafus/logger",()=>({createWebLogger:()=>({info:vi.fn(),success:vi.fn(),warn:vi.fn(),error:vi.fn()})}));
vi.mock("./transactionalAuthMail",()=>({sendPasswordChangedNoticeEmail:m.mail,sendUsernameChangedNoticeEmail:vi.fn(),sendWelcomeEmailAfterRegistration:vi.fn()}));
vi.mock("./passwordReset",()=>({resetPasswordByToken:vi.fn()}));
vi.mock("./registerUserWithCredentials",()=>({registerUserWithCredentials:vi.fn()}));
import {setPassword,changePassword} from "./authService";
const P="Password2New",OLD="OldPass123";
beforeEach(()=>{
 vi.clearAllMocks();m.faultRevoke=false;m.state=new Map([
  ["A",{password:"vk-opaque",passwordSetAt:null,sessionsRevokedAt:null,email:"a@sample.test"}],
  ["B",{password:"old-hash",passwordSetAt:new Date("2026-01-01"),sessionsRevokedAt:null,email:"b@sample.test"}],
 ]);m.sessions=new Map([["A1",{userId:"A",revokedAt:null}],["A2",{userId:"A",revokedAt:null}],["B1",{userId:"B",revokedAt:null}]]);
 m.hash.mockImplementation(async()=>"new-hash");m.compare.mockImplementation(async(p:string,h:string)=>p===OLD&&h==="old-hash");m.mail.mockResolvedValue(undefined);
});
describe("W1 G02 Core real orchestration/mock Prisma, mail & bcrypt",()=>{
 it("set first time hashes cost 12, atomically revokes A sessions but not B",async()=>{
  await setPassword("A",P);expect(m.hash).toHaveBeenCalledWith(P,12);
  expect(m.state.get("A")?.password).toBe("new-hash");expect(m.state.get("A")?.passwordSetAt).toBeInstanceOf(Date);
  expect(m.state.get("A")?.sessionsRevokedAt).toBeInstanceOf(Date);expect(m.sessions.get("A1")?.revokedAt).toBeInstanceOf(Date);expect(m.sessions.get("A2")?.revokedAt).toBeInstanceOf(Date);
  expect(m.sessions.get("B1")?.revokedAt).toBeNull();expect(m.txn).toHaveBeenCalledTimes(1);
 });
 it("set retry cannot overwrite existing password or revoke again",async()=>{
  await setPassword("A",P);const rev=m.state.get("A")!.sessionsRevokedAt;await expect(setPassword("A","Password3Next")).rejects.toThrow("уже установлен");
  expect(m.state.get("A")?.sessionsRevokedAt).toBe(rev);expect(m.txn).toHaveBeenCalledTimes(1);
 });
 it("set when already configured refuses before bcrypt and DB writes",async()=>{
  await expect(setPassword("B",P)).rejects.toThrow("уже установлен");expect(m.hash).not.toHaveBeenCalled();expect(m.txn).not.toHaveBeenCalled();
 });
 it("set rollback if refresh update fails: no half-applied credentials",async()=>{
  m.faultRevoke=true;await expect(setPassword("A",P)).rejects.toThrow("FAKE_DB_REVOKE_FAILURE");
  expect(m.state.get("A")?.passwordSetAt).toBeNull();expect(m.state.get("A")?.sessionsRevokedAt).toBeNull();expect(m.sessions.get("A1")?.revokedAt).toBeNull();
 });
 it("set mail failure is nonfatal AFTER credential+revocation commit",async()=>{
  m.mail.mockRejectedValueOnce(Error("FAKE_MAIL_FAILURE"));await setPassword("A",P);
  expect(m.state.get("A")?.password).toBe("new-hash");expect(m.sessions.get("A1")?.revokedAt).toBeInstanceOf(Date);
 });
 it("change correct current password revokes B sessions without touching A",async()=>{
  await changePassword("B",OLD,P);expect(m.compare).toHaveBeenCalledWith(OLD,"old-hash");expect(m.hash).toHaveBeenCalledWith(P,12);
  expect(m.state.get("B")?.password).toBe("new-hash");expect(m.state.get("B")?.sessionsRevokedAt).toBeInstanceOf(Date);
  expect(m.sessions.get("B1")?.revokedAt).toBeInstanceOf(Date);expect(m.sessions.get("A1")?.revokedAt).toBeNull();
 });
 it("wrong current password: no mutation, no session revocation",async()=>{
  await expect(changePassword("B","WrongPass1",P)).rejects.toThrow("Неверный текущий пароль");
  expect(m.txn).not.toHaveBeenCalled();expect(m.sessions.get("B1")?.revokedAt).toBeNull();
 });
 it("change without installed password rejected before compare",async()=>{
  await expect(changePassword("A",OLD,P)).rejects.toThrow("Сначала установите пароль");expect(m.compare).not.toHaveBeenCalled();
 });
 it("change DB refresh failure rolls back password and revocation",async()=>{
  m.faultRevoke=true;await expect(changePassword("B",OLD,P)).rejects.toThrow("FAKE_DB_REVOKE_FAILURE");
  expect(m.state.get("B")?.password).toBe("old-hash");expect(m.state.get("B")?.sessionsRevokedAt).toBeNull();expect(m.sessions.get("B1")?.revokedAt).toBeNull();
 });
 it("change failure on stale current hash preserves most recently changed password",async()=>{
  const old=m.state.get("B")!;m.state.set("B",{...old,password:"changed-by-another-client"});
  await expect(changePassword("B",OLD,P)).rejects.toThrow("Неверный текущий пароль");
  expect(m.state.get("B")?.password).toBe("changed-by-another-client");
 });
 it("invalid new password never mutates credentials",async()=>{
  await expect(changePassword("B",OLD,"weak")).rejects.toThrow();expect(m.hash).not.toHaveBeenCalled();expect(m.txn).not.toHaveBeenCalled();
 });
 it("parallel set-password retries CAS to exactly one success and one revocation",async()=>{
  const results=await Promise.allSettled([setPassword("A",P),setPassword("A","AnotherPass3")]);
  expect(results.filter(x=>x.status==="fulfilled")).toHaveLength(1);
  expect(results.filter(x=>x.status==="rejected")).toHaveLength(1);
  expect(m.revoke).toHaveBeenCalledTimes(1);
  expect(m.state.get("A")?.passwordSetAt).toBeInstanceOf(Date);
 });
 it("parallel change-password with same old hash permits only one commit",async()=>{
  const results=await Promise.allSettled([changePassword("B",OLD,P),changePassword("B",OLD,"AnotherPass3")]);
  expect(results.filter(x=>x.status==="fulfilled")).toHaveLength(1);
  expect(results.filter(x=>x.status==="rejected")).toHaveLength(1);
  expect(m.revoke).toHaveBeenCalledTimes(1);
  expect(m.state.get("B")?.password).toBe("new-hash");
 });
 it("change mail failure is nonfatal, no tokens leaked from response",async()=>{
  m.mail.mockRejectedValueOnce(Error("FAKE_MAIL_FAILURE"));await changePassword("B",OLD,P);
  expect(m.state.get("B")?.sessionsRevokedAt).toBeInstanceOf(Date);
 });
});
