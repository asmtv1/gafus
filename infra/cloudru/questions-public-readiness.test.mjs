import assert from 'node:assert/strict';
import { test } from 'node:test';
import { QUESTIONS_CDN, checkQuestionsCdnSettings, checkQuestionsCdnApiResponse,
  checkQuestionsCdnReadiness } from './questions-public-readiness.mjs';

const env = {
  QUESTIONS_PUBLIC_S3_ENABLED: 'true', QUESTIONS_CDN_LIVE_VERIFIED: 'true',
  QUESTIONS_CLOUD_JOB_ENABLED: 'true', QUESTIONS_PROCESSOR_READY: 'true',
  QUESTIONS_PUBLIC_S3_BUCKET: QUESTIONS_CDN.bucket,
  QUESTIONS_CDN_BASE_URL: 'https://' + QUESTIONS_CDN.hostname,
  QUESTIONS_BEGET_CDN_SERVICE_ID: QUESTIONS_CDN.id,
  BEGET_CDN_API_TOKEN: 'test-token-123456789012345678901234567890',
};
const service = {
  service: {
    id: QUESTIONS_CDN.id, display_name: 'GAFUS Questions CDN', status: 'RUNNING',
    cdn: {
      ssl_enabled: true,
      source_domain: { domain: QUESTIONS_CDN.origin, source_protocol: 'HTTPS' },
      resource_domain: [{domain: QUESTIONS_CDN.hostname, status: 'WORKING'}],
    },
  },
};
test('only exact public S3 + Questions CDN config is eligible for release', () => {
  assert.equal(checkQuestionsCdnSettings(env), true);
  assert.throws(() => checkQuestionsCdnSettings({...env, QUESTIONS_CLOUD_JOB_ENABLED: 'false'}),
    /QUESTIONS_PROCESSOR_NOT_READY/);
  assert.throws(() => checkQuestionsCdnSettings({...env, QUESTIONS_PROCESSOR_READY: 'false'}),
    /QUESTIONS_PROCESSOR_NOT_READY/);
  assert.equal(checkQuestionsCdnSettings({ ...env, QUESTIONS_PUBLIC_S3_ENABLED: 'false' }), false);
  for (const key of ['QUESTIONS_CDN_LIVE_VERIFIED', 'QUESTIONS_PUBLIC_S3_BUCKET',
    'QUESTIONS_CDN_BASE_URL', 'QUESTIONS_BEGET_CDN_SERVICE_ID']) {
    const broken = { ...env, [key]: 'invalid' };
    assert.throws(() => checkQuestionsCdnSettings(broken), /QUESTIONS_CDN_DEPLOY_SETTINGS_MISMATCH/);
  }
  assert.throws(() => checkQuestionsCdnSettings({ ...env, BEGET_CDN_API_TOKEN: '' }),
    /QUESTIONS_CDN_API_TOKEN_MISSING/);
});
test('release refuses CDN without working HTTPS, expected origin and exact resource UUID', () => {
  assert.doesNotThrow(() => checkQuestionsCdnApiResponse(service));
  for (const broken of [
    { service: { ...service.service, id: 'foreign' } },
    { service: { ...service.service, status: 'CONFIGURING' } },
    { service: { ...service.service, cdn: { ...service.service.cdn, ssl_enabled: false } } },
    { service: { ...service.service, cdn: { ...service.service.cdn, source_domain: {domain:'gafus-documents-private.s3.cloud.ru',source_protocol:'HTTPS'} } } },
    { service: { ...service.service, cdn: { ...service.service.cdn, resource_domain:[{domain:QUESTIONS_CDN.hostname,status:'CONFIGURING'}] } } },
  ]) assert.throws(() => checkQuestionsCdnApiResponse(broken), /QUESTIONS_CDN_NOT_READY/);
});
test('HTTPS read-only Beget API GET confirms readiness; never contacts API when disabled', async () => {
  const calls = [];
  const fetcher = async (url, options) => {
    calls.push({url,options});
    return { ok: true, json: async () => service };
  };
  assert.equal(await checkQuestionsCdnReadiness(env, fetcher), 'ready');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.beget.com/v1/cloud/' + QUESTIONS_CDN.id);
  assert.equal(calls[0].options.method, undefined); // no writes
  assert.equal(await checkQuestionsCdnReadiness({...env, QUESTIONS_PUBLIC_S3_ENABLED:'false'}, fetcher), 'disabled');
  assert.equal(calls.length, 1);
  await assert.rejects(checkQuestionsCdnReadiness(env, async () =>
    ({ok:false, status:403})), /QUESTIONS_CDN_PREFLIGHT_HTTP_403/);
});
