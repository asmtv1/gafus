import {test} from 'node:test';
import assert from 'node:assert/strict';
import { associations,destinations,verifyLiveDomainLinks } from './gafus-app-links-live.mjs';
const expected=Object.fromEntries(associations.map(p=>[p,{marker:p}]));
const ok=(route,options={})=>({
  status:options.status??200,
  redirected:options.redirected??false,
  headers:{get:k=>k==='content-type'?(options.type??'application/json'):k==='location'?(options.location??null):null},
  json:async()=> options.body??expected[route],
});
test('requires 4 direct 200 JSON documents with exact expected contents at apex/www',async()=>{
  const seen=[];
  const read=await verifyLiveDomainLinks({expected,fetchImpl:async(url,opts)=>{
    assert.equal(opts.method,'GET');assert.equal(opts.redirect,'manual');
    seen.push(url);return ok(new URL(url).pathname);
  }});
  assert.equal(read.length,4);
  assert(seen.includes('https://www.gafus.ru/.well-known/assetlinks.json'));
});
test('fails closed if the edge redirects or serves SPA text/html with 200',async()=>{
  for(const options of [{status:302,location:'https://other.example'},{type:'text/html'},
    {body:{index:'SPA'}}]) {
    await assert.rejects(verifyLiveDomainLinks({expected,
      fetchImpl:async(url)=>ok(new URL(url).pathname,options)}),
    /APP_LINK_(HTTP_NOT_DIRECT_200|INVALID_CONTENT_TYPE|LIVE_DOCUMENT_MISMATCH)/);
  }
});
test('one inaccessible host blocks domain verification, even if apex passes',async()=>{
  await assert.rejects(verifyLiveDomainLinks({expected,fetchImpl:async(url)=>{
    if(new URL(url).host==='www.gafus.ru')throw Error('network');
    return ok(new URL(url).pathname);
  }}),/APP_LINK_DOMAIN_UNREACHABLE/);
});
