import { describe, it, expect } from 'vitest';
import { cdnIsolatedAcceptance } from './cdn-isolated-acceptance';
import { galleryStorageConfigFromEnv } from './config';
import { signGalleryCloudruFallback } from './fallback';
const fixture = {
  NODE_ENV:'test', GAFUS_CDN_FULL_ISOLATED_ACCEPTANCE:'1',
  DATABASE_URL:'postgresql://asmtv1@127.0.0.1:55446/cdn_agent2_qa',
  REDIS_URL:'redis://127.0.0.1:56340',
  GAFUS_CDN_LOCAL_S3_ENDPOINT:'http://127.0.0.1:58390',
  GAFUS_CDN_LOCAL_S3_KEY:'a'.repeat(32),GAFUS_CDN_LOCAL_S3_SECRET:'b'.repeat(64),
  GALLERY_ENABLED:'true',GALLERY_MEDIA_FALLBACK_ENABLED:'true',
};
describe('Agent2 disposable gallery signer cannot enter production/shared runtime',()=>{
  it('only exact QA identity activates synthetic local S3',()=>{
    expect(cdnIsolatedAcceptance(fixture)).toBe(true);
    expect(galleryStorageConfigFromEnv(fixture).bucket).toBe('gafus-refactor-agent2-gallery-test');
    for(const patch of [{NODE_ENV:'production'},{NODE_ENV:'development'},
      {GAFUS_CDN_FULL_ISOLATED_ACCEPTANCE:'0'},
      {DATABASE_URL:'postgresql://asmtv1@127.0.0.1:5432/production'},
      {REDIS_URL:'redis://127.0.0.1:55927'},
      {GAFUS_CDN_LOCAL_S3_ENDPOINT:'https://s3.cloud.ru'},
      {GAFUS_CDN_LOCAL_S3_KEY:'short'}])
      expect(cdnIsolatedAcceptance({...fixture,...patch})).toBe(false);
  });
  it('signed local S3 URLs fail closed if QA mode is not explicitly enabled',async()=>{
    const key='gallery/owner/media/photo/v2/full.webp';
    await expect(signGalleryCloudruFallback(key,120,{...fixture,NODE_ENV:'production'})).rejects.toThrow();
  });
});
