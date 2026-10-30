#!/usr/bin/env node
/**
 * AG4-INFRA-032: NONPROD nginx source-only SPA routing contract.
 * Reads exactly the dedicated local config, never nginx -T or production files.
 * Structural route classification is an assertion model, NOT a live HTTP test.
 */
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const project=resolve(fileURLToPath(new URL('../..',import.meta.url)));
const configPath=resolve(project,'scripts/refactor/infra032-spa-local.nginx.conf');
const appRoots=[
  ['5180',resolve(project,'apps/web-vite/dist')],
  ['5181',resolve(project,'apps/trainer-panel/src/vite-preparation/.opt-in-dist')],
  ['5182',resolve(project,'apps/admin-panel/src/vite-preparation/.opt-in-dist')],
];
function contract(condition,reason){if(!condition)throw Error('INFRA032_CONTRACT: '+reason);}
function blockFrom(text,open){
  const start=text.indexOf('{',open);contract(start>=0,'missing opening brace');
  let level=0;
  for(let i=start;i<text.length;i++){
    const c=text[i];if(c==='{')level++;if(c==='}')level--;
    if(level===0)return {body:text.slice(start+1,i),end:i+1};
  }
  throw Error('INFRA032_CONTRACT: unbalanced nginx blocks');
}
function blocks(body,expression){
  const result=[];expression.lastIndex=0;
  for(let match;(match=expression.exec(body));){
    const parsed=blockFrom(body,match.index);
    result.push({name:match[1]??'',body:parsed.body});
    expression.lastIndex=parsed.end;
  }
  return result;
}
function directive(body,pattern,reason){
  contract(pattern.test(body),reason);
}
function singleLocation(locations,token){
  const match=locations.filter(loc=>loc.name===token);
  contract(match.length===1,'exactly one location '+token);
  return match[0].body;
}
const textCache=/add_header\s+Cache-Control\s+"no-store, max-age=0"\s+always;/;
const apiCache=/add_header\s+Cache-Control\s+"private, no-store, max-age=0"\s+always;/;
const pwaRegex=/\^\/\(\?:sw\\\.js\|service-worker\\\.js\|workbox-/;
const genericExt=/\^?\\\.\(\?:html\|js\|mjs\|css\|map\|json/;
const pwaRoute=/^\/(?:sw\.js|service-worker\.js|workbox-[^/]*\.[cm]?js|manifest\.(?:json|webmanifest)|site\.webmanifest)$/i;
const staticExt=/\.(?:html|js|mjs|css|map|json|png|jpe?g|gif|svg|ico|webp|avif|woff2?|ttf|otf|eot|pdf|txt|webmanifest|wasm|mp4|webm)$/i;
export function validateSpaConfig(raw){
  const source=raw.split('\n').filter(line=>!/^\s*#/.test(line)).join('\n');
  contract(!/\binclude\s/.test(source),'no external or uninspected includes');
  contract(!/\b(?:auth_basic|ssl_certificate|access_log\s+\/|error_log\s+\/|proxy_cache_path|proxy_store|alias\s+|rewrite\s+|error_page\s+|set\s+\$)\b/.test(source),'unsafe nginx config directive');
  directive(source,/^error_log\s+stderr\s+warn;$/m,'error logs must go to stderr only');
  directive(source,/^\s*access_log\s+off;/m,'disable access log with query strings');
  directive(source,/^pid\s+\/Users\/asmtv1\/Desktop\/gafus-refactor\/scripts\/refactor\/infra032-spa-local\.pid;$/m,'PID confined to project');
  contract(!/\blisten\s+(?!127\.0\.0\.1:)/.test(source),'loopback listeners only');
  const serverBlocks=blocks(source,/\bserver\s*\{/g);
  contract(serverBlocks.length===3,'exactly three nonprod SPA servers');
  for(const [i,server] of serverBlocks.entries()){
    const [port,root]=appRoots[i];
    directive(server.body,new RegExp('\\blisten\\s+127\\.0\\.0\\.1:'+port+';'),'server listener '+port);
    const found=[...server.body.matchAll(/\blisten\s+([^;]+);/g)];
    contract(found.length===1&&found[0][1]==='127.0.0.1:'+port,'only planned port '+port);
    directive(server.body,new RegExp('\\broot\\s+'+root.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+';'),'actual Vite output root '+root);
    directive(server.body,/\bautoindex\s+off;/,'disable directory enumeration');
    const locations=blocks(server.body,/\blocation\s+([^\{\n]+?)\s*\{/g);
    contract(locations.length===8,'eight exact route classes on '+port);
    const upstreams=[...server.body.matchAll(/\bproxy_pass\s+([^;]+);/g)];
    contract(upstreams.length===1&&upstreams[0][1]==='http://127.0.0.1:4188',
      'one allowed localhost API proxy only on '+port);
    for(const location of locations){
      if(location.name!=='^~ /api/v1/')
        contract(!/\bproxy_pass\s/.test(location.body),
          'no API proxy inside SPA, static or PWA location');
    }
    const api=singleLocation(locations,'^~ /api/v1/');
    directive(api,/\bproxy_pass\s+http:\/\/127\.0\.0\.1:4188;/,'local API upstream must preserve /api/v1 path');
    directive(api,/\bproxy_intercept_errors\s+off;/,'preserve API 401/403/500');
    directive(api,/\bproxy_redirect\s+off;/,'no upstream redirect rewriting');
    for(const pat of [/\bproxy_cache\s+off;/,/\bproxy_no_cache\s+1;/,/\bproxy_cache_bypass\s+1;/,/\bproxy_hide_header\s+Cache-Control;/,apiCache])directive(api,pat,'API must be private/no-store without caching');
    for(const pat of [/proxy_set_header\s+Cookie\s+\$http_cookie;/,/proxy_set_header\s+Authorization\s+\$http_authorization;/,/proxy_set_header\s+X-Forwarded-Proto\s+\$scheme;/])directive(api,pat,'forward auth/session context');
    for(const name of ['= /api/v1','^~ /api/']){
      const b=singleLocation(locations,name);directive(b,/\breturn\s+404;/,'other API paths 404');directive(b,apiCache,'other API paths private/no-store');
    }
    const pwa=locations.filter(loc=>pwaRegex.test(loc.name));
    contract(pwa.length===1,'PWA endpoints dedicated before static regex');
    directive(pwa[0].body,/\breturn\s+404;/,'no SW/manifest HTML fallback');
    directive(pwa[0].body,textCache,'no SW stale cache');
    const asset=singleLocation(locations,'^~ /assets/');
    directive(asset,/\btry_files\s+\$uri\s+=404;/,'missing Vite asset returns 404');
    directive(asset,textCache,'Vite static no stale 404/cache');
    const generic=locations.filter(loc=>genericExt.test(loc.name));
    contract(generic.length===1,'static extension 404 location');
    directive(generic[0].body,/\btry_files\s+\$uri\s+=404;/,'missing static file 404');
    directive(generic[0].body,textCache,'static no-cache');
    const html=singleLocation(locations,'= /index.html');
    directive(html,/\btry_files\s+\/index\.html\s+=404;/,'missing index itself is 404');
    directive(html,textCache,'HTML no-store');
    const route=singleLocation(locations,'/');
    directive(route,/\btry_files\s+\$uri\s+\/index\.html;/,'deep link falls through to index');
    directive(route,textCache,'SPA navigation no-store');
    contract(locations.indexOf(pwa[0])<locations.indexOf(generic[0]),'PWA regex before generic assets');
  }
  return {serverCount:3,ports:appRoots.map(([port])=>Number(port)),roots:appRoots.map(([,root])=>root)};
}
/** Deterministic routing model after validateSpaConfig(), not a launched nginx. */
export function modelRequest(pathname,method='GET'){
  const path=new URL(pathname,'http://localhost').pathname;
  if(path.startsWith('/api/v1/'))return {action:'PROXY_API',status:'UPSTREAM',cache:'private, no-store, max-age=0',method,path};
  if(path==='/api/v1'||path.startsWith('/api/'))return {action:'API_404',status:404,cache:'private, no-store, max-age=0'};
  if(pwaRoute.test(path))return {action:'PWA_404',status:404,cache:'no-store, max-age=0'};
  if(path.startsWith('/assets/')||staticExt.test(path)){
    if(path==='/index.html')return {action:'INDEX',status:'FILE_OR_404',cache:'no-store, max-age=0'};
    return {action:'STATIC_FILE_OR_404',status:'FILE_OR_404',cache:'no-store, max-age=0'};
  }
  return {action:'SPA_INDEX',status:'INDEX_OR_404',cache:'no-store, max-age=0'};
}
const ownPath=resolve(fileURLToPath(import.meta.url));
if(process.argv[1]&&resolve(process.argv[1])===ownPath){
 const result=validateSpaConfig(readFileSync(configPath,'utf8'));
 console.log('INFRA032_SPA_STATIC_PASS '+JSON.stringify(result));
}
