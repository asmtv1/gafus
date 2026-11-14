import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,chmod,mkdtemp,rm,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {checkPrivateNonprodFile,assertSidecarTopology} from './uptrace-nonprod-sidecar-preflight.mjs';
const root=resolve(fileURLToPath(new URL('../..',import.meta.url)));
const c=join(root,'ci-cd/observability/uptrace/docker-compose.nonprod-ack.yml');
const a=join(root,'ci-cd/observability/uptrace/alloy.nonprod-sidecar.alloy');

test('sidecar uses only isolated Nonprod, secret file and bounded durable queues',async()=>{
 const [config,alloy]=await Promise.all([readFile(c,'utf8'),readFile(a,'utf8')]);
 assert.equal(assertSidecarTopology(alloy,config),true);
 assert.match(config,/restart: unless-stopped/);
 assert.match(config,/no-new-privileges/);
 assert.match(config,/--storage.path=\/var\/lib\/alloy/);
 assert.match(alloy,/gafus_uptrace_ack_gateway_/);
 assert.doesNotMatch(config,/\n\s*ports:/);
 assert.doesNotMatch(config,/\n\s*network_mode: host/);
});

test('refuse published ports, prod targets and plain env tokens',async()=>{
 const [config,alloy]=await Promise.all([readFile(c,'utf8'),readFile(a,'utf8')]);
 for(const change of [config+'\n    ports:\n      - "54319:54319"',
   config.replace('profiles: [preview]','profiles: [production]')])
  assert.throws(()=>assertSidecarTopology(alloy,change),/NONPROD_SIDECAR_ISOLATION_INVALID/);
 assert.throws(()=>assertSidecarTopology(alloy+'\nprometheus.remote_write "yandex" {}',config),
  /NONPROD_SIDECAR_ISOLATION_INVALID/);
 assert.throws(()=>assertSidecarTopology(alloy.replace('local.file "ack_token"','local.file "insecure"'),config),
  /NONPROD_SIDECAR_ISOLATION_INVALID/);
});

test('private credentials must be owner-only regular files, never symlinks',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'gafus-ack-preflight-'));
 t.after(()=>rm(dir,{recursive:true,force:true}));
 const token=join(dir,'token');
 await writeFile(token,'SYNTHETIC_ACK_NONPROD_TOKEN_SAFE_1234567890',{mode:0o600});
 assert.equal(await checkPrivateNonprodFile(token,'ack'),true);
 await chmod(token,0o644);
 await assert.rejects(()=>checkPrivateNonprodFile(token,'ack'),/PRIVATE_FILE_INVALID/);
 await chmod(token,0o600);
 const link=join(dir,'link');await symlink(token,link);
 await assert.rejects(()=>checkPrivateNonprodFile(link,'ack'),/PRIVATE_FILE_INVALID/);
 await writeFile(token,'short',{mode:0o600});
 await assert.rejects(()=>checkPrivateNonprodFile(token,'ack'));
});
