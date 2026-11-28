import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync, execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const guard = fileURLToPath(new URL("./check-workspace-public-exports.mjs",import.meta.url));

function fixture(t) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"gafus-exports-"));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const put=(file,body)=>{
    const dest=path.join(root,file);
    fs.mkdirSync(path.dirname(dest),{recursive:true});
    fs.writeFileSync(dest,typeof body==="string"?body:JSON.stringify(body));
  };
  put("package.json",{devDependencies:{"@gafus/qa":"workspace:*"}});
  put("apps/client/package.json",{name:"@gafus/client",dependencies:{"@gafus/domain":"workspace:*"}});
  put("packages/domain/package.json",{name:"@gafus/domain",exports:{
    ".":{types:"./dist/index.d.ts",default:"./dist/index.js"},
    "./wire":{types:"./dist/wire.d.ts"},
  }});
  put("packages/domain/src/index.ts","export const value=1;");
  put("packages/domain/src/wire.ts","export type Wire={id:string};");
  put("packages/qa/package.json",{name:"@gafus/qa",exports:{".":"./src/index.ts"}});
  put("packages/qa/src/index.ts","export const fixture=1;");
  put("apps/client/src/index.ts",'import {value} from "@gafus/domain"; import type {Wire} from "@gafus/domain/wire";');
  put("apps/client/src/index.test.ts",'import {fixture} from "@gafus/qa";');
  execFileSync("git",["init","-q"],{cwd:root});
  function run(...args){
    return spawnSync(process.execPath,[guard,"--project-root",root,...args],{encoding:"utf8"});
  }
  return {root,put,run};
}
test("accepts runtime, declaration-only and explicit QA-host imports",t=>{
  const {run}=fixture(t);
  const result=run();
  assert.equal(result.status,0,result.stderr);
  assert.match(result.stdout,/1 explicit root QA imports/);
});
test("rejects private source, undeclared runtime and missing exports",t=>{
  const {put,run}=fixture(t);
  put("apps/client/src/bad.ts",`
    import {fixture} from "@gafus/qa";
    import {value} from "../../../packages/domain/src/index";
    import("@gafus/domain/missing");
    require("@gafus/domain/wire");
  `);
  const result=run();
  assert.equal(result.status,1);
  assert.match(result.stderr,/missing declared workspace dependency @gafus\/qa/);
  assert.match(result.stderr,/private cross-workspace source path/);
  assert.match(result.stderr,/missing public export @gafus\/domain\/missing/);
  assert.match(result.stderr,/declaration-only export loaded at runtime/);
});
test("rejects dangling public targets and stale tsconfig paths",t=>{
  const {root,put,run}=fixture(t);
  fs.unlinkSync(path.join(root,"packages/domain/src/wire.ts"));
  put("apps/client/tsconfig.json",{compilerOptions:{paths:{"@gafus/domain/retired":["./old.ts"]}}});
  const result=run();
  assert.equal(result.status,1);
  assert.match(result.stderr,/no source for .\/dist\/wire.d.ts/);
  assert.match(result.stderr,/stale public alias/);
});
test("built mode requires actual emitted targets without executing them",t=>{
  const {put,run}=fixture(t);
  assert.match(run("--built").stderr,/missing built artifact/);
  put("packages/domain/dist/index.js",'throw new Error("must never execute");');
  put("packages/domain/dist/index.d.ts","export declare const value:number;");
  put("packages/domain/dist/wire.d.ts","export type Wire={id:string};");
  const result=run("--built");
  assert.equal(result.status,0,result.stderr);
  assert.match(result.stdout,/built artifacts verified/);
});
