/**
 * Safely park new, currently DNS-unpublished feed.gafus.ru CDN against the
 * pre-existing Yandex Feed API Gateway (NOT Cloud.ru staging-only) until
 * production Cloud.ru Feed Origin is separately deployed and accepted.
 * Does NOT alter any pre-existing CDN resource or DNS record.
 */
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
const e=process.env;
if(e.GAFUS_FEED_PARK_CONFIRM!=='new-cdn-only-existing-yandex-feed-origin')throw Error('NEW_FEED_CDN_PARK_NOT_AUTHORIZED');
const id='bc8ru2x6mcqxwcl6a7vj',folder='b1gjbsvfnd1fl68k43g6';
const yandexFeedGroup='8971053823582171020';
const yandexFeedHost='d5dbaoo0dr812sj1ee7f.764nr5vy.apigw.yandexcloud.net';
const stageGroup='7331777604738481539';
const stageHost='gafus-feed-origin-staging.containerapps.ru';
const credentials=JSON.parse(await readFile('infra/feed/.secrets/runtime.json','utf8'));
function cli(args){const r=spawnSync('yc',args,{encoding:'utf8',timeout:60000});if(r.status!==0)throw Error(`YC_COMMAND_FAILED_${args[0]}_${args[1]}`);return r.stdout?JSON.parse(r.stdout):{}}
const group=cli(['cdn','origin-group','get','--id',yandexFeedGroup,'--folder-id',folder,'--format=json']);
if(group.origins?.length!==1||group.origins[0].source!==yandexFeedHost)throw Error('UNEXPECTED_EXISTING_FEED_GROUP');
const read=()=>cli(['cdn','resource','get','--id',id,'--folder-id',folder,'--format=json']);
const info=()=>{const x=read(),o=x.options??{};if(x.cname!=='feed.gafus.ru'||x.ssl_certificate?.type!=='CM'||x.ssl_certificate?.status!=='READY'||
 o.secure_key?.key!==credentials.cdn_secret||o.static_request_headers?.value?.['x-feed-origin-secret']!==credentials.origin_secret)
 throw Error('NEW_FEED_CDN_CERT_OR_SIGNER_MISMATCH');
 return{domain:x.cname,group:x.origin_group_id,host:o.host_options?.host?.value,sni:o.custom_server_name?.value??null,signatureVerified:true,staticOriginSecretVerified:true}};
const before=info();
if(before.group===yandexFeedGroup&&before.host===yandexFeedHost&&before.sni===yandexFeedHost){console.log(JSON.stringify({alreadyParked:true,...before}));process.exit(0)}
if(before.group!==stageGroup||before.host!==stageHost||before.sni!==stageHost)throw Error('WRONG_RESOURCE_NOT_STAGE');
try{cli(['cdn','resource','update','--id',id,'--folder-id',folder,'--origin-group-id',yandexFeedGroup,'--host-header',yandexFeedHost,'--custom-server-name',yandexFeedHost,'--origin-protocol','HTTPS','--format=json']);}
catch(error){console.error('FEED_CDN_UPDATE_CLI_FAILED_CHECK_LIVE_STATE');}
const after=info();
if(after.group!==yandexFeedGroup||after.host!==yandexFeedHost||after.sni!==yandexFeedHost)throw Error('SAFE_FEED_CDN_PARK_UNVERIFIED');
console.log(JSON.stringify({parkedToExistingFeedOrigin:true,...after,productionCloudruUntouched:true,existingCDNResourcesUntouched:true}));
