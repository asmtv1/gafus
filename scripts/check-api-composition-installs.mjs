/** Fail-closed migration ratchet for the 34 legacy API side-effect installers.
 * Removing an installer is allowed; silently introducing/re-introducing one is not.
 * Each historical entry documents owning module, server provider and direct
 * consumers that were present when the migration began. */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";
import { execFileSync } from "node:child_process";
const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const snapshotFile=resolve(root,"docs/audit/api-composition-baseline-20261118.json");
const app=readFileSync(resolve(root,"apps/api/src/app.ts"),"utf8");
const sourceImports=[...app.matchAll(/^import "(\.\/modules\/[^"\n]+\/composition\/install-[^"\n]+\.js)";/gm)]
  .map(match=>match[1].replace(/^\.\//,""))
  .sort();
const paths=execFileSync("git",["ls-files","--","apps/api/src","packages/worker/src","packages/core/src","packages/course-server/src"],{cwd:root,encoding:"utf8"})
  .trim().split("\n").filter(f=>/\.(?:ts|tsx|js|mjs)$/.test(f)&&!/\.test\./.test(f)&&existsSync(resolve(root,f)));
const importData=new Map(paths.map(file=>[file,readFileSync(resolve(root,file),"utf8")]));
function inventory(){
  return sourceImports.map(entry=>{
    const file="apps/api/src/"+entry.replace(/\.js$/, ".ts");
    const source=readFileSync(resolve(root,file),"utf8");
    const registrations=[...new Set([...source.matchAll(/\b(register\w+Port)\s*\(/g)].map(m=>m[1]))].sort();
    const contracts=[...new Set([...source.matchAll(/from\s+"(@gafus\/core[^"\n]+)"/g)].map(m=>m[1]))].sort();
    const providers=[...new Set([...source.matchAll(/from\s+"(@gafus\/(?!core)[^"\n]+)"/g)].map(m=>m[1]))].sort();
    const directConsumers=paths.filter(candidate=>candidate!==file&&contracts.some(contract=>importData.get(candidate)?.includes(`from "${contract}"`))).sort();
    return {installation:file,owner:entry.split("/")[1],registrations,contracts,providers,directConsumers};
  });
}
function compare(current,baseline){
  const original=new Set(baseline.map(row=>row.installation));
  const active=new Set(current.map(row=>row.installation));
  return {
    newInstallers:[...active].filter(f=>!original.has(f)),
    retired:[...original].filter(f=>!active.has(f)),
    remaining:current.length,
  };
}
if(process.argv.includes("--snapshot")){
  if(sourceImports.length!==34) throw Error(`EXPECT_ORIGINAL_34_GOT_${sourceImports.length}`);
  try{readFileSync(snapshotFile);throw Error("BASELINE_ALREADY_EXISTS: do not overwrite");}
  catch(e){if(e?.code!=="ENOENT")throw e;}
  writeFileSync(snapshotFile,JSON.stringify({revision:"04052d616",created:"2026-11-18",installers:inventory()},null,2)+"\n");
  process.stdout.write(`API_COMPOSITION_BASELINE_CAPTURED ${sourceImports.length}\n`);
} else {
  const base=JSON.parse(readFileSync(snapshotFile,"utf8"));
  if(!Array.isArray(base.installers)||base.installers.length!==34) throw Error("INVALID_API_COMPOSITION_BASELINE");
  const diff=compare(inventory(),base.installers);
  if(diff.newInstallers.length) throw Error("NEW_API_GLOBAL_REGISTRATIONS_BLOCKED:\n"+diff.newInstallers.join("\n"));
  if(process.argv.includes("--require-zero") && diff.remaining !== 0) throw Error(`API_EXPLICIT_DI_REQUIRED: ${diff.remaining} legacy global installers remain`);
  process.stdout.write(`API_COMPOSITION_RATCHET_PASS ${diff.remaining}/34 legacy installers remain, retired=${diff.retired.length}\n`);
}
