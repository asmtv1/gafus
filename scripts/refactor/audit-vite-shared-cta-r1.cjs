/* Read-only AST inspection inside approved Refactor. Never follows symlinks. */
const fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const root=process.cwd();
if(root!=='/Users/asmtv1/Desktop/gafus-refactor') throw Error('ROOT_FENCE');
const base=path.join(root,'apps/web-vite/src');
const all=[];
function files(dir){
 for(const ent of fs.readdirSync(dir,{withFileTypes:true})){
  const f=path.join(dir,ent.name);
  if(ent.isSymbolicLink())continue;
  if(ent.isDirectory())files(f);
  else if(ent.name.endsWith('.tsx')&&!ent.name.includes('.test.'))scan(f);
 }
}
function scan(f){
 const src=fs.readFileSync(f,'utf8'),tree=ts.createSourceFile(f,src,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 function visit(node){
  if(ts.isJsxOpeningElement(node)||ts.isJsxSelfClosingElement(node)){
   const tag=node.tagName.getText(tree);
   if(tag==='button'||tag==='a'||tag==='RouteLink'){
    const attrs={};
    for(const a of node.attributes.properties){
      if(!ts.isJsxAttribute(a))continue;
      let str=a.initializer?.getText(tree)||'';
      attrs[a.name.getText(tree)]=str.slice(0,230);
    }
    const begin=tree.getLineAndCharacterOfPosition(node.getStart()).line+1;
    const kids=ts.isJsxOpeningElement(node)&&ts.isJsxElement(node.parent)?node.parent.children.map(c=>c.getText(tree)).join(' '):'';
    all.push({file:path.relative(base,f),line:begin,tag,attrs,body:kids.replace(/\s+/g,' ').slice(0,130)});
   }
  }
  ts.forEachChild(node,visit);
 }
 visit(tree);
}
files(base);
fs.mkdirSync(path.join(root,'.design-verify/shared-cta-audit-r1'),{recursive:true});
fs.writeFileSync(path.join(root,'.design-verify/shared-cta-audit-r1/controls.json'),JSON.stringify(all,null,2));
const counts={},classes={};
for(const r of all){
 counts[r.tag]=(counts[r.tag]||0)+1;
 if(r.tag!=='button')continue;
 let cls=r.attrs.className||'(none)';
 classes[cls]=(classes[cls]||0)+1;
}
const entries=Object.entries(classes).sort((a,b)=>b[1]-a[1]);
console.log('COUNTS',JSON.stringify(counts),'CLASSES',entries.length);
for(const [v,n] of entries.slice(0,165)) console.log(String(n).padStart(3),v);
console.log('REPORT .design-verify/shared-cta-audit-r1/controls.json');
