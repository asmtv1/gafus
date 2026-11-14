#!/usr/bin/env node
/**
 * Reproducible old ORM runtime against a NEW additive OTA schema.
 * Generate the unmodified HEAD Prisma client into temporary directories;
 * NO production DB access, no Git checkout/reset, no migrations, no commits.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {execFileSync,spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const pkg=path.join(root,"packages/prisma");
const url=process.env.GAFUS_OTA_COMPAT_DB_URL;
if(!url || process.argv.length!==3 || process.argv[2]!=="--execute")
  throw Error("USAGE: GAFUS_OTA_COMPAT_DB_URL=local-snapshot node scripts/verify-ota-legacy-prisma-compat.mjs --execute");
const target=new URL(url);
if(target.protocol!=="postgresql:" || target.hostname!=="127.0.0.1" || target.port!=="55673" ||
   target.pathname!=="/gafus_ota_snapshot_20261112")
  throw Error("LEGACY_RUNTIME_TEST_REQUIRES_ISOLATED_LOCAL_SNAPSHOT");
const folder=fs.mkdtempSync(path.join(pkg,".ota-legacy-client-"));
const generated=fs.mkdtempSync(path.join(os.tmpdir(),"gafus-ota-legacy-prisma-client-"));
function run(program,args,options={}){
  const p=spawnSync(program,args,{cwd:root,encoding:"utf8",timeout:160000,
    env:{...process.env,...options.env}});
  if(p.error||p.status!==0)throw Error(`${program} ${args.join(" ")} failed (rc=${p.status})\n${(p.stderr||p.stdout||"").slice(-2500)}`);
  return p.stdout;
}
try{
  const original=execFileSync("git",["show","HEAD:packages/prisma/schema.prisma"],{cwd:root,encoding:"utf8"});
  const needle='  provider      = "prisma-client-js"';
  if(original.split(needle).length!==2)throw Error("HEAD_PRISMA_CLIENT_GENERATOR_CHANGED");
  const source=original.replace(needle,`${needle}\n  output        = "${generated}"`);
  const schemaFile=path.join(folder,"schema.prisma");
  fs.writeFileSync(schemaFile,source,{mode:0o600});
  // A schema inside the package can see @prisma/client without npm auto-install.
  const printed=run("pnpm",["--filter","@gafus/prisma","exec","prisma","generate","--schema",schemaFile],
    {env:{DATABASE_URL:url}});
  if(!printed.includes("Generated Prisma Client"))throw Error("MISSING_LEGACY_CLIENT_GENERATION_CONFIRMATION");
  fs.symlinkSync(path.join(pkg,"node_modules"),path.join(generated,"node_modules"),"dir");
  const passed=run("node",["scripts/verify-ota-legacy-runtime.mjs"],
    {env:{DATABASE_URL:url,GAFUS_OTA_LEGACY_PRISMA_CLIENT_DIR:generated}});
  const parsed=JSON.parse(passed.trim());
  if(parsed.status!=="OLD_PRISMA_RUNTIME_CRUD_PASS" || parsed.legacyModels!==190 || parsed.writesPersisted)
    throw Error("LEGACY_PRISMA_RUNTIME_DID_NOT_PASS");
  console.log(JSON.stringify({status:"LEGACY_CLIENT_ON_NEW_SCHEMA_PASS",baselineHead:
    execFileSync("git",["rev-parse","--short","HEAD"],{cwd:root,encoding:"utf8"}).trim(),
    ...parsed}));
}finally{
  fs.rmSync(folder,{recursive:true,force:true});
  fs.rmSync(generated,{recursive:true,force:true});
}
