/** Pure/read-only probes: never restore traffic without proving exact media bytes. */
export async function probePreviousOrigin({
  hostname, path, headerName, headerSecret, expectedBytes,
  fetcher = fetch, attempts = 2, now = () => Date.now(),
}) {
  if (!hostname || !/^[a-z0-9.-]+$/i.test(hostname) ||
      !path?.startsWith('/') || path.includes('?') || !headerName || !headerSecret ||
      !Buffer.isBuffer(expectedBytes) || !expectedBytes.length ||
      !Number.isInteger(attempts) || attempts < 1)
    return false;
  for (let attempt = 0; attempt < attempts; attempt++) {
    const start = now();
    try {
      const response = await fetcher(`https://${hostname}${path}`, {
        method: 'GET',
        headers: { [headerName]: headerSecret },
        redirect: 'manual',
        cache: 'no-store',
        signal: AbortSignal.timeout(4500),
      });
      if (response.status !== 200) {
        await response.body?.cancel();
        return false;
      }
      const body = Buffer.from(await response.arrayBuffer());
      if (!body.equals(expectedBytes) || now() - start > 3000) return false;
    } catch {
      return false;
    }
  }
  return true;
}

/** Require repeated byte-identical, fast reads, not one warm origin request. */
export async function verifyDirectOriginStable({
  kind, url, headerName, headerSecret, expectedBytes,
  fetcher = fetch, samples = 8, maxAttempts = 12, maxLatencyMs = 3000,
  wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now = () => Date.now(),
}) {
  if (!['gallery', 'feed'].includes(kind) ||
      !url.startsWith('https://') || !headerName || !headerSecret ||
      !Buffer.isBuffer(expectedBytes) || !expectedBytes.length ||
      !Number.isInteger(samples) || samples < 1 ||
      !Number.isInteger(maxAttempts) || maxAttempts < samples ||
      !Number.isSafeInteger(maxLatencyMs) || maxLatencyMs < 1)
    throw Error('CDN_INVALID_DIRECT_ORIGIN_CONFIG');
  let consecutive = 0;
  let failures = 0;
  let lastFailure = 'none';
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const start = now();
    try {
      const response = await fetcher(url, {
        method: 'GET',
        headers: { [headerName]: headerSecret },
        redirect: 'manual',
        cache: 'no-store',
        signal: AbortSignal.timeout(4500),
      });
      if (response.status !== 200) {
        lastFailure = `http_${response.status}`;
        await response.body?.cancel();
      } else {
        const bytes = Buffer.from(await response.arrayBuffer());
        if (!bytes.equals(expectedBytes)) throw Error('CDN_DIRECT_ORIGIN_BYTES_MISMATCH_' + kind);
        if (now() - start > maxLatencyMs) {
          lastFailure = 'too_slow';
        } else {
          consecutive++;
          if (consecutive === samples) return { samples, attempts: attempt, failures };
          await wait(400);
          continue;
        }
      }
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('CDN_DIRECT_ORIGIN_BYTES_MISMATCH_'))
        throw error;
      lastFailure = 'transport';
    }
    consecutive = 0;
    failures++;
    if (attempt < maxAttempts) await wait(700);
  }
  throw Error(`CDN_DIRECT_ORIGIN_UNSTABLE_${kind}_after_${maxAttempts}_last_${lastFailure}_failures_${failures}`);
}
