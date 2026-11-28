/** Inventory and ratchet for catch and Promise.catch sites. Existing fallback
 * paths are recorded as baseline, not silently declared semantically safe.
 * New handled/suppressed sites require a reporter, propagation, or a local
 * "diagnostic: expected <reason>" review comment. Runs without a .git dir. */
const ts=require('typescript');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const baselinePath='scripts/mobile-diagnostic-catch-baseline.json';
const walk=d=>fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>
  e.isSymbolicLink()||e.name.startsWith('.')||['node_modules','dist','build','coverage'].includes(e.name)?[]:
    e.isDirectory()?walk(path.posix.join(d,e.name)):[path.posix.join(d,e.name)]);
const records={};
const counts={reported:0,propagates:0,documented:0,baseline:0};
for(const file of [...walk('apps/mobile/app'),...walk('apps/mobile/src')].filter(f=>/\.tsx?$/.test(f)&&!/[.](test|spec)\./.test(f))){
  const source=ts.createSourceFile(file,fs.readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true);
  const reporterNames=new Set(['reportClientError','reportClientErrorAndWait']);
  const namespaces=new Set();
  for(const node of source.statements)if(ts.isImportDeclaration(node)&&ts.isStringLiteral(node.moduleSpecifier)){
    const named=node.importClause?.namedBindings;
    if(named&&ts.isNamedImports(named))for(const n of named.elements){
      if(reporterNames.has(n.propertyName?.text??n.name.text))reporterNames.add(n.name.text);
    }
    if(named&&ts.isNamespaceImport(named)&&/error-reporting/.test(node.moduleSpecifier.text))namespaces.add(named.name.text);
  }
  function classify(body){
    let reported=false,propagates=false;
    function visit(x){
      if(ts.isThrowStatement(x))propagates=true;
      if(ts.isCallExpression(x)){
        const e=x.expression;
        if(ts.isIdentifier(e)&&reporterNames.has(e.text)||
          ts.isPropertyAccessExpression(e)&&ts.isIdentifier(e.expression)&&namespaces.has(e.expression.text)&&reporterNames.has(e.name.text))reported=true;
        if(e.getText(source)==='Promise.reject')propagates=true;
      }
      ts.forEachChild(x,visit);
    }
    visit(body);
    return reported?'reported':propagates?'propagates':undefined;
  }
  function scan(node){
    let body;
    if(ts.isCatchClause(node))body=node.block;
    if(ts.isCallExpression(node)&&ts.isPropertyAccessExpression(node.expression)&&node.expression.name.text==='catch'&&
      node.arguments[0]&&(ts.isArrowFunction(node.arguments[0])||ts.isFunctionExpression(node.arguments[0])))body=node.arguments[0].body;
    if(body){
      const category=classify(body);
      if(category)counts[category]++;
      else if(ts.isBlock(body)&&/diagnostic:\s*expected\s+[^\n*]{12,}/i.test(
        source.text.slice(body.getStart(source)+1,body.statements[0]?.getStart(source)??body.end-1)))counts.documented++;
      else{
        // Include the complete catch expression + path in the immutable
        // ratchet, not line numbers. Editing/removing a fallback is reviewable.
        const key=crypto.createHash('sha256').update(node.getText(source).replace(/\s+/g,' ')).digest('hex').slice(0,20);
        const relative=file.replace(/^apps\/mobile\//,'');
        (records[relative]??={})[key]=((records[relative]??{})[key]??0)+1;
        counts.baseline++;
        if(process.argv.includes('--inventory')){
          const line=source.getLineAndCharacterOfPosition(node.getStart(source)).line+1;
          console.log(relative+':'+line+' '+key+' '+node.getText(source).replace(/\s+/g,' ').slice(0,180));
        }
      }
    }
    ts.forEachChild(node,scan);
  }
  scan(source);
}
if(process.argv.includes('--write'))fs.writeFileSync(baselinePath,JSON.stringify(records,null,2)+'\n');
else{
  const baseline=JSON.parse(fs.readFileSync(baselinePath,'utf8'));
  for(const [file,items] of Object.entries(records))for(const [key,n] of Object.entries(items)){
    if(n>(baseline[file]?.[key]??0))throw Error('New unreviewed mobile catch: '+file+' '+key+
      '; report, propagate, or document the expected fallback.');
  }
}
console.log('mobile diagnostic catch inventory',counts);
if(process.argv.includes('--require-zero')&&counts.baseline>0)
  throw Error('Unreviewed mobile catch handlers remain: '+counts.baseline);
