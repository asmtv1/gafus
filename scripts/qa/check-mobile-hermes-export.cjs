/** Offline check of actual Expo/Hermes export output. Never uses release or
 * cloud credentials and never uploads source maps or changes the registry. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const ts=require('typescript');
const Module=require('node:module');
function source(file){
  const name=path.resolve(file),m=new Module(name,module);
  m.filename=name;m.paths=Module._nodeModulePaths(path.dirname(name));
  const original=m.require.bind(m);
  m.require=id=>id.startsWith('.')&&fs.existsSync(path.resolve(path.dirname(name),id+'.ts'))?
    source(path.resolve(path.dirname(name),id+'.ts')):original(id);
  m._compile(ts.transpileModule(fs.readFileSync(name,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,name);
  return m.exports;
}
const {sanitizeMobileStack}=source('packages/types/src/contracts/mobileTelemetry.ts');
const {createMobileSymbolicator}=source('packages/worker/src/mobile-telemetry-symbolication.ts');
const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function vlq(value){
  const values=[];let n=0,shift=0;
  for(const c of value){
    const digit=alphabet.indexOf(c);assert.ok(digit>=0);
    n+=(digit&31)*2**shift;
    if(digit&32)shift+=5;
    else {values.push((n&1)?-Math.floor(n/2):Math.floor(n/2));n=0;shift=0;}
  }
  return values;
}
function locate(map){
  let sourceIndex=0,originalLine=0,originalColumn=0;
  let line=0;
  for(const row of map.mappings.split(';')){
    line++;let column=0;
    for(const segment of row.split(',')){
      if(!segment)continue;
      const values=vlq(segment);column+=values[0];
      if(values.length<4)continue;
      sourceIndex+=values[1];originalLine+=values[2];originalColumn+=values[3];
      if(map.sources[sourceIndex]?.endsWith('/shared/lib/error-reporting/reportClientError.ts'))
        return {line,column,originalLine:originalLine+1,originalColumn:originalColumn+1};
    }
  }
  throw Error('Missing reporter mapping');
}
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
(async()=>{
  const root=process.argv[2];
  assert.ok(root,'USAGE: check-mobile-hermes-export.cjs <export-directory>');
  for(const platform of ['ios','android']){
    const folder=path.join(root,'_expo/static/js',platform);
    const name=fs.readdirSync(folder).find(x=>/^widget-entry-[a-f0-9]{32}\.hbc\.map$/.test(x));
    assert.ok(name);
    const bundle=name.slice(0,-4);
    const header=Buffer.alloc(8);const fd=fs.openSync(path.join(folder,bundle),'r');
    try {fs.readSync(fd,header);}finally{fs.closeSync(fd);}
    assert.equal(header.toString('hex'),'c61fbc03c103191f');
    const bytes=fs.readFileSync(path.join(folder,name)),map=JSON.parse(bytes);
    assert.ok(map.x_hermes_function_offsets,'expected composed Hermes source map');
    const location=locate(map);
    const updateId=crypto.randomUUID(),runtime='1.7.6',sourceSha='a'.repeat(40),revision=1;
    const manifest=Buffer.from(JSON.stringify({schemaVersion:1,private:true,retentionClass:'release-symbols',
      environment:'preview',platform,runtimeVersion:runtime,updateId,revision,sourceSha,
      maps:[{filename:sha(bytes)+'.map',sha256:sha(bytes),sizeBytes:bytes.length,logicalBundle:bundle}]}));
    const symbolsRef='symbols-s3:'+sha(manifest);
    const reader=async key=>key.endsWith('manifest.json')?manifest:bytes;
    const stack=sanitizeMobileStack('at report (address at '+bundle+':'+location.line+':'+location.column+')');
    const result=await createMobileSymbolicator(reader)({platform,runtime,updateId,stack,build:'1'},
      {status:'ota',revision,sourceSha,symbolsRef},'preview');
    assert.equal(result.status,'symbolicated');
    assert.match(result.stack,new RegExp('apps/mobile/src/shared/lib/error-reporting/reportClientError.ts:'+location.originalLine+':'+location.originalColumn+'\\)$'));
    console.log(platform+' PASS real Hermes bytecode + '+map.sources.length+' sources; offset '+location.column+' -> reporter.ts:'+location.originalLine+':'+location.originalColumn);
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
