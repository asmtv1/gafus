#!/usr/bin/env node
/* G0 four-agent ownership and handoff integrity, no writes/network/symlink traversal. */
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

const ROOT = "/Users/asmtv1/Desktop/gafus-refactor";
const runGit = args => execFileSync("git",["-C",ROOT,...args],{encoding:"utf8"}).trim();
assert.equal(process.cwd(),ROOT,"Wrong cwd");
assert.equal(fs.realpathSync(ROOT),ROOT,"Symlinked root");
assert.equal(runGit(["rev-parse","--show-toplevel"]),ROOT,"Wrong Git root");
assert.equal(runGit(["branch","--show-current"]),"vite","Unexpected branch");
function safe(rel) {
  assert(!path.isAbsolute(rel) && !rel.split("/").some(x=>!x || x==="." || x===".."),
    "Invalid relative path: "+rel);
  let curr=ROOT;
  for(const segment of rel.split("/")){
    curr=path.join(curr,segment);
    if(fs.existsSync(curr)) assert(!fs.lstatSync(curr).isSymbolicLink(),"Symlink: "+rel);
  }
  return curr;
}
const read=rel=>fs.readFileSync(safe(rel),"utf8");
const ownership=JSON.parse(read("docs/refactor/coordination/OWNERSHIP.json"));
const snapshot=JSON.parse(read("docs/refactor/coordination/BASELINE.json"));
assert.equal(ownership.root,ROOT);
assert.equal(snapshot.root,ROOT);
assert.equal(ownership.branch,"vite");
assert.equal(snapshot.branch,"vite");
assert.equal(ownership.checkpoint,snapshot.id);
const specs=[];
for(const [agent,entry] of Object.entries(ownership.owners)){
  assert(["AG1","AG2","AG3","AG4"].includes(agent));
  for(const prefix of entry.prefixes){
    assert(prefix.endsWith("/") && !prefix.startsWith("/"),"Bad prefix "+prefix);
    specs.push({agent,value:prefix,kind:"prefix"});
  }
  for(const file of entry.files){
    assert(!file.endsWith("/") && !file.startsWith("/"),"Bad file "+file);
    specs.push({agent,value:file,kind:"file"});
  }
}
function overlaps(a,b){
  if(a.value===b.value)return true;
  if(a.kind==="prefix" && b.value.startsWith(a.value))return true;
  if(b.kind==="prefix" && a.value.startsWith(b.value))return true;
  return false;
}
for(let i=0;i<specs.length;i++){
  for(let j=i+1;j<specs.length;j++){
    assert(!overlaps(specs[i],specs[j]),
      "Overlapping owners "+JSON.stringify(specs[i])+" vs "+JSON.stringify(specs[j]));
  }
}
function ownerFor(rel){
  safe(rel);
  const matches=specs.filter(s=>s.kind==="file"?s.value===rel:rel.startsWith(s.value));
  assert(matches.length<=1,"Ambiguous owner "+rel);
  return matches[0]?.agent ?? null;
}
let verified=0;
for(const rel of Object.keys(snapshot.hashes)){
  assert(ownerFor(rel),"Unassigned snapshot source "+rel);
  verified++;
}
assert.equal(ownerFor("apps/api/src/app.ts"),"AG1");
assert.equal(ownerFor("apps/web-vite/src/App.tsx"),"AG2");
assert.equal(ownerFor("apps/mobile/src/shared/lib/api/client.ts"),"AG3");
assert.equal(ownerFor("apps/admin-panel/src/middleware.ts"),"AG4");
assert.equal(ownerFor("pnpm-lock.yaml"),"AG4");
assert.equal(ownerFor("docs/refactor/coordination/BASELINE.json"),"AG4");
assert.equal(ownerFor("scripts/refactor/parallel_baseline.py"),"AG4");
assert.equal(ownerFor("unassigned/private-config.txt"),null);
for(let i=1;i<=4;i++){
  const rel="docs/refactor/agents/AGENT_"+i+"_PLAN.md";
  assert.equal(ownerFor(rel),"AG"+i);
  const s=read(rel);
  assert(s.includes(ROOT),"Missing absolute root in "+rel);
  assert(s.includes("## G0 HANDOFF 2026-10-16"),"Missing handoff in "+rel);
  assert(s.includes("OWNERSHIP.json") && s.includes("BASELINE.json"),"Missing freeze references "+rel);
  assert(s.includes("vite"),"Missing expected branch "+rel);
}
for(const rel of ["docs/refactor/coordination/OWNERSHIP.md",
  "docs/refactor/coordination/CONTRACT_FREEZE.md",
  "docs/refactor/coordination/START_PROTOCOL.md",
  "docs/refactor/coordination/OPERATIONS.md",
  "docs/refactor/coordination/LAUNCH_PROMPTS.md",
  "docs/refactor/coordination/GATES.json"]){
  assert.equal(ownerFor(rel),"AG4");
  assert(read(rel).length>100,"Empty coordination doc "+rel);
}
const gates=JSON.parse(read("docs/refactor/coordination/GATES.json"));
assert.equal(gates.baselineId,snapshot.id);
assert.equal(gates.gates.G0_STATIC.status,"PASS");
assert(["OPEN","CLOSED"].includes(gates.gates.P0_PARALLEL_PREPARATION.status));
assert(["PENDING","BLOCKED","FROZEN"].includes(gates.gates.G1_DTO_SEMANTIC.status));
const c=snapshot.counts;
assert.equal(c.webPages,snapshot.web.pages.length);
assert.equal(c.webApi,snapshot.web.apiRoutes.length);
assert.equal(c.webActions,snapshot.web.actions.length);
assert.equal(c.trainerPages,snapshot.trainer.pages.length);
assert.equal(c.adminPages,snapshot.admin.pages.length);
assert.equal(c.honoStaticDeclarations,snapshot.hono.length);
assert.equal(c.mobileApiAdapters,snapshot.mobile.adapters.length);
const statuses={};
for(const row of snapshot.web.apiRoutes){
  for(const match of row.matches){
    statuses[match.state]=(statuses[match.state]??0)+1;
  }
}
assert.equal(Object.values(statuses).reduce((a,b)=>a+b,0),144);
console.log("PASS G0: four owners, no overlapping prefixes, "+verified+
  " hashed sources assigned, four handoffs, docs present");
console.log("HTTP match candidates:",JSON.stringify(statuses));
console.log("Gate status:",JSON.stringify(Object.fromEntries(Object.entries(gates.gates).map(([k,v])=>[k,v.status]))));
