import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { request as httpRequest } from "node:http";
import { createReadOnlyApiServer, listenLocal } from "./read-only-api.mjs";

const server = createReadOnlyApiServer();
let address;
before(async () => {
  address = await listenLocal(server, 0);
  assert.equal(address.address, "127.0.0.1");
});
after(async () => {
  await new Promise((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
});

function local(path, options) {
  return fetch("http://127.0.0.1:" + address.port + path, options);
}

test("health is public, local and uses no-store", async () => {
  const response = await local("/health");
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal((await response.json()).source, "gafus-refactor-local-mock");
});
test("GET courses returns empty isolated fixture, never production data", async () => {
  const response = await local("/api/v1/courses");
  assert.deepEqual(await response.json(), { success: true, data: [] });
});
test("GET public courses also returns empty read-only fixture", async () => {
  const response = await local("/api/v1/public/courses");
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { success: true, data: [] });
});

test("authentication is intentionally unavailable in mock mode", async () => {
  const response = await local("/api/v1/auth/me");
  assert.equal(response.status, 401);
});
test("all mutating HTTP methods are rejected", async () => {
  for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
    const response = await local("/api/v1/courses", { method });
    assert.equal(response.status, 403, method);
    assert.equal((await response.json()).error, "READ_ONLY_DEVELOPMENT");
  }
});
test("unimplemented reads fail closed", async () => {
  const response = await local("/api/v1/payments");
  assert.equal(response.status, 404);
});
test("head returns no response body", async () => {
  const response = await local("/health", { method: "HEAD" });
  assert.equal(response.status, 200);
  assert.equal(await response.text(), "");
});
test("CORS is allowed only for local frontend dev", async () => {
  const good = await local("/health", { headers: { Origin: "http://127.0.0.1:5173" } });
  assert.equal(good.headers.get("access-control-allow-origin"), "http://127.0.0.1:5173");
  const bad = await local("/health", { headers: { Origin: "https://example.com" } });
  assert.equal(bad.headers.get("access-control-allow-origin"), null);
});
test("non-local host is forbidden", async () => {
  const result = await new Promise((resolve, reject) => {
    const req = httpRequest({
      hostname: "127.0.0.1",
      port: address.port,
      path: "/health",
      headers: { Host: "api.gafus.ru" },
    }, (res) => {
      const parts = [];
      res.on("data", (part) => parts.push(part));
      res.on("end", () => resolve({ status: res.statusCode, body: JSON.parse(Buffer.concat(parts).toString()) }));
      res.on("error", reject);
    });
    req.on("error", reject);
    req.end();
  });
  assert.equal(result.status, 403);
  assert.equal(result.body.error, "LOCAL_ONLY");
});
test("invalid port is rejected", () => {
  assert.throws(() => listenLocal(createReadOnlyApiServer(), 99999), TypeError);
});
