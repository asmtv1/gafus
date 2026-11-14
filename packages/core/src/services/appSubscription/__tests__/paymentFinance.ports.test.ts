import {beforeEach,describe,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({read:vi.fn(),write:vi.fn(),refund:vi.fn()}));
vi.mock("@gafus/subscription-finance-server/payment-finance",()=>({
 readLocalFinancePayment:m.read,persistVerifiedFinanceFields:m.write,persistRefundFinanceReceipt:m.refund,
}));
import {enrichPaymentFinance,recordFinanceRefund} from "@gafus/subscription-payment-server/payment-finance";
const provider={id:"yk",status:"succeeded",amount:{value:"2490",currency:"RUB"},income_amount:{value:"2390",currency:"RUB"},captured_at:"2026-11-01T12:00:00Z",payment_method:{type:"sbp"}};
beforeEach(()=>{vi.clearAllMocks();m.read.mockResolvedValue({id:"p",provider:"YOOKASSA",amount:"2490",currency:"RUB",yookassaPaymentId:"yk"});m.write.mockResolvedValue(undefined);m.refund.mockResolvedValue(undefined);});
describe("Core finance policy uses only narrow SQL ports",()=>{
 it("enriches only verified matching successful YooKassa amount",async()=>{
  expect(await enrichPaymentFinance("p",provider)).toBe(true);
  expect(m.read).toHaveBeenCalledWith("p");
  expect(m.write).toHaveBeenCalledWith("p",expect.objectContaining({providerIncomeAmount:"2390",providerPaymentMethodType:"sbp"}));
 });
 it("denies wrong identity or payment provider without any update",async()=>{
  expect(await enrichPaymentFinance("p",{...provider,id:"another"})).toBe(false);
  m.read.mockResolvedValueOnce({yookassaPaymentId:"yk",provider:"APPLE",amount:"2490",currency:"RUB"});
  expect(await enrichPaymentFinance("p",provider)).toBe(false);
  expect(m.write).not.toHaveBeenCalled();
 });
 it("allows finance enrichment failure without rolling back verified subscription",async()=>{
  m.write.mockRejectedValueOnce(new Error("db temporarily unavailable"));
  expect(await enrichPaymentFinance("p",provider)).toBe(false);
 });
 it("validates real refund before persisting via caller tx",async()=>{
  const tx={appSubscriptionFinanceRefund:{}} as never;
  await recordFinanceRefund(tx,{id:"p",yookassaPaymentId:"yk",amount:"2490"},{id:"refund",status:"succeeded",payment_id:"yk",created_at:"2026-11-02T10:00:00Z",amount:{value:"100",currency:"RUB"}});
  expect(m.refund).toHaveBeenCalledWith(tx,expect.objectContaining({providerRefundId:"refund",amountKopecks:10000,paymentId:"p"}));
 });
 it("blocks an unverified refund amount before SQL",async()=>{
  await expect(recordFinanceRefund({} as never,{id:"p",yookassaPaymentId:"yk",amount:"2490"},{id:"r",status:"succeeded",payment_id:"yk",created_at:"2026-11-02",amount:{value:"99999",currency:"RUB"}})).rejects.toThrow("Invalid refund amount");
  expect(m.refund).not.toHaveBeenCalled();
 });
});
