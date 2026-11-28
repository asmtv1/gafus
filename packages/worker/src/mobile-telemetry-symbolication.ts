import { createHash } from 'node:crypto';
import { SourceMap, type SourceMapPayload } from 'node:module';
import type { MobileTelemetryEventV1 } from '@gafus/types';
import type { MobilePrivateSymbolReader } from '@gafus/cdn-upload/mobile-private-symbols';

type Scope = {environment:'preview'|'production';platform:'ios'|'android';runtime:string;updateId:string;
  revision:number;sourceSha:string;symbolsRef:string;nativeBuild?:string;nativeArtifactSha256?:string};
export type MobileSymbolication = {status:'disabled'|'unavailable'|'unmapped'|'partial'|'symbolicated';stack?:string};
const sha=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');
const HEX64=/^[a-f0-9]{64}$/;
const FN=/^[A-Za-z_$<>][A-Za-z0-9_.$<>-]{0,99}$/;

/** Retain only static repository paths, not local machine paths or source contents. */
function safeSource(source:unknown):string|undefined {
  if(typeof source!=='string'||source.length>2048)return;
  const normalized=source.replace(/\\/g,'/');
  const match=/(?:^|\/)((?:apps\/mobile\/(?:app|src)|packages\/[a-zA-Z0-9_-]+\/src)\/[A-Za-z0-9_./()\[\]-]+\.(?:tsx?|jsx?))$/.exec(normalized);
  const result=match?.[1]??(/^(?:\.\/)?((?:app|src)\/[A-Za-z0-9_./()\[\]-]+\.(?:tsx?|jsx?))$/.exec(normalized)?.[1] ? 'apps/mobile/'+/^(?:\.\/)?((?:app|src)\/[A-Za-z0-9_./()\[\]-]+\.(?:tsx?|jsx?))$/.exec(normalized)![1] : undefined);
  if(result&&!result.split('/').some(v=>v==='.'||v==='..')&&result.length<=240)return result;
}
export function sanitizeSymbolicatedStack(stack:unknown):string|undefined {
  if(typeof stack!=='string')return;
  const frames=stack.split('\n').slice(0,50).flatMap(line=>{
    if(line.length>500)return [];
    const m=/^at ([A-Za-z_$<>][A-Za-z0-9_.$<>-]{0,99}) \(([^()]+(?:\([^()]*\)[^()]*)*):(\d{1,8}):(\d{1,8})\)$/.exec(line);
    if(!m)return [];
    const source=safeSource(m[2]);
    return source&&source===m[2]?[line]:[];
  });
  return frames.length?frames.join('\n'):undefined;
}

/** Resolve only an immutable, verified manifest matching this exact OTA.
 * The client stack currently has no distinct bundle ID, so do not guess
 * when an export has more than one logical Hermes bundle. */
export async function loadMobileReleaseSourceMap(read:MobilePrivateSymbolReader,scope:Scope,bundleId?:string):Promise<SourceMap> {
  if(!/^(preview|production)$/.test(scope.environment)||! /^(ios|android)$/.test(scope.platform)||
    !/^\d{1,4}\.\d{1,4}\.\d{1,4}$/.test(scope.runtime)||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(scope.updateId)||
    !Number.isSafeInteger(scope.revision)||scope.revision<0||
    (scope.revision===0&&(!/^\d{1,20}$/.test(scope.nativeBuild??'')||!HEX64.test(scope.nativeArtifactSha256??'')))||! /^[a-f0-9]{40}$/.test(scope.sourceSha)||
    !/^symbols-s3:[a-f0-9]{64}$/.test(scope.symbolsRef))throw Error('MOBILE_SYMBOL_SCOPE');
  const prefix=`symbols/${scope.environment}/gafus/${scope.runtime}/${scope.platform}/${scope.revision===0?'embedded/'+scope.nativeBuild+'/':''}${scope.updateId}`;
  const manifest=await read(prefix+'/private-symbol-manifest.json',100_000);
  if(manifest.length>100_000||sha(manifest)!==scope.symbolsRef.slice('symbols-s3:'.length))throw Error('MOBILE_SYMBOL_MANIFEST_HASH');
  const m=JSON.parse(manifest.toString('utf8'));
  if(m.schemaVersion!==1||m.private!==true||m.retentionClass!=='release-symbols'||
    m.environment!==scope.environment||m.platform!==scope.platform||m.runtimeVersion!==scope.runtime||
    m.updateId!==scope.updateId||m.revision!==scope.revision||m.sourceSha!==scope.sourceSha||
    !Array.isArray(m.maps)||m.maps.length<1||m.maps.length>8||
    (scope.revision===0&&(m.nativeBuild!==scope.nativeBuild||m.nativeArtifactSha256!==scope.nativeArtifactSha256)))
    throw Error('MOBILE_SYMBOL_MANIFEST_SCOPE');
  // A plain index.android.bundle stack has no chunk identity. Never pick a
  // map arbitrarily if the archive contains multiple candidate bundles.
  if(bundleId&&!/^(?:[a-f0-9]{32}|[a-f0-9]{64})$/.test(bundleId))throw Error('MOBILE_SYMBOL_BUNDLE_ID');
  const candidates=bundleId?m.maps.filter((item:{logicalBundle?:unknown})=>
    typeof item?.logicalBundle==='string'&&new RegExp('^(?:widget-entry|entry|index|AppEntry)-'+bundleId+'\\.hbc$').test(item.logicalBundle)):m.maps;
  if(candidates.length!==1)throw Error('MOBILE_SYMBOL_MAP_AMBIGUOUS');
  const item=candidates[0];
  if(!item||!HEX64.test(item.sha256)||item.filename!==item.sha256+'.map'||
    !Number.isSafeInteger(item.sizeBytes)||item.sizeBytes<1||item.sizeBytes>50*1024*1024)
    throw Error('MOBILE_SYMBOL_MAP_METADATA');
  const bytes=await read(prefix+'/'+item.filename,item.sizeBytes);
  if(bytes.length!==item.sizeBytes||sha(bytes)!==item.sha256)throw Error('MOBILE_SYMBOL_MAP_HASH');
  const json=JSON.parse(bytes.toString('utf8'));
  if(json.version!==3||!Array.isArray(json.sources)||!json.sources.every((x:unknown)=>typeof x==='string')||
    !Array.isArray(json.names)||!json.names.every((x:unknown)=>typeof x==='string')||
    typeof json.mappings!=='string')throw Error('MOBILE_SYMBOL_MAP_FORMAT');
  // Drop original source contents; the worker only needs positions and names.
  const payload:SourceMapPayload={version:3,file:'bundle',sourceRoot:'',sources:json.sources,
    names:json.names,mappings:json.mappings,sourcesContent:[]};
  return new SourceMap(payload);
}

export function symbolicateMobileStack(stack:string,map:SourceMap):MobileSymbolication {
  const frames:string[]=[];
  let total=0;
  for(const frame of stack.split('\n').slice(0,50)) {
    const parsed=/^at ([A-Za-z_$<>][A-Za-z0-9_.$<>-]{0,99}) \(bundle(?:-[a-f0-9]{32,64})?:(\d{1,8}):(\d{1,10})\)$/.exec(frame);
    if(!parsed)continue;
    total++;
    const line=Number(parsed[2])-1,offset=Number(parsed[3]);
    if(line<0)continue;
    // Metro symbolicate defaults: generated line base 1, Hermes offset base 0.
    const mapped=map.findEntry(line,offset);
    if(!('originalSource' in mapped)||mapped.generatedLine!==line)continue;
    const source=safeSource(mapped.originalSource);
    if(!source||!Number.isSafeInteger(mapped.originalLine)||!Number.isSafeInteger(mapped.originalColumn)||
      mapped.originalLine<0||mapped.originalColumn<0)continue;
    const name=(mapped as {name?:unknown}).name;
    frames.push(`at ${typeof name==='string'&&FN.test(name)?name:parsed[1]} (${source}:${mapped.originalLine+1}:${mapped.originalColumn+1})`);
  }
  const safe=sanitizeSymbolicatedStack(frames.join('\n'));
  return safe?{status:frames.length===total?'symbolicated':'partial',stack:safe}:{status:'unmapped'};
}

export function createMobileSymbolicator(read:MobilePrivateSymbolReader|undefined) {
  let cache:{key:string;map:SourceMap}|undefined;
  return async(e:MobileTelemetryEventV1,release:{
    status:string;revision?:number;sourceSha?:string;symbolsRef?:string;
    embeddedUpdateId?:string;nativeArtifactSha256?:string;
  }|undefined,environment:'preview'|'production',canLoad:()=>boolean=()=>true):Promise<MobileSymbolication>=>{
    if(!read)return {status:'disabled'};
    if(!e.stack||!release?.sourceSha||!release.symbolsRef||
      (e.platform!=='ios'&&e.platform!=='android')||
      (release.status!=='ota'&&release.status!=='embedded'))return {status:'unavailable'};
    const embedded=release.status==='embedded';
    const revision=embedded?0:release.revision;
    const updateId=embedded?release.embeddedUpdateId:e.updateId;
    if(revision===undefined||!updateId)return {status:'unavailable'};
    const scope:Scope={environment,platform:e.platform,runtime:e.runtime,updateId,
      revision,sourceSha:release.sourceSha,symbolsRef:release.symbolsRef,
      ...(embedded?{nativeBuild:e.build,nativeArtifactSha256:release.nativeArtifactSha256}:{})};
    const frames=e.stack.split('\n').filter(frame=>/ \(bundle(?:-[a-f0-9]{32,64})?:/.test(frame)).slice(0,50);
    if(!frames.length)return {status:'unavailable'};
    const resolved:string[]=[];
    // Maintain frame order; budget counts actual cache misses, not individual frames.
    const failed=new Set<string>();
    for(const frame of frames) {
      const id=/ \(bundle-([a-f0-9]{32}|[a-f0-9]{64}):/.exec(frame)?.[1];
      const key=JSON.stringify([scope,id??'']);
      if(failed.has(key))continue;
      try {
        if(cache?.key!==key) {
          if(!canLoad()){failed.add(key);continue;}
          cache={key,map:await loadMobileReleaseSourceMap(read,scope,id)};
        }
        const mapped=symbolicateMobileStack(frame,cache.map);
        if(mapped.stack)resolved.push(mapped.stack);
      }catch{failed.add(key);}
    }
    return resolved.length?{status:resolved.length===frames.length?'symbolicated':'partial',stack:resolved.join('\n')}:
      {status:failed.size?'unavailable':'unmapped'};
  };
}
