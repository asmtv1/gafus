/**
 * Bounded production edge acceptance. A single transient 5xx/timeout after
 * CDN propagation must not trigger an immediate rollback, but we still require
 * 15 CONSECUTIVE exact-byte successful responses and fail closed on 4xx or
 * unexpected content. Signed URLs are renewed per attempt to avoid expiry.
 */
export async function verifyStableCdnGet({
  kind,
  urlForAttempt,
  expectedBytes,
  fetcher = fetch,
  samples = 15,
  maxAttempts = 35,
  retryDelayMs = 1500,
  wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}) {
  if (
    !["gallery", "feed"].includes(kind) ||
    !Buffer.isBuffer(expectedBytes) ||
    !expectedBytes.length ||
    !Number.isInteger(samples) ||
    samples < 1 ||
    !Number.isInteger(maxAttempts) ||
    maxAttempts < samples ||
    !Number.isSafeInteger(retryDelayMs) ||
    retryDelayMs < 0
  ) {
    throw Error("CDN_INVALID_STABILITY_CONFIG");
  }
  let consecutive = 0;
  let transientFailures = 0;
  let lastFailure = "none";
  let transportFailures = 0;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    // A newly signed request each time, not a single 150-second token.
    const url = urlForAttempt();
    try {
      const response = await fetcher(url, {
        redirect: "manual",
        cache: "no-store",
        signal: AbortSignal.timeout(14000),
      });
      if (response.status === 200) {
        const body = Buffer.from(await response.arrayBuffer());
        if (!body.equals(expectedBytes)) throw Error("CDN_EDGE_BYTES_MISMATCH_" + kind);
        consecutive++;
        if (consecutive === samples) {
          return { samples: consecutive, attempts: attempt, transientFailures };
        }
        continue;
      }
      await response.body?.cancel();
      if (response.status < 500 || response.status > 599) {
        // No automatic bypass of 403/404, including while propagating.
        throw Error("CDN_EDGE_HTTP_" + response.status + "_" + kind);
      }
      lastFailure = "http_" + response.status;
    } catch (error) {
      if (
        error instanceof Error &&
        /^(CDN_EDGE_BYTES_MISMATCH_|CDN_EDGE_HTTP_)/.test(error.message)
      ) {
        throw error;
      }
      // Fetch transport failures are retried; do not log signed URLs.
      lastFailure = "transport";
      transportFailures++;
    }
    transientFailures++;
    consecutive = 0;
    if (attempt < maxAttempts) await wait(retryDelayMs);
  }
  const error = Error(
    "CDN_EDGE_UNSTABLE_" + kind + "_after_" + maxAttempts +
    "_last_" + lastFailure + "_transient_" + transientFailures,
  );
  // Error metadata is intentionally not set if even one TLS/transport
  // failure was observed. Only fully HTTP-5xx edge outages may degrade.
  if (transportFailures === 0 && /^http_5\d\d$/.test(lastFailure))
    error.cdnTransientOnly = true;
  throw error;
}
