/** Read-only Beget source/config inventory. Never logs raw settings or credentials. */
const token = process.env.BEGET_CDN_API_TOKEN;
if (!token || token.length < 24) throw Error('BEGET_AUTH_UNAVAILABLE');
const get = async path => {
  const res = await fetch('https://api.beget.com' + path, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    redirect: 'error', signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) { await res.body?.cancel(); throw Error('BEGET_HTTP_' + res.status + '_'+path.replaceAll('/','_')); }
  return res.json();
};
for (const endpoint of ['/v1/cloud/configuration', '/v1/cloud', '/v1/cloud/cdn/source-domains']) {
  try {
    const x = await get(endpoint);
    console.log('INSPECT',endpoint,'rootFields',Object.keys(x ?? {}));
    for (const [k,v] of Object.entries(x ?? {})) {
      if (!Array.isArray(v)) continue;
      console.log('ARRAY',k,'count',v.length);
      if (endpoint.endsWith('configuration')) {
        for (const row of v.filter(y=> y && typeof y==='object' && /cdn/i.test(JSON.stringify({id:y.id,name:y.name,type:y.type,slug:y.slug,display_name:y.display_name}))))
          console.log('CDN_CONFIG',JSON.stringify({id:row.id,type:row.type,name:row.name,slug:row.slug,displayName:row.display_name}));
      } else if (endpoint === '/v1/cloud') {
        for (const row of v.filter(y=> y && typeof y==='object' && (y.cdn || /cdn/i.test(y.type ?? ''))))
          {
            console.log('CDN_SERVICE',JSON.stringify({id:row.id,name:row.display_name,status:row.status,type:row.type,source:row.cdn?.source_domain?.domain}));
            if (row.cdn?.source_domain?.domain === 'gafus-gallery-origin.containerapps.ru') {
              const origin = row.cdn.source_domain;
              console.log('GALLERY_SOURCE_FIELDS', JSON.stringify({
                source_service_type:origin.source_service_type,
                source_protocol:origin.source_protocol,
                source_service_id:origin.source_service_id ? 'present' : 'absent',
                cdn_service_id:origin.cdn_service_id ? 'present' : 'absent',
              }));
              const settings=row.cdn.settings??{};
              console.log('GALLERY_SETTINGS_FLAGS',JSON.stringify({
                follow_origin_redirect:settings.follow_origin_redirect?.enable,
                tokenized_url_secure_key:settings.tokenized_url_secure_key?.enable,
                static_request_headers:settings.static_request_headers?.enabled,
                caching_time:settings.caching_time,
              }));
            }
          }
      } else console.log('DOMAIN_FIELDS',v.length?Object.keys(v[0]).slice(0,12):[]);
    }
  } catch (e) { console.log('INSPECT_ERROR',endpoint, e?.name === 'Error' ? e.message : e?.name); process.exitCode=1; }
}
