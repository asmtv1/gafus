import { describe, expect, it } from "vitest";
import { createFeedRequestVerifier, signFeedRequest, type FeedNonceStore } from "./hmac.js";
const path = "/internal/feed/jobs/claim";
const key = new Uint8Array(32).fill(42);
const now = 1_791_535_200_000;
function verifier() {
  const consumed = new Set<string>();
  const nonces: FeedNonceStore = {
    async consume(id, expires) {
      if (expires <= now || consumed.has(id)) return false;
      consumed.add(id); return true;
    },
  };
  return createFeedRequestVerifier({ key, nonces, now: () => now });
}
function signed(body = '{"batchSize":1}', nonce = "unique-nonce-1234567") {
  return signFeedRequest({ path, body, key, timestamp: now / 1000, nonce });
}
describe("feed internal request signature", () => {
  it("authenticates raw exact body and rejects replay", async () => {
    const check = verifier();
    const body = '{"batchSize":1}', headers = signed(body);
    expect(await check({ method: "POST", path, body, headers })).toBe(true);
    expect(await check({ method: "POST", path, body, headers })).toBe(false);
  });
  it("rejects changed payload, endpoint and HTTP method", async () => {
    const body = '{"batchSize":1}', headers = signed(body);
    expect(await verifier()({ method: "POST", path, body: '{"batchSize":2}', headers })).toBe(false);
    expect(await verifier()({ method: "POST", path: "/internal/feed/jobs/complete", body, headers })).toBe(false);
    expect(await verifier()({ method: "GET", path, body, headers })).toBe(false);
  });
  it("rejects old, future, malformed and oversized requests", async () => {
    const body = '{"batchSize":1}';
    for (const offset of [-61, 61]) {
      const headers = signFeedRequest({ path, body, key, timestamp: now / 1000 + offset });
      expect(await verifier()({ method: "POST", path, body, headers })).toBe(false);
    }
    expect(await verifier()({ method: "POST", path, body: "a".repeat(16385), headers: signed(body) })).toBe(false);
    expect(await verifier()({ method: "POST", path, body, headers: { ...signed(body), "x-feed-signature": "bad" } })).toBe(false);
  });
  it("never permits a key below 256 bits", () => {
    expect(() => createFeedRequestVerifier({ key: new Uint8Array(8), nonces: { consume: async () => true } })).toThrow();
    expect(() => signFeedRequest({ path, body: "{}", key: new Uint8Array(8) })).toThrow();
  });
  it("fails closed on unavailable nonce storage", async () => {
    const rejector = createFeedRequestVerifier({
      key,
      now: () => now,
      nonces: { consume: async () => { throw new Error("storage offline"); } },
    });
    await expect(rejector({ method: "POST", path, body: "{}", headers: signed("{}", "another-nonce-12345") }))
      .rejects.toThrow("storage offline");
  });
});
