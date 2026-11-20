import { afterEach, describe, expect, it, vi } from "vitest";
import {
  YookassaHttpError, assertYookassaPaymentConfirmed, assertYookassaPaymentCanceled,
  assertYookassaPaymentMethodActive, fetchYookassaPaymentObject,
  fetchYookassaRefundObject, fetchYookassaPaymentMethodObject,
} from "./yookassaProvider";

afterEach(() => vi.unstubAllGlobals());
const auth = { shopId: "test-shop", secretKey: "local-test-key" };
const payment = {
  id: "provider-1", status: "succeeded", paid: true,
  amount: { value: "349.00", currency: "RUB" },
  metadata: { kind: "app_subscription", localPaymentId: "local-1", userId: "user-1", planCode: "monthly" },
};
const local = { id: "local-1", userId: "user-1", planCode: "monthly", amount: 349, currency: "RUB" };
describe("YooKassa provider verification adapter", () => {
  it("reads a payment with encoded ID and Basic auth without touching SQL", async () => {
    const fakeFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(payment), {status: 200}));
    vi.stubGlobal("fetch", fakeFetch);
    expect(await fetchYookassaPaymentObject({ ...auth, yookassaPaymentId: "provider/1" })).toEqual(payment);
    const [url, init] = fakeFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.yookassa.ru/v3/payments/provider%2F1");
    expect(init).toMatchObject({ method: "GET", headers: { Authorization: "Basic " + Buffer.from("test-shop:local-test-key").toString("base64") } });
    expect(fakeFetch).toHaveBeenCalledTimes(1);
  });
  it("rejects a payment from another user, local payment, currency, amount or state", () => {
    expect(() => assertYookassaPaymentConfirmed({providerPayment: payment, localPayment: local, yookassaPaymentId: "provider-1"})).not.toThrow();
    for (const wrong of [{...local,userId:"other"},{...local,id:"different"},{...local,currency:"USD"},{...local,amount:400}]) {
      expect(() => assertYookassaPaymentConfirmed({providerPayment: payment, localPayment: wrong, yookassaPaymentId: "provider-1"})).toThrow();
    }
    expect(() => assertYookassaPaymentConfirmed({providerPayment: {...payment, status:"pending"}, localPayment:local, yookassaPaymentId:"provider-1"})).toThrow();
    expect(() => assertYookassaPaymentCanceled({providerPayment: {...payment, status:"canceled"}, localPayment:local, yookassaPaymentId:"provider-1"})).not.toThrow();
  });
  it("fails closed for inactive or foreign payment methods", () => {
    const method = { id:"m-1", status:"active", saved:true, metadata:{kind:"app_subscription_payment_method",subscriptionId:"s-1",userId:"u-1"}};
    const base = {providerPaymentMethod:method,paymentMethodId:"m-1",subscriptionId:"s-1",userId:"u-1"};
    expect(() => assertYookassaPaymentMethodActive(base)).not.toThrow();
    expect(() => assertYookassaPaymentMethodActive({...base,providerPaymentMethod:{...method,saved:false}})).toThrow();
    expect(() => assertYookassaPaymentMethodActive({...base,userId:"u-2"})).toThrow();
  });
  it("does not disguise upstream errors as verified payments", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("not found",{status:404})));
    await expect(fetchYookassaRefundObject({...auth,yookassaRefundId:"not-found"})).rejects.toMatchObject({status:404,name:"YookassaHttpError"});
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    await expect(fetchYookassaPaymentMethodObject({...auth,paymentMethodId:"m"})).rejects.toThrow("offline");
  });
});

describe("YooKassa SBP payment method registration transport", () => {
  const input = {
    shopId: "synthetic-shop", secretKey: "synthetic-secret",
    idempotenceKey: "appsub-pm:dedupe-local-1",
    body: { type: "sbp", confirmation: { type: "redirect", return_url: "https://example.invalid/subscription?trial=1" },
      metadata: {kind: "app_subscription_payment_method", userId: "owner-A", subscriptionId: "sub-A"} },
  };
  afterEach(() => vi.unstubAllGlobals());

  it("POSTs the SBP request once with the existing identity and no persistence", async () => {
    const mock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      id: "method-A", confirmation: {confirmation_url: "https://checkout.invalid/redirect"},
    }), {status: 200}));
    vi.stubGlobal("fetch", mock);
    const { requestYookassaPaymentMethod } = await import("./yookassaProvider");
    await expect(requestYookassaPaymentMethod(input)).resolves.toEqual({
      ok: true, paymentMethodId: "method-A", confirmationUrl: "https://checkout.invalid/redirect",
    });
    expect(mock).toHaveBeenCalledTimes(1);
    const [url, options] = mock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.yookassa.ru/v3/payment_methods");
    expect(options).toMatchObject({ method: "POST", headers: {
      "Content-Type": "application/json",
      "Idempotence-Key": input.idempotenceKey,
      Authorization: "Basic " + Buffer.from("synthetic-shop:synthetic-secret").toString("base64"),
    }});
    expect(JSON.parse(options.body as string)).toEqual(input.body);
  });

  it("reports an ambiguous transport error instead of a verified provider result", async () => {
    const error = new Error("local-network-dropped-after-send");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(error));
    const { requestYookassaPaymentMethod } = await import("./yookassaProvider");
    await expect(requestYookassaPaymentMethod(input)).resolves.toEqual({
      ok: false, kind: "transport", cause: error,
    });
  });

  it("distinguishes upstream rejection and missing identity/confirmation", async () => {
    const { requestYookassaPaymentMethod } = await import("./yookassaProvider");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("provider-rejected", {status: 409})));
    await expect(requestYookassaPaymentMethod(input)).resolves.toEqual({
      ok: false, kind: "rejected", status: 409, responseText: "provider-rejected",
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      id: "method-A", confirmation: {},
    }), {status: 200})));
    await expect(requestYookassaPaymentMethod(input)).resolves.toEqual({
      ok: false, kind: "invalid", responseData: {id: "method-A", confirmation: {}},
    });
  });

  it("does not produce successful confirmation from malformed JSON", async () => {
    const { requestYookassaPaymentMethod } = await import("./yookassaProvider");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("invalid-json", {status: 200})));
    await expect(requestYookassaPaymentMethod(input)).rejects.toBeInstanceOf(SyntaxError);
  });
});
