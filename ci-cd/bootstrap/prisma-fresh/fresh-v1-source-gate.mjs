/**
 * Blocking source-only CI gate for Option A. Compatible with future additive
 * migrations after the immutable historical v1 prefix. Never opens a DB.
 */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyFreshV1Source, FRESH_V1_LAST_BASELINE_MIGRATION } from './fresh-v1-installer.mjs';

const here=dirname(fileURLToPath(import.meta.url));
const root=resolve(here,'../../..');
const baseline=verifyFreshV1Source();
const sha=path=>createHash('sha256').update(readFileSync(path)).digest('hex');
const originalSchema=join(here,'schema.v1.prisma');
const currentSchema=join(root,'packages/prisma/schema.prisma');
const { readdirSync } = await import('node:fs');
const dirs=readdirSync(join(root,'packages/prisma/migrations'),{withFileTypes:true})
  .filter(x=>x.isDirectory()).map(x=>x.name);
const forwards=dirs.filter(name=>!baseline.includes(name));
if(sha(originalSchema)===sha(currentSchema) && forwards.length===0) {
  // Full original 14 Python SQL extraction tests remain valid before the first
  // forward migration. Once schema grows, this old gate must NOT block CI.
  const result=spawnSync(process.execPath,[join(here,'review-gate.mjs')],{
    cwd:root,encoding:'utf8',timeout:30000,maxBuffer:2*1024*1024});
  if(result.status!==0)throw Error(`FRESH_V1_LEGACY_SOURCE_GATE_FAILED:${result.stderr.slice(-1500)}`);
  console.log('PASS original v1 163-history extraction review and Python 14/14');
} else {
  if(sha(originalSchema)!==sha(currentSchema) && forwards.length===0)
    throw Error('CURRENT_SCHEMA_CHANGED_WITHOUT_FORWARD_MIGRATION');
  console.log(`PASS immutable v1 baseline 163 + ${forwards.length} post-${FRESH_V1_LAST_BASELINE_MIGRATION} forward directories`);
  console.log('Future SQL requires separately owned PG18 apply/diff acceptance; no historical SQL replay.');
}
console.log('PASS OPTION_A_V1_SOURCE_GATE no DB, no migration history changes');
