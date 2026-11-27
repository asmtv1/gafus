import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {execFileSync} from "node:child_process";
import {flagGroups} from "./feature-flag-policy.mjs";
import {buildFlagCatalog, readFlagSelectors, compareFlagCatalog} from "./feature-flag-policy-checks.mjs";

const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const catalog=buildFlagCatalog(flagGroups);
const files=[...new Set(execFileSync("git",["ls-files","-c","-o","--exclude-standard","-z"],{cwd:root,maxBuffer:32*1024*1024}).toString().split("\0"))]
  .filter(f=>/^(apps|packages)\//.test(f)&&/\.[cm]?[jt]sx?$/.test(f)&&!/(\.test\.|\.spec\.|\/tests?\/|\/__fixtures__\/|\/scripts\/|\/dist\/|\/\.types-build-)/.test(f)&&fs.existsSync(path.join(root,f)));
const actual=new Map();
for(const file of files) {
  const source=fs.readFileSync(path.join(root,file),"utf8");
  for(const key of readFlagSelectors(source)){
    if(!actual.has(key))actual.set(key,new Set());
    actual.get(key).add(file);
  }
}
const {missing, stale}=compareFlagCatalog(catalog,actual);
if(missing.length||stale.length) {
  console.error("Uncatalogued flags:",missing,"No remaining literal consumers:",stale);
  process.exitCode=1;
}else {
  console.log("Feature-flag source policy PASS:",catalog.size,"literal selectors, all have owner/fallback/removal gate");
  if(process.argv.includes("--report")) {
    const lines=["# Environment flag source inventory","","Not production values. Literal selectors (including local QA), not dynamic environment names. Persisted AppFeatureFlag policy is in qa-handoff.","","| Key | Owner | Missing/invalid setting behavior | Retirement gate | Source consumers |","|---|---|---|---|---|"];
    for(const [key,group] of [...catalog].sort(([a],[b])=>a.localeCompare(b)))lines.push("| `"+key+"` | "+group.owner+" | "+group.fallback+" | "+group.removal+" | "+[...actual.get(key)].sort().map(x=>"`"+x+"`").join(", ")+" |");
    lines.push("", "Persisted controls: gafus-architecture-roadmap-20261126-product-flags.md.");
    fs.writeFileSync(path.join(root,"docs/audit/gafus-architecture-roadmap-20261126-environment-flags.md"),lines.join("\n")+"\n");
  }
}
