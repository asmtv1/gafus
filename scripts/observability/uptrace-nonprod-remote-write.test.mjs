import {test} from 'node:test';
import assert from 'node:assert/strict';
import {writeRequest,snappyLiteral,sendRemoteWrite} from './uptrace-nonprod-remote-write.mjs';
test('Prometheus remote write is one fixed low-cardinality protobuf series',()=>{
 const bytes=writeRequest(1794579000000);
 const text=bytes.toString('latin1');
 assert.ok(text.includes('gafus_nonprod_prom_rw_canary'));
 assert.ok(text.includes('__name__'));
 assert.ok(text.includes('preview'));
 assert.ok(!text.includes('email'));
 assert.ok(!text.includes('user_id'));
 assert.ok(bytes.length<256);
});
test('snappy block uses raw literal tag and carries identical protobuf data',()=>{
 const bytes=writeRequest(1794579000000);
 const block=snappyLiteral(bytes);
 const length=block[0];
 assert.equal(length,bytes.length);
 assert.equal(block[1],0xf0);
 assert.equal(block[2],bytes.length-1);
 assert.deepEqual(block.subarray(3),bytes);
});
test('nonprod smoke enforces exact origin, encoding and does not print credentials',async()=>{
 const result=await sendRemoteWrite({dsn:'TEST_PRIVATE_NONPROD',now:1794579000000,
  fetchImpl:async(url,req)=>{
   assert.equal(url,'https://api.uptrace.dev/api/v1/prometheus/write');
   assert.equal(req.method,'POST');assert.equal(req.redirect,'error');
   assert.equal(req.headers['content-encoding'],'snappy');
   assert.ok(req.body instanceof Buffer);
   assert.equal(req.body.includes(Buffer.from('TEST_PRIVATE_NONPROD')),false);
   return new Response(null,{status:204});
  }});
 assert.equal(result.accepted,true);
});
