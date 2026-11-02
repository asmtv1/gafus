import assert from 'node:assert/strict';
import { test } from 'node:test';
import { detectProviderChange, requiresProviderCheck } from './beget-provider-change-detect.mjs';
const a = 'a'.repeat(40), b = 'b'.repeat(40);

test('ordinary application and CI changes never force provider API reads', () => {
  assert.equal(requiresProviderCheck(['apps/api/src/main.ts', '.github/workflows/ci-cd.yml']), false);
  assert.equal(requiresProviderCheck(['ci-cd/docker/docker-compose.prod.yml'],
    '@@ -2,1 +2,1 @@\n-      - CHAT2_API_ENABLED=false\n+      - CHAT2_API_ENABLED=true\n'), false);
  assert.equal(detectProviderChange(a,b,(_cmd,args) => args.includes('--name-only')
    ? 'apps/web-vite/src/App.tsx\n' : ''),false);
});
test('provider provisioning or control-plane gate changes require verification', () => {
  for (const file of ['infra/cloudru/beget-gallery-create.mjs',
    'infra/cloudru/beget-gallery-secure-configure.mjs',
    'infra/cloudru/gallery-redirect-release-gate.mjs']) {
    assert.equal(requiresProviderCheck([file]),true,file);
  }
});
test('compose CDN bindings require provider verification, unrelated changes do not', () => {
  const files=['ci-cd/docker/docker-compose.prod.yml'];
  assert.equal(requiresProviderCheck(files,'+      - GALLERY_CDN_BASE_URL=https://new.invalid\n'),true);
  assert.equal(requiresProviderCheck(files,'-      - FEED_CDN_SECRET=${FEED_CDN_SECRET:-}\n'),true);
  assert.equal(detectProviderChange(a,b,(_cmd,args)=>args.includes('--name-only')
    ? files.join('\n') : '@@ -10 +10 @@\n+      - GALLERY_CDN_REDIRECT_ENABLED=true\n'),true);
});
test('invalid or unknown baseline never reports safe unchanged config', () => {
  assert.equal(detectProviderChange('0'.repeat(40),b,()=>{throw Error('should not call git')}),true);
  assert.throws(()=>detectProviderChange('malformed',b),/INVALID_SHA/);
  assert.equal(detectProviderChange(a,b,()=>{throw Error('non-ancestor baseline')}),true);
  assert.throws(()=>detectProviderChange(a,b,(_cmd,args)=>{
    if(args.includes('--name-only')) throw Error('git diff failure');
    return '';
  }),/git diff failure/);
});
