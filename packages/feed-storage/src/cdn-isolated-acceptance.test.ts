import { describe, it, expect } from 'vitest';
import { cdnIsolatedAcceptance } from './cdn-isolated-acceptance.js';
import { feedStorageConfigFromEnv } from './storage.js';
import { signFeedCloudruFallback } from './fallback.js';
const fixture = {
  NODE_ENV:'test', GAFUS_CDN_FULL_ISOLATED_ACCEPTANCE:'1',
  DATABASE_URL:'postgresql://asmtv1@127.0.0.1:55446/cdn_agent2_qa',
  REDIS_URL:'redis://127.0.0.1:56340',
  GAFUS_CDN_LOCAL_S3_ENDPOINT:'http://127.0.0.1:58390',
  GAFUS_CDN_LOCAL_S3_KEY:'a'.repeat(32),GAFUS_CDN_LOCAL_S3_SECRET:'b'.repeat(64),
  FEED_ENABLED:'true',FEED_MEDIA_FALLBACK_ENABLED:'true',
};
describe('Agent2 disposable feed signer cannot enter production/shared runtime',()=>{
  it('only exact QA identity activates synthetic local S3',()=>{
    expect(cdnIsolatedAcceptance(fixture)).toBe(true);
    expect(feedStorageConfigFromEnv(fixture).bucket).toBe('gafus-refactor-agent2-feed-test');
    for(const patch of [{NODE_ENV:'production'},{NODE_ENV:'development'},
      {GAFUS_CDN_FULL_ISOLATED_ACCEPTANCE:'0'},
      {DATABASE_URL:'postgresql://asmtv1@127.0.0.1:5432/production'},
      {REDIS_URL:'redis://127.0.0.1:55927'},
      {GAFUS_CDN_LOCAL_S3_ENDPOINT:'https://s3.cloud.ru'},
      {GAFUS_CDN_LOCAL_S3_KEY:'short'}])
      expect(cdnIsolatedAcceptance({...fixture,...patch})).toBe(false);
  });
  it('signed local S3 URLs fail closed if QA mode is not explicitly enabled',async()=>{
    await expect(signFeedCloudruFallback('media/v2/asset/v1/image/m.webp',120,{...fixture,NODE_ENV:'production'})).rejects.toThrow();
  });
});
