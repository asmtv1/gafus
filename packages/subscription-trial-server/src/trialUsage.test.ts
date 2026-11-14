import {beforeEach,describe,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({read:vi.fn(),find:vi.fn(),write:vi.fn(),lock:vi.fn()}));
vi.mock("@gafus/prisma",()=>({prisma:{appSubscriptionTrial:{findUnique:m.read,findFirst:m.find,upsert:m.write}}}));
import {
 hasUsedAppSubscriptionTrial,getYookassaTrialAvailability,
 findYookassaTrialByPaymentMethodFingerprintHash,recordYookassaTrialStarted,recordYookassaTrialUnavailable,
} from "./trialUsage.js";
const fingerprint="a".repeat(64);
beforeEach(()=>{vi.clearAllMocks();m.read.mockResolvedValue(null);m.find.mockResolvedValue(null);m.write.mockResolvedValue({id:"trial"});m.lock.mockResolvedValue([]);});
describe("isolated YooKassa trial SQL",()=>{
 it("reads only the exact user/provider trial receipt",async()=>{
  expect(await hasUsedAppSubscriptionTrial({userId:"A",provider:"APPLE"})).toBe(false);
  expect(m.read).toHaveBeenCalledExactlyOnceWith({where:{userId_provider:{userId:"A",provider:"APPLE"}},select:{id:true}});
  expect(await hasUsedAppSubscriptionTrial({userId:"",provider:"YOOKASSA"})).toBe(false);
  expect(m.read).toHaveBeenCalledOnce();
 });
 it("availability treats prior receipt as used and normalizes only known unavailable reason",async()=>{
  m.read.mockResolvedValueOnce({id:"trial",trialUnavailableReason:"CARD_FINGERPRINT_REUSED"});
  expect(await getYookassaTrialAvailability("A")).toEqual({available:false,trialDays:3,unavailableReason:"CARD_FINGERPRINT_REUSED"});
  m.read.mockResolvedValueOnce({id:"trial",trialUnavailableReason:"sensitive-private-value"});
  expect((await getYookassaTrialAvailability("A")).unavailableReason).toBeNull();
  await expect(getYookassaTrialAvailability("")).rejects.toThrow("TRIAL_USER_ID_REQUIRED");
 });
 it("serializes reusable card fingerprint before querying another user in SAME supplied tx",async()=>{
  const tx={appSubscriptionTrial:{findFirst:m.find},$queryRaw:m.lock} as never;
  expect(await findYookassaTrialByPaymentMethodFingerprintHash({userId:"new-owner",paymentMethodFingerprintHash:fingerprint,tx})).toBeNull();
  expect(m.lock).toHaveBeenCalledOnce();
  expect(m.lock.mock.invocationCallOrder[0]).toBeLessThan(m.find.mock.invocationCallOrder[0]);
  expect(m.find).toHaveBeenCalledExactlyOnceWith({where:{provider:"YOOKASSA",paymentMethodFingerprintHash:fingerprint,userId:{not:"new-owner"},trialUnavailableReason:null},select:{id:true,userId:true}});
 });
 it("refuses checking fingerprint without a transaction or a 64-hex fingerprint",async()=>{
  await expect(findYookassaTrialByPaymentMethodFingerprintHash({userId:"A",paymentMethodFingerprintHash:fingerprint})).rejects.toThrow("TRIAL_FINGERPRINT_TRANSACTION_REQUIRED");
  await expect(findYookassaTrialByPaymentMethodFingerprintHash({userId:"A",paymentMethodFingerprintHash:"bad",tx:{} as never})).rejects.toThrow("TRIAL_FINGERPRINT_SCOPE_INVALID");
  expect(m.find).not.toHaveBeenCalled();
 });
 it("started receipt is idempotent for one owner/provider, retains original dates on update",async()=>{
  const startedAt=new Date("2026-11-07T12:00:00Z"),endedAt=new Date("2026-11-10T12:00:00Z");
  await recordYookassaTrialStarted({userId:"A",subscriptionId:"sub",startedAt,endedAt,paymentMethodFingerprintHash:fingerprint});
  expect(m.write).toHaveBeenCalledExactlyOnceWith({where:{userId_provider:{userId:"A",provider:"YOOKASSA"}},create:{userId:"A",provider:"YOOKASSA",subscriptionId:"sub",startedAt,endedAt,paymentMethodFingerprintHash:fingerprint,trialUnavailableReason:null},update:{subscriptionId:"sub",paymentMethodFingerprintHash:fingerprint,trialUnavailableReason:null}});
 });
 it("marking reused-card trial stores non-usable receipt without granting free access",async()=>{
  const at=new Date("2026-11-07T12:00:00Z");
  await recordYookassaTrialUnavailable({userId:"B",subscriptionId:"subB",at,paymentMethodFingerprintHash:fingerprint,reason:"CARD_FINGERPRINT_REUSED"});
  expect(m.write.mock.calls[0]?.[0]?.create).toMatchObject({startedAt:at,endedAt:at,trialUnavailableReason:"CARD_FINGERPRINT_REUSED"});
 });
 it("missing user/subscription cannot write any receipt",async()=>{
  await expect(recordYookassaTrialStarted({userId:"",subscriptionId:"sub",startedAt:new Date(),endedAt:new Date()})).rejects.toThrow("TRIAL_OWNER_SUBSCRIPTION_REQUIRED");
  await expect(recordYookassaTrialUnavailable({userId:"A",subscriptionId:"",at:new Date(),paymentMethodFingerprintHash:fingerprint,reason:"CARD_FINGERPRINT_REUSED"})).rejects.toThrow("TRIAL_OWNER_SUBSCRIPTION_REQUIRED");
  expect(m.write).not.toHaveBeenCalled();
 });
});
