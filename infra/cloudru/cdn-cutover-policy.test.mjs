import assert from 'node:assert/strict';
import { probePreviousOrigin, verifyDirectOriginStable } from './cdn-cutover-policy.mjs';
const bytes = Buffer.from('test-webp');
const ok = (code) => ({ status: code, body: { cancel: async () => {} }, arrayBuffer: async () => bytes });
const options = {hostname: 'previous-origin.example.com', path: '/posts/test/attachment.webp',
  headerName: 'x-feed-origin-secret', headerSecret: 'safe-example', expectedBytes: bytes, attempts: 2};
const seen = [];
assert.equal(await probePreviousOrigin({ ...options, fetcher: async (url, init) => {
  seen.push({url, init}); return ok(200);
}}), true);
assert.equal(seen.length, 2);
assert(seen.every(({url, init}) => url === 'https://previous-origin.example.com/posts/test/attachment.webp' && init.method === 'GET'));
for (const code of [301, 403, 404, 500, 502, 504])
  assert.equal(await probePreviousOrigin({...options, fetcher: async () => ok(code)}), false);
assert.equal(await probePreviousOrigin({...options, fetcher: async () => {throw Error('TLS timeout');}}), false);
assert.equal(await probePreviousOrigin({...options, fetcher: async () => ({...ok(200),arrayBuffer:async()=>Buffer.from('wrong')})}), false);
assert.equal(await probePreviousOrigin({...options, hostname: 'https://bad', fetcher: async () => ok(200)}), false);

const cfg = {kind: 'feed',url:'https://gafus-feed-origin.containerapps.ru/posts/test',
  headerName:'x-feed-origin-secret',headerSecret:'safe-example', expectedBytes:bytes,
  samples:3, maxAttempts:5, wait:async()=>{},now:()=>1000};
const response = (status, body=bytes) => ({status, arrayBuffer:async()=>body,body:{cancel:async()=>{}}});
const attempts = [response(200),response(504),response(200),response(200),response(200)];
assert.deepEqual(await verifyDirectOriginStable({...cfg,fetcher:async()=>attempts.shift()}),
  {samples:3,attempts:5,failures:1});
await assert.rejects(verifyDirectOriginStable({...cfg,maxAttempts:3,fetcher:async()=>response(504)}),
  /CDN_DIRECT_ORIGIN_UNSTABLE_feed_after_3_last_http_504_failures_3/);
await assert.rejects(verifyDirectOriginStable({...cfg,fetcher:async()=>response(200,Buffer.from('wrong'))}),
  /CDN_DIRECT_ORIGIN_BYTES_MISMATCH_feed/);
await assert.rejects(verifyDirectOriginStable({...cfg,maxAttempts:3,now:(()=>{let n=0;return()=>n++*3200;})(),fetcher:async()=>response(200)}),
  /CDN_DIRECT_ORIGIN_UNSTABLE_feed_after_3_last_too_slow/);
console.log('CDN per-origin health and guarded rollback policy PASS');
