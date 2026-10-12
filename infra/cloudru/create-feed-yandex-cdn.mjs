/**
 * Create one signed Yandex Cloud CDN resource for feed.gafus.ru, currently
 * unresolvable in public DNS. Temporarily pin it to SYNTHETIC-ONLY Cloud.ru
 * Feed Origin; do not publish DNS or cut over any production media here.
 * The already-issued Certificate Manager cert and existing Feed runtime
 * signer / origin HMAC must match the app and must NOT be rotated.
 */
import { spawnSync } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { lookup } from 'node:dns/promises';
const e=process.env;
if(e.GAFUS_FEED_CDN_PROVISION_CONFIRM!=='create-signed-feed-resource-no-dns')
  throw Error('FEED_CDN_CREATION_NOT_AUTHORIZED');
const domain='feed.gafus.ru';
const folder='b1gjbsvfnd1fl68k43g6';
const stageOrigin='gafus-feed-origin-staging.containerapps.ru';
const stageGroup='7331777604738481539';
const certId='fpqkuvbeq4u9trv49apr';
const secrets=JSON.parse(await readFile('infra/feed/.secrets/runtime.json','utf8'));
if(!/^[a-zA-Z0-9_-]{32}$/.test(secrets.cdn_secret??'') ||
   !/^[a-zA-Z0-9_-]{32,128}$/.test(secrets.origin_secret??''))
  throw Error('EXISTING_FEED_SECRETS_NOT_VERIFIED');
const cli=args=>{
 const r=spawnSync('yc',args,{encoding:'utf8',timeout:80000,maxBuffer:2*1024*1024});
 if(r.status!==0){
  const safeError=(r.stderr??'').replaceAll(secrets.cdn_secret,'[MASKED_SIGNER]').replaceAll(secrets.origin_secret,'[MASKED_ORIGIN]');
  console.error('YC_CDN_API_ERROR',args.slice(0,3).join(' '),r.status,safeError.slice(0,1250));
  throw Error('YCL_CDN_OPERATION_FAILED');
 }
 return r.stdout?JSON.parse(r.stdout):{};
};
const current=cli(['cdn','resource','list','--folder-id',folder,'--format=json']);
const duplicate=current.find(x=>x.cname===domain);
if(duplicate){
 const existing=cli(['cdn','resource','get','--id',duplicate.id,'--folder-id',folder,'--format=json']);
 const opts=existing.options??{};
 if(existing.ssl_certificate?.type!=='CM'||existing.ssl_certificate?.status!=='READY'||
   opts.secure_key?.key!==secrets.cdn_secret||
   opts.static_request_headers?.value?.['x-feed-origin-secret']!==secrets.origin_secret)
   throw Error('EXISTING_FEED_CDN_UNTRUSTED_SIGNING_OR_CERT');
 console.log(JSON.stringify({exists:true,resourceId:existing.id,domain:existing.cname,ssl:'READY',
  originGroupId:existing.origin_group_id,secureSigningVerified:true,originHeaderVerified:true,
  providerCNAME:existing.provider_cname}));
 process.exit(0);
}
const cert=cli(['certificate-manager','certificate','get','--id',certId,'--format=json']);
if(cert.status!=='ISSUED'||cert.folder_id!==folder||!cert.domains?.includes(domain))
  throw Error('FEED_TLS_CERT_NOT_ISSUED_OR_WRONG_FOLDER');
const origin=cli(['cdn','origin-group','get','--id',stageGroup,'--folder-id',folder,'--format=json']);
if(origin.origins?.length!==1||origin.origins[0].source!==stageOrigin)
  throw Error('INVALID_SYNTHETIC_STAGE_ORIGIN_GROUP');
try{const answers=await lookup(domain,{all:true});if(answers.length)throw Error('FEED_DNS_ALREADY_LIVE_REFUSE_UNEXPECTED_CUTOVER');}
catch(err){if(err?.code!=='ENOTFOUND'&&err?.code!=='ENODATA')throw err;}
const result=cli(['cdn','resource','create',domain,'--folder-id',folder,
 '--origin-group-id',stageGroup,'--origin-protocol','HTTPS',
 '--cert-manager-ssl-cert-id',certId,
 '--host-header',stageOrigin,'--custom-server-name',stageOrigin,
 '--secure-key',secrets.cdn_secret,'--static-request-headers',`x-feed-origin-secret=${secrets.origin_secret}`,
 '--ignore-query-string','--ignore-cookie',
 '--cache-expiration-time','600','--browser-cache-expiration-time','0',
 '--redirect-http-to-https','--format=json']);
const created=cli(['cdn','resource','get','--id',result.id,'--folder-id',folder,'--format=json']);
if(created.cname!==domain||created.origin_group_id!==stageGroup||
  created.ssl_certificate?.data?.cm?.id!==certId||
  created.options?.secure_key?.key!==secrets.cdn_secret||
  created.options?.static_request_headers?.value?.['x-feed-origin-secret']!==secrets.origin_secret)
  throw Error('FEED_CDN_RESOURCE_CREATED_BUT_SECURITY_VERIFICATION_FAILED');
const dir=join(homedir(),'.codex/cloudru');await mkdir(dir,{recursive:true,mode:0o700});
const receipt=join(dir,'feed-cdn-new-resource.json');
await writeFile(receipt,JSON.stringify({resourceId:created.id,domain,originGroupId:stageGroup,
 certId,createdAt:new Date().toISOString(),dnsConfigured:false,productionEnabled:false},null,2),{mode:0o600});
console.log(JSON.stringify({created:true,resourceId:created.id,domain:created.cname,originGroup:created.origin_group_id,
 certificateReady:created.ssl_certificate?.status==='READY',tlsCertId:certId,
 signerVerified:true,originSecretHeaderVerified:true,onlySyntheticPathsAtOrigin:true,
 cdnDnsTarget:created.provider_cname??created.provider_domain??created.cname_internal??null,productionTrafficUnchanged:true}));
