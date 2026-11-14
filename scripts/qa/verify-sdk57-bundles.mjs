#!/usr/bin/env node
/** Reproducible SDK57 graph proof from *actual* Metro/Hermes source maps.
 * Does not contact Expo, stores, Uptrace, S3 or the user account. */
import fs from 'node:fs';
import path from 'node:path';
const ROOT = path.resolve(import.meta.dirname,'../..');
const MOBILE = path.join(ROOT,'apps/mobile');
const mobile = JSON.parse(fs.readFileSync(path.join(MOBILE,'package.json'),'utf8'));
const root = JSON.parse(fs.readFileSync(path.join(ROOT,'package.json'),'utf8'));
const config = JSON.parse(fs.readFileSync(path.join(MOBILE,'app.json'),'utf8')).expo;
const expected = {
  'expo':'57.0.33','react-native':'0.86.3','react':'19.2.3',
  'expo-router':'57.0.31','expo-modules-core':'57.0.26','react-native-worklets':'0.10.1',
};
const fail=(message)=>{throw Error('SDK57_RELEASE_GRAPH_FAILED:'+message);};
if(mobile.version!==config.version || config.runtimeVersion?.policy!=='appVersion' || config.version!=='1.8.0')fail('RUNTIME');
if(root.dependencies?.['react-native']!==expected['react-native'] ||
   root.dependencies?.react!==expected.react)fail('ROOT_PEERS');
if(mobile.dependencies?.['@react-navigation/native'])fail('ROUTER_DIRECT_DEPENDENCY');
const proof={appVersion:mobile.version,expo:mobile.dependencies.expo,
  ios:{},android:{},checkedAt:new Date().toISOString()};
for(const platform of ['ios','android']) {
  const exported=path.join(ROOT,'.qa/sdk57/export-'+platform);
  const assetRoot=path.join(exported,'_expo/static/js',platform);
  if(!fs.existsSync(assetRoot))fail('MISSING_EXPORT_'+platform);
  const names=fs.readdirSync(assetRoot);
  const maps=names.filter(n=>n.endsWith('.hbc.map'));
  const binaries=names.filter(n=>n.endsWith('.hbc'));
  if(!maps.length || maps.length!==binaries.length)fail('HERMES_SOURCEMAP_'+platform);
  const sources=[];
  for(const name of maps) {
    const data=JSON.parse(fs.readFileSync(path.join(assetRoot,name),'utf8'));
    if(data.version!==3 || !Array.isArray(data.sources) || !data.sources.length)fail('SOURCEMAP_SCHEMA_'+platform);
    sources.push(...data.sources);
  }
  const actual={};
  for(const [name,version] of Object.entries(expected)){
    const escaped=name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    const matcher=new RegExp('/\\.pnpm/'+escaped+'@([^/_]+)');
    const found=[...new Set(sources.flatMap(s=>{const match=s.match(matcher);return match?[match[1]]:[]}))];
    if(found.length!==1||found[0]!==version)fail('DUPLICATE_OR_WRONG_'+platform+'_'+name+':'+found.join(','));
    actual[name]=version;
  }
  const hbcBytes=binaries.reduce((sum,file)=>sum+fs.statSync(path.join(assetRoot,file)).size,0);
  if(hbcBytes<200_000)fail('HERMES_BUNDLE_TOO_SMALL_'+platform);
  proof[platform]={packages:actual,sourceFiles:sources.length,hermesBundles:binaries.length,
    hermesBytes:hbcBytes,sourceMaps:maps.length};
}
if(mobile.dependencies['react-native']!==expected['react-native']||mobile.dependencies.react!==expected.react)fail('MOBILE_PEERS');
console.log(JSON.stringify(proof,null,2));
