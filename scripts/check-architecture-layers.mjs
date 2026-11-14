#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const baseline=path.join(root,'docs/audit/architecture-boundary-baseline.json');
const skip=new Set(['node_modules','dist','coverage','.git','build','.turbo']);
function* files(dir){if(!fs.existsSync(dir))return;for(const entry of fs.readdirSync(dir,{withFileTypes:true})){if(skip.has(entry.name)||entry.name.startsWith('.'))continue;const p=path.join(dir,entry.name);if(entry.isDirectory())yield* files(p);else if(/\.[cm]?[jt]sx?$/.test(p)&&!/(?:\.test|\.spec|\.integration|\.contract)\.[cm]?[jt]sx?$/.test(p))yield p;}}
function imports(file) {
  const source = fs.readFileSync(file, 'utf8');
  const imported = new Set(ts.preProcessFile(source, true, true).importedFiles.map(x => x.fileName));
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true,
    file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  function visit(node) {
    if (ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        ts.isIdentifier(node.expression) && node.expression.text === 'require')) {
      const arg = node.arguments[0];
      if (arg && (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg)))
        imported.add(arg.text);
      else imported.add('<computed-module-specifier>');
    } else if (ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference) &&
      ts.isStringLiteral(node.moduleReference.expression)) {
      imported.add(node.moduleReference.expression.text);
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  return [...imported];
}
export function audit(base=root){const found=[];const manifests=new Map();for(const file of files(path.join(base,'apps/api/src')))inspect(file);for(const file of files(path.join(base,'packages')))inspect(file);function inspect(file){const rel=path.relative(base,file).split(path.sep).join('/');const pkg=rel.startsWith('packages/')?rel.split('/')[1]:null;for(const spec of imports(file)){const add=(rule)=>found.push({rule,file:rel,import:spec});if(spec==='<computed-module-specifier>'&&(rel.startsWith('packages/core/src/')||rel.startsWith('apps/api/src/routes/')||/\/(?:domain|application)\//.test(rel)))add('computed-module-import');const orm=/^(?:@gafus\/prisma|@prisma\/client)(?:\/|$)/.test(spec);if(rel.startsWith('apps/api/src/routes/')&&orm)add('route-prisma');if(rel.startsWith('packages/core/src/')&&orm)add('core-prisma-direct');if(/\/domain\//.test(rel)&&/^(?:@gafus\/prisma|@prisma\/client|hono|bullmq|ioredis|@aws-sdk\/|@gafus\/queues)(?:\/|$)/.test(spec))add('domain-infrastructure');if(/\/application\//.test(rel)&&/^(?:@gafus\/prisma|@prisma\/client|hono|bullmq|ioredis|@aws-sdk\/)(?:\/|$)/.test(spec))add('application-infrastructure');if(pkg&&spec.startsWith('.')&&!path.resolve(path.dirname(file),spec).startsWith(path.join(base,'packages',pkg)+path.sep))add('cross-package-relative');if(spec.startsWith('@gafus/')){const parts=spec.slice(7).split('/');const name=parts.shift();const pj=path.join(base,'packages',name,'package.json');if(parts.length&&fs.existsSync(pj)){if(!manifests.has(name))manifests.set(name,JSON.parse(fs.readFileSync(pj,'utf8')));const exp=manifests.get(name).exports;const sub='./'+parts.join('/');if(exp&&!Object.hasOwn(exp,sub)&&!Object.keys(exp).some(k=>k.endsWith('/*')&&sub.startsWith(k.slice(0,-1))))add('private-package-import');}}}if(rel.startsWith('apps/api/src/routes/')&&/\.\$(?:query|execute)Raw/.test(fs.readFileSync(file,'utf8')))found.push({rule:'route-raw-sql',file:rel,import:'(query)'});}const graph=new Map();
const allPackages=path.join(base,'packages');
if(fs.existsSync(allPackages))for(const pkg of fs.readdirSync(allPackages)){
  const packageJson=path.join(allPackages,pkg,'package.json');
  if(!fs.existsSync(packageJson))continue;
  const manifest=JSON.parse(fs.readFileSync(packageJson,'utf8'));
  const edges=Object.keys({...manifest.dependencies,...manifest.peerDependencies})
    .filter(x=>x.startsWith('@gafus/')).map(x=>x.slice(7));
  graph.set(pkg,edges);
}
// Core's unit/integration tests may depend on Prisma; its shipped runtime must not.
const coreManifestPath=path.join(allPackages,'core','package.json');
if(fs.existsSync(coreManifestPath)){
 const manifest=JSON.parse(fs.readFileSync(coreManifestPath,'utf8'));
 if(Object.hasOwn(manifest.dependencies??{},'@gafus/prisma'))
  found.push({rule:'core-production-prisma-dependency',file:'packages/core/package.json',import:'@gafus/prisma'});
}
const visited=new Set(), stack=[], cycles=new Set();
function visit(name){
 if(stack.includes(name)){
  const cycle=stack.slice(stack.indexOf(name));
  const variants=cycle.map((_,i)=>[...cycle.slice(i),...cycle.slice(0,i)].join(' -> '));
  cycles.add(variants.sort()[0]);return;
 }
 if(visited.has(name))return;
 stack.push(name);
 for(const next of graph.get(name)||[])if(graph.has(next))visit(next);
 stack.pop();visited.add(name);
}
for(const name of graph.keys())visit(name);
for(const cycle of cycles)found.push({rule:'workspace-dependency-cycle',file:'packages',import:cycle});
return found.sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));}
const key=x=>JSON.stringify(x);
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){const now=audit();if(process.argv.includes('--write-baseline')){if(process.env.ALLOW_ARCH_BASELINE_UPDATE!=='1')throw Error('Baseline regeneration requires explicit review');fs.mkdirSync(path.dirname(baseline),{recursive:true});fs.writeFileSync(baseline,JSON.stringify({version:1,violations:now},null,2)+'\n');console.log('Wrote architecture baseline:',now.length);}else{const old=JSON.parse(fs.readFileSync(baseline,'utf8')).violations;const known=new Set(old.map(key));const current=new Set(now.map(key));const added=now.filter(x=>!known.has(key(x)));const removed=old.filter(x=>!current.has(key(x)));console.log('Architecture check:',now.length,'existing,',removed.length,'resolved,',added.length,'new');if(added.length){console.error(added.map(key).join('\n'));process.exitCode=1;}}}
