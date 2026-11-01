/**
 * Read-only CDN service diagnostics after a failed signed-origin smoke.
 * Only non-secret booleans and HTTP statuses are printed. The service API
 * payload may contain credentials; NEVER dump it, including on errors.
 */
const token = process.env.BEGET_CDN_API_TOKEN;
if (!token || token.length < 24) throw Error('BEGET_DIAGNOSTIC_TOKEN_MISSING');

for (const [scope, id, origin, cdnHost] of [
  ['gallery', process.env.GALLERY_BEGET_CDN_REDIRECT_SERVICE_ID || '96cd124e-767e-4af1-a568-c4d1f9b4e73f', 'api.gafus.ru', 'fupiquafifeswu.begetcdn.cloud'],
  ['feed', process.env.FEED_BEGET_CDN_SERVICE_ID, 'gafus-feed-origin.containerapps.ru', 'quepraquiecebquomiel.begetcdn.cloud'],
]) {
  if (!/^[0-9a-f-]{36}$/.test(id ?? '')) throw Error('BEGET_DIAGNOSTIC_ID_INVALID_' + scope);
  try {
    const response = await fetch('https://api.beget.com/v1/cloud/' + id, {
      method: 'GET',
      headers: { Authorization: 'Bearer ' + token },
      redirect: 'error',
      signal: AbortSignal.timeout(12000),
    });
    if (!response.ok) {
      await response.body?.cancel();
      console.log(JSON.stringify({ scope, serviceGetHttp: response.status, accessible: false }));
      continue;
    }
    const payload = await response.text();
    const data = JSON.parse(payload);
    // Never log the full provider response, field values or the bearer token.
    console.log(JSON.stringify({
      scope,
      serviceGetHttp: response.status,
      responseKeys: Object.keys(data ?? {}).filter(key => /^[a-zA-Z_]{1,40}$/.test(key)).slice(0, 12),
      containsExpectedOrigin: payload.includes(origin),
      containsExpectedCdnHost: payload.includes(cdnHost),
      containsExpectedServiceId: payload.includes(id),
    }));
  } catch (error) {
    console.log(JSON.stringify({scope, serviceGetHttp: 'network-error', errorType: error?.name ?? 'unknown'}));
  }
}
