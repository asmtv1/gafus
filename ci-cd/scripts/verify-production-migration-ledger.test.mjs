import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, renameSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const program = 'ci-cd/scripts/verify-production-migration-ledger.py';
const fixtureRoot = mkdtempSync(join(tmpdir(), 'gafus-ledger-gate-'));
const fixtures = [];
for (let i = 0; i < 163; i++) {
  const name = i===0 ? '20251118_add_trainer_videos' : `20260101000000_synthetic_${String(i).padStart(3, '0')}`;
  const sql = `CREATE TABLE synthetic_${i} (id INTEGER);\n`;
  const directory = join(fixtureRoot, name);
  mkdirSync(directory);
  writeFileSync(join(directory, 'migration.sql'), sql);
  fixtures.push({name, checksum:createHash('sha256').update(sql).digest('hex')});
}
const run = (rows, dir = fixtureRoot) => spawnSync('python3', [program, dir], {
  input:rows.length ? rows.map(r => r.join('\t')).join('\n')+'\n' : '', encoding:'utf8', timeout:15_000,
});
const validRows = () => fixtures.map(x => [x.name, x.checksum, 'applied']);
const deny = (rows, needle) => {
  const result=run(rows);
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, new RegExp(needle));
  assert.doesNotMatch(result.stdout, /_PASS:/);
};

test('full synthetic 163-migration ledger matches all local SHA256, pending allowed', () => {
  const rows = validRows();
  const result=run(rows);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /applied=163:pending=0/);
  assert.equal(run([...rows, ['20260101000000_synthetic_000','manual','rolled_back']]).status,0);
});
test('fail closed on checksum mismatch, manual checksum, duplicate, remote-only, failed, truncated ledger', () => {
  const orig=validRows();
  const replace=(i,row)=>orig.map((v,n)=>n===i?row:v);
  deny(replace(1,[orig[1][0], 'f'.repeat(64), 'applied']), 'MIGRATION_SHA_MISMATCH');
  deny(replace(1,[orig[1][0], 'manual', 'applied']), 'NONSTANDARD_MIGRATION_CHECKSUM');
  deny([...orig,orig[1]], 'DUPLICATE_APPLIED_MIGRATION');
  deny([...orig,['20260101000000_nonexistent', 'a'.repeat(64), 'applied']], 'REMOTE_ONLY_MIGRATION');
  deny(replace(1,[orig[1][0], orig[1][1], 'failed']), 'UNFINISHED_MIGRATION');
  deny(orig.slice(0,161), 'APPLIED_MIGRATION_COUNT_TOO_LOW');
  deny([], 'MIGRATION_LEDGER_EMPTY');
});
test('approved legacy checksum exceptions need exact schema, all six historical rows and unmodified SQL', () => {
  const base=mkdtempSync(join(tmpdir(),'gafus-legacy-ledger-attestation-'));
  try {
    const dirs=join(base,'packages/prisma/migrations');
    const manifestDir=join(base,'ci-cd/scripts');
    mkdirSync(dirs,{recursive:true});
    mkdirSync(manifestDir,{recursive:true});
    const manifest=JSON.parse(readFileSync('ci-cd/scripts/approved-legacy-migration-baseline-20261115.json','utf8'));
    const rows=[];
    for(let i=0;i<162;i++){
      const name=`20200101000000_synthetic_${String(i).padStart(3,'0')}`;
      const sql=`CREATE TABLE ledger_synthetic_${i} (id INTEGER);\n`;
      mkdirSync(join(dirs,name));
      writeFileSync(join(dirs,name,'migration.sql'),sql);
      rows.push([name,createHash('sha256').update(sql).digest('hex'),'applied']);
    }
    const approved=Object.entries(manifest.approvedLegacyChecksumExceptions);
    for(const [name,rule] of approved){
      const dir=join(dirs,name);mkdirSync(dir);
      const actual=readFileSync(join('packages/prisma/migrations',name,'migration.sql'));
      writeFileSync(join(dir,'migration.sql'),actual);
      assert.equal(createHash('sha256').update(actual).digest('hex'),rule.candidateSqlSha256);
      rows.push([name,rule.recordedProductionChecksum,'applied']);
    }
    for(let i=0;i<12;i++){
      const name=`20270101000000_future_${String(i).padStart(2,'0')}`;
      const dir=join(dirs,name);mkdirSync(dir);
      writeFileSync(join(dir,'migration.sql'),`SELECT ${i};\n`);
      if(i<4)rows.push([name,'0'.repeat(64),'rolled_back']);
    }
    const fingerprint = Object.keys(manifest.schemaCheckpoints)[0];
    manifest.schemaCheckpoints = {
      [fingerprint]: {
        expectedApplied: 168,
        expectedRolledBack: 4,
        expectedSources: 180,
        ledgerSha256: createHash('sha256').update(rows.map(row => row.join('\t') + '\n').sort().join('')).digest('hex'),
      },
    };
    writeFileSync(join(manifestDir,'approved-legacy-migration-baseline-20261115.json'),
      JSON.stringify(manifest));
    const runApproved=(data,schema=fingerprint)=>
      spawnSync('python3',[program,dirs,...(schema===null?[]:[schema])],{
        input:data.map(x=>x.join('\t')).join('\n')+'\n',encoding:'utf8',timeout:15_000,
      });
    const pass=runApproved(rows);
    assert.equal(pass.status,0,pass.stderr);
    assert.match(pass.stdout,/LEGACY_SCHEMA_ATTESTED_EXCEPTIONS:6/);
    assert.match(pass.stdout,/applied=168:pending=12/);
    assert.equal(runApproved([...rows].reverse()).status,0,'ledger order must not affect the checkpoint');
    const changedRollback = rows.map(row => row[2] === 'rolled_back' ? [row[0], '1'.repeat(64), row[2]] : row);
    assert.match(runApproved(changedRollback).stderr,/LEGACY_APPROVAL_NOT_EXACT_PRODUCTION_BASELINE/);
    for(const bad of [runApproved(rows,null),runApproved(rows,'a'.repeat(64))]){
      assert.equal(bad.status,1,'missing/changed schema must veto');
      assert.match(bad.stderr,/NONSTANDARD_MIGRATION_CHECKSUM|MIGRATION_SHA_MISMATCH/);
    }
    const altered=rows.map(x=>[...x]);
    altered[162][1]='f'.repeat(64);
    const tamperedLedger=runApproved(altered);
    assert.equal(tamperedLedger.status,1);
    assert.match(tamperedLedger.stderr,/MIGRATION_SHA_MISMATCH/);
    const altered2=rows.map(x=>[...x]);
    altered2[0][1]='f'.repeat(64);
    assert.match(runApproved(altered2).stderr,/MIGRATION_SHA_MISMATCH/);
    const partlyRepaired=rows.map(x=>[...x]);
    partlyRepaired[162][1]=approved[0][1].candidateSqlSha256;
    assert.match(runApproved(partlyRepaired).stderr,/LEGACY_APPROVAL_NOT_EXACT_PRODUCTION_BASELINE/);
    const target=join(dirs,approved[1][0],'migration.sql');
    writeFileSync(target,readFileSync(target,'utf8')+'-- tampered\n');
    assert.equal(runApproved(rows).status,1,'modified candidate SQL must veto even with pinned live schema');
  } finally {rmSync(base,{recursive:true,force:true});}
});

test('new mandatory OTA migration is pinned at the pre-schema and exact post-schema checkpoint', () => {
  const root=mkdtempSync(join(tmpdir(),'gafus-ota-pending-ledger-'));
  try {
    const migrations=join(root,'packages/prisma/migrations');
    const manifestDir=join(root,'ci-cd/scripts');
    mkdirSync(migrations,{recursive:true});
    mkdirSync(manifestDir,{recursive:true});
    const manifest=JSON.parse(readFileSync('ci-cd/scripts/approved-legacy-migration-baseline-20261115.json','utf8'));
    const pre='a'.repeat(64), post='b'.repeat(64);
    const migration='20261118101500_per_platform_mobile_ota_mandatory';
    const newSql=readFileSync(join('packages/prisma/migrations',migration,'migration.sql'));
    const pinned=createHash('sha256').update(newSql).digest('hex');
    const realPre=manifest.schemaCheckpoints['58989b48f1a51db4b1d034d5e8a9058e9347a67aa2d5e812136c83c3c297cb18'];
    assert.deepEqual(realPre.approvedPendingMigration,{name:migration,sqlSha256:pinned});
    const realPost=manifest.schemaCheckpoints['f7a0c486a02a1ee905a765182b9f30773c582811ff51e30080e658cdf8e837cd'];
    assert.equal(realPost.expectedApplied,182);
    assert.equal(realPost.expectedSources,182);
    assert.equal(realPost.expectedRolledBack,4);

    const rows=[];
    for(let i=0;i<175;i++){
      const name=`20200101000000_synthetic_${String(i).padStart(3,'0')}`;
      const sql=`SELECT ${i};\n`;
      const dir=join(migrations,name);mkdirSync(dir);
      writeFileSync(join(dir,'migration.sql'),sql);
      rows.push([name,createHash('sha256').update(sql).digest('hex'),'applied']);
    }
    for(const [name,rule] of Object.entries(manifest.approvedLegacyChecksumExceptions)){
      const dir=join(migrations,name);mkdirSync(dir);
      const sql=readFileSync(join('packages/prisma/migrations',name,'migration.sql'));
      writeFileSync(join(dir,'migration.sql'),sql);
      assert.equal(createHash('sha256').update(sql).digest('hex'),rule.candidateSqlSha256);
      rows.push([name,rule.recordedProductionChecksum,'applied']);
    }
    for(let i=0;i<4;i++) rows.push([`20270101000000_rolled_back_${i}`,'0'.repeat(64),'rolled_back']);
    const digest=items=>createHash('sha256').update(
      items.map(row=>row.join('\t')+'\n').sort().join('')
    ).digest('hex');
    const migrated=[...rows,[migration,pinned,'applied']];
    manifest.schemaCheckpoints={
      [pre]:{ledgerSha256:digest(rows),expectedApplied:181,expectedRolledBack:4,
        expectedSources:181,approvedPendingMigration:{name:migration,sqlSha256:pinned}},
      [post]:{ledgerSha256:digest(migrated),expectedApplied:182,expectedRolledBack:4,expectedSources:182},
    };
    writeFileSync(join(manifestDir,'approved-legacy-migration-baseline-20261115.json'),
      JSON.stringify(manifest));
    const runScoped=(data,schema=pre)=>spawnSync('python3',[program,migrations,schema],{
      input:data.map(row=>row.join('\t')).join('\n')+'\n',encoding:'utf8',timeout:15_000,
    });
    assert.equal(runScoped(rows).status,0,'original exact checkpoint must still work');
    const pendingDir=join(migrations,migration);mkdirSync(pendingDir);
    writeFileSync(join(pendingDir,'migration.sql'),newSql);
    const pending=runScoped(rows);
    assert.equal(pending.status,0,pending.stderr);
    assert.match(pending.stdout,/applied=181:pending=1/);
    assert.match(pending.stdout,/LEGACY_SCHEMA_ATTESTED_EXCEPTIONS:6/);

    assert.match(runScoped(migrated).stderr,/LEGACY_APPROVAL_NOT_EXACT_PRODUCTION_BASELINE/,
      'migration recorded before schema update must veto');
    assert.match(runScoped(rows,post).stderr,/LEGACY_APPROVAL_NOT_EXACT_PRODUCTION_BASELINE/,
      'new schema but old ledger must veto');
    const final=runScoped(migrated,post);
    assert.equal(final.status,0,final.stderr);
    assert.match(final.stdout,/applied=182:pending=0/);

    writeFileSync(join(pendingDir,'migration.sql'),Buffer.concat([newSql,Buffer.from('-- changed\n')]));
    assert.match(runScoped(rows).stderr,/LEGACY_APPROVAL_NOT_EXACT_PRODUCTION_BASELINE/,
      'even one byte change in pending SQL must veto');
    writeFileSync(join(pendingDir,'migration.sql'),newSql);
    const unexpected=join(migrations,'20271212000000_unreviewed');
    mkdirSync(unexpected);writeFileSync(join(unexpected,'migration.sql'),'SELECT 1;\n');
    assert.match(runScoped(rows).stderr,/LEGACY_APPROVAL_NOT_EXACT_PRODUCTION_BASELINE/,
      'a second unapproved pending migration must veto');
    rmSync(unexpected,{recursive:true});
    const drift=runScoped(rows,'c'.repeat(64));
    assert.equal(drift.status,1,'unknown production schema must veto all six exceptions');
    assert.match(drift.stderr,/MIGRATION_SHA_MISMATCH|NONSTANDARD_MIGRATION_CHECKSUM/);
    const rollbackDrift=rows.map(row=>row[2]==='rolled_back'?[row[0],'1'.repeat(64),row[2]]:row);
    assert.match(runScoped(rollbackDrift).stderr,/LEGACY_APPROVAL_NOT_EXACT_PRODUCTION_BASELINE/);
  } finally { rmSync(root,{recursive:true,force:true}); }
});

test('four SHA-pinned migrations require exact pre- and post-migration production checkpoints',()=>{
  const root=mkdtempSync(join(tmpdir(),'gafus-four-pending-ledger-'));
  try {
    const migrations=join(root,'packages/prisma/migrations');
    const manifestDir=join(root,'ci-cd/scripts');
    mkdirSync(migrations,{recursive:true});
    mkdirSync(manifestDir,{recursive:true});
    const manifest=JSON.parse(readFileSync('ci-cd/scripts/approved-legacy-migration-baseline-20261115.json','utf8'));
    const prodSha='f7a0c486a02a1ee905a765182b9f30773c582811ff51e30080e658cdf8e837cd';
    const real=manifest.schemaCheckpoints[prodSha];
    const prodAfterSha='eceee5fa0ca9ed7ac3d6dfbc44f30cfd29b772662c534f142e29178ffe12aa42';
    const realAfter=manifest.schemaCheckpoints[prodAfterSha];
    const pinned=real.approvedPendingMigrations;
    assert.equal(real.expectedApplied,182);
    assert.equal(real.expectedSources,182);
    assert.equal(pinned.length,4);
    assert.equal(realAfter.expectedApplied,real.expectedApplied+pinned.length);
    assert.equal(realAfter.expectedSources,realAfter.expectedApplied);
    assert.equal(realAfter.expectedRolledBack,real.expectedRolledBack);
    assert.equal(realAfter.approvedPendingMigration,undefined);
    // Later reviewed batches may extend this checkpoint; its 186-source baseline remains valid.
    assert.deepEqual(pinned.map(item=>item.name),[
      '20261118160000_version_ota_publication',
      '20261118201500_remove_vk_review_profiles',
      '20261119121000_account_deletion_audit_immutable',
      '20261120120000_google_play_subscriptions',
    ]);
    for(const item of pinned){
      const contents=readFileSync(join('packages/prisma/migrations',item.name,'migration.sql'));
      assert.equal(createHash('sha256').update(contents).digest('hex'),item.sqlSha256);
      const dir=join(migrations,item.name);mkdirSync(dir);
      writeFileSync(join(dir,'migration.sql'),contents);
    }
    const rows=[];
    for(let i=0;i<176;i++){
      const name=`20200101000000_synthetic_${String(i).padStart(3,'0')}`;
      const sql=`SELECT ${i};\n`;
      const dir=join(migrations,name);mkdirSync(dir);
      writeFileSync(join(dir,'migration.sql'),sql);
      rows.push([name,createHash('sha256').update(sql).digest('hex'),'applied']);
    }
    for(const [name,rule] of Object.entries(manifest.approvedLegacyChecksumExceptions)){
      const dir=join(migrations,name);mkdirSync(dir);
      const sql=readFileSync(join('packages/prisma/migrations',name,'migration.sql'));
      writeFileSync(join(dir,'migration.sql'),sql);
      rows.push([name,rule.recordedProductionChecksum,'applied']);
    }
    for(let i=0;i<4;i++)rows.push([`20270101000000_rolled_back_${i}`,'0'.repeat(64),'rolled_back']);
    const digest=input=>createHash('sha256').update(input.map(row=>row.join('\t')+'\n').sort().join('')).digest('hex');
    const pre='a'.repeat(64);
    const post='b'.repeat(64);
    const appliedRows=[...rows,...pinned.map(({name,sqlSha256})=>[name,sqlSha256,'applied'])];
    real.ledgerSha256=digest(rows);
    realAfter.ledgerSha256=digest(appliedRows);
    manifest.schemaCheckpoints={ [pre]:real, [post]:realAfter };
    const manifestPath=join(manifestDir,'approved-legacy-migration-baseline-20261115.json');
    writeFileSync(manifestPath,JSON.stringify(manifest));
    const run=(data=rows,hash=pre)=>spawnSync('python3',[program,migrations,hash],{
      input:data.map(row=>row.join('\t')).join('\n')+'\n',encoding:'utf8',timeout:15_000,
    });
    const accepted=run();
    assert.equal(accepted.status,0,accepted.stderr);
    assert.match(accepted.stdout,/applied=182:pending=4/);
    assert.match(accepted.stdout,/LEGACY_SCHEMA_ATTESTED_EXCEPTIONS:6/);
    assert.equal(run(rows,'c'.repeat(64)).status,1,'unknown live schema must veto');
    assert.equal(run(rows.map((row,i)=>i===0?[row[0],'f'.repeat(64),row[2]]:row)).status,1,
      'different historical ledger must veto');
    const after=run(appliedRows,post);
    assert.equal(after.status,0,after.stderr);
    assert.match(after.stdout,/applied=186:pending=0/);
    assert.equal(run(rows,post).status,1,'post-migration schema must reject the preceding ledger');
    const first=pinned[0].name;
    const original=readFileSync(join(migrations,first,'migration.sql'));
    writeFileSync(join(migrations,first,'migration.sql'),Buffer.concat([original,Buffer.from('-- changed\n')]));
    assert.match(run().stderr,/LEGACY_APPROVAL_NOT_EXACT_PRODUCTION_BASELINE/);
    writeFileSync(join(migrations,first,'migration.sql'),original);
    const extra=join(migrations,'20271212000000_unreviewed');
    mkdirSync(extra);writeFileSync(join(extra,'migration.sql'),'SELECT 1;\n');
    assert.match(run().stderr,/LEGACY_APPROVAL_NOT_EXACT_PRODUCTION_BASELINE/);
    assert.match(run(appliedRows,post).stderr,/LEGACY_APPROVAL_NOT_EXACT_PRODUCTION_BASELINE/);
    rmSync(extra,{recursive:true});
    const missing=join(migrations,pinned[1].name);
    renameSync(missing,missing+'.disabled');
    assert.match(run().stderr,/LEGACY_APPROVAL_NOT_EXACT_PRODUCTION_BASELINE/);
    renameSync(missing+'.disabled',missing);
    const premature=[...rows,[first,pinned[0].sqlSha256,'applied']];
    assert.match(run(premature).stderr,/LEGACY_APPROVAL_NOT_EXACT_PRODUCTION_BASELINE/);
    manifest.schemaCheckpoints[pre].approvedPendingMigrations.push(pinned[0]);
    writeFileSync(manifestPath,JSON.stringify(manifest));
    assert.match(run().stderr,/LEGACY_MANIFEST_PENDING_INVALID/,'duplicate approval must veto');
  } finally { rmSync(root,{recursive:true,force:true}); }
});

test('six pending SQL proposal is exact and fails closed until separately reviewed',()=>{
  const root=mkdtempSync(join(tmpdir(),'gafus-six-pending-ledger-'));
  try {
    const manifestRel='ci-cd/scripts/approved-legacy-migration-baseline-20261115.json';
    const proposal='docs/audit/evidence/direct-prod-ledger-20261128/pending-batch.proposal.patch';
    const manifestPath=join(root,manifestRel);
    const migrations=join(root,'packages/prisma/migrations');
    mkdirSync(join(root,'ci-cd/scripts'),{recursive:true});
    mkdirSync(migrations,{recursive:true});
    writeFileSync(manifestPath,readFileSync(manifestRel));
    const patch=readFileSync(proposal);
    const apply=(args)=>spawnSync('git',['apply',...args],{cwd:root,input:patch,encoding:'utf8'});
    const fingerprint='eceee5fa0ca9ed7ac3d6dfbc44f30cfd29b772662c534f142e29178ffe12aa42';
    // Also exercise the same test after a separately authorized application.
    if(JSON.parse(readFileSync(manifestPath)).schemaCheckpoints[fingerprint].approvedPendingMigrations){
      const reversed=apply(['--reverse']);
      assert.equal(reversed.status,0,reversed.stderr);
    }
    const original=JSON.parse(readFileSync(manifestPath));
    const check=apply(['--check']);
    assert.equal(check.status,0,check.stderr);
    const applied=apply([]);
    assert.equal(applied.status,0,applied.stderr);
    const proposed=JSON.parse(readFileSync(manifestPath));
    const checkpoint=proposed.schemaCheckpoints[fingerprint];
    const pinned=checkpoint.approvedPendingMigrations;
    assert.deepEqual(pinned.map(x=>x.name),[
      '20261126220000_dog_walk_changes',
      '20261127090000_consultation_push_receipts',
      '20261127140000_walk_gps_ota_operational_signals',
      '20261127150000_yookassa_frozen_checkout_return_url',
      '20261127160000_mail_attempt_operational_category',
      '20261127170000_mail_event_received_at_brin',
    ]);
    assert.equal(checkpoint.ledgerSha256,'ab671c55b705417f01f8001ed6b50530552853e7a08cacf3d8048ff1851da8dd');
    assert.equal(checkpoint.expectedApplied,186);
    assert.equal(checkpoint.expectedRolledBack,4);
    assert.equal(checkpoint.expectedSources,186);
    const expected=structuredClone(original);
    expected.schemaCheckpoints[fingerprint].approvedPendingMigrations=pinned;
    assert.deepEqual(proposed,expected,'only this pending batch may change');
    const rows=[];
    const sourceDir='packages/prisma/migrations';
    const names=spawnSync('git',['ls-files',sourceDir],{encoding:'utf8'});
    assert.equal(names.status,0,names.stderr);
    for(const file of names.stdout.trim().split('\n').filter(f=>f.endsWith('/migration.sql'))){
      const name=file.split('/').at(-2);
      const bytes=readFileSync(file);
      const sha=createHash('sha256').update(bytes).digest('hex');
      const dir=join(migrations,name);mkdirSync(dir);
      writeFileSync(join(dir,'migration.sql'),bytes);
      const pending=pinned.find(x=>x.name===name);
      if(pending){assert.equal(sha,pending.sqlSha256);continue;}
      rows.push([name,original.approvedLegacyChecksumExceptions[name]?.recordedProductionChecksum??sha,'applied']);
    }
    assert.equal(rows.length,186);
    for(let i=0;i<4;i++)rows.push([`20270101000000_rolled_back_${i}`,'0'.repeat(64),'rolled_back']);
    // Synthetic rollback metadata and fingerprint are deliberately NOT a live attestation.
    const synthetic='a'.repeat(64);
    const digest=input=>createHash('sha256').update(input.map(row=>row.join('\t')+'\n').sort().join('')).digest('hex');
    const fixture=structuredClone(proposed);
    fixture.schemaCheckpoints={[synthetic]:{...checkpoint,ledgerSha256:digest(rows)}};
    const run=(data=rows,hash=synthetic)=>spawnSync('python3',[program,migrations,hash],{
      input:data.map(row=>row.join('\t')).join('\n')+'\n',encoding:'utf8',timeout:15_000,
    });
    const veto=(result,needle=/LEGACY_APPROVAL_NOT_EXACT_PRODUCTION_BASELINE/)=>{
      assert.equal(result.status,1,result.stderr);
      assert.match(result.stderr,needle);
      assert.doesNotMatch(result.stdout,/_PASS:/);
    };
    const before=structuredClone(fixture);
    delete before.schemaCheckpoints[synthetic].approvedPendingMigrations;
    writeFileSync(manifestPath,JSON.stringify(before));
    veto(run());
    writeFileSync(manifestPath,JSON.stringify(fixture));
    const positive=run();
    assert.equal(positive.status,0,positive.stderr);
    assert.match(positive.stdout,/applied=186:pending=6/);
    assert.match(positive.stdout,/LEGACY_SCHEMA_ATTESTED_EXCEPTIONS:6/);
    veto(run(rows,'b'.repeat(64)),/MIGRATION_SHA_MISMATCH|NONSTANDARD_MIGRATION_CHECKSUM/);
    const drift=rows.map((row,i)=>i===rows.length-1?[row[0],'f'.repeat(64),row[2]]:row);
    veto(run(drift));
    veto(run(rows.slice(0,-1)));
    veto(run([...rows,[pinned[0].name,pinned[0].sqlSha256,'applied']]));
    const sql=join(migrations,pinned[0].name,'migration.sql');
    const bytes=readFileSync(sql);
    writeFileSync(sql,Buffer.concat([bytes,Buffer.from('\n-- changed\n')]));
    veto(run());
    writeFileSync(sql,bytes);
    const extra=join(migrations,'20271212000000_unreviewed');
    mkdirSync(extra);writeFileSync(join(extra,'migration.sql'),'SELECT 1;\n');
    veto(run());
    rmSync(extra,{recursive:true});
    const missing=join(migrations,pinned[1].name);
    rmSync(missing,{recursive:true});
    veto(run());
  } finally {rmSync(root,{recursive:true,force:true});}
});

test('canonical cutover and reusable workflow require pre-mutation ledger gate',()=>{
  const cutover=readFileSync('ci-cd/scripts/production-schema-cutover.sh','utf8');
  const workflow=readFileSync('.github/workflows/production-deploy-reusable.yml','utf8');
  assert.match(cutover, /verify_migration_ledger\(\)/);
  assert.match(cutover, /preflight\)\s+verify_migration_ledger/);
  assert.match(cutover, /prepare\)\s+verify_migration_ledger/);
  assert.match(workflow, /git show "\$CONTROL_SHA:ci-cd\/scripts\/production-schema-cutover\.sh"/);
  assert.match(workflow, /git show "\$CONTROL_SHA:ci-cd\/scripts\/verify-production-migration-ledger\.py"/);
  assert(workflow.indexOf('control-schema-cutover.sh"') < workflow.indexOf('git reset --hard "${{ inputs.release_sha }}"'),
    'ROLLBACK_CONTROL_GUARD_MUST_BE_PRESERVED_BEFORE_TARGET_CHECKOUT');
  assert.match(workflow, /GAFUS_MIGRATION_LEDGER_VERIFIER_PATH="\$RELEASE_BACKUP_DIR\/control-migration-ledger\.py"/);
  assert(workflow.indexOf('control-schema-cutover.sh" preflight') < workflow.indexOf('docker pull "$reference"'),
    'PREDEPLOY_LEDGER_GUARD_MUST_PRECEDE_IMAGE_PULL');
  assert.match(workflow,/control-schema-cutover\.sh" preflight \|\| \{[\s\S]*?git reset --hard "\$\(cat "\$RELEASE_BACKUP_DIR\/previous\.sha"\)"[\s\S]*?exit 1/,
    'LEDGER_VETO_MUST_RESTORE_PREVIOUS_CHECKOUT');
});
test('no connection capabilities in verifier; synthetic resource cleanup',()=>{
  const body=readFileSync(program,'utf8');
  for(const forbidden of ['psycopg','subprocess','os.system','urllib','requests','sqlite3'])
    assert(!body.includes(forbidden),`READONLY_VERIFIER_MUST_NOT_CONNECT:${forbidden}`);
  assert.match(body, /hashlib\.sha256\(path\.read_bytes\(\)\)/);
  rmSync(fixtureRoot,{recursive:true,force:true});
});
