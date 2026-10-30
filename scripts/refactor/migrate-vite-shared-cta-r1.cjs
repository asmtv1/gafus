/** Whitelisted, semantically classified native olive/red CTA migration.
 * No automatic conversion of tabs, option chips, menu triggers, reactions,
 * calendar cells, pagination arrows or already-styled source controls.
 * Every touched pathname is inside the permitted GAFUS Refactor checkout.
 */
const fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const ROOT='/Users/asmtv1/Desktop/gafus-refactor';
if(process.cwd()!==ROOT)throw Error('PROJECT_ROOT_MISMATCH');
const root=path.join(ROOT,'apps/web-vite/src'),migrate=process.argv.includes('--apply');
const skip=/^(App\.tsx|features\/(?:chats\/StreamDialog|moments\/(?:MomentPoll|MomentDraftPoll|MomentPostMenu)|courses\/CourseCatalog|pets\/PetWeightChart|training\/TrainingDayViewer)\.tsx)$/;
const primary=/сохран|отправ|созда|добав|зарегистр|опубликов|подтверд|заверш|продолж|загруз|провер|повтор|примен|начать|записат|войти|разблок|публику|оплат|открыть за гафус|обновить/i;
const red=/удал|стереть|заблок|отменить запись|выйти на всех устройствах/i;
const scans=[],targets=[];
function enumerate(dir){
 for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
  const file=path.join(dir,entry.name);
  if(entry.isSymbolicLink())continue;
  if(entry.isDirectory())enumerate(file);
  else if(entry.isFile()&&/\.tsx$/.test(entry.name)&&!/\.test\.tsx$/.test(entry.name))scan(file);
 }
}
function scan(file){
 const rel=path.relative(root,file);if(skip.test(rel))return;
 let src=fs.readFileSync(file,'utf8');
 const ast=ts.createSourceFile(file,src,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 const changes=[],labels=[];
 function visit(node){
  if(ts.isJsxElement(node)&&node.openingElement.tagName.getText(ast)==='button'&&
    node.closingElement.tagName.getText(ast)==='button'){
   const open=node.openingElement;
   const attrs=Object.fromEntries(open.attributes.properties.filter(ts.isJsxAttribute)
     .map(a=>[a.name.getText(ast),a.initializer?.getText(ast)||'']));
   const text=node.children.map(c=>c.getText(ast)).join(' ').replace(/\s+/g,' ').slice(0,400);
   const normalized=text.trim();
   let variant=red.test(normalized)?'red':primary.test(normalized)?'primary':'';
   if(/не удалять|не удалось|не удаляется|не отменять|отмена удаления/i.test(normalized)){
     // A neutral rejection / failure label is never a destructive CTA.
     if(!/да, удалить|подтвердить удаление/i.test(normalized))variant='';
   }
   if(Object.hasOwn(attrs,'className')||!variant||attrs['aria-selected']||
     attrs['aria-pressed']||attrs.role||attrs['data-consultation-day-key']||
     attrs['data-poll-option']||attrs['data-index']||
     !(attrs.type==='"button"'||attrs.type==='"submit"'))variant='';
   // CSS-derived custom icon/pill actions must keep the feature design.
   if(variant){
    const name=variant==='red'?'SecondaryButton':'PrimaryButton';
    changes.push({start:open.tagName.getStart(ast),end:open.tagName.end,
      text:variant==='red'?'SecondaryButton variant="red"':'PrimaryButton'});
    changes.push({start:node.closingElement.tagName.getStart(ast),
      end:node.closingElement.tagName.end,text:name});
    labels.push({line:ast.getLineAndCharacterOfPosition(open.getStart(ast)).line+1,variant,body:text.slice(0,78)});
   }
  }
  ts.forEachChild(node,visit);
 }
 visit(ast);
 if(!labels.length)return;
 const types=[...new Set(labels.map(l=>l.variant))];
 const relImport=path.relative(path.dirname(file),path.join(root,'shared/ui')).replaceAll(path.sep,'/');
 const importPath=relImport.startsWith('.')?relImport:'./'+relImport;
 const decl='import {'+[...(types.includes('primary')?['PrimaryButton']:[]),
  ...(types.includes('red')?['SecondaryButton']:[])].join(',')+'} from "'+importPath+'";\n';
 // Preserve existing imports and do not duplicate the shared library.
 const imports=ast.statements.filter(ts.isImportDeclaration);
 if(imports.length===0)throw Error('No import declaration: '+rel);
 const existing=imports.find(n=>n.moduleSpecifier.text===importPath);
 if(existing){
   const names=existing.importClause?.namedBindings;
   if(!names||!ts.isNamedImports(names))throw Error('Non-named shared import: '+rel);
   const present=new Set(names.elements.map(el=>el.name.text));
   const missing=[...(types.includes('primary')?['PrimaryButton']:[]),
     ...(types.includes('red')?['SecondaryButton']:[])].filter(n=>!present.has(n));
   if(missing.length) changes.push({start:names.end-1,end:names.end-1,
     text:(names.elements.length?',':'')+missing.join(',')});
 }else{
   const last=imports.at(-1);
   changes.push({start:last.end,end:last.end,text:'\n'+decl.trimEnd()});
 }
 changes.sort((a,b)=>b.start-a.start);
 for(const c of changes){
  if(c.start<0||c.end<c.start)throw Error('Offset fence');
  src=src.slice(0,c.start)+c.text+src.slice(c.end);
 }
 const verify=ts.createSourceFile(file,src,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 if(verify.parseDiagnostics.length)throw Error('Invalid JSX: '+rel);
 scans.push({file:rel,labels});
 if(migrate){fs.writeFileSync(file,src);}
}
enumerate(root);
const out=path.join(ROOT,'.design-verify/shared-cta-audit-r1');
fs.mkdirSync(out,{recursive:true});
fs.writeFileSync(path.join(out,migrate?'migration-result.json':'migration-preview.json'),
 JSON.stringify({applied:migrate,files:scans.length,controls:scans.reduce((n,x)=>n+x.labels.length,0),scans},null,2));
const tally=scans.reduce((a,s)=>{for(const l of s.labels)a[l.variant]=(a[l.variant]||0)+1;return a;},{});
console.log(JSON.stringify({applied:migrate,files:scans.length,buttons:tally}));
for(const f of scans)console.log(f.file+': '+f.labels.map(x=>x.line+(x.variant==='red'?'R':'O')).join(','));
