/** Read-only source contract for GAFUS iOS Universal Links / Android App Links.
 * This verifies deployable association files, native OS intent scope, and
 * Nginx's exact non-SPA responses before a native store or web release.
 */
export const officialHosts = ['gafus.ru','www.gafus.ru'];
export const requiredPaths = [
  ['pathPrefix','/training/'],
  ['path','/training'],
  ['pathPrefix','/feed/'],
  ['pathPrefix','/questions/'],
  ['pathPrefix','/chats/'],
  ['pathPrefix','/moments/'],
  ['path','/moments'],
  ['path','/reset-password'],
];
export const requiredIosPaths = [
  '/feed/*','/questions/*','/chats/*','/training/*',
  '/moments','/moments/*','/reset-password',
];
const validFingerprint = /^(?:[A-F0-9]{2}:){31}[A-F0-9]{2}$/;
export function verifyGafusAppLinkSource({expo,ios,android,edge,inner}) {
  const errors=[];
  const check=(ok,why)=>{if(!ok)errors.push(why)};
  const bundle='ru.gafus.app';
  check(expo.ios?.bundleIdentifier===bundle && expo.android?.package===bundle,
    'APP_LINK_BUNDLE_IDS_MUST_MATCH');
  check(expo.ios?.appleTeamId==='PJQ8PP666S', 'APP_LINK_IOS_TEAM_MUST_MATCH_RELEASE_IPA');
  check(officialHosts.every(host=>expo.ios?.associatedDomains?.includes(`applinks:${host}`)),
    'APP_LINK_IOS_ASSOCIATED_DOMAINS_MISSING');
  check(expo.ios?.associatedDomains?.length===officialHosts.length,
    'APP_LINK_IOS_EXTRA_ASSOCIATED_DOMAIN');
  check(ios?.applinks?.details?.length===1 &&
    ios.applinks.details[0]?.appID===`PJQ8PP666S.${bundle}`,
    'AASA_IOS_SIGNING_ID_NOT_MATCHING_RELEASE_TEAM');
  const actual=ios?.applinks?.details?.[0]?.paths ?? [];
  check(requiredIosPaths.every(p=>actual.includes(p)), 'AASA_REQUIRED_LINK_ROUTE_MISSING');
  check(ios?.applinks?.apps?.length===0, 'AASA_APPS_MUST_BE_EMPTY');
  check(actual.every(p=>requiredIosPaths.includes(p)), 'AASA_UNEXPECTED_LINK_ROUTE');
  const asset=android?.[0];
  check(Array.isArray(android) && android.length===1 &&
    asset?.relation?.length===1 && asset.relation[0]==='delegate_permission/common.handle_all_urls' &&
    asset?.target?.namespace==='android_app' && asset.target.package_name===bundle,
    'ASSETLINKS_ANDROID_ID_OR_RELATION_INVALID');
  const fingerprints=asset?.target?.sha256_cert_fingerprints ?? [];
  check(Array.isArray(fingerprints) && fingerprints.length>0 &&
    fingerprints.every(s=>validFingerprint.test(s)) && new Set(fingerprints).size===fingerprints.length,
    'ASSETLINKS_ANDROID_SIGNER_FINGERPRINT_INVALID');
  const filters=expo.android?.intentFilters ?? [];
  check(filters.length===officialHosts.length*requiredPaths.length,
    'ANDROID_APP_LINK_INTENT_FILTER_COUNT_UNEXPECTED');
  for(const host of officialHosts) for(const [field,path] of requiredPaths) {
    const matches=filters.filter(f=>f.autoVerify===true && f.action==='VIEW' &&
      f.category?.includes('BROWSABLE') && f.category?.includes('DEFAULT') &&
      f.data?.length===1 && f.data[0]?.scheme==='https' &&
      f.data[0]?.host===host && f.data[0]?.[field]===path &&
      Object.keys(f.data[0]).length===3);
    check(matches.length===1,`ANDROID_APP_LINK_MISSING_OR_BROAD:${host}:${field}:${path}`);
  }
  for(const [path,name] of [
    ['/.well-known/apple-app-site-association','aasa'],
    ['/.well-known/assetlinks.json','assetlinks'],
  ]) {
    const re=new RegExp(`location\\s*=\\s*${path.replaceAll('.','\\.')}\\s*\\{`);
    check(re.test(edge) && re.test(inner),`DOMAIN_ASSOCIATION_EXACT_NGINX_ROUTE_MISSING:${name}`);
    check(edge.includes(`proxy_pass http://gafus-web:3000${path};`),
      `DOMAIN_ASSOCIATION_EDGE_PROXY_MISSING:${name}`);
    // Edge proxies to the exact path; the inner Nginx MUST use try_files
    // =404, or an unknown association path can return index.html instead.
    const block=inner.slice(inner.indexOf(`location = ${path} {`));
    check(block.startsWith(`location = ${path} {`) || block.startsWith('location = '+path),
      `DOMAIN_ASSOCIATION_INNER_MISSING:${name}`);
    check(block.slice(0,180).includes('default_type application/json') &&
      block.slice(0,180).includes('try_files $uri =404'),
      `DOMAIN_ASSOCIATION_JSON_OR_SPA_FALLBACK:${name}`);
  }
  return errors;
}
