import {beforeEach,describe,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({read:vi.fn(),update:vi.fn(),upsert:vi.fn()}));
vi.mock("@gafus/prisma",()=>({prisma:{appSubscriptionPayment:{findUnique:m.read,update:m.update}}}));
import {readLocalFinancePayment,persistVerifiedFinanceFields,persistRefundFinanceReceipt} from "./paymentFinance.js";
beforeEach(()=>{vi.clearAllMocks();m.read.mockResolvedValue({id:"payment",yookassaPaymentId:"yk",amount:"2490",currency:"RUB",provider:"YOOKASSA"});m.update.mockResolvedValue({});m.upsert.mockResolvedValue({});});
describe("payment financial SQL repository (policy remains Core)",()=>{
 it("projects minimal locally confirmed payment fields",async()=>{
  expect(await readLocalFinancePayment("payment")).toMatchObject({yookassaPaymentId:"yk"});
  expect(m.read).toHaveBeenCalledExactlyOnceWith({where:{id:"payment"},select:{id:true,yookassaPaymentId:true,amount:true,currency:true,provider:true}});
 });
 it("rejects empty identifiers without hitting the DB",async()=>{
  expect(await readLocalFinancePayment("")).toBeNull();
  await expect(persistVerifiedFinanceFields("",{})).rejects.toThrow("FINANCE_PAYMENT_ID_REQUIRED");
  expect(m.read).not.toHaveBeenCalled();expect(m.update).not.toHaveBeenCalled();
 });
 it("writes only parsed provider finance metadata after caller validation",async()=>{
  const data={providerIncomeAmount:"2390.00",providerPaymentMethodType:"sbp",financeSyncedAt:new Date()};
  await persistVerifiedFinanceFields("payment",data);
  expect(m.update).toHaveBeenCalledExactlyOnceWith({where:{id:"payment"},data});
 });
 it("refund receipt uses the supplied transaction, not a second connection",async()=>{
  const data={providerRefundId:"r",paymentId:"p",amountKopecks:500,refundedAt:new Date()};
  await persistRefundFinanceReceipt({appSubscriptionFinanceRefund:{upsert:m.upsert}} as never,data);
  expect(m.upsert).toHaveBeenCalledExactlyOnceWith({where:{providerRefundId:"r"},update:{},create:data});
  expect(m.update).not.toHaveBeenCalled();
 });
});
