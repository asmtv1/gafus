import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,chmodSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
const root=resolve(import.meta.dirname,'../..');
const script=join(root,'ci-cd/scripts/backup-to-yandex.sh');

function mockRun(mode){
 const dir=mkdtempSync(join(tmpdir(),'gafus-backup-offline-'));
 const bin=join(dir,'bin');
 mkdirSync(bin);
 const docker=[
  '#!/bin/sh',
  'dd if=/dev/urandom bs=4096 count=4 2>/dev/null'
 ].join('\n')+'\n';
 const curl=[
  '#!/bin/sh',
  'printf "%s\\n" "$*" >> "$GAFUS_MOCK_DIR/requests.log"',
  'case "$*" in',
  '  *resources/upload*)',
  '    if [ "$GAFUS_MOCK_MODE" = quota ]; then echo "Storage quota exceeded" >&2; exit 22; fi',
  '    printf "%s" \x27{"href":"https://uploader.disk.yandex.net/test"}\x27',
  '    ;;',
  '  *--upload-file*)',
  '    while [ "$#" -gt 0 ]; do',
  '      if [ "$1" = --upload-file ]; then shift; wc -c < "$1" > "$GAFUS_MOCK_DIR/size"; break; fi',
  '      shift',
  '    done',
  '    ;;',
  '  *resources*)',
  '    size=$(cat "$GAFUS_MOCK_DIR/size")',
  '    if [ "$GAFUS_MOCK_MODE" = mismatch ]; then size=$((size + 1)); fi',
  '    printf \x27{"type":"file","size":%s}\x27 "$size"',
  '    ;;',
  '  *) exit 90;;',
  'esac'
 ].join('\n')+'\n';
 for(const [name,source] of [['docker',docker],['curl',curl]]){
  const path=join(bin,name);writeFileSync(path,source);chmodSync(path,0o700);
 }
 try {
  const result=spawnSync('bash',[script],{
   cwd:root,encoding:'utf8',timeout:12000,
   env:{...process.env,PATH:bin+':'+process.env.PATH,YANDEX_DISK_TOKEN:'offline-test',
    GAFUS_MOCK_MODE:mode,GAFUS_MOCK_DIR:dir,GAFUS_BACKUP_METRICS_DIR:dir}
  });
  const metricFile=join(dir,'gafus_backup_verified.prom');
  return {...result,requests:readFileSync(join(dir,'requests.log'),'utf8'),
    metric:existsSync(metricFile)?readFileSync(metricFile,'utf8'):null};
 }finally{rmSync(dir,{recursive:true,force:true});}
}

test('backup streams, gzips and remotely verifies without deletion',()=>{
 const r=mockRun('ok');
 assert.equal(r.status,0,r.stderr+'\n'+r.stdout);
 assert.match(r.stdout,/BACKUP_VERIFIED_REMOTE/);
 assert.match(r.requests,/overwrite=false/);
 assert.match(r.requests,/--upload-file/);
 assert.doesNotMatch(r.requests,/-X DELETE|--request DELETE|overwrite=true/);
});
test('overdraft blocks backup and does not delete remote files',()=>{
 const r=mockRun('quota');
 assert.notEqual(r.status,0,r.stderr+'\n'+r.stdout);
 assert.match(r.stdout,/YANDEX_UPLOAD_URL_REJECTED/);
 assert.doesNotMatch(r.requests,/-X DELETE|--request DELETE|--upload-file/);
});

test('successful verified remote upload is the only producer of the last-success metric',()=>{
 const ok=mockRun('ok');
 assert.equal(ok.status,0,ok.stderr);
 assert.match(ok.metric??'',/gafus_database_backup_last_success_timestamp_seconds \d+/);
 const rejected=mockRun('quota');
 assert.notEqual(rejected.status,0);
 assert.equal(rejected.metric,null,'No successful backup can be inferred from a quota failure');
});

test('remote metadata size mismatch must never publish last-success metric',()=>{
 const failed=mockRun('mismatch');
 assert.notEqual(failed.status,0);
 assert.match(failed.stderr+failed.stdout,/YANDEX_BACKUP_SIZE_MISMATCH/);
 assert.equal(failed.metric,null);
 assert.match(failed.requests,/--upload-file/);
});
