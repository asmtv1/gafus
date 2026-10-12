import assert from 'node:assert/strict';
import { cloudruMediaManifests } from './media-manifests.mjs';
import { assertOriginDeliveryReady } from './origin-delivery-gate.mjs';
const m = cloudruMediaManifests('12345678-1234-1234-1234-123456789012',
  'abcdef0123456789abcdef0123456789abcdef01');
const flags = {
  GALLERY_HTTPS_REVERSE_PROXY_VERIFIED: true,
  FEED_HTTPS_REVERSE_PROXY_VERIFIED: true,
  GALLERY_ORIGIN_SECRET_HEADER_VERIFIED: true,
  FEED_ORIGIN_SECRET_HEADER_VERIFIED: true,
  GALLERY_EDGE_TOKEN_HIT_VERIFIED: true,
  FEED_EDGE_TOKEN_HIT_VERIFIED: true,
  GALLERY_CDN_EDGE_CACHE_POLICY_VERIFIED: true,
  FEED_CDN_EDGE_CACHE_POLICY_VERIFIED: true,
  GALLERY_ORIGIN_P95_UNDER_4000_VERIFIED: true,
  FEED_ORIGIN_P95_UNDER_4000_VERIFIED: true,
  GALLERY_CDN_100_REQUESTS_VERIFIED: true,
  FEED_CDN_100_REQUESTS_VERIFIED: true,
};
assert.throws(() => assertOriginDeliveryReady(m),
  /CLOUDRU_ORIGIN_DELIVERY_UNVERIFIED/);
// The manifest now deliberately permits public HTTPS ingress behind an origin
// secret. Test the genuinely non-reachable variant rather than an old shape.
const sleeping = structuredClone(m);
sleeping.services[0].template.scaling.minInstanceCount = 0;
assert.throws(() => assertOriginDeliveryReady(sleeping, flags),
  /CLOUDRU_ORIGIN_COLD_START_UNSAFE/);
assert.throws(() => assertOriginDeliveryReady(m, {
  ...flags, GALLERY_CDN_100_REQUESTS_VERIFIED: false,
}), /CLOUDRU_ORIGIN_RELIABILITY_UNVERIFIED/);
const privateIngress = structuredClone(m);
privateIngress.services.find(item => item.name === 'gafus-feed-origin').configuration.ingress.publiclyAccessible = false;
assert.throws(() => assertOriginDeliveryReady(privateIngress, {
  ...flags, FEED_HTTPS_REVERSE_PROXY_VERIFIED: false }),
  /CLOUDRU_ORIGIN_NOT_EXTERNALLY_REACHABLE/);
assert.throws(() => assertOriginDeliveryReady(m, {
  ...flags, FEED_EDGE_TOKEN_HIT_VERIFIED: false }),
  /CLOUDRU_ORIGIN_DELIVERY_UNVERIFIED/);
assert.throws(() => assertOriginDeliveryReady(m, {
  ...flags, GALLERY_CDN_EDGE_CACHE_POLICY_VERIFIED: false }),
  /CLOUDRU_ORIGIN_DELIVERY_UNVERIFIED/);
assert.equal(assertOriginDeliveryReady(m, flags), true);
console.log('Cloudru origin delivery readiness: inaccessible ingress, cache-hit auth, origin-header, no-store fail-closed PASS');
