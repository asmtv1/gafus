#!/usr/bin/env node
/* Deterministic human-readable projection of immutable G0 BASELINE.json. */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const ROOT = "/Users/asmtv1/Desktop/gafus-refactor";
const SNAP = "docs/refactor/coordination/BASELINE.json";
const OUT = "docs/refactor/coordination/OPERATIONS.md";
const B = String.fromCharCode(96);
if (process.cwd() !== ROOT || fs.realpathSync(ROOT) !== ROOT) throw Error("Wrong root");
if (execFileSync("git",["-C",ROOT,"rev-parse","--show-toplevel"],{encoding:"utf8"}).trim()!==ROOT) throw Error("Wrong Git root");
if (execFileSync("git",["-C",ROOT,"branch","--show-current"],{encoding:"utf8"}).trim()!=="vite") throw Error("Wrong branch");
for (const rel of [SNAP, OUT]) {
  let curr=ROOT;
  for (const segment of rel.split("/")) {
    curr=path.join(curr,segment);
    if (fs.existsSync(curr) && fs.lstatSync(curr).isSymbolicLink()) throw Error("Symlink refused");
  }
}
const d=JSON.parse(fs.readFileSync(SNAP,"utf8"));
const lines=[];
const c=x=>B+String(x).replaceAll(B,"'").replaceAll("|","\\|")+B;
const cell=x=>String(x).replaceAll("|","\\|").replaceAll("\n"," ");
const table=(heads,rows)=>{
  lines.push("| "+heads.join(" | ")+" |");
  lines.push("| "+heads.map(()=>"---").join(" | ")+" |");
  for(const r of rows) lines.push("| "+r.map(cell).join(" | ")+" |");
  lines.push("");
};
const heading=(s)=>{lines.push("## "+s,"");};
const candidate=url=>{
  if(d.vite.staticRoutes.includes(url)) return "ROUTE_EXISTS_NOT_PARITY";
  if(/^\/(?:courses|articles|pets|questions)\/\[[^/]+\]$/.test(url)) return "DYNAMIC_CANDIDATE";
  return "UNMAPPED_OR_ALIAS_REVIEW";
};
lines.push("# G0 — полный статический реестр операций и исходных точек входа","");
lines.push("**Snapshot:** "+c(d.id)+"; branch "+c(d.branch)+"; HEAD "+c(d.head)+".");
lines.push("**Важно:** это полный **статический** перечень обнаруженных page/route/action/module entry points, а НЕ доказательство их runtime-работоспособности или эквивалентности DTO. Списки методов и экспортов извлечены регулярными выражениями, динамические dispatchers и внутренние Core вызовы требуют ручной декомпозиции. Ни одна строка сама по себе не означает DONE. Все чтения только внутри разрешённого Refactor; symlink не разыменовывались.","");
lines.push("## Краткая сводка","");
table(["Зона","Pages / routes","API route","use server modules","Owner"],
  [["Legacy Web",d.counts.webPages,d.counts.webApi,d.counts.webActions,"AG2 source → AG1 backend"],
  ["Trainer",d.counts.trainerPages,d.counts.trainerApi+" + "+d.counts.trainerOtherRoutes+" non-API",d.counts.trainerActions,"AG4 source → AG1 backend"],
  ["Admin",d.counts.adminPages,d.counts.adminApi,d.counts.adminActions,"AG4 source → AG1 backend"],
  ["Mobile",d.counts.mobileRouteFiles+" route files",d.counts.mobileApiAdapters+" adapters","native offline/push","AG3 source → AG1 backend"],
  ["Hono",d.counts.honoStaticDeclarations+" declarations","wildcard included","DTO pending","AG1"],
  ["Vite Web",d.counts.viteStaticRoutes+" static routes","dynamic helpers","partial prototype","AG2"]]);
heading("Legacy Web — все 55 URL (AG2)");
table(["URL","Старый исходник","Vite static match","Что дальше"],
 d.web.pages.map(x=>[c(x.url),c(x.source),candidate(x.url),"AG2 parity URL/redirect/auth/SEO/E2E; AG1 API"]));
heading("Legacy Web — Next API HTTP операции (AG2 owns legacy source; AG1 owns replacement)");
const webOps=d.web.apiRoutes.flatMap(x=>x.matches.map(m=>[c(m.method),c(x.url),c(x.source),c(m.state),"AG1 DTO/auth/RBAC + AG2 consumer + contract/E2E"]));
table(["Method","Legacy path","Legacy source","Static Hono match","Gate"],webOps);
heading("Legacy Web — 73 use server modules, exported actions (AG2 legacy; AG1 business)");
table(["Legacy module","Export/function (static)","Gate"],
 d.web.actions.flatMap(x=>(x.exports.length?x.exports:["DYNAMIC_EXPORT_REVIEW"]).map(name=>
  [c(x.source),c(name),"AG1 Core/API mapping + AG2 UI + negative/contract tests"])));
heading("Trainer — все 29 Next pages (AG4)");
table(["URL","Source","Gate"],d.trainer.pages.map(x=>[c(x.url),c(x.source),"AG4 Vite route+UI; AG1 API+owner RBAC"]));
heading("Trainer — Next API + прочие route handlers (AG4 legacy; AG1 backend)");
table(["Method","URL","Source","Status"],
 [...d.trainer.apiRoutes,...d.trainer.otherRoutes].flatMap(x=>
   (x.matches??(x.methods.length?x.methods.map(method=>({method,state:"NON_API_ROUTE"})):[{method:"UNKNOWN",state:"NON_API_ROUTE"}]))
   .map(m=>[c(m.method),c(x.url),c(x.source),c(m.state)])));
heading("Trainer — 50 use server modules, exported actions");
table(["Module","Export/function (static)","Gate"],
 d.trainer.actions.flatMap(x=>(x.exports.length?x.exports:["DYNAMIC_EXPORT_REVIEW"]).map(name=>
  [c(x.source),c(name),"AG1 endpoint+role+owner; AG4 adapter/form; contract+E2E"])));
heading("Admin — все 21 Next pages (AG4)");
table(["URL","Source","Gate"],d.admin.pages.map(x=>[c(x.url),c(x.source),"AG4 Vite route+UI; AG1 API+RBAC/audit"]));
heading("Admin — Next API HTTP операции (AG4 legacy; AG1 backend)");
table(["Method","URL","Source","Status"],
 d.admin.apiRoutes.flatMap(x=>x.matches.map(m=>[c(m.method),c(x.url),c(x.source),c(m.state)])));
heading("Admin — 20 use server modules, exported actions");
table(["Module","Export/function (static)","Gate"],
 d.admin.actions.flatMap(x=>(x.exports.length?x.exports:["DYNAMIC_EXPORT_REVIEW"]).map(name=>
  [c(x.source),c(name),"AG1 endpoint+RBAC+audit; AG4 UI+negative tests"])));
heading("Mobile — все 66 Expo route files (AG3; layouts/service files included)");
table(["Expo route (static approximation)","Source","Gate"],
 d.mobile.screens.map(x=>[c(x.route),c(x.source),"AG3 behavior/deep link/device test; AG1 API compatibility"]));
heading("Mobile — 37 API adapters и обнаруженные endpoint references (AG3)");
table(["Adapter","Exported symbols (static)","Endpoint string references (static)","Gate"],
 d.mobile.adapters.map(x=>[c(x.source),x.exports.map(c).join(", ")||"DYNAMIC_EXPORT_REVIEW",
  x.endpointReferences.map(c).join(", ")||"DYNAMIC_URL_REVIEW",
  "AG3 old-native JSON fixture; AG1 response/error compatibility"]));
heading("Hono — 205 статических HTTP-деклараций (AG1)");
table(["Method","Path","Source:line","Kind","Gate"],
 d.hono.map(x=>[c(x.method),c(x.path),c(x.source+":"+x.line),
   x.dispatcher?"WILDCARD/DISPATCH":"DIRECT_DECLARATION",
   "AG1 request/response/error/auth/owner/side-effect + tests"]));
heading("Незакрытые операции: как закрывать 1:1");
lines.push("1. Владелец UI помечает для каждой строки: legacy behavior, DTO, permission, side effect, новый URL/file, feature test, browser/native E2E ID. Если удаляется — отдельный утверждённый ADR.");
lines.push("2. AG1 для каждого Next API, server action export и Mobile adapter связывает метод с существующим Hono+Core или создаёт согласованную additive API карточку. Совпадение path не доказывает DTO; wildcard dispatcher надо расписывать по action.");
lines.push("3. AG3 защищает старые native response/error fixtures; AG4 фиксирует Trainer/Admin roles, audit, finance и non-prod integration.");
lines.push("4. Закрытие операции только по коду+тестам: DONE_VERIFIED; без выполнения — PARTIAL/BLOCKED/UNKNOWN. Этот snapshot никогда не переписывать для косметического уменьшения незакрытых строк.");
lines.push("5. Проверки: "+c("python3 scripts/refactor/parallel_baseline.py --verify")+", "+c("node scripts/refactor/render_operations.mjs --check")+", "+c("node scripts/refactor/verify_parallel_freeze.mjs")+".","");
const rendered=lines.join("\n");
const mode=process.argv[2];
if(mode==="--create"){
  fs.writeFileSync(OUT,rendered,{encoding:"utf8",flag:"wx"});
  console.log("CREATED",OUT,"lines",lines.length,"bytes",Buffer.byteLength(rendered));
}else if(mode==="--check"){
  const stored=fs.readFileSync(OUT,"utf8");
  if(stored!==rendered) throw Error("OPERATIONS.md does not match immutable snapshot");
  console.log("PASS OPERATIONS.md projection",lines.length,"lines");
}else throw Error("Usage: --create|--check");
