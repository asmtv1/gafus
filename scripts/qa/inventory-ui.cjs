"use strict";
/**
 * Static JSX interactive candidate inventory for the QA matrix.
 * Candidate != visible element, tested action, or functional PASS.
 * Repeatable, does not alter existing status rows.
 */
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const root = process.cwd();
const apps = [
  ["Web", "apps/web-vite/src"],
  ["Admin", "apps/admin-panel/src"],
  ["Trainer", "apps/trainer-panel/src"],
];
const actions = [];
const tags = /^(button|input|select|textarea|a|Button|IconButton|Link|Checkbox|Switch|Tab|TabsTrigger|Select|SelectTrigger|SelectItem|DropdownMenuItem|MenuItem|DialogTrigger|RadioGroupItem|AccordionTrigger|Toggle|ToggleGroupItem|Combobox|DatePicker|Upload|FileUpload)$/;
const triggers = new Set([
  "onClick", "onChange", "onSubmit", "onKeyDown", "onKeyUp", "onPointerDown", "onDoubleClick",
  "onValueChange", "onCheckedChange", "onSelect", "onBlur",
]);
function filesAt(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(d =>
    d.isDirectory() ? filesAt(path.join(dir, d.name)) :
    d.isFile() && /\.tsx$/.test(d.name) && !/\.(test|spec|stories)\.tsx$/.test(d.name) ? [path.join(dir, d.name)] : []);
}
function displayAttr(a, sf) {
  if (!a || !ts.isJsxAttribute(a)) return "";
  if (a.initializer && ts.isStringLiteral(a.initializer)) return a.initializer.text;
  return "";
}
function routeFor(app, relative) {
  const p = relative.replace(/\\/g, "/");
  if (app === "Web") {
    const feature = /^apps\/web-vite\/src\/features\/([^/]+)/.exec(p)?.[1];
    return feature ? "feature:" + feature : "shared-or-app";
  }
  const panel = /\/app\/\(main\)\/main-panel\/(.*)/.exec(p)?.[1];
  return panel ? "/main-panel/" + panel.replace(/\/page\.tsx$/, "").replace(/\.tsx$/, "") : "shared-or-app";
}
for (const [app, src] of apps) {
  for (const file of filesAt(path.join(root, src))) {
    const relative = path.relative(root, file);
    const code = fs.readFileSync(file, "utf8");
    const sf = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    function walk(n) {
      if (ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n)) {
        const tag = n.tagName.getText(sf);
        const attrs = n.attributes.properties.filter(ts.isJsxAttribute);
        const names = attrs.map(a => a.name.getText(sf));
        const handlers = names.filter(s => triggers.has(s));
        if (tags.test(tag) || handlers.length) {
          const ln = sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
          const candidateLabel = attrs.find(a => ["aria-label", "title", "placeholder", "name", "data-testid"].includes(a.name.getText(sf)));
          const rawLabel = displayAttr(candidateLabel, sf);
          let text = rawLabel || "";
          if (!text && ts.isJsxOpeningElement(n) && ts.isJsxElement(n.parent)) {
            text = n.parent.children.filter(ts.isJsxText).map(child => child.getText(sf).trim()).filter(Boolean).join(" ");
          }
          text = text.replace(/[|\\\n\r]/g, " ").replace(/\s+/g, " ").slice(0, 60);
          const detail = tag + (handlers.length ? " [" + handlers.join(",") + "]" : "") + (text ? " «" + text + "»" : "");
          actions.push({app, source:relative + ":" + ln, route:routeFor(app,relative), detail});
        }
      }
      ts.forEachChild(n, walk);
    }
    walk(sf);
  }
}
actions.sort((a, b) => a.app.localeCompare(b.app) || a.source.localeCompare(b.source));
const report = path.join(root, "docs/qa/FUNCTIONAL_MATRIX.md");
let content = fs.readFileSync(report, "utf8");
const start = "<!-- UI_CANDIDATES_BEGIN -->";
const end = "<!-- UI_CANDIDATES_END -->";
const beginIdx = content.indexOf(start);
if (beginIdx >= 0) {
  const endIdx = content.indexOf(end, beginIdx);
  if (endIdx < 0) throw new Error("Missing UI candidates end marker");
  content = content.slice(0, beginIdx).trimEnd() + "\n";
}
let tail = "\n" + start + "\n\n## Статический реестр JSX интерактивных кандидатов\n\n";
tail += "Это исходные элементы-кандидаты (могут быть общими, скрытыми или недостижимыми). Реальная доступность, связь с маршрутом, последствия нажатия и статус требуют Chromium. Static discovery НЕ равен покрытию. Для shared-or-app или feature:* привязка маршрута ещё не установлена.\n\n";
tail += "| ID | Приложение | Маршрут / область | Кандидат | Исходник | Unit/Integration | Playwright | Статус |\n";
tail += "|---|---|---|---|---|---|---|---|\n";
let byApp = {};
for (const a of actions) {
  byApp[a.app] = (byApp[a.app] || 0) + 1;
  const id = "UI-" + a.app.toUpperCase().slice(0,3) + "-" + String(byApp[a.app]).padStart(4, "0");
  tail += "| " + id + " | " + a.app + " | " + a.route + " | " + a.detail.replace(/\|/g, "/") + " | " + a.source + " | NOT RUN | NOT RUN | NOT RUN |\n";
}
tail += "\nСтатических JSX кандидатов: " + actions.length + " (" + JSON.stringify(byApp) + "). Все NOT RUN. Элементы в сторонних UI-библиотеках, динамически генерируемые, API и Native Mobile этим сканером не обнаруживаются.\n\n" + end + "\n";
fs.writeFileSync(report, content + tail);
console.log("UI_STATIC_CANDIDATES", actions.length, byApp, "all_NOT_RUN");
