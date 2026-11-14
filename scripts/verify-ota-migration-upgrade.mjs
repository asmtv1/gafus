#!/usr/bin/env node
/** Replay all OTA-only migrations over a clean snapshot of pre-refactor HEAD schema. */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { spawnSync, execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const migrations=[
  "20261112180500_signed_mobile_ota_registry",
  "20261112191500_mobile_ota_signed_ci_attestation",
  "20261112194500_mobile_ota_native_release_audit",
  "20261112201500_mobile_ota_native_fingerprint_isolation",
  "20261112211500_mobile_source_patch_operation_id",
  "20261112224500_mobile_ota_cohort_rollouts",
  "20261112230000_mobile_ota_installation_telemetry",
];
const defaultDb=process.env.GAFUS_OTA_TEST_PG_URL;
if(process.argv.length!==3 || process.argv[2]!=="--execute" || !defaultDb)
  throw Error("REQUIRES --execute AND GAFUS_OTA_TEST_PG_URL FOR ISOLATED_LOCAL_POSTGRESQL");
const base=new URL(defaultDb);
if(base.protocol!=="postgresql:" || base.hostname!=="127.0.0.1" || base.port!=="55673" ||
  base.pathname!=="/gafus_ota_preview_qa")
  throw Error("REFUSING_NON_ISOLATED_DATABASE");
const name=`gafus_ota_ephemeral_${randomBytes(6).toString("hex")}`;
const args=["-h","127.0.0.1","-p","55673","-U",decodeURIComponent(base.username)];
const temp=fs.mkdtempSync(path.join(os.tmpdir(),"gafus-ota-migrations-"));
let created=false;
function run(cmd,arr,options={}){
  const p=spawnSync(cmd,arr,{cwd:root,encoding:"utf8",timeout:90000,
    env:{...process.env,...options.env},maxBuffer:8*1024*1024});
  if(p.error||p.status!==0)throw Error(`${cmd} ${arr.join(" ")} failed (rc ${p.status}): ${(p.stderr||p.stdout||"").slice(-1700)}`);
  return p.stdout;
}
try{
  run("psql",[...args,"-d","postgres","-v","ON_ERROR_STOP=1","-c",`CREATE DATABASE ${name}`]);
  created=true;
  const schema=execFileSync("git",["show","HEAD:packages/prisma/schema.prisma"],{cwd:root,encoding:"utf8"});
  const schemaFile=path.join(temp,"legacy-schema.prisma");fs.writeFileSync(schemaFile,schema,{mode:0o600});
  const url=new URL(defaultDb);url.pathname=`/${name}`;
  run("pnpm",["--filter","@gafus/prisma","exec","prisma","db","push","--skip-generate","--schema",schemaFile],
    {env:{DATABASE_URL:url.toString()}});
  for(const migration of migrations){
    const sql=path.join(root,"packages/prisma/migrations",migration,"migration.sql");
    if(!fs.existsSync(sql))throw Error(`OTA_MIGRATION_MISSING:${migration}`);
    run("psql",[...args,"-d",name,"-v","ON_ERROR_STOP=1","-f",sql]);
  }
  const query=`SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('MobileOtaDeployment','MobileOtaRelease','MobileOtaTelemetryEvent','MobileNativeRelease','MobilePatchDefinition')`;
  const count=Number(run("psql",[...args,"-d",name,"-At","-c",query]).trim());
  if(count!==5)throw Error(`OTA_MIGRATION_TABLES_MISSING:${count}`);
  const columns=Number(run("psql",[...args,"-d",name,"-At","-c",
    `SELECT COUNT(*) FROM information_schema.columns WHERE table_name='MobileOtaAuditEvent' AND column_name='rolloutPercent'`]).trim());
  if(columns!==1)throw Error("OTA_ROLLOUT_AUDIT_COLUMN_MISSING");
  console.log(JSON.stringify({status:"LEGACY_TO_OTA_MIGRATIONS_PASS",migrationsApplied:migrations.length,
    otaTablesChecked:count,rolloutAuditColumn:true,ephemeralDb:name}));
}finally{
  if(created){
    // Drop ONLY this freshly random, in-process-created local DB, no other DB.
    try{run("psql",[...args,"-d","postgres","-v","ON_ERROR_STOP=1","-c",`DROP DATABASE ${name}`]);}
    catch(error){console.error(`QA_DB_CLEANUP_FAILED: ${error instanceof Error?error.message:String(error)}`);process.exitCode=1;}
  }
  fs.rmSync(temp,{recursive:true,force:true});
}
