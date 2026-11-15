import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {parse} from 'yaml';

const read=file=>readFileSync(file,'utf8');
const banned=/apptracer(?:\.ru|\/sdk|\/sourcemap)|YC_MONITORING_API_KEY|monitoring\.api\.cloud\.yandex\.net|prometheus\.remote_write\s+"yc"|prometheus\.relabel\s+"yc_allowlist"/i;

test('production, nonprod and mobile releases have no live legacy monitoring sender',()=>{
 const files=[
  'ci-cd/docker/prometheus/config.alloy',
  'ci-cd/docker/prometheus/config.uptrace-canary.alloy',
  'ci-cd/docker/docker-compose.prod.yml',
  '.github/workflows/gafus-self-hosted-ota-preview.yml',
  '.github/workflows/gafus-self-hosted-ota-production.yml',
  'apps/mobile/app.config.js',
  'apps/mobile/scripts/submit-self-hosted-ota-result.mjs',
  'packages/mobile-ota-server/src/ci-registration.ts',
  'apps/mobile/src/shared/lib/error-reporting/reportClientError.ts',
  'packages/error-handling/src/lib/reportClientError.ts',
 ];
 for(const file of files)assert.doesNotMatch(read(file),banned,file);
 assert.match(read('ci-cd/docker/prometheus/config.alloy'),/prometheus\.remote_write "uptrace"/);
 assert.match(read('apps/mobile/src/shared/lib/error-reporting/reportClientError.ts'),/enqueueMobileTelemetryError/);
 assert.match(read('packages/error-handling/src/lib/reportClientError.ts'),/reportBrowserDiagnostic/);
});

test('retired service, SDK, config plugins, and scripts are absent from source tree',()=>{
 for(const file of [
  'apps/mobile/plugins/withAppTracerNative.js',
  'apps/mobile/scripts/upload-apptracer-sourcemaps.mjs',
  'apps/mobile/scripts/publish-update-with-apptracer.mjs',
  'apps/mobile/src/shared/lib/tracer',
  'packages/logger/src/tracerServer.ts',
  'packages/ui-components/src/TracerProvider.tsx',
  'scripts/sync-metrics-to-yandex-native.py',
  'scripts/deploy-general-dashboard.py',
  'scripts/import-dashboards-to-yandex.sh',
  'docs/monitoring/yandex-monitoring.md',
 ])assert.equal(existsSync(file),false,file);
});

test('CI will retire already-running legacy importer without changing product analytics or backup jobs',()=>{
 const compose=parse(read('ci-cd/docker/docker-compose.prod.yml'));
 const env=name=>compose.services[name].environment.join('\n');
 assert(!Object.hasOwn(compose.services,'yandex-metrics-sync'));
 for(const name of ['worker','api','bull-board'])
  assert.doesNotMatch(env(name),/TRACER_APP_TOKEN|TRACER_SERVER_ENABLED/);
 assert.doesNotMatch(env('grafana-alloy'),/YC_MONITORING_API_KEY/);
 const deploy=read('.github/workflows/production-deploy-reusable.yml');
 assert.match(deploy,/docker stop --time 20 gafus-yandex-metrics-sync/);
 assert.match(deploy,/docker rm gafus-yandex-metrics-sync/);
 assert.doesNotMatch(deploy,/secrets\.YC_MONITORING_API_KEY|secrets\.NEXT_PUBLIC_TRACER_APP_TOKEN/);
 assert(existsSync('ci-cd/scripts/backup-to-yandex.sh'));
 assert(existsSync('packages/analytics/package.json'));
});

test('OTA release requires audited private S3 source maps, not a legacy vendor token',()=>{
 const mobile=JSON.parse(read('apps/mobile/package.json'));
 const ui=JSON.parse(read('packages/ui-components/package.json'));
 const lock=read('pnpm-lock.yaml');
 assert(!Object.keys(mobile.devDependencies).some(key=>key.startsWith('@apptracer/')));
 assert(!Object.keys(ui.dependencies).some(key=>key.startsWith('@apptracer/')));
 assert.doesNotMatch(lock,/@apptracer\//i);
 const native=JSON.parse(read('apps/mobile/app.json')).expo;
 assert(!native.plugins.includes('./plugins/withAppTracerNative'));
 const callbacks=read('packages/mobile-ota-server/src/ci-registration.ts');
 assert.match(callbacks,/privateSymbols: z\.literal\(true\)/);
 assert.match(callbacks,/symbols-s3:/);
 assert.doesNotMatch(callbacks,/appTracerRef|checks\.appTracer/);
});
