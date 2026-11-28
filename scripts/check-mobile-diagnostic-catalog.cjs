/* Static inventory/guard for reporter call sites. Never derive codes from runtime strings. */
const ts = require('typescript');
const fs = require('node:fs');
const pathModule = require('node:path');
const file = 'packages/types/src/contracts/mobileDiagnosticCatalog.ts';
const pairs = new Map();
const legacy = {GlobalJsError:'JS_UNHANDLED',ScreenOrientation:'SCREEN_ORIENTATION',SplashScreen:'SPLASH_SCREEN',FontLoad:'FONT_LOAD',MobileTelemetrySelfTest:'MOBILE_TELEMETRY_SELF_TEST',DogWalkGpsNoPoints:'GPS_WALK_NO_POINTS',DogWalkGpsInsufficientFix:'GPS_WALK_INSUFFICIENT_FIX',DogWalkGpsStorageUnavailable:'GPS_WALK_STORAGE_UNAVAILABLE',OtaSignatureRejected:'OTA_SIGNATURE_REJECTED',OtaMandatoryIncomplete:'OTA_MANDATORY_INCOMPLETE'};
const token = s => s.replace(/([a-z0-9])([A-Z])/g,'$1_$2').replace(/[^a-zA-Z0-9]+/g,'_').toUpperCase();
const literalValues = (node, source) => {
  if (!node) return [];
  if (ts.isStringLiteral(node)) return [node.text];
  if (ts.isConditionalExpression(node)) return [...literalValues(node.whenTrue,source),...literalValues(node.whenFalse,source)];
  // This action is explicitly typed as "read" | "mute" at its declaration.
  if (source.fileName.endsWith('/Chat2ListScreen.tsx') && node.getText(source)==='action') return ['read','mute'];
  throw Error('Non-static diagnostic identifier: '+source.fileName+' '+node.getText(source));
};
let calls=0;
function walk(dir) {
  return fs.readdirSync(dir,{withFileTypes:true}).flatMap(entry=>{
    if(entry.isSymbolicLink()||entry.name.startsWith('.')||['node_modules','dist','build','coverage'].includes(entry.name))return [];
    const name=pathModule.posix.join(dir,entry.name);
    return entry.isDirectory()?walk(name):[name];
  });
}
const paths=[...walk('apps/mobile/app'),...walk('apps/mobile/src')].filter(f=>/\.tsx?$/.test(f)&&!f.includes('.test.')&&!f.includes('.spec.')&&!f.endsWith('/reportClientError.ts'));

for(const path of paths) {
  const s=ts.createSourceFile(path,fs.readFileSync(path,'utf8'),ts.ScriptTarget.Latest,true);
  const reporters=new Set(['reportClientError','reportClientErrorAndWait']);
  const namespaces=new Set();
  const transportAliases=new Set(['enqueueMobileTelemetryError']);
  for(const statement of s.statements) {
    if(!ts.isImportDeclaration(statement)||!ts.isStringLiteral(statement.moduleSpecifier))continue;
    const named=statement.importClause?.namedBindings;
    if(!named)continue;
    if(ts.isNamespaceImport(named)&&/error-reporting/.test(statement.moduleSpecifier.text))namespaces.add(named.name.text);
    if(ts.isNamedImports(named))for(const imported of named.elements) {
      const exported=imported.propertyName?.text??imported.name.text;
      if(reporters.has(exported))reporters.add(imported.name.text);
      if(transportAliases.has(exported))transportAliases.add(imported.name.text);
    }
  }
  function isReporter(expr) {
    return ts.isIdentifier(expr)&&reporters.has(expr.text)||
      ts.isPropertyAccessExpression(expr)&&ts.isIdentifier(expr.expression)&&namespaces.has(expr.expression.text)&&reporters.has(expr.name.text);
  }
  const prop=(o,k)=>o&&ts.isObjectLiteralExpression(o)?o.properties.find(p=>p.name?.getText(s)===k)?.initializer:undefined;
  function visit(x){
    if(ts.isCallExpression(x)&&ts.isIdentifier(x.expression)&&transportAliases.has(x.expression.text)&&!path.endsWith('/nativeCrashCapture.ts'))
      throw Error('Direct diagnostic transport bypass: '+path);
    if(ts.isCallExpression(x)&&isReporter(x.expression)){
      calls++;
      const a=x.arguments[1], keys=literalValues(prop(a,'issueKey'),s);
      const operation=prop(prop(a,'keys'),'operation');
      const ops=operation?literalValues(operation,s):[''];
      if(!keys.length) throw Error('Missing issueKey: '+path);
      for(const key of keys) for(const op of ops) {
        const source=token(key);
        const code=legacy[key]??[source,token(op)].filter(Boolean).join('_');
        if(!/^[A-Z][A-Z0-9_]{0,63}$/.test(code)) throw Error('Invalid code '+code);
        const routeDomain = /training|course|favorite/i.test(key)?'training':/pet|vet|reminder/i.test(key)?'pets':/profile|partner/i.test(key)?'profile':/question/i.test(key)?'qa':/pay|purchase|subscription|promo/i.test(key)?'billing':/chat/i.test(key)?'chat2':/feed|moment/i.test(key)?'feed':/gallery|album/i.test(key)?'gallery':/ota|update/i.test(key)?'ota':/walk|gps/i.test(key)?'walk':/auth|login|register|password|session/i.test(key)?'auth':/article/i.test(key)?'articles':/guide/i.test(key)?'guides':/consult/i.test(key)?'consultations':'navigation';
        const domain=path.match(/\/features\/([^/]+)/)?.[1]??path.match(/\/entities\/([^/]+)/)?.[1]??(path.includes('/(auth)/')?'auth':path.includes('/app/')?routeDomain:'shared');
        const screen=path.includes('/app/')||/Screen\.tsx$/.test(path)?source:undefined;
        const id=key+':'+op;
        const existing=pairs.get(id);
        const entry={code,module:token(domain),...(screen?{screen}:{}),...(op?{operation:token(op)}:{})};
        if(existing && existing.module!==entry.module) entry.module='SHARED';
        if(existing && existing.screen!==entry.screen) delete entry.screen;
        pairs.set(id,entry);
      }
    }
    ts.forEachChild(x,visit);
  }visit(s);
}
// Self-test passes reporter as a callback; retain this explicit registration.
pairs.set('MobileTelemetrySelfTest:',{code:'MOBILE_TELEMETRY_SELF_TEST',module:'SHARED'});
// Keep historical sources: old installed bundles still submit their original codes.
if(fs.existsSync(file)) {
  for(const line of fs.readFileSync(file,'utf8').split('\n')) {
    if(!/^  "/.test(line)) continue;
    const [id,entry]=Object.entries(JSON.parse('{'+line.trim().replace(/,$/,'')+'}'))[0];
    if(!pairs.has(id)) pairs.set(id,entry);
    else if(JSON.stringify(pairs.get(id))!==JSON.stringify(entry))
      throw Error('Existing diagnostic source changed: '+id+'; preserve its published metadata or introduce a new issueKey.');
  }
}
const output='/** Static allowlist for mobile diagnostic sources. Maintained by check-mobile-diagnostic-catalog.cjs. */\nexport const mobileDiagnosticCatalog = '+'{\n'+[...pairs].sort(([a],[b])=>a<b?-1:a>b?1:0).map(([id,entry])=>'  '+JSON.stringify(id)+': '+JSON.stringify(entry)+',').join('\n')+'\n}'+' as const;\n';
if(process.argv.includes('--write'))fs.writeFileSync(file,output);
else if(fs.readFileSync(file,'utf8')!==output)throw Error('Mobile diagnostic catalog is stale; review new static codes and regenerate.');
console.log(calls+' reporter calls; '+pairs.size+' static diagnostic sources');
