/**
 * Read-only pre-deploy guard: a valid Container Apps manifest is NOT proof
 * that a third-party CDN can reach its origin or cache token-gated content.
 */
export function assertOriginDeliveryReady(manifests, verification = {}) {
  if (!Array.isArray(manifests?.services) || manifests.services.length !== 2)
    throw new Error('CLOUDRU_ORIGIN_MANIFESTS_MISSING');
  for (const scope of ['GALLERY', 'FEED']) {
    const name = `gafus-${scope.toLowerCase()}-origin`;
    const svc = manifests.services.find(item => item.name === name);
    if (!svc || !svc.template?.containers?.length)
      throw new Error('CLOUDRU_ORIGIN_MANIFESTS_MISSING');
    const envNames = new Set(svc.template.containers[0].env?.map(item => item.name));
    for (const name of [`${scope}_ORIGIN_SECRET`, `${scope}_CDN_SECRET`,
      `${scope}_CDN_EDGE_TOKEN_VERIFIED`, `${scope}_CDN_EDGE_CACHE_HIT_VERIFIED`])
      if (!envNames.has(name)) throw new Error('CLOUDRU_ORIGIN_AUTH_NOT_CONFIGURED');
    // According to Cloud.ru Container Apps, a service with no external HTTPS
    // endpoint cannot be used as a third-party CDN origin. A reverse proxy may
    // substitute for direct public ingress only AFTER real reachability proof.
    if (svc.configuration?.ingress?.publiclyAccessible !== true &&
        verification[`${scope}_HTTPS_REVERSE_PROXY_VERIFIED`] !== true)
      throw new Error('CLOUDRU_ORIGIN_NOT_EXTERNALLY_REACHABLE');
    // Yandex CDN gives the origin roughly five seconds to respond. A Cloud.ru
    // scale-to-zero startup was measured at 11.68 seconds on staging, so even
    // a correct deployment is not ready if all replicas can be stopped.
    if (svc.template.scaling?.minInstanceCount < 1)
      throw new Error('CLOUDRU_ORIGIN_COLD_START_UNSAFE');
    // These checks must be demonstrated on a synthetic CDN cache MISS and HIT,
    // never set merely because the application checks an origin header.
    if (verification[`${scope}_ORIGIN_SECRET_HEADER_VERIFIED`] !== true ||
        verification[`${scope}_EDGE_TOKEN_HIT_VERIFIED`] !== true ||
        verification[`${scope}_CDN_EDGE_CACHE_POLICY_VERIFIED`] !== true)
      throw new Error('CLOUDRU_ORIGIN_DELIVERY_UNVERIFIED');
    // Never rely on a single successful edge fetch: initial staging delivered
    // 97/100 requests and intermittently returned 504. Demand 100/100 and
    // separately confirm safe warm-cache authorization before enabling users.
    if (verification[`${scope}_ORIGIN_P95_UNDER_4000_VERIFIED`] !== true ||
        verification[`${scope}_CDN_100_REQUESTS_VERIFIED`] !== true)
      throw new Error('CLOUDRU_ORIGIN_RELIABILITY_UNVERIFIED');
  }
  return true;
}
