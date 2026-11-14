import {beforeEach,describe,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({tx:vi.fn(),lock:vi.fn(),find:vi.fn(),updateUser:vi.fn(),revoke:vi.fn(),delete:vi.fn(),lookup:vi.fn()}));
vi.mock("@gafus/prisma",()=>({prisma:{
 $transaction:m.tx,user:{findUnique:m.lookup},
}}));
import {consumePasswordResetReceipt,ResetReceiptUnavailableError,lookupPhoneByNormalizedUsername} from "./passwordReset.js";
const valid={id:"receipt-1",userId:"owner",expiresAt:new Date(Date.now()+120000)};
beforeEach(()=>{
 vi.clearAllMocks();m.lock.mockResolvedValue([{id:"receipt-1"}]);m.find.mockResolvedValue(valid);
 m.updateUser.mockResolvedValue({email:"owner@example.test"});m.revoke.mockResolvedValue({count:2});m.delete.mockResolvedValue({id:"receipt-1"});
 m.tx.mockImplementation(async(fn:(tx:unknown)=>Promise<unknown>)=>fn({
  $queryRaw:m.lock,passwordResetToken:{findUnique:m.find,delete:m.delete},
  user:{update:m.updateUser},refreshToken:{updateMany:m.revoke},
 }));
});
describe("password reset adapter verifies and consumes token atomically",()=>{
 it("locks a hashed token, updates only its owner, revokes sessions and then deletes the receipt",async()=>{
  const result=await consumePasswordResetReceipt({kind:"token",tokenHash:"sha256:test"},"already-bcrypt");
  expect(result).toBe("owner@example.test");
  expect(m.find).toHaveBeenCalledExactlyOnceWith({where:{id:"receipt-1"}});
  expect(m.updateUser).toHaveBeenCalledExactlyOnceWith({where:{id:"owner"},data:{password:"already-bcrypt",passwordSetAt:expect.any(Date),sessionsRevokedAt:expect.any(Date)},select:{email:true}});
  expect(m.revoke).toHaveBeenCalledExactlyOnceWith({where:{userId:"owner",revokedAt:null},data:{revokedAt:expect.any(Date)}});
  expect(m.delete).toHaveBeenCalledExactlyOnceWith({where:{id:"receipt-1"}});
  expect(m.lock.mock.invocationCallOrder[0]).toBeLessThan(m.updateUser.mock.invocationCallOrder[0]);
  expect(m.updateUser.mock.invocationCallOrder[0]).toBeLessThan(m.delete.mock.invocationCallOrder[0]);
  expect(m.tx).toHaveBeenCalledOnce();
 });
 it("locks short code with identical all-or-nothing transaction",async()=>{
  expect(await consumePasswordResetReceipt({kind:"shortCode",shortCode:"123456"},"hashed")).toBe("owner@example.test");
  expect(m.delete).toHaveBeenCalledOnce();expect(m.revoke).toHaveBeenCalledOnce();
 });
 it("missing/expired receipt rejects without touching any accounts",async()=>{
  m.lock.mockResolvedValueOnce([]);
  await expect(consumePasswordResetReceipt({kind:"token",tokenHash:"sha256:missing"},"hash")).rejects.toBeInstanceOf(ResetReceiptUnavailableError);
  expect(m.updateUser).not.toHaveBeenCalled();
  m.find.mockResolvedValueOnce({...valid,expiresAt:new Date(0)});
  await expect(consumePasswordResetReceipt({kind:"shortCode",shortCode:"expired"},"hash")).rejects.toBeInstanceOf(ResetReceiptUnavailableError);
  expect(m.revoke).not.toHaveBeenCalled();
 });
 it("legacy raw-token lookup is attempted only when explicitly supplied and hashed lookup failed",async()=>{
  m.lock.mockResolvedValueOnce([]).mockResolvedValueOnce([{id:"receipt-1"}]);
  await consumePasswordResetReceipt({kind:"token",tokenHash:"sha256:missing",legacyRawToken:"a".repeat(43)},"hash");
  expect(m.lock).toHaveBeenCalledTimes(2);
 });
 it("failure revoking refresh sessions bubbles up and prevents token removal",async()=>{
  m.revoke.mockRejectedValueOnce(new Error("SQL_ABORT"));
  await expect(consumePasswordResetReceipt({kind:"shortCode",shortCode:"123456"},"hash")).rejects.toThrow("SQL_ABORT");
  expect(m.delete).not.toHaveBeenCalled();
 });
 it("short or missing identity never starts a transaction",async()=>{
  await expect(consumePasswordResetReceipt({kind:"shortCode",shortCode:""},"hash")).rejects.toBeInstanceOf(ResetReceiptUnavailableError);
  await expect(consumePasswordResetReceipt({kind:"token",tokenHash:""},"hash")).rejects.toBeInstanceOf(ResetReceiptUnavailableError);
  expect(m.tx).not.toHaveBeenCalled();
 });
 it("username phone lookup normalizes exactly and never scans all users",async()=>{
  m.lookup.mockResolvedValueOnce({phone:"+70000000000"});
  expect(await lookupPhoneByNormalizedUsername("  PERSON  ")).toBe("+70000000000");
  expect(m.lookup).toHaveBeenCalledExactlyOnceWith({where:{username:"person"},select:{phone:true}});
  expect(await lookupPhoneByNormalizedUsername("  ")).toBeNull();
  expect(m.lookup).toHaveBeenCalledOnce();
 });
});
