/** Only explicitly observed HTTP 5xx at a CDN edge is degradable.
 * TLS/transport errors, bytes mismatches, HTTP 4xx, invalid CDN configuration
 * and bad signatures remain hard release failures.
 */
export function transientEdge5xx(kind, stage, status) {
  if (!['gallery', 'feed'].includes(kind) || !/^[a-z][a-z-]*$/.test(stage) ||
      !Number.isInteger(status) || status < 500 || status > 599)
    throw Error('INVALID_TRANSIENT_EDGE_CLASSIFICATION');
  const error = new Error(`CDN_TRANSIENT_EDGE_${kind}_${stage}_HTTP_${status}`);
  error.cdnTransientOnly = true;
  return error;
}
export function isDegradableCdnFailure(error, kind, fallbackVerified) {
  return fallbackVerified === true && ['gallery', 'feed'].includes(kind) &&
    error instanceof Error && error.cdnTransientOnly === true &&
    (error.message.startsWith(`CDN_TRANSIENT_EDGE_${kind}_`) ||
     error.message.startsWith(`CDN_EDGE_UNSTABLE_${kind}_`));
}
