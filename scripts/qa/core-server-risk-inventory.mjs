#!/usr/bin/env node
/**
 * Source-based Core -> server compatibility debt inventory.
 *
 * The frozen ratchet is authoritative: this only classifies actual AST
 * import/export edges and doesn't mutate exceptions or re-label test imports.
 * Labels express migration risk, not a security audit or a production SLO.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { inventory } from "../check-core-server-facades.mjs";

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const original = JSON.parse(fs.readFileSync(
  path.join(project, "docs/audit/core-server-facade-initial-20261111.json"), "utf8",
)).imports;
const current = inventory(project);
const bySignature = (rows) => {
  const map = new Map();
  for (const row of rows) {
    const key = JSON.stringify([row.file, row.import]);
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return map;
};
const remaining = bySignature(current);
const affected = [
  ...new Set([...original, ...current].map(row => row.file)),
];
const astByFile = new Map();
for (const file of affected) {
  const full = path.join(project, file);
  if (fs.existsSync(full)) {
    astByFile.set(file, ts.createSourceFile(file, fs.readFileSync(full, "utf8"),
      ts.ScriptTarget.Latest, true, ts.ScriptKind.TS));
  }
}
function syntaxKind(row) {
  const ast = astByFile.get(row.file);
  if (!ast) return "retired";
  const matches = ast.statements.filter(node =>
    (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
    node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier) &&
    node.moduleSpecifier.text === row.import);
  if (!matches.length) return "retired";
  if (matches.every(node => ts.isImportDeclaration(node) && node.importClause?.isTypeOnly ||
      ts.isExportDeclaration(node) && node.isTypeOnly)) return "type-only";
  if (matches.every(ts.isExportDeclaration)) return "re-export";
  return "runtime-import";
}
function risk(row, kind) {
  // Business criticality takes precedence over the re-export syntax. A tiny
  // payment/consent facade still has a high-risk public contract.
  const filename = row.file.toLowerCase();
  const spec = row.import.toLowerCase();
  if (/auth|identity|payment|subscription|finance|wallet|credit|reward|deleteuser|accountcleanup|registration|receipt|trainerstep|trainercourse|exam|offline|training|ledger|booking|consent/.test(filename+" "+spec))
    return "H";
  // Prisma delegate-shaped "ports" are not independent typed domain contracts.
  if (/media-db-ports|rows|profile|photos|personalization/.test(spec) && kind === "type-only")
    return "M";
  if (kind === "retired" || kind === "type-only" || kind === "re-export")
    return "L";
  return "M";
}
const migrated = new Map();
for (const row of original) {
  const key = JSON.stringify([row.file, row.import]);
  const present = remaining.get(key) ?? 0;
  if (present) remaining.set(key, present - 1);
  else migrated.set(key, (migrated.get(key) ?? 0) + 1);
}
const groups = new Map();
for (const row of original) {
  const pkg = row.import.split("/")[1];
  const kind = syntaxKind(row);
  const item = { ...row, kind, risk: risk(row, kind) };
  if (!groups.has(pkg)) groups.set(pkg, []);
  groups.get(pkg).push(item);
}
const escaped = str => str.replaceAll("|","\\|").replaceAll("\n"," ");
const out = [
  "# Core → серверные адаптеры: инвентаризация и риск миграции",
  "",
  "Автоматический анализ исходных AST; категории риска — инженерная приоритизация,",
  "а не оценка безопасности. Исходная точка — 142 AST-импорта из замороженного baseline;",
  "выполненные переносы сохраняются в исторической таблице.",
  "",
  "- **L (низкий)**: только типы или простые реэкспорты НЕ финансовых/авторизационных контуров; проверить потребителей API.",
  "- **M (средний)**: прямой вызов адаптера чтения/медиа/контента; перевести через use-case порт, сохранить ACL.",
  "- **H (высокий)**: затронуты авторизация, согласия, платежи, подписки, прогресс, экзамены, idempotency/lease/CAS (даже если текущий импорт — простой реэкспорт).",
  "",
  "| Пакет | Всего (история) | L | M | H | Уже устранено |",
  "| --- | ---: | ---: | ---: | ---: | ---: |",
];
for (const [pkg, items] of [...groups].sort((a,b) => b[1].length-a[1].length)) {
 const stats = {L:0,M:0,H:0};
 for (const x of items) stats[x.risk]++;
 const retired = items.filter(x=>x.kind==="retired").length;
 out.push(`| ${pkg} | ${items.length} | ${stats.L} | ${stats.M} | ${stats.H} | ${retired} |`);
}
const sums = Object.values(Object.fromEntries(groups)).flat();
out.push("",`Всего: **${original.length}**, фактически осталось **${current.length}**; устранено **${original.length-current.length}**.`,"");
for(const [pkg, items] of [...groups].sort((a,b)=> b[1].length-a[1].length)) {
 out.push("## "+pkg,"","| Риск | Форма | Файл Core | Точное server API |",
 "| :--: | --- | --- | --- |");
 for (const x of items) out.push(`| ${x.risk} | ${x.kind} | \`${escaped(x.file.replace("packages/core/src/",""))}\` | \`${escaped(x.import)}\` |`);
 out.push("");
}
out.push("## Границы приёмки","","Каждая порция требует подтверждения экспортов собранных пакетов, TypeScript,",
"воздействующих Core/API/Worker тестов и обновления ratchet **только после** прохождения.",
"Для H-риска обязательны реальный изолированный PostgreSQL и тесты конкуренции,",
"rollback, владельца/прав, stale lease, CAS/replay. Staging-сервисы не подменяются mocks.","");
const filename = path.join(project, "docs/audit/core-server-adapter-risk-inventory-20261111.md");
fs.writeFileSync(filename, out.join("\n")+"\n");
console.log("CORE_SERVER_RISK_INVENTORY",original.length,"baseline",current.length,"remaining", original.length-current.length,"resolved",filename);
