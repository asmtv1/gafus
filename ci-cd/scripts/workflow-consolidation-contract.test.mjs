import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import {test} from 'node:test';
import {spawnSync} from 'node:child_process';
import YAML from 'yaml';

const dir='.github/workflows';
const read=name=>readFileSync(dir+'/'+name+'.yml','utf8');
const parse=name=>YAML.parse(read(name));
const files=readdirSync(dir).filter(x=>x.endsWith('.yml')).sort();

test('four primary workflows, independent backup and three internal call-only workflows',()=>{
 assert.deepEqual(files,[
  'build-single-container.yml','ci-cd.yml','cloudru-media-images.yml',
  'daily-backup.yml','deploy-only.yml','infrastructure-jobs.yml',
  'production-deploy-reusable.yml','production-job-release-reusable.yml'
 ]);
 const primary=['build-single-container','ci-cd','deploy-only','infrastructure-jobs'];
 for(const name of primary) assert(parse(name).on.workflow_dispatch || parse(name).on.push,name);
 for(const name of ['cloudru-media-images','production-deploy-reusable','production-job-release-reusable']){
  assert(parse(name).on.workflow_call,name);
  assert.equal(parse(name).on.workflow_dispatch,undefined,name+' must not expose direct manual launch');
 }
 assert(parse('daily-backup').on.schedule?.length);
 assert(Object.hasOwn(parse('daily-backup').on,'workflow_dispatch'));
});

test('main CI reconciles Cloud.ru image links while Deploy Only remains app-only',()=>{
 const ci=parse('ci-cd'),retry=parse('deploy-only');
 assert.equal(ci.jobs['deploy-production'].with.app_only,true);
 assert.equal(retry.jobs.deploy.with.app_only,true);
 assert.deepEqual(ci.jobs['cloudru-jobs-sync'].needs,['deploy-production']);
 assert.deepEqual(ci.jobs['cloudru-jobs-verify'].needs,['cloudru-jobs-sync']);
 assert(ci.jobs['deploy-production'].needs.includes('cloudru-jobs-preflight'));
 assert(ci.jobs['deploy-production'].needs.includes('build-images'));
 assert(!Object.keys(retry.jobs).some(x=>x.includes('cloudru-jobs')));
 assert(retry.jobs.deploy.needs.includes('preflight-cdn'));
 assert(retry.jobs['validate-release'].steps.some(x=>x.run?.includes('RELEASE_IMAGES_OR_QA_NOT_VERIFIED')));
 assert(retry.jobs['validate-release'].steps.some(x=>x.run?.includes('SCHEMA_COMPATIBLE')));
 assert.equal(retry.concurrency['cancel-in-progress'],false);
});

test('single build has immutable digest and only touches the selected service',()=>{
 const yaml=parse('build-single-container');
 assert.deepEqual(yaml.on.workflow_dispatch.inputs.container.options,
   ['web','trainer-panel','admin-panel','api','worker','bull-board','prisma']);
 const build=yaml.jobs.build.steps.find(x=>x.uses==='docker/build-push-action@v6');
 assert(build);
 assert(build.with.tags.includes('manual-'));
 assert(!build.with.tags.includes(':latest'));
 const deploy=yaml.jobs.deploy;
 assert(deploy.concurrency.group==='gafus-production-deploy');
 assert(deploy.steps[0].with.script.includes('docker pull "$image@$digest"'));
 assert(deploy.steps[0].with.script.includes('PRODUCTION_SHA_DIFFERS'));
 assert(deploy.steps[0].with.script.includes('trap restore ERR'));
 assert(deploy.steps[0].with.script.includes('--no-deps --force-recreate "$service"'));
 assert(!deploy.steps[0].with.script.includes('docker volume rm'));
 const shell=spawnSync('bash',['-n'],{input:deploy.steps[0].with.script,encoding:'utf8'});
 assert.equal(shell.status,0,shell.stderr);
});

test('Cloud.ru updates require explicit confirmation and cannot delete S3/Jobs',()=>{
 const infra=parse('infrastructure-jobs');
 assert.deepEqual(infra.on.workflow_dispatch.inputs.operation.options,
  ['plan','preflight','apply-existing-jobs','verify','publish-media-images','beget-readonly-diagnostic',
   'beget-gallery-create','beget-gallery-configure','beget-gallery-canary']);
 assert(infra.jobs.guard.steps[0].run.includes('UPDATE_11_EXISTING_JOBS'));
 assert(infra.jobs['publish-guard'].steps[0].run.includes('PUBLISH_MEDIA_IMAGES'));
 assert.equal(infra.jobs['apply-existing-jobs'].needs,'preflight');
 assert.equal(infra.jobs['publish-media-images'].needs,'publish-guard');
 // The temporary Beget CDN setup operations are production-secret scoped but
 // cannot be run from main or any arbitrary branch. Mutating operations also
 // require an exact confirmation inside their own scripts.
 for(const action of ['beget-gallery-create',
   'beget-gallery-configure','beget-gallery-canary']) {
  assert(infra.jobs[action].if.includes("refs/heads/chore/gallery-cdn-307-migration"),action);
  assert.equal(infra.jobs[action].environment,'production',action);
 }
 assert(infra.jobs['beget-gallery-create'].env.GALLERY_CDN_CREATE_CONFIRM.includes('inputs.confirmation'));
 assert(infra.jobs['beget-gallery-configure'].env.GALLERY_CDN_CONFIGURE_CONFIRM.includes('inputs.confirmation'));
 const create=readFileSync('infra/cloudru/beget-gallery-create.mjs','utf8');
 const configure=readFileSync('infra/cloudru/beget-gallery-secure-configure.mjs','utf8');
 assert(create.includes('CREATE_ISOLATED_GALLERY_CDN_2026_11_01'));
 assert(configure.includes('SECURE_NEW_GALLERY_CDN_2026_11_01'));
 assert(!/method:\s*['"]DELETE['"]/.test(create+configure));
 const source=read('infrastructure-jobs');
 assert(!/aws s3 rm|mc rm|rclone delete|s3.deleteObject/i.test(source));
});

test('backup is append-only, verifies uploaded file and never deletes old backups',()=>{
 const yaml=parse('daily-backup');
 assert(yaml.on.schedule);
 const source=readFileSync('ci-cd/scripts/backup-to-yandex.sh','utf8');
 assert(source.includes('overwrite=false'));
 assert(source.includes('BACKUP_VERIFIED_REMOTE'));
 assert(source.includes('YANDEX_BACKUP_SIZE_MISMATCH'));
 assert(source.includes('set -euo pipefail'));
 assert(!/curl\s+-X\s+DELETE|--request\s+DELETE/.test(source));
 assert(!/^\s*[^#\n]*overwrite=true/m.test(source));
 assert(!/docker\s+(stop|rm)|docker-compose.*down/.test(source));
 const bash=spawnSync('bash',['-n','ci-cd/scripts/backup-to-yandex.sh'],{encoding:'utf8'});
 assert.equal(bash.status,0,bash.stderr);
});
