"use strict";
/**
 * Extracts static Hono API method declarations. Paths may be relative to a
 * mounted router; a candidate is not a verified public endpoint or test.
 */
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const root = process.cwd();
const base = path.join(root, "apps/api/src");
const methods = new Set(["get", "post", "put", "patch", "delete", "head", "options", "all"]);
function walkFiles(dir) {
  return fs.readdirSync(dir, {withFileTypes:true}).flatMap(ent => ent.isDirectory()
    ? walkFiles(path.join(dir,ent.name))
    : ent.isFile() && /\.(ts|tsx)$/.test(ent.name) && !/\.(test|spec|d)\.ts$/.test(ent.name)
      ? [path.join(dir,ent.name)] : []);
}
const entries = [];
for (const file of walkFiles(base)) {
  const source=fs.readFileSync(file,"utf8");
  const sf=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true);
  function visit(node){
    if(ts.isCallExpression(node)&&ts.isPropertyAccessExpression(node.expression)){
      const method=node.expression.name.text;
      if(methods.has(method) && node.arguments.length && ts.isStringLiteral(node.arguments[0])){
        const route=node.arguments[0].text;
        if(route.startsWith("/")){
          const ln=sf.getLineAndCharacterOfPosition(node.getStart(sf)).line+1;
          entries.push({method:method.toUpperCase(),path:route,source:path.relative(root,file)+":"+ln});
        }
      }
    }
    ts.forEachChild(node,visit);
  }
  visit(sf);
}
entries.sort((a,b)=>a.source.localeCompare(b.source));
const file=path.join(root,"docs/qa/FUNCTIONAL_MATRIX.md");
let s=fs.readFileSync(file,"utf8");
const a="<!-- API_CANDIDATES_BEGIN -->", b="<!-- API_CANDIDATES_END -->";
const i=s.indexOf(a); if(i>=0){const j=s.indexOf(b,i);if(j<0)throw Error("missing end");s=s.slice(0,i).trimEnd()+"\n";}
let x="\n"+a+"\n\n## Статическая инвентаризация API\n\nHTTP handlers из TypeScript AST. Относительные paths могут быть смонтированы под другими префиксами. Реальность endpoint, права доступа, тело, ответы, изменение БД и побочные эффекты требуют integration/API тестов. Ни один не проверен этим сканером.\n\n";
x+="| ID | Приложение | Метод | Относительный путь | Исходник | Integration/API | Статус |\n|---|---|---|---|---|---|---|\n";
for(let i=0;i<entries.length;i++){const z=entries[i];x+="| API-"+String(i+1).padStart(4,"0")+" | Backend | "+z.method+" | "+z.path.replace(/\|/g,"/")+" | "+z.source+" | NOT RUN | NOT RUN |\n";}
x+="\nОбнаружено деклараций HTTP handlers: "+entries.length+" (без гарантии полноты динамических/монтируемых маршрутов).\n\n"+b+"\n";
fs.writeFileSync(file,s+x);
console.log("API_STATIC_CANDIDATES",entries.length, "NOT_RUN");
