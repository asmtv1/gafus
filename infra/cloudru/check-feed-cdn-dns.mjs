/** Read-only readiness gate for actual feed.gafus.ru CDN hostname + TLS. */
import { spawnSync } from 'node:child_process';
import { Resolver } from 'node:dns/promises';
import { readFile } from 'node:fs/promises';
import { request } from 'node:https';
import { createHash } from 'node:crypto';
const domain='feed.gafus.ru',folder='b1gjbsvfnd1fl68k43g6',id='bc8ru2x6mcqxwcl6a7vj';
const op=spawnSync('yc',['cdn','resource','get','--id',id,'--folder-id',folder,'--format=json'],{encoding:'utf8',timeout:22000});
if(op.status!==0)throw Error('FEED_CDN_RESOURCE_UNREADABLE');
const x=JSON.parse(op.stdout),o=x.options??{},secrets=JSON.parse(await readFile('infra/feed/.secrets/runtime.json','utf8'));
if(x.cname!==domain||x.ssl_certificate?.type!=='CM'||x.ssl_certificate?.status!=='READY'||
  x.origin_group_id!=='8971053823582171020'||
  !x.active||o.secure_key?.key!==secrets.cdn_secret||
  o.static_request_headers?.value?.['x-feed-origin-secret']!==secrets.origin_secret)
  throw Error('FEED_CDN_CERT_SIGNER_OR_ORIGIN_SECRET_UNSAFE');
const expected=x.provider_cname?.replace(/\.$/,'').toLowerCase();
if(!expected?.endsWith('.topology.gslb.yccdn.ru'))throw Error('UNEXPECTED_YANDEX_CDN_TARGET');
// CDN CLI v0 may omit ssl_certificate.data even though the REST API returns
// the original Certificate Manager ID. Verify exactly which cert is attached.
const auth=spawnSync('yc',['iam','create-token'],{encoding:'utf8',timeout:18000});
if(auth.status!==0)throw Error('Y_CDN_IAM_TOKEN_READ_FAILED');
const rest=await fetch(`https://cdn.api.cloud.yandex.net/cdn/v1/resources/${id}`,{
 headers:{Authorization:`Bearer ${auth.stdout.trim()}`},signal:AbortSignal.timeout(15000)});
if(!rest.ok)throw Error('Y_CDN_REST_READ_FAILED');
const restData=await rest.json();
if(restData.sslCertificate?.data?.cm?.id!=='fpqkuvbeq4u9trv49apr')
 throw Error('WRONG_FEED_CDN_CERTIFICATE_ID');
// Use independent public recursors rather than the Mac's stale negative cache.
const publicResolvers=['1.1.1.1','8.8.8.8'];
const recursorResults=await Promise.all(publicResolvers.map(async server=>{
 const resolver=new Resolver();resolver.setServers([server]);
 try{return{server,cnames:(await resolver.resolveCname(domain)).map(x=>x.replace(/\.$/,'').toLowerCase())}}
 catch(err){return{server,cnames:[],error:err?.code??'unknown'}};
}));
const cname=[...new Set(recursorResults.flatMap(x=>x.cnames))];
const authoritative=['ns1.reg.ru','ns2.reg.ru'].map(server=>{
 const query=spawnSync('dig',[`@${server}`,'+short',domain,'CNAME'],{encoding:'utf8',timeout:6000});
 return {server,cnames:query.status===0?query.stdout.trim().split(/\s+/).filter(Boolean).map(x=>x.replace(/\.$/,'').toLowerCase()):[]};
});
const dnsCorrect=authoritative.every(x=>x.cnames.includes(expected))&&
 recursorResults.some(x=>x.cnames.includes(expected));
const result={resource:id,domain,sslCertificateReady:true,existingFeedSignerVerified:true,originSecretVerified:true,
 expectedCNAME:expected,publicCNAME:cname,publicRecursors:recursorResults,
 authoritative,certificateId:'fpqkuvbeq4u9trv49apr',dnsCorrect};
if(!dnsCorrect){console.log(JSON.stringify({...result,acceptance:'DNS_RECORD_REQUIRED'}));process.exit(2);}
const probe=async (path,md5,exp)=>await new Promise((resolve,reject)=>{
 const link=new URL(`https://${domain}${path}?md5=${md5}&expires=${exp}`);
 const call=request(link,{method:'HEAD',timeout:12000,rejectUnauthorized:true},res=>{res.resume();res.on('end',()=>resolve(res.statusCode))});
 call.on('timeout',()=>call.destroy(Error('TLS_PROBE_TIMEOUT')));call.on('error',reject);call.end();
});
const path='/posts/__gafus_cloudru_validation__/staging/attachments/11111111-1111-4111-8111-111111111111/poster.webp';
const expired=Math.floor(Date.now()/1000)-80, future=Math.floor(Date.now()/1000)+70;
const expiredMd5=createHash('md5').update(`${expired}${path} ${secrets.cdn_secret}`).digest('base64url');
try{
 const statusExpired=await probe(path,expiredMd5,expired);
 const statusTampered=await probe(path,'A'.repeat(22),future);
 const ok=[403,410].includes(statusExpired)&&statusTampered===403;
 console.log(JSON.stringify({...result,tlsVerified:true,expiredStatus:statusExpired,tamperedStatus:statusTampered,
  acceptance:ok?'SIGNER_TLS_TEST_PASS':'SIGNED_EDGE_TEST_UNVERIFIED'}));
 if(!ok)process.exitCode=1;
}catch(err){
 console.log(JSON.stringify({...result,tlsVerified:false,tlsErrorCode:err?.code??err?.name??'unknown',
  acceptance:'EDGE_TLS_NOT_READY'}));
 process.exitCode=3;
}
