/**
 * Read-only CDN service diagnostics after a failed signed-origin smoke.
 * Only non-secret booleans and HTTP statuses are printed. The service API
 * payload may contain credentials; NEVER dump it, including on errors.
 */
const token = process.env.BEGET_CDN_API_TOKEN;
if (!token || token.length < 24) throw Error('BEGET_DIAGNOSTIC_TOKEN_MISSING');

if (process.argv.includes('--list')) {
  try {
    const response = await fetch('https://api.beget.com/v1/cloud', {
      headers: { Authorization: 'Bearer ' + token },
      redirect: 'error',
      signal: AbortSignal.timeout(12000),
    });
    if (!response.ok) {
      await response.body?.cancel();
      console.log(JSON.stringify({cloudServiceListHttp:response.status, accessible:false}));
    } else {
      const data = await response.json();
      const found=[];
      const seen=new Set();
      function walk(value, depth=0) {
        if (!value || typeof value!=='object' || depth>7 || seen.has(value)) return;
        seen.add(value);
        if (Array.isArray(value)) { for (const item of value) walk(item, depth+1); return; }
        const id=typeof value.id==='string' ? value.id : typeof value.service_id==='string' ? value.service_id : null;
        const type=typeof value.type==='string' ? value.type : typeof value.kind==='string' ? value.kind : '';
        const name=typeof value.name==='string' ? value.name : '';
        if (id && /cdn/i.test(type+' '+name)) found.push({id, type, name});
        for (const item of Object.values(value)) walk(item,depth+1);
      }
      walk(data);
      const candidates=found.slice(0,20);
      const details=[];
      for(const candidate of candidates){
        try{
          const reply=await fetch('https://api.beget.com/v1/cloud/'+candidate.id,{
            headers:{Authorization:'Bearer '+token},
            redirect:'error',signal:AbortSignal.timeout(10000)});
          const text=reply.ok?await reply.text():'';
          const parsed=reply.ok?JSON.parse(text):null;
          const root=parsed?.service??parsed??{};
          details.push({
            id:candidate.id,status:reply.status,
            keys:Object.keys(root).slice(0,14),
            cdnKeys:Object.keys(root.cdn??{}).slice(0,30),
            cdnSettingsKeys:Object.keys(root.cdn?.settings??{}).slice(0,30),
            settings:{
              secureTokenEnabled:root.cdn?.settings?.tokenized_url_secure_key?.enable ??
                root.cdn?.settings?.tokenized_url_secure_key?.enabled ?? null,
              secureTokenFieldNames:Object.keys(root.cdn?.settings?.tokenized_url_secure_key??{}).slice(0,12),
              sourceServiceType:root.cdn?.source_domain?.source_service_type??null,
              sourceProtocol:root.cdn?.source_domain?.source_protocol??null,
              staticHeaderNames:Object.keys(root.cdn?.settings?.static_request_headers?.value??{}).slice(0,12),
              staticRequestHeadersEnabled:root.cdn?.settings?.static_request_headers?.enabled ?? null,
              sourceDomainKeys:Object.keys(root.cdn?.source_domain??{}).slice(0,12),
              headerFields:Object.keys(root.cdn?.settings?.static_request_headers??{}).slice(0,10),
              enabledProtocols:Object.keys(root.cdn?.settings?.allowed_http_methods??{}).slice(0,10),
            },
            hasGalleryHost:text.includes('mepsuduyokabib.begetcdn.cloud'),
            hasFeedHost:text.includes('quepraquiecebquomiel.begetcdn.cloud'),
            hasRemovedFeedHost:text.includes('garaquachegasourn.begetcdn.cloud'),
            hasGalleryOrigin:text.includes('gafus-gallery-origin.containerapps.ru'),
            hasFeedOrigin:text.includes('gafus-feed-origin.containerapps.ru'),
            hasSecureKeyConfig:text.includes('secure_key'),
          });
        }catch(error){details.push({id:candidate.id,errorType:error?.name??'unknown'});}
      }
      console.log(JSON.stringify({cdnServiceDetails:details}));
      const raw=JSON.stringify(data);
      console.log(JSON.stringify({cloudServiceListHttp:response.status,
        topLevelKeys:Object.keys(data ?? {}).slice(0,12),
        expectedIdsPresent:{
          gallery:raw.includes(process.env.GALLERY_BEGET_CDN_SERVICE_ID ?? 'EXPECTED_NOT_DEFINED'),
          feed:raw.includes(process.env.FEED_BEGET_CDN_SERVICE_ID ?? 'EXPECTED_NOT_DEFINED'),
        },
        cdnCandidateCount:found.length,cdns:found.slice(0,20)}));
    }
  } catch (error) {
    console.log(JSON.stringify({cloudServiceListHttp:'network-error',errorType:error?.name ?? 'unknown'}));
  }
  process.exit(0);
}

for (const [scope, id, origin, cdnHost] of [
  ['gallery', process.env.GALLERY_BEGET_CDN_SERVICE_ID, 'gafus-gallery-origin.containerapps.ru', 'mepsuduyokabib.begetcdn.cloud'],
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
