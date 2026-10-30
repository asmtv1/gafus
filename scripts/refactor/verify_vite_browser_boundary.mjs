#!/usr/bin/env node
/** AG4-ROOT-031 browser boundary: reachable runtime modules, no imports executed. */
import fs from 'node:fs';
import path from 'node:path';
import {builtinModules} from 'node:module';
import {fileURLToPath} from 'node:url';
import ts from 'typescript';
export const ROOT=path.resolve(fileURLToPath(new URL('../..',import.meta.url)));
const entries=[
 ['Web Vite','apps/web-vite/src/main.tsx','apps/web-vite/index.html','apps/web-vite/public','apps/web-vite/vite.config.mjs'],
 ['Trainer Vite opt-in','apps/trainer-panel/src/vite-preparation/main.tsx','apps/trainer-panel/src/vite-preparation/index.html','apps/trainer-panel/public','apps/trainer-panel/src/vite-preparation/vite.config.ts'],
 ['Admin Vite opt-in','apps/admin-panel/src/vite-preparation/main.tsx','apps/admin-panel/src/vite-preparation/index.html','apps/admin-panel/public','apps/admin-panel/src/vite-preparation/vite.config.ts'],
];
const ext=['.ts','.tsx','.js','.jsx','.mjs','.mts','.cjs','.json','.css'];
const builtins=new Set(builtinModules.map(x=>x.replace(/^node:/,'')));
const server=/^(?:next(?:\/|$)|server-only$|@prisma\/client(?:\/|$)|@gafus\/(?:core|prisma|logger|queues|mailer|auth|server|webpush|worker|api)(?:\/|$)|prisma(?:\/|$)|dotenv(?:\/|$))/;
const denied=/(?:AG4AdminConsultationNavShell20261021\.scoped\.test\.tsx|AG4CancellationReceiptReview20261021\.scoped(?:\.test)?\.ts)$/;
// A workspace import is browser-safe only when it is explicitly declared by
// the importing package, exported by the destination package, and in this
// deliberately small reviewed client allowlist. Server packages remain denied.
const browserWorkspaces=new Map([
 ['types',new Set(['.','./training-client'])],
 ['core-client',null], // full published client-only exports checked by core-client graph guard
 ['consultation-shared',null],
 ['cdn-upload',new Set(['./utils'])],
 ['chat-media-quality',new Set(['.'])],
 ['ui-components',new Set(['./cookie-consent','./voximplant-room'])],
]);
function allowRuntimeWorkspace(spec,file){
 if(!/^(?:apps|packages)\/[a-z0-9-]+\/src\//.test(file))return false;
 const parts=spec.split('/');if(parts[0]!=='@gafus'||!parts[1])return false;
 const name=parts[1],allowed=browserWorkspaces.get(name);
 if(!browserWorkspaces.has(name))return false;
 const entry=parts.length===2?'.':'./'+parts.slice(2).join('/');
 if(allowed&&!allowed.has(entry))return false;
 const origin=file.split('/').slice(0,2).join('/');
 const originManifest=path.join(ROOT,origin,'package.json');
 const destinationManifest=path.join(ROOT,'packages',name,'package.json');
 if(!fs.existsSync(originManifest)||!fs.existsSync(destinationManifest))return false;
 const from=JSON.parse(fs.readFileSync(originManifest,'utf8'));
 const to=JSON.parse(fs.readFileSync(destinationManifest,'utf8'));
 if(!Object.hasOwn({...from.dependencies,...from.devDependencies},'@gafus/'+name))return false;
 return Boolean(to.exports?.[entry]);
}

const violation=(code,file,issue)=>({code,file,issue});
const slash=x=>x.split(path.sep).join('/');
function safe(root,p){
 const abs=path.resolve(p);
 if(abs!==root&&!abs.startsWith(root+path.sep))throw Error('OUTSIDE_PROJECT_PATH');
 if(denied.test(abs))throw Error('DENIED_PATH');
 let curr=root;
 for(const part of path.relative(root,abs).split(path.sep).filter(Boolean)){
  curr=path.join(curr,part);
  if(fs.existsSync(curr)&&fs.lstatSync(curr).isSymbolicLink())throw Error('SYMLINK_PATH');
 }
 return abs;
}
export function checkSpecifier(s,file='<fixture>.ts'){
 if(s.startsWith('node:')||builtins.has(s)||builtins.has(s.split('/')[0]))return 'NODE_IMPORT';
 if(server.test(s))return 'SERVER_IMPORT';
 if(s.startsWith('@gafus/'))return allowRuntimeWorkspace(s,file)?null:'UNINSPECTED_WORKSPACE_RUNTIME_IMPORT';
 if(s.startsWith('@/')||s.startsWith('~/')||s.startsWith('@trainer-panel/')||
  s.startsWith('@shared/')||s.startsWith('@features/'))return 'UNRESOLVED_LOCAL_ALIAS';
 return null;
}
export function inspect(code,file='<fixture>.ts'){
 const ast=ts.createSourceFile(file,code,ts.ScriptTarget.Latest,true,
   file.endsWith('.tsx')?ts.ScriptKind.TSX:file.endsWith('.jsx')?ts.ScriptKind.JSX:ts.ScriptKind.TS);
 const imports=[],violations=[];
 const add=spec=>{const problem=checkSpecifier(spec,file);
  if(problem)violations.push(violation(problem,file,spec));else imports.push(spec);};
 function visit(node){
  if(ts.isImportDeclaration(node)&&ts.isStringLiteral(node.moduleSpecifier)){
   const c=node.importClause;
   const typeOnly=!!c?.isTypeOnly||!!(c?.namedBindings&&ts.isNamedImports(c.namedBindings)&&
     !c.name&&c.namedBindings.elements.length>0&&c.namedBindings.elements.every(e=>e.isTypeOnly));
   if(!typeOnly)add(node.moduleSpecifier.text);
  }
  if(ts.isExportDeclaration(node)&&node.moduleSpecifier&&ts.isStringLiteral(node.moduleSpecifier)){
   const names=node.exportClause&&ts.isNamedExports(node.exportClause)?node.exportClause.elements:null;
   if(!node.isTypeOnly&&!(names&&names.length&&names.every(x=>x.isTypeOnly)))add(node.moduleSpecifier.text);
  }
  if(ts.isCallExpression(node)){
   const isDynamic=node.expression.kind===ts.SyntaxKind.ImportKeyword||
     ts.isIdentifier(node.expression)&&node.expression.text==='require';
   if(isDynamic){const arg=node.arguments[0];
    if(arg&&(ts.isStringLiteral(arg)||ts.isNoSubstitutionTemplateLiteral(arg)))add(arg.text);
    else violations.push(violation('DYNAMIC_IMPORT',file,'nonliteral import/require'));
   }
   const called=node.expression.getText(ast);
   if(/^import\.meta\.glob(?:Eager)?$/.test(called))
     violations.push(violation('UNRESOLVED_GLOB',file,called));
   if(/(?:^|\.)serviceWorker\.register$|(?:^|\.)pushManager\.subscribe$/.test(called)){
     const pushOnly=file==='apps/web-vite/src/features/profile/browserPushEnrollment.ts';
     const isPushRegister=called.endsWith('serviceWorker.register')&&
       node.arguments[0]&&ts.isStringLiteral(node.arguments[0])&&node.arguments[0].text==='/push-sw.js';
     const isPushSubscribe=called.endsWith('pushManager.subscribe');
     if(!pushOnly||!(isPushRegister||isPushSubscribe))
       violations.push(violation('PWA_REGISTER',file,called));
    }
  }
  ts.forEachChild(node,visit);
 }
 visit(ast);
 return {imports,violations};
}
function local(root,from,s){
 const p=safe(root,path.resolve(path.dirname(from),s.replace(/\?(?:raw|url)$/,'')));
 for(const candidate of [p,...ext.map(e=>p+e),...ext.map(e=>path.join(p,'index'+e))]){
  safe(root,candidate);
  if(fs.existsSync(candidate)&&fs.lstatSync(candidate).isFile())return candidate;
 }
 return null;
}
export function inspectViteConfig(code,file='<vite.config>'){
 const ast=ts.createSourceFile(file,code,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
 const violations=[];
 const pwaSpec=/^(?:vite-plugin-pwa|@vite-pwa\/|workbox-|next-pwa)(?:\/|$)/i;
 function visit(node){
  if((ts.isImportDeclaration(node)||ts.isExportDeclaration(node))&&node.moduleSpecifier&&
     ts.isStringLiteral(node.moduleSpecifier)&&pwaSpec.test(node.moduleSpecifier.text))
    violations.push(violation('VITE_PWA_PLUGIN',file,node.moduleSpecifier.text));
  if(ts.isCallExpression(node)){
   if(ts.isIdentifier(node.expression)&&/^(?:VitePWA|GenerateSW|InjectManifest)$/.test(node.expression.text))
    violations.push(violation('VITE_PWA_PLUGIN',file,node.expression.text));
   const arg=node.arguments[0];
   if(ts.isIdentifier(node.expression)&&node.expression.text==='require'&&
     arg&&ts.isStringLiteral(arg)&&pwaSpec.test(arg.text))
    violations.push(violation('VITE_PWA_PLUGIN',file,arg.text));
  }
  ts.forEachChild(node,visit);
 }
 visit(ast);return violations;
}
function assets(root,publicDir){
 const result=[],base=safe(root,path.join(root,publicDir));
 if(!fs.existsSync(base))return result;
 function walk(d){for(const name of fs.readdirSync(d).sort()){
  const p=safe(root,path.join(d,name));const st=fs.lstatSync(p);
  if(st.isDirectory())walk(p);
  else if(st.isFile()&&/^(?:manifest\.(?:json|webmanifest)|site\.webmanifest|sw\.js|service-worker\.[cm]?js|workbox-[^/]+\.[cm]?js)$/i.test(name))
    result.push(violation('PWA_ASSET',slash(path.relative(root,p)),name));
 }}walk(base);return result;
}
export function audit({root=ROOT,targets=entries,read=p=>fs.readFileSync(p,'utf8')}={}){
 const seen=new Set(),violations=[],counts={};root=path.resolve(root);
 for(const [name,entry,html,pub,config] of targets){
  const start=safe(root,path.join(root,entry));const index=safe(root,path.join(root,html));
  counts[name]=0;
  if(!fs.existsSync(start)||!fs.existsSync(index)){
   if(name.endsWith(' opt-in')&&!fs.existsSync(start)&&!fs.existsSync(index))continue;
   violations.push(violation('MISSING_ENTRY',entry,html));continue;
  }
  const h=read(index);
  const moduleScripts=[...h.matchAll(/<script\b[^>]*>/gi)]
   .map(x=>x[0]).filter(x=>/\btype\s*=\s*['"]module['"]/i.test(x))
   .map(x=>x.match(/\bsrc\s*=\s*['"]([^'"]+)['"]/i)?.[1]??null);
  const expected='/'+slash(path.relative(path.dirname(index),start));
  if(moduleScripts.length!==1||moduleScripts[0]!==expected)
    violations.push(violation('ENTRY_HTML_MISMATCH',html,'expected module '+expected));
  if(/<link\b[^>]*\brel\s*=\s*['"]?manifest\b/i.test(h))
    violations.push(violation('PWA_MANIFEST_HTML',html,'manifest link'));
  if(/<meta\b[^>]*\bname\s*=\s*['"](?:apple-mobile-web-app-capable|mobile-web-app-capable)['"]/i.test(h))
    violations.push(violation('PWA_INSTALL_HTML',html,'install hint'));
  if(/(?:navigator\.)?serviceWorker\s*\.\s*register\s*\(|pushManager\s*\.\s*subscribe\s*\(/i.test(h))
    violations.push(violation('PWA_INLINE_HTML',html,'inline PWA registration'));
  violations.push(...assets(root,pub));
  if(config){
   const file=safe(root,path.join(root,config));
   if(!fs.existsSync(file))violations.push(violation('MISSING_VITE_CONFIG',config,'missing'));
   else violations.push(...inspectViteConfig(read(file),config));
  }
  const todo=[start];
  while(todo.length){
   const file=safe(root,todo.pop());if(seen.has(file))continue;
   seen.add(file);counts[name]++;
   if(['.css','.json'].includes(path.extname(file)))continue;
   const rel=slash(path.relative(root,file));const scan=inspect(read(file),rel);
   violations.push(...scan.violations);
   for(const spec of scan.imports){
    if(!spec.startsWith('.'))continue;
    const next=local(root,file,spec);
    if(!next)violations.push(violation('MISSING_RELATIVE',rel,spec));
    else todo.push(next);
   }
  }
 }
 return {ok:violations.length===0,counts,modules:seen.size,violations};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const result=audit();console.log('ENTRIES '+JSON.stringify(result.counts)+' MODULES '+result.modules);
 for(const error of result.violations)console.error(error.code+' '+error.file+' '+error.issue);
 console.log(result.ok?'BROWSER_BOUNDARY_PASS':'BROWSER_BOUNDARY_FAIL '+result.violations.length);
 if(!result.ok)process.exitCode=1;
}
