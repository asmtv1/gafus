#!/usr/bin/env node
/** Explicitly selected, checksum-pinned NONDEPLOY Vite artifact curation. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const acorn=require('acorn');
const postcss=require('postcss');
const valueParser=require('postcss-value-parser');
const root='/Users/asmtv1/Desktop/gafus-refactor';
const own=path.dirname(fileURLToPath(import.meta.url));
const fail=(code)=>{throw Error(code)};
function confined(p,exists=true){
 if(!path.isAbsolute(p))fail('ABSOLUTE_PATH_REQUIRED');
 const q=path.resolve(p);
 if(!q.startsWith(root+path.sep))fail('OUTSIDE_ROOT');
 let cur=root;
 for(const part of path.relative(root,q).split(path.sep)){
  if(!part)continue;
  cur=path.join(cur,part);
  if(fs.existsSync(cur)||fs.lstatSync(cur,{throwIfNoEntry:false})){
   const st=fs.lstatSync(cur);if(st.isSymbolicLink())fail('SYMLINK_DENIED');
  }else if(exists)fail('MISSING_PATH');
 }
 return q;
}
const sha=(bytes)=>crypto.createHash('sha256').update(bytes).digest('hex');
const allowed=/^assets\/[A-Za-z0-9][A-Za-z0-9_.-]*\.(?:js|css|png|jpg|jpeg|webp|svg|ico|woff|woff2|avif)$/;
const fingerprint=/^assets\/[A-Za-z0-9][A-Za-z0-9_.-]*-[A-Za-z0-9_-]{6,}\.(?:js|css|png|jpg|jpeg|webp|svg|ico|woff|woff2|avif)$/;
function walk(dir,prefix=''){
 const out=[];
 for(const item of fs.readdirSync(dir,{withFileTypes:true})){
  if(item.name.startsWith('.')||item.name==='node_modules'||item.name.includes('%'))fail('HIDDEN_OR_ENCODED_PATH');
  const relative=prefix+item.name, full=path.join(dir,item.name);
  if(item.isSymbolicLink())fail('SYMLINK_DENIED');
  if(item.isDirectory()){if(relative!=='assets')fail('UNSUPPORTED_DIRECTORY');out.push(...walk(full,relative+'/'));}
  else if(item.isFile())out.push(relative);
  else fail('UNSUPPORTED_ENTRY');
 }
 return out;
}
function htmlRefs(content){
 // Fail closed on nontrivial HTML; no permissive regex-based certification of arbitrary URL encoding.
 if(/&#|%[0-9a-f]{2}|\\|<base\b|<iframe\b|<object\b|<embed\b|<img\b|<video\b|<audio\b|<source\b|\bsrcset\b|\bstyle\s*=|@import|url\s*\(|<meta\b[^>]*http-equiv/i.test(content))fail('UNSUPPORTED_HTML_REFERENCE');
 const refs=[];
 const tags=[...content.matchAll(/<(script|link)\b([^>]*)>/gi)];
 for(const [,tag,attrs] of tags){
  const a=[...attrs.matchAll(/\b([a-zA-Z-]+)\s*=\s*(["'])(.*?)\2/g)];
  if(/=/.test(attrs.replace(/\b[a-zA-Z-]+\s*=\s*(["'])(.*?)\1/g,'')))fail('UNQUOTED_HTML_ATTRIBUTE');
  const obj=Object.fromEntries(a.map(x=>[x[1].toLowerCase(),x[3]]));
  if(tag.toLowerCase()==='script'&&(!obj.src||obj.type!=='module'||Object.keys(obj).some(k=>!['src','type','crossorigin'].includes(k))))fail('UNSUPPORTED_SCRIPT');
  if(tag.toLowerCase()==='link'&&(!['stylesheet','modulepreload'].includes(obj.rel)||!obj.href||Object.keys(obj).some(k=>!['href','rel','crossorigin'].includes(k))))fail('UNSUPPORTED_LINK');
  const u=tag.toLowerCase()==='script'?obj.src:obj.href;
  if(!/^\/assets\/[A-Za-z0-9_.-]+\.(?:js|css)$/.test(u)||u.includes('..'))fail('EXTERNAL_OR_UNSAFE_REFERENCE');
  refs.push(u.slice(1));
 }
 if(!refs.length)fail('MISSING_REFERENCES');
 if(/<script\b/i.test(content)&&!tags.some(x=>x[1].toLowerCase()==='script'))fail('SCRIPT_PARSE_INCOMPLETE');
 if(/<link\b/i.test(content)&&!tags.some(x=>x[1].toLowerCase()==='link'))fail('LINK_PARSE_INCOMPLETE');
 return refs;
}
// Dependency graph, not a general application security checker. Parse code, never execute it.
function localRef(from,raw,extensions){
 if(typeof raw!=='string'||!raw||/[\\%?#\x00-\x1f]/.test(raw)||raw.includes('..')||raw.includes('//')||/^[a-z][a-z0-9+.-]*:/i.test(raw))fail('UNSUPPORTED_ASSET_REFERENCE');
 if(!raw.startsWith('./')&&!raw.startsWith('/assets/'))fail('EXTERNAL_OR_NONLOCAL_DEPENDENCY');
 const target=raw.startsWith('/assets/')?raw.slice(1):path.posix.normalize(path.posix.join(path.posix.dirname(from),raw));
 if(!allowed.test(target)||!fingerprint.test(target)||!extensions.some(ext=>target.endsWith(ext)))fail('UNSUPPORTED_DEPENDENCY_TYPE');
 return target;
}
function jsDependencies(name,source){
 let ast;try{ast=acorn.parse(source,{ecmaVersion:'latest',sourceType:'module',allowHashBang:false})}catch{fail('UNSUPPORTED_JS_SYNTAX')}
 const refs=[];
 function visit(node){
  if(!node||typeof node!=='object')return;
  if(node.type==='ImportDeclaration'||(node.type==='ExportNamedDeclaration'||node.type==='ExportAllDeclaration')&&node.source){
   refs.push(localRef(name,node.source.value,['.js','.css']));
  }
  if(node.type==='ImportExpression'){
   if(node.source?.type!=='Literal'||typeof node.source.value!=='string'||node.options)fail('NONLITERAL_DYNAMIC_IMPORT');
   refs.push(localRef(name,node.source.value,['.js']));
  }
  // URL runtime construction is not itself a static dependency. Asset URL factories using
  // import.meta.url MUST NOT be silently ignored, since they can reference copied files.
  if(node.type==='NewExpression'&&node.callee?.name==='URL'){
   const containsImportMeta=x=>x&&typeof x==='object'&&(x.type==='MetaProperty'&&x.meta?.name==='import'&&x.property?.name==='meta'||Object.values(x).some(v=>Array.isArray(v)?v.some(containsImportMeta):containsImportMeta(v)));
   if(node.arguments.some(containsImportMeta))fail('UNSUPPORTED_NEW_URL_ASSET');
  }
  for(const [key,value] of Object.entries(node)){
   if(key==='start'||key==='end'||key==='loc')continue;
   if(Array.isArray(value))value.forEach(v=>v&&typeof v==='object'&&visit(v));
   else if(value&&typeof value==='object')visit(value);
  }
 }
 visit(ast);return refs;
}
function cssDependencies(name,source){
 let ast;try{ast=postcss.parse(source,{from:undefined})}catch{fail('UNSUPPORTED_CSS_SYNTAX')}
 const refs=[];
 function parseUrl(raw,exts){
  const value=raw.trim();
  if(!value||/['"\\]/.test(value)||valueParser(value).nodes.length!==1||valueParser(value).nodes[0].type!=='word')fail('UNSUPPORTED_CSS_URL');
  refs.push(localRef(name,value,exts));
 }
 ast.walkAtRules(rule=>{
  if(rule.name.toLowerCase()==='import'){
   const tokens=valueParser(rule.params).nodes.filter(n=>n.type!=='space'&&n.type!=='comment');
   if(tokens.length!==1||tokens[0].type!=='string')fail('UNSUPPORTED_CSS_IMPORT');
   refs.push(localRef(name,tokens[0].value,['.css']));
  }
 });
 ast.walkDecls(decl=>{
  const parsed=valueParser(decl.value);
  parsed.walk(node=>{
   if(node.type==='function'&&node.value.toLowerCase()==='url'){
    if(node.nodes.length!==1||!['word','string'].includes(node.nodes[0].type))fail('UNSUPPORTED_CSS_URL');
    const v=node.nodes[0].value;
    if(/[\\%?#\x00-\x1f]/.test(v))fail('UNSUPPORTED_CSS_URL');
    refs.push(localRef(name,v,['.woff','.woff2','.png','.jpg','.jpeg','.webp','.svg','.ico','.avif']));
    return false;
   }
  });
 });
 return refs;
}
function validate(input,manifestPath){
 const source=confined(input),manifestFile=confined(manifestPath);
 if(!fs.statSync(source).isDirectory()||!fs.statSync(manifestFile).isFile())fail('INPUT_TYPE');
 const manifest=JSON.parse(fs.readFileSync(manifestFile,'utf8'));
 if(manifest.schema!=='ag4-static-artifact-hashes-v1'||!Array.isArray(manifest.files)||Object.keys(manifest).sort().join()!=='files,schema')fail('BAD_MANIFEST');
 const actual=walk(source).sort();
 if(!actual.includes('index.html')||actual.length<2||actual.filter(x=>x!=='index.html').some(x=>!allowed.test(x)||!fingerprint.test(x)))fail('UNSUPPORTED_STATIC_GRAPH');
 const expected=manifest.files;
 if(expected.length!==actual.length||new Set(expected.map(x=>x.path)).size!==actual.length)fail('MANIFEST_FILESET');
 const names=expected.map(x=>x.path).sort();if(JSON.stringify(names)!==JSON.stringify(actual))fail('MANIFEST_FILESET');
 const dependencies=new Map();
 const copied=[];
 for(const name of actual){const entry=expected.find(x=>x.path===name);if(!entry||!/^[a-f0-9]{64}$/.test(entry.sha256)||Object.keys(entry).sort().join()!=='path,sha256')fail('MANIFEST_ENTRY');
  const file=confined(path.join(source,name));const st=fs.lstatSync(file);if(!st.isFile()||st.size===0||st.size>10*1024*1024)fail('FILE_SIZE_OR_TYPE');
  const data=fs.readFileSync(file);if(sha(data)!==entry.sha256)fail('HASH_MISMATCH');
  if(name.endsWith('.js')||name.endsWith('.css')){
   const txt=data.toString('utf8');if(txt.includes('\ufffd')||/sourceMappingURL/i.test(txt))fail('UNSUPPORTED_DYNAMIC_ASSET');
   dependencies.set(name,name.endsWith('.js')?jsDependencies(name,txt):cssDependencies(name,txt));
  }
  copied.push({path:name,sha256:entry.sha256});
 }
 const html=fs.readFileSync(path.join(source,'index.html'),'utf8');
 const references=htmlRefs(html);
 for(const ref of references)if(!actual.includes(ref))fail('MISSING_HTML_ASSET');
 const graph=new Set(),pending=[...references];
 while(pending.length){const item=pending.pop();if(graph.has(item))continue;if(!actual.includes(item))fail('MISSING_DEPENDENCY');graph.add(item);pending.push(...(dependencies.get(item)||[]))}
 for(const file of actual.filter(x=>x!=='index.html'))if(!graph.has(file))fail('UNREACHABLE_ASSET');
 const config=fs.readFileSync(path.join(own,'nginx.conf'));copied.push({path:'nginx.conf',sha256:sha(config)});
 return {source,copied,config};
}
export {htmlRefs,jsDependencies,cssDependencies,allowed,fingerprint};
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
try{
 const [mode,input,hashes,dest]=process.argv.slice(2);
 if(!['dry-run','write'].includes(mode)||!input||!hashes||!dest)fail('USAGE');
 const destination=confined(dest,false);if(fs.existsSync(destination))fail('DEST_EXISTS');
 const parent=path.dirname(destination);confined(parent);if(!fs.statSync(parent).isDirectory())fail('DEST_PARENT_MISSING');
 const {source,copied,config}=validate(input,hashes);
 if(destination===source||destination.startsWith(source+path.sep)||source.startsWith(destination+path.sep))fail('OVERLAPPING_PATH');
 if(mode==='dry-run'){console.log(JSON.stringify({status:'validated',files:copied.length,destination}));process.exit(0)}
 const staging=fs.mkdtempSync(path.join(parent,'.ag4-static-stage-'));let published=false;
 try{
  fs.mkdirSync(path.join(staging,'assets'));
  for(const {path:relative,sha256} of copied){if(relative==='nginx.conf'){fs.writeFileSync(path.join(staging,relative),config);continue}
   const data=fs.readFileSync(path.join(source,relative));if(sha(data)!==sha256)fail('SOURCE_CHANGED_DURING_COPY');fs.writeFileSync(path.join(staging,relative),data,{flag:'wx'});
  }
  fs.writeFileSync(path.join(staging,'artifact-sha256.json'),JSON.stringify({schema:'ag4-curated-static-v1',files:copied},null,2)+'\n',{flag:'wx'});
  if(fs.existsSync(destination))fail('DEST_EXISTS');
  fs.renameSync(staging,destination);published=true;
 }finally{if(!published)fs.rmSync(staging,{recursive:true,force:true})}
 console.log(JSON.stringify({status:'published',files:copied.length,destination}));
}catch(error){console.error('AG4_CONTEXT_'+(typeof error?.message==='string'&&/^[A-Z_]+$/.test(error.message)?error.message:'VALIDATION_FAILED'));process.exitCode=1}

}
