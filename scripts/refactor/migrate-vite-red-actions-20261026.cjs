/** Exact scoped red/cancel/destructive button inheritance in Refactor only.
 * Preview: node scripts/refactor/migrate-vite-red-actions-20261026.cjs
 * Apply:   node scripts/refactor/migrate-vite-red-actions-20261026.cjs --apply
 */
const fs=require("node:fs"),path=require("node:path"),ts=require("typescript");
const ROOT="/Users/asmtv1/Desktop/gafus-refactor";
if(process.cwd()!==ROOT)throw Error("PROJECT_ROOT_FENCE");
const srcRoot=path.join(ROOT,"apps/web-vite/src");
const apply=process.argv.includes("--apply");
const targets=[];
const noSpecific=new Set([
 // Icon-only / in-place toggles, not prominent cancellation CTA.
]);
function chosen(text,attrs,rel){
 const clean=text.replace(/\s+/g," ").trim();
 if(/^(?:Отмена|Не удалять(?: ответ| вопрос)?|Отменить (?:ответ|изменения|голос|выбор)|Удалить(?: альбом| фото| публикацию| у всех)?|Заблокировать|Отклонить|Закрыть (?:фотографию|просмотр|редактор|жалобу))$/i.test(clean))return true;
 if(/Отменить запись/.test(clean)&&/Отменяем/.test(clean))return true;
 if(/Отключить уведомления на этом устройстве/.test(clean))return true;
 if(/^(?:Удалить|Закрыть|Отмена)$/.test(clean)&&attrs["aria-label"])return false;
 // Source class handles compact icon-only delete; keep its original dimensions.
 if(rel==="features/pets/PetDetails.tsx")return false;
 const more=new Map([
  ["features/gallery/GalleryUploadQueue.tsx",new Set(["Убрать из очереди","Прервать передачу"])],
  ["features/gallery/GalleryAlbums.tsx",new Set(["Убрать обложку"])],
  ["features/gallery/GalleryPhotoActionsDialog.tsx",new Set(["Закрыть"])],
  ["features/moments/MomentsCatalog.tsx",new Set(["Сбросить рекомендации"])],
  ["features/moments/MomentDraftPoll.tsx",new Set(["Убрать последний вариант"])],
  ["features/moments/MomentComposer.tsx",new Set(["Убрать"])],
  ["features/moments/MomentEditPublishedText.tsx",new Set(["Убрать","Убрать новый файл"])],
  ["features/moments/MomentInlinePoll.tsx",new Set(["Убрать"])],
  ["features/pets/PetVetVisitsConnected.tsx",new Set(["Убрать"])],
  ["features/profile/RemindersOptIn.tsx",new Set(["Удалить (макет)"])],
 ]);
 if(more.get(rel)?.has(clean))return true;
 if(/^(?:Удалить публикацию)$/.test(clean)&&/menuDanger/.test(attrs.className||""))return true;
 return false;
}
function scan(file){
 const rel=path.relative(srcRoot,file),s=fs.readFileSync(file,"utf8");
 const ast=ts.createSourceFile(file,s,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 const changes=[],matched=[];
 function visit(n){
  if(ts.isJsxElement(n)&&n.openingElement.tagName.getText(ast)==="button"){
   const open=n.openingElement;
   const attrs=Object.fromEntries(open.attributes.properties.filter(ts.isJsxAttribute).map(a=>[a.name.getText(ast),a.initializer?.getText(ast)||""]));
   const body=n.children.map(c=>c.getText(ast)).join(" ").replace(/\s+/g," ").trim();
   if(chosen(body,attrs,rel)){
    const isCompact=/^(?:Убрать(?: новый файл| последний вариант| из очереди)?)$/.test(body)&&
      !attrs.className;
    changes.push({from:open.tagName.getStart(ast),to:open.tagName.end,
      text:isCompact?'SecondaryButton variant="red" className="gafus-inline-red-action"':'SecondaryButton variant="red"'});
    changes.push({from:n.closingElement.tagName.getStart(ast),to:n.closingElement.tagName.end,
      text:"SecondaryButton"});
    // Remove legacy generic neutral class so red styles/typography fully come from the shared component.
    const attr=open.attributes.properties.find(a=>ts.isJsxAttribute(a)&&a.name.getText(ast)==="className"&&a.initializer?.getText(ast)==='"button-secondary"');
    if(attr)changes.push({from:attr.getStart(ast),to:attr.end,text:""});
    matched.push({line:ast.getLineAndCharacterOfPosition(n.getStart(ast)).line+1,body:body.slice(0,120),cls:attrs.className||""});
   }
  }
  ts.forEachChild(n,visit);
 }
 visit(ast);
 if(!matched.length)return;
 const importPath=path.relative(path.dirname(file),path.join(srcRoot,"shared/ui")).replaceAll(path.sep,"/");
 const uri=importPath.startsWith(".")?importPath:"./"+importPath;
 const imports=ast.statements.filter(ts.isImportDeclaration);
 const existent=imports.find(n=>n.moduleSpecifier.text===uri);
 if(existent){
  const names=existent.importClause?.namedBindings;
  if(!names||!ts.isNamedImports(names))throw Error("Unsupported shared import "+rel);
  if(!names.elements.some(x=>x.name.text==="SecondaryButton"))
   changes.push({from:names.end-1,to:names.end-1,text:', SecondaryButton'});
 }else{
  if(imports.length===0)throw Error("Missing imports "+rel);
  changes.push({from:imports.at(-1).end,to:imports.at(-1).end,text:'\nimport { SecondaryButton } from "'+uri+'";'});
 }
 let out=s;
 changes.sort((a,b)=>b.from-a.from);
 for(const ch of changes)out=out.slice(0,ch.from)+ch.text+out.slice(ch.to);
 const checked=ts.createSourceFile(file,out,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 if(checked.parseDiagnostics.length)throw Error("Invalid JSX "+rel);
 targets.push({file:rel,matched});
 if(apply)fs.writeFileSync(file,out);
}
function walk(dir){
 for(const ent of fs.readdirSync(dir,{withFileTypes:true})){
  if(ent.isSymbolicLink())continue;
  const f=path.join(dir,ent.name);
  if(ent.isDirectory())walk(f);
  else if(ent.isFile()&&f.endsWith(".tsx")&&!f.endsWith(".test.tsx"))scan(f);
 }
}
walk(srcRoot);
const folder=path.join(ROOT,".design-verify/shared-cta-red-r2");
fs.mkdirSync(folder,{recursive:true});
fs.writeFileSync(path.join(folder,apply?"applied.json":"preview.json"),JSON.stringify({applied:apply,files:targets.length,buttons:targets.reduce((n,f)=>n+f.matched.length,0),targets},null,2));
console.log(JSON.stringify({applied:apply,files:targets.length,buttons:targets.reduce((n,f)=>n+f.matched.length,0)}));
for(const target of targets)console.log(target.file+": "+target.matched.map(r=>r.line+" "+r.body+" "+r.cls).join("; "));
