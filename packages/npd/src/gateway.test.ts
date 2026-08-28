import { describe, expect, it } from "vitest";
import { NpdGateway, NpdGatewayError, redactNpd } from "./gateway.js";

const response = (body: string, status = 200) => new Response(body, { status, headers: { "content-type": "application/json" } });
const gateway = (fetch: typeof globalThis.fetch) => new NpdGateway({ deviceId: "stable-device", fetch, timeoutMs: 5 });
describe("NpdGateway", () => {
  it("uses the captured SMS protocol and validates its response", async () => {
    let request = "";
    const result = await gateway(async (url) => { request = String(url); return response('{"challengeToken":"challenge","expireIn":120}'); }).startSms("8 (900) 123-45-67");
    expect(request).toContain("/api/v2/auth/challenge/sms/start");
    expect(result).toEqual({ challengeToken: "challenge", expiresIn: 120 });
  });
  it("classifies malformed JSON and unauthorized/rate-limit responses", async () => {
    await expect(gateway(async () => response("<html>")).getProfile()).rejects.toMatchObject({ code: "MALFORMED_RESPONSE" });
    await expect(gateway(async () => response('{"message":"bad"}', 401)).getProfile()).rejects.toMatchObject({ code: "UNAUTHORIZED", status: 401 });
    await expect(gateway(async () => response('{"message":"slow"}', 429)).getProfile()).rejects.toMatchObject({ code: "RATE_LIMITED", status: 429 });
  });
  it("never retries or treats uncertain create/cancel delivery as success", async () => {
    await expect(gateway(async () => response('{"code":"DUPLICATE"}', 409)).createReceipt({ inn: "123456789012", operationAt: new Date(), services: [{ name: "Service", amount: "10.00" }] })).rejects.toMatchObject({ code: "AMBIGUOUS_WRITE" });
    await expect(gateway(async () => response("{}")).createReceipt({ inn: "123456789012", operationAt: new Date(), services: [{ name: "Service", amount: "10.00" }] })).rejects.toMatchObject({ code: "AMBIGUOUS_WRITE" });
    await expect(gateway(async () => response("", 503)).cancelReceipt({ receiptUuid: "r", reason: "REFUND" })).rejects.toMatchObject({ code: "AMBIGUOUS_WRITE" });
  });
  it("keeps definitive create errors definitive", async () => {
    const input = { inn: "123456789012", operationAt: new Date(), services: [{ name: "Service", amount: "10.00" }] };
    await expect(gateway(async () => response('{"code":"BAD_REQUEST"}', 400)).createReceipt(input)).rejects.toMatchObject({ code: "API_ERROR", status: 400 });
    await expect(gateway(async () => response('{"code":"TOO_MANY"}', 429)).createReceipt(input)).rejects.toMatchObject({ code: "RATE_LIMITED", status: 429 });
  });
  it("serializes exact kopecks without float arithmetic and rejects excess precision", async () => {
    let body = "";
    await gateway(async (_url, init) => { body = String(init?.body); return response('{"approvedReceiptUuid":"receipt"}'); }).createReceipt({ inn: "123456789012", operationAt: new Date(), services: [{ name: "One", amount: "0.10", quantity: 3 }, { name: "Two", amount: "0.02", quantity: 2 }] });
    expect(JSON.parse(body)).toMatchObject({ totalAmount: "0.34", services: [{ amount: "0.10", quantity: 3 }, { amount: "0.02", quantity: 2 }] });
    await expect(gateway(async () => response("{}")).createReceipt({ inn: "123456789012", operationAt: new Date(), services: [{ name: "Bad", amount: "1.001" }] })).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });
  it("classifies an aborted non-write request as timeout", async () => {
    await expect(gateway(async (_url, init) => { await new Promise<void>((_, reject) => init?.signal?.addEventListener("abort", () => reject(Object.assign(new Error(), { name: "AbortError" })))); throw new Error("unreachable"); }).getProfile()).rejects.toMatchObject({ code: "TIMEOUT" });
  });
  it("redacts tokens and explicitly blocks unevidenced receipt history", async () => {
    expect(redactNpd('Authorization: Bearer abc.def refreshToken="secret"')).not.toContain("abc.def");
    await expect(gateway(async () => response("{}")).listRecentReceipts()).rejects.toMatchObject({ code: "UNAVAILABLE" satisfies NpdGatewayError["code"] });
  });
});
