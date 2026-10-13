import assert from "node:assert/strict";
import { verifyStableCdnGet } from "./cdn-stability.mjs";

const bytes = Buffer.from([82, 73, 70, 70, 1, 2, 3, 4]);
const response = (status, body = "") => new Response(body, { status });
function stub(events) {
  const calls = [];
  return {
    calls,
    fetcher: async (url, init) => {
      calls.push({ url, init });
      const event = events.shift();
      assert.notEqual(event, undefined, "extra unexpected CDN request");
      if (event instanceof Error) throw event;
      return event;
    },
  };
}
function config(mock, overrides = {}) {
  let signedAt = 0;
  return {
    kind: "gallery",
    urlForAttempt: () => "https://gallery.example.test/signed?token=" + ++signedAt,
    expectedBytes: bytes,
    fetcher: mock.fetcher,
    samples: 3,
    maxAttempts: 6,
    retryDelayMs: 0,
    wait: async () => {},
    ...overrides,
  };
}

const good = () => response(200, bytes);
const recovered = stub([response(504), good(), good(), good()]);
assert.deepEqual(await verifyStableCdnGet(config(recovered)), {
  samples: 3,
  attempts: 4,
  transientFailures: 1,
});
assert.equal(new Set(recovered.calls.map((x) => x.url)).size, 4);
assert(recovered.calls.every((x) => x.init.redirect === "manual"));

const intermittent = stub([good(), response(502), good(), good(), good()]);
assert.deepEqual(await verifyStableCdnGet(config(intermittent)), {
  samples: 3,
  attempts: 5,
  transientFailures: 1,
});
const denied = stub([response(403)]);
await assert.rejects(verifyStableCdnGet(config(denied)), /CDN_EDGE_HTTP_403_gallery/);
assert.equal(denied.calls.length, 1);
const missing = stub([response(404)]);
await assert.rejects(verifyStableCdnGet(config(missing)), /CDN_EDGE_HTTP_404_gallery/);
const wrongBody = stub([response(200, "unexpected")]);
await assert.rejects(verifyStableCdnGet(config(wrongBody)), /CDN_EDGE_BYTES_MISMATCH_gallery/);
const redirected = stub([response(302)]);
await assert.rejects(verifyStableCdnGet(config(redirected)), /CDN_EDGE_HTTP_302_gallery/);
const persistent = stub(Array.from({ length: 4 }, () => response(503)));
await assert.rejects(
  verifyStableCdnGet(config(persistent, { samples: 3, maxAttempts: 4 })),
  /CDN_EDGE_UNSTABLE_gallery_after_4_last_http_503_transient_4/,
);
const unavailable = stub([new TypeError("fetch failed"), good(), good(), good()]);
assert.deepEqual(await verifyStableCdnGet(config(unavailable)), {
  samples: 3,
  attempts: 4,
  transientFailures: 1,
});
await assert.rejects(
  verifyStableCdnGet(config(stub([]), { maxAttempts: 2 })),
  /CDN_INVALID_STABILITY_CONFIG/,
);
console.log("Cloud.ru CDN strict, bounded transient recovery acceptance PASS");
