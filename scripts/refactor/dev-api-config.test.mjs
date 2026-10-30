import { test } from "node:test";
import assert from "node:assert/strict";
import { assertSafeDevApiBaseUrl, DEV_API_URL } from "./dev-api-config.mjs";

test("default API is the only allowed, loopback mock", () => {
  assert.equal(assertSafeDevApiBaseUrl(), DEV_API_URL);
  assert.equal(assertSafeDevApiBaseUrl(DEV_API_URL), DEV_API_URL);
});
test("production and external URLs are forbidden", () => {
  for (const value of [
    "https://api.gafus.ru",
    "https://api.gafus.pro",
    "https://example.com",
    "http://localhost:4174",
    "http://127.0.0.1:3002",
    "http://127.0.0.1:4174@evil.example",
    "http://127.0.0.1:4174/?redirect=https://api.gafus.ru",
    "http://127.0.0.1:4174/../api",
    "not a url",
    "",
    null,
  ]) {
    assert.throws(() => assertSafeDevApiBaseUrl(value), /mock|invalid|string/);
  }
});
