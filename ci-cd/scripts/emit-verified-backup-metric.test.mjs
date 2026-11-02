import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
const root=resolve(import.meta.dirname,'../..');
const helper=join(root,'ci-cd/scripts/emit-verified-backup-metric.py');

test('timestamp recorded atomically without secrets and parseable by Prometheus',()=>{
  const dir=mkdtempSync(join(tmpdir(),'gafus-backup-metrics-'));
  try {
    const run=spawnSync('python3',[helper],{encoding:'utf8',env:{...process.env,GAFUS_BACKUP_METRICS_DIR:dir}});
    assert.equal(run.status,0,run.stderr);
    const text=readFileSync(join(dir,'gafus_backup_verified.prom'),'utf8');
    assert.match(text,/^# TYPE gafus_database_backup_last_success_timestamp_seconds gauge$/m);
    const line=text.match(/^gafus_database_backup_last_success_timestamp_seconds (\d+)$/m);
    assert(line);
    assert(Math.abs(Date.now()/1000 - Number(line[1])) < 20);
    assert.doesNotMatch(text,/token|yandex|owner|storage|https:/i);
    assert(!run.stdout.includes(dir));
  } finally { rmSync(dir,{recursive:true,force:true}); }
});

test('untrusted relative directory never receives metrics',()=>{
  const run=spawnSync('python3',[helper],{encoding:'utf8',env:{...process.env,GAFUS_BACKUP_METRICS_DIR:'relative/path'}});
  assert.notEqual(run.status,0);
  assert.doesNotMatch(run.stdout,/RECORDED/);
});

test('metric is not emitted from failed or incomplete backup steps',()=>{
  const backup=readFileSync(join(root,'ci-cd/scripts/backup-to-yandex.sh'),'utf8');
  assert(backup.indexOf('YANDEX_BACKUP_SIZE_MISMATCH')<backup.indexOf('emit-verified-backup-metric.py'));
  assert(backup.includes('if [[ -n "${GAFUS_BACKUP_METRICS_DIR:-}" ]]'));
  assert(backup.includes('BACKUP_METRICS_WRITE_FAILED_REMOTE_BACKUP_VALID'));
});
