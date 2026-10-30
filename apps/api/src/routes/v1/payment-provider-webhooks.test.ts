import { Hono } from "hono";
import { createHmac } from "node:crypto";
import { afterEach,describe,expect,it,vi } from "vitest";
const { yoo,apple } = vi.hoisted(()=>({yoo:vi.fn(),apple:vi.fn()}));
vi.mock("@gafus/core/services/appSubscription",()=>({
  handleYookassaAppSubscriptionWebhook:yoo,
  handleAppleAppSubscriptionNotification:apple,
}));
import { paymentProviderWebhooks } from "./payment-provider-webhooks";
const app=new Hono();app.route("/",paymentProviderWebhooks);
const url="/api/v1/payments/webhook";
const json=(value:unknown)=>JSON.stringify(value);
const notification={type:"notification",event:"payment.succeeded",object:{id:"yk-1",
  amount:{value:"100.00"},metadata:{kind:"app_subscription",localPaymentId:"db-1"}}};
const post=(body:string,headers:Record<string,string>={})=>app.request(url,{method:"POST",body,
  headers:{"content-type":"application/json",...headers}});
afterEach(()=>{vi.clearAllMocks();delete process.env.YOOKASSA_SKIP_IP_CHECK;
  delete process.env.YOOKASSA_SECRET_KEY;});
describe("Next provider webhooks moved to Hono",()=>{
  it("rejects non-provider IP and absent IP without accessing Core",async()=>{
    expect((await post(json(notification))).status).toBe(403);
    expect((await post(json(notification),{"x-forwarded-for":"203.0.113.1"})).status).toBe(403);
    expect(yoo).not.toHaveBeenCalled();
  });
  it("accepts pinned provider IP and forwards metadata for provider verification",async()=>{
    yoo.mockResolvedValueOnce({userId:"owner"});
    const res=await post(json(notification),{"x-forwarded-for":"185.71.76.2"});
    expect(res.status).toBe(200);
    expect(yoo).toHaveBeenCalledWith(expect.objectContaining({
      event:"payment.succeeded",yookassaPaymentId:"yk-1",
      metadata:{kind:"app_subscription",localPaymentId:"db-1"},
      payloadHash:expect.any(String),
    }));
  });
  it("rejects unsigned from untrusted IP even when IP skip is not enabled",async()=>{
    expect((await post(json(notification),{"x-forwarded-for":"127.0.0.1"})).status).toBe(403);
  });
  it("rejects spoofed/invalid signature with provider IP",async()=>{
    process.env.YOOKASSA_SECRET_KEY="secret";
    const res=await post(json(notification),{
      "x-forwarded-for":"185.71.76.1","x-yookassa-signature":"abc",
    });
    expect(res.status).toBe(403);expect(yoo).not.toHaveBeenCalled();
  });
  it("accepts a correctly signed provider event with no payment duplication",async()=>{
    const body=json(notification);
    const secret="nonproduction-secret";
    process.env.YOOKASSA_SECRET_KEY=secret;
    yoo.mockResolvedValueOnce({userId:"owner"});
    const signed=createHmac("sha256",secret).update(body).digest("hex");
    const res=await post(body,{"x-forwarded-for":"185.71.76.20",
      "x-yookassa-signature":signed});
    expect(res.status).toBe(200);
    expect(yoo).toHaveBeenCalledTimes(1);
  });
  it("rejects malformed payload without creating a payment",async()=>{
    process.env.YOOKASSA_SKIP_IP_CHECK="1";
    expect((await post("{broken")).status).toBe(400);
    expect(yoo).not.toHaveBeenCalled();
  });
  it("routes metadata-less refunds to Core and ignores legacy purchases",async()=>{
    process.env.YOOKASSA_SKIP_IP_CHECK="1";
    yoo.mockResolvedValueOnce({userId:"owner"});
    const refund={type:"notification",event:"refund.succeeded",object:{id:"refund-a",
      payment_id:"yk-a",amount:{value:"123.00"}}};
    expect((await post(json(refund))).status).toBe(200);
    expect(yoo).toHaveBeenCalledWith(expect.objectContaining({
      event:"refund.succeeded",yookassaPaymentId:"yk-a",yookassaRefundId:"refund-a",
    }));
    expect((await post(json({...notification,object:{id:"old-payment"}}))).status).toBe(200);
    expect(yoo).toHaveBeenCalledTimes(1);
  });
  it("does not acknowledge failed Core reconciliation",async()=>{
    process.env.YOOKASSA_SKIP_IP_CHECK="1";yoo.mockRejectedValueOnce(Error("provider down"));
    expect((await post(json(notification))).status).toBe(500);
  });
  it("exposes original public Apple notifications route",async()=>{
    apple.mockResolvedValue(undefined);
    const res=await app.request("/api/v1/app-subscription/apple/notifications",{
      method:"POST",headers:{"content-type":"application/json"},body:json({signedPayload:"signed-JWS"}),
    });
    expect(res.status).toBe(200);
    expect(apple).toHaveBeenCalledWith({signedPayload:"signed-JWS"});
  });
});
