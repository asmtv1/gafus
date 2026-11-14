#!/usr/bin/env node
/** Read-only launch gate for isolated Nonprod ACK sidecar. No docker up. */
import { lstat, readFile, realpath } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const compose=join(root,'ci-cd/observability/uptrace/docker-compose.nonprod-ack.yml');
const graph=join(root,'ci-cd/observability/uptrace/alloy.nonprod-sidecar.alloy');
const requiredNames=['uptrace-nonprod-ack-gateway.token','uptrace-nonprod-ingest.dsn'];

export async function checkPrivateNonprodFile(path,kind){
 const info=await lstat(path);
 if(!info.isFile()||info.isSymbolicLink()||info.uid!==process.getuid()||
    (info.mode&0o077)!==0||info.size<12||info.size>4096)
  throw Error('NONPROD_PRIVATE_FILE_INVALID:'+kind);
 const text=(await readFile(path,'utf8')).trim();
 if(kind==='ack'&&!/^[A-Za-z0-9_-]{32,128}$/.test(text))
  throw Error('NONPROD_ACK_TOKEN_INVALID');
 if(kind==='dsn'&&(text.length<12||/[\r\n\x00-\x1f]/.test(text)))
  throw Error('NONPROD_DSN_INVALID');
 return true;
}

export function assertSidecarTopology(alloy,composeText){
 const activeAlloy=alloy.split('\n').filter(line=>!/^\s*\/\//.test(line)).join('\n');
 if(!alloy.includes('local.file "ack_token"')||
    !alloy.includes('is_secret = true')||
    !alloy.includes('string.trim_space(convert.nonsensitive(local.file.ack_token.content))')||
    !alloy.includes('otelcol.storage.file')||
    !alloy.includes('block_on_overflow = true')||
    !composeText.includes('network_mode: service:ack-gateway')||
    !composeText.includes('network_mode: none')||
    !composeText.includes('read_only: true')||
    !composeText.includes('nonprod-wal:')||
    !composeText.includes('source: nonprod-wal')||
    !composeText.includes('--stability.level=public-preview')||
    (composeText.match(/profiles: \[preview\]/g)??[]).length!==3||
    /profiles: \[production\]/.test(composeText)||
    /network_mode: host/.test(composeText)||
    /GAFUS_NONPROD_ACK_GATEWAY_TOKEN:/.test(composeText)||
    !composeText.includes('GAFUS_TELEMETRY_ENVIRONMENT: preview')||
    !composeText.includes('GAFUS_UPTRACE_ACK_GATEWAY_ENABLED: "true"')||
    /^\s*ports:/m.test(composeText)||
    /\b(?:postgres|redis|appmetrica|yandex|yc\.monitoring|gafus-prod)\b/i.test(activeAlloy))
  throw Error('NONPROD_SIDECAR_ISOLATION_INVALID');
 return true;
}

export async function runSidecarPreflight({env=process.env,runCompose=true}={}){
 const uid=process.getuid();
 if(!Number.isSafeInteger(uid))throw Error('NONPROD_REQUIRES_LOCAL_UNIX_UID');
 const dir=env.GAFUS_NONPROD_CREDENTIALS_DIR??join(homedir(),'.config/gafus-observability');
 if(!resolve(dir).startsWith(join(homedir(),'.config/')+'')||
    (await realpath(dir))!==resolve(dir))
  throw Error('NONPROD_CREDENTIALS_DIRECTORY_NOT_PRIVATE_HOME');
 const names=await Promise.all(requiredNames.map(async(name,i)=>
  checkPrivateNonprodFile(join(dir,name),i===0?'ack':'dsn')));
 const [alloy,composeText]=await Promise.all([readFile(graph,'utf8'),readFile(compose,'utf8')]);
 assertSidecarTopology(alloy,composeText);
 if(runCompose){
  execFileSync('docker',['compose','-f',compose,'--profile','preview','config','--quiet'],{
   cwd:root,
   env:{...env,GAFUS_NONPROD_UID:String(uid),GAFUS_NONPROD_CREDENTIALS_DIR:dir},
   timeout:15_000,
   stdio:['ignore','pipe','pipe'],
  });
 }
 return {scope:'GAFUS Nonprod 9383 only',credentialFilesVerified:names.length,
  isolatedSidecar:true,composeValid:runCompose,
  permanentDeploymentBlocked:'independent watchdog, hard WAL quota, native crash and 14+7 day gates still pending'};
}

if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1])){
 runSidecarPreflight().then(value=>console.log(JSON.stringify(value))).catch(()=>{
  console.error('NONPROD_SIDECAR_PREFLIGHT_BLOCKED');process.exitCode=1;
 });
}
