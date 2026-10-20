import assert from 'node:assert/strict';
import { test } from 'node:test';
import { allowLegacyPublicFeedSmokeMiss, selectedSmokeScopes, fetchSafe, fetchPublicFeedProof, isRetryableSmokeTransportError } from './beget-production-smoke.mjs';

const key = 'posts/beget-smoke-bef94b1b82bd47a6b05325ec8be2b22e/beget-smoke-bef94b1b82bd47a6b05325ec8be2b22e/attachments/bef94b1b82bd47a6b05325ec8be2b22e/poster.webp';
const digest = '93c513effa21235a9617897eb55830910863834228730eae0f42b5c78043fb02';

test('only pinned legacy public Feed fixture accepts no-store MISS', () => {
  assert.equal(allowLegacyPublicFeedSmokeMiss(true, key, digest, 'MISS'), true);
  for (const [publicRead, changedKey, changedDigest, state] of [
    [false, key, digest, 'MISS'],
    [true, key, digest, 'HIT'],
    [true, key, digest, 'ABSENT'],
    [true, key, digest, 'EXPIRED'],
    [true, key, 'f'.repeat(64), 'MISS'],
    [true, key.replace('beget-smoke-', 'beget-user-'), digest, 'MISS'],
  ]) assert.equal(allowLegacyPublicFeedSmokeMiss(publicRead, changedKey, changedDigest, state), false);
});


test('pre-deploy smoke checks public Feed only when the new Gallery route is enabled', () => {
  const ready = {GALLERY_CDN_REDIRECT_ENABLED: 'true',
    GALLERY_CDN_ORIGIN_ROUTE_ENABLED: 'true', FEED_BUCKET_PUBLIC: 'true'};
  assert.deepEqual(selectedSmokeScopes(['--feed-only'], ready).map(s => s.name), ['feed']);
  assert.deepEqual(selectedSmokeScopes([], ready).map(s => s.name), ['gallery', 'feed']);
  for (const [env, reason] of [
    [{...ready, GALLERY_CDN_REDIRECT_ENABLED: 'false'}, /REQUIRES_NEW_GALLERY/],
    [{...ready, GALLERY_CDN_ORIGIN_ROUTE_ENABLED: 'false'}, /REQUIRES_NEW_GALLERY/],
    [{...ready, FEED_BUCKET_PUBLIC: 'false'}, /REQUIRES_NEW_GALLERY/],
  ]) assert.throws(() => selectedSmokeScopes(['--feed-only'], env), reason);
  for (const args of [['--skip-gallery'], ['--feed-only', '--other']])
    assert.throws(() => selectedSmokeScopes(args, ready), /INVALID_MODE/);
});


test('read-only Gallery CDN smoke retries intermittent TLS/connect timeouts without changing policies', async () => {
  const signedUrl='https://dikinuneceswe.begetcdn.cloud/md5(secret-in-url,1800000000)/albums/test/test/photos/test/full.webp';
  const attempts=[], delays=[], warnings=[];
  const oldWarn=console.warn;
  let count=0;
  console.warn=(...args)=>warnings.push(args.join(' '));
  try {
    const result=await fetchSafe(signedUrl,{method:'HEAD'},
      async (url,opts)=>{
        attempts.push({url,opts});
        if(++count===1)throw Object.assign(new Error('The operation was aborted due to timeout'),{name:'TimeoutError'});
        if(count===2)throw Object.assign(new TypeError('fetch failed'),{cause:{code:'UND_ERR_SOCKET'}});
        return {status:200};
      },
      async ms=>delays.push(ms));
    assert.equal(result.status,200);
    assert.deepEqual(delays,[350,700]);
    assert.equal(attempts.length,3);
    for(const attempt of attempts) {
      assert.equal(attempt.url,signedUrl);
      assert.equal(attempt.opts.method,'HEAD');
      assert.equal(attempt.opts.redirect,'manual');
      assert.equal(attempt.opts.cache,'no-store');
      assert.ok(attempt.opts.signal instanceof AbortSignal);
    }
    assert.equal(warnings.length,2);
    assert.ok(warnings.every(x=>x.includes('BEGET_SMOKE_TRANSPORT_RETRY')));
    assert.ok(warnings.every(x=>!x.includes(signedUrl)&&!x.includes('secret-in-url')));
  } finally {console.warn=oldWarn;}
});

test('persistent CDN transport outage fails closed after exactly three bounded attempts', async () => {
  const err=Object.assign(new Error('timeout'),{name:'TimeoutError'});
  let called=0;
  const oldWarn=console.warn;
  console.warn=()=>{};
  try {
    await assert.rejects(fetchSafe('https://test.invalid/',{},
      async()=>{called++;throw err;},async()=>{}),x=>x===err);
  } finally {console.warn=oldWarn;}
  assert.equal(called,3);
});

test('HTTP 403/404/500, wrong TLS certificate and malformed requests are NOT retried', async () => {
  for(const status of [403,404,410,500]) {
    let calls=0;
    const res=await fetchSafe('https://test.invalid/',{},async()=>{calls++;return {status};});
    assert.equal(res.status,status);
    assert.equal(calls,1);
  }
  for(const err of [
    Object.assign(new TypeError('fetch failed'),{cause:{code:'ERR_TLS_CERT_ALTNAME_INVALID'}}),
    new TypeError('Invalid URL'),
    new Error('content digest mismatch'),
  ]) {
    let calls=0;
    await assert.rejects(fetchSafe('https://test.invalid/',{},async()=>{calls++;throw err;}),x=>x===err);
    assert.equal(calls,1);
    assert.equal(isRetryableSmokeTransportError(err),false);
  }
});


test('a timeout while reading CDN GET body retries the entire signed request', async () => {
  const timeout=Object.assign(new Error('body timeout'),{name:'TimeoutError'});
  let calls=0;
  const oldWarn=console.warn;
  console.warn=()=>{};
  try {
    const response=await fetchSafe('https://test.invalid/signed?token=secret',{},
      async()=>{
        calls++;
        const result=new Response('proof', {status:200,headers:{'content-type':'image/webp'}});
        if(calls===1)result.arrayBuffer=async()=>{throw timeout;};
        return result;
      },async()=>{});
    assert.equal(response.status,200);
    assert.equal(response.headers.get('content-type'),'image/webp');
    assert.equal(Buffer.from(await response.arrayBuffer()).toString(),'proof');
  } finally {console.warn=oldWarn;}
  assert.equal(calls,2);
});

test('a successful HTTP 206 range response retains content-range and exact bytes', async () => {
  const result=await fetchSafe('https://test.invalid/signed',{headers:{Range:'bytes=0-4'}},
    async()=>new Response('abcde',{status:206,headers:{'content-range':'bytes 0-4/900','content-type':'image/webp'}}));
  assert.equal(result.status,206);
  assert.equal(result.headers.get('content-range'),'bytes 0-4/900');
  assert.deepEqual(Buffer.from(await result.arrayBuffer()),Buffer.from('abcde'));
});


test('approved public Feed CDN rechecks transient 403 without accepting permanent denial', async () => {
  const warnings=[]; const delays=[]; const original=console.warn;
  console.warn=(...args)=>warnings.push(args.join(' '));
  try {
    let requests=0;
    const response=await fetchPublicFeedProof('https://feed.example/fixture', {},
      async()=>({ status: ++requests < 3 ? 403 : 200 }),async ms=>delays.push(ms));
    assert.equal(response.status,200);
    assert.equal(requests,3);
    assert.deepEqual(delays,[1500,3000]);
    assert.equal(warnings.length,2);
    assert.ok(warnings.every(w=>w.includes('PUBLIC_FEED_CDN_403_RECHECK') &&
      !w.includes('feed.example') && !w.includes('fixture')));
    for(const [code,expected] of [[403,3],[404,1],[410,1],[500,1]]) {
      let count=0;
      const result=await fetchPublicFeedProof('https://feed.example/fixture', {method:'HEAD'},
        async()=>{count++;return {status:code};},async()=>{});
      assert.equal(result.status,code);
      assert.equal(count,expected);
    }
  } finally {console.warn=original;}
});
