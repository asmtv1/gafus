import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {spawnSync} from 'node:child_process';
import YAML from 'yaml';
const load=(p)=>YAML.parse(readFileSync(p,'utf8'));
const app=load('.github/workflows/production-app-only.yml');
const reusable=load('.github/workflows/production-deploy-reusable.yml');
test('app-only manual deploy verifies exact successful main release and never patches Cloud.ru Jobs',()=>{
 const jobs=app.jobs;
 assert.deepEqual(Object.keys(jobs).sort(),['deploy-app-only','recover-api-after-migration','server-preflight','validate-app-release','verify-live-production']);
 const v=jobs['validate-app-release'];
 assert.match(v.steps[1].run,/RELEASE_IMAGES_OR_SECURITY_NOT_VERIFIED/);
 assert.match(v.steps[1].run,/RELEASE_NOT_ON_MAIN/);
 assert.match(v.steps[1].run,/cloudru-media-contracts/);
 const d=jobs['deploy-app-only'];
 assert.equal(d.with.app_only,true);
 assert.equal(d.uses,'./.github/workflows/production-deploy-reusable.yml');
 for(const text of [readFileSync('.github/workflows/production-app-only.yml','utf8'), v.steps[1].run])
  assert.doesNotMatch(text,/production-job-release-reusable|production-job-release\.mjs|CLOUDRU_NEW_BACKEND_DEPLOYED|cloudru-jobs-cutover/);
});
test('reusable app-only release preserves provider configuration and activates V2 without changing jobs',()=>{
 const j=reusable.jobs['deploy-production'];
 assert.equal(reusable.on.workflow_call.inputs.app_only.default,false);
 const gate=j.steps.find(x=>x.name==='Validate Beget-only production readiness before SSH');
 assert.equal(gate.if,'${{ !inputs.app_only }}');
 const ssh=j.steps.find(x=>x.uses==='appleboy/ssh-action@v1.0.3');
 const script=['DEPLOY_SCRIPT_1','DEPLOY_SCRIPT_2','DEPLOY_SCRIPT_3'].map(x=>ssh.env[x]).join('\n');
 assert.match(script,/APP_ONLY_EXISTING_BEGET_PRESERVED_V2_FLAGS_READY/);
 assert.match(script,/APP_ONLY_PREVIOUS_ENV/);
 assert.match(script,/'POSTGRES_PASSWORD', 'DATABASE_URL', 'REDIS_URL'/);
 assert.match(script,/'JWT_SECRET', 'JWT_REFRESH_SECRET', 'NEXTAUTH_SECRET'/);
 assert.match(script,/CLOUDRU_MEDIA_JOBS_ENABLED':'true'/);
 assert.match(script,/bash "\$CUTOVER_SCRIPT" prepare/);
 assert.match(script,/bash "\$CUTOVER_SCRIPT" migrate/);
 assert.match(script,/bash "\$CUTOVER_SCRIPT" open/);
 assert.doesNotMatch(script,/production-job-release\.mjs|containers\.api\.cloud\.ru\/v2\/jobs/);
 const p=spawnSync('bash',['-n'],{input:script,encoding:'utf8'});
 assert.equal(p.status,0,p.stderr);
});

test('migration recovery only runs after verified snapshot + 162 completed migrations, never rolls schema back or edits Cloud Jobs',()=>{
 const j=app.jobs['recover-api-after-migration'];
 assert(j,'MISSING_INCIDENT_RECOVERY');
 assert.match(j.if,/inputs\.mode == 'recover'/);
 assert(j.needs.includes('validate-app-release'));
 const ssh=j.steps[0];
 assert.equal(ssh.uses,'appleboy/ssh-action@v1.0.3');
 const script=ssh.with.script;
 assert.match(script,/migration-complete/);
 assert.match(script,/41150071782-1/);
 assert.match(script,/pg_restore --list/);
 assert.match(script,/MIGRATIONS_NOT_COMPLETE/);
 assert.match(script,/quepraquiecebquomiel\.begetcdn\.cloud/);
 assert.match(script,/mepsuduyokabib\.begetcdn\.cloud/);
 assert.match(script,/GALLERY_CDN_ENV_MISSING/);
 assert.match(script,/RELEASE_IMAGE_MISMATCH/);
 assert.match(script,/RESTART_OR_OOM/);
 const apiReady = script.indexOf('CONTAINER_HEALTHY=$service');
 const nginxCheck = script.indexOf('docker exec gafus-nginx nginx -t');
 assert(apiReady > 0 && nginxCheck > apiReady,
  'NGINX_UPSTREAM_DNS_CANNOT_BE_CHECKED_BEFORE_API_RECREATION');
 assert.match(script,/production-schema-cutover\.sh" verify/);
 assert.match(script,/production-schema-cutover\.sh" open/);
 assert.doesNotMatch(script,/migrate deploy|\.sh" migrate|production-job-release|containers\.api\.cloud\.ru|pg_restore --clean|pg_restore --create/);
 const a=spawnSync('bash',['-n'],{input:script,encoding:'utf8'});
 assert.equal(a.status,0,a.stderr);
});

test('read-only live production verification ties all running containers to verified SHA and checks restarts, OOM, critical logs, backup, schema and HTTPS',()=>{
 const j=app.jobs['verify-live-production'];
 assert(j,'MISSING_POST_DEPLOY_VERIFICATION');
 assert.match(j.if,/inputs\.mode == 'verify'/);
 const cmd=j.steps[0].with.script;
 for(const flag of ['WRONG_LIVE_IMAGE','LIVE_CONTAINER_CRASH','LIVE_CONTAINER_UNHEALTHY',
   'RECENT_FATAL_LOGS','PRODUCTION_LIVE_RELEASE_VERIFIED_NO_CLOUDRU_JOB_CHANGES',
   'INVALID_PRODUCTION_MIGRATION_LEDGER','MAINTENANCE_STILL_ACTIVE','PRISMA_MIGRATION_IMAGE_PRESENT',
   'CHAT2_BROKER_NOT_RUNNING','GALLERY_APP_ORIGIN_MISMATCH','FEED_APP_ORIGIN_MISMATCH'])
   assert(cmd.includes(flag),'MISSING_PROD_VERIFY_'+flag);
 assert.match(cmd,/check_containers first/);
 assert.match(cmd,/check_containers second/);
 assert.doesNotMatch(cmd,/docker\s+(?:run|stop|restart|rm|pull|tag)|docker-compose.*\s+(?:up|stop|down)|prisma migrate|git reset|kubectl|production-job-release/);
 const check=spawnSync('bash',['-n'],{input:cmd,encoding:'utf8'});
 assert.equal(check.status,0,check.stderr);
});
