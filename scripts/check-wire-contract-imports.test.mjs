import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const script=fileURLToPath(new URL("./check-wire-contract-imports.mjs",import.meta.url));
test("only type-only public contracts are accepted",()=>{
 const root=mkdtempSync(path.join(tmpdir(),"gafus-wire-"));
 try {
  for(const dir of ["packages/types/src/data","apps/api/src"]) mkdirSync(path.join(root,dir),{recursive:true});
  writeFileSync(path.join(root,"packages/types/package.json"),JSON.stringify({exports:{"./course":{types:"./dist/data/course.d.ts"}}}));
  writeFileSync(path.join(root,"packages/types/src/data/course.ts"),"export type Course={id:string};");
  const file=path.join(root,"apps/api/src/route.ts");
  const run=()=>spawnSync(process.execPath,[script,"--project-root",root],{encoding:"utf8"});
  writeFileSync(file,'import type {Course} from "@gafus/types/course";');
  assert.equal(run().status,0);
  writeFileSync(file,'import type {Course} from "../../../packages/types/src/data/course";');
  assert.match(run().stderr,/private source paths/);
  assert.equal(run().status,1);
  writeFileSync(file,'import {Course} from "@gafus/types/course";');
  assert.match(run().stderr,/type-only/);
  assert.equal(run().status,1);
  writeFileSync(file,'void import("@gafus/types/course");');
  assert.equal(run().status,1);
 }finally{rmSync(root,{recursive:true,force:true});}
});
