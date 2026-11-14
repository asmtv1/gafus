import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
  safeServerResourceAttributes,defaultServerTraceRatio,
} from '../../packages/logger/dist/serverTelemetry.js';
test('every server runtime has bounded namespace, environment and immutable release',()=>{
  const attrs=safeServerResourceAttributes('gafus-api',{
    NODE_ENV:'production',GAFUS_TELEMETRY_ENVIRONMENT:'production',
    GAFUS_RELEASE_SHA:'a'.repeat(40),GAFUS_SERVICE_VERSION:'build-123456',
  });
  assert.deepEqual(attrs,{
    'service.namespace':'gafus','service.name':'gafus-api',
    'deployment.environment.name':'production','gafus.release.sha':'a'.repeat(40),
    'service.version':'build-123456',
  });
});
test('resource rejects forged release, version and invalid environment without leaking other keys',()=>{
  const attrs=safeServerResourceAttributes('gafus-worker',{
    GAFUS_TELEMETRY_ENVIRONMENT:'production;user=secret',GAFUS_SERVICE_VERSION:'id:alice/secret',
    GAFUS_RELEASE_SHA:'ffff?secret',AUTHORIZATION:'Bearer SECRET',PRIVATE_USER_ID:'123',
  });
  assert.deepEqual(attrs,{'service.namespace':'gafus','service.name':'gafus-worker'});
  assert.doesNotMatch(JSON.stringify(attrs),/SECRET|AUTHORIZATION|PRIVATE_USER_ID|alice/);
});
test('API root traces default 5%, worker root traces default 10%',()=>{
  assert.equal(defaultServerTraceRatio('gafus-api'),0.05);
  assert.equal(defaultServerTraceRatio('gafus-worker'),0.1);
  assert.equal(defaultServerTraceRatio('gafus-worker','0'),0);
  assert.equal(defaultServerTraceRatio('gafus-api','1'),1);
  assert.equal(defaultServerTraceRatio('gafus-api','1.5'),0.05);
  assert.equal(defaultServerTraceRatio('gafus-worker','bad'),0.1);
});
