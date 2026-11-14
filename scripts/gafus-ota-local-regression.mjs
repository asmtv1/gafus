#!/usr/bin/env node
/** OTA-specific final regression, dry-run first. No deploy, migrate, install, Git writes. */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const requested=process.argv.slice(2);
const allowed=new Set(["--execute","--with-isolated-db"]);
if(requested.some(v=>!allowed.has(v)) || new Set(requested).size!==requested.length)
  throw Error("INVALID_OTA_LOCAL_REGRESSION_FLAG");
const execute=requested.includes("--execute");
const withDb=requested.includes("--with-isolated-db");
const db="postgresql://asmtv1@127.0.0.1:55673/gafus_ota_preview_qa?schema=public";
const jobs=[
  ["prisma-schema",["pnpm","--filter","@gafus/prisma","exec","prisma","validate"]],
  ["old-schema-shape-compat",["node","scripts/verify-ota-schema-backcompat.mjs"]],
  ["OTA-architecture",["pnpm","check:core-boundaries"]],
  ["OTA-server-build",["pnpm","--filter","@gafus/mobile-ota-server","build"]],
  ["OTA-server-cohorts",["pnpm","--filter","@gafus/mobile-ota-server","exec","vitest","run","--config","vitest.rollout.config.ts","--reporter=dot"]],
  ["OTA-API-typecheck",["pnpm","--filter","@gafus/api","typecheck"]],
  ["OTA-mobile-typecheck",["pnpm","--filter","@gafus/mobile","typecheck"]],
  ["OTA-admin-typecheck",["pnpm","--filter","@gafus/admin-panel","typecheck"]],
  ["OTA-worker-typecheck",["pnpm","--filter","@gafus/worker","typecheck"]],
  ["OTA-API-contracts",["pnpm","--filter","@gafus/api","exec","vitest","run",
    "src/modules/mobile-ota/manifest-protocol.test.ts",
    "src/modules/mobile-ota/ci-registration.test.ts",
    "src/routes/v1/admin-mobile-ota.test.ts",
    "src/routes/v1/mobile-ota.actual-app-mounted.test.ts",
    "src/routes/v1/internal-mobile-ota-ci.test.ts",
    "src/routes/mobile-ota-telemetry.test.ts",
    "src/routes/v1/app-subscription.route.test.ts","--reporter=dot"]],
  ["OTA-mobile-and-Apple",["pnpm","--filter","@gafus/mobile","exec","vitest","run",
    "src/features/app-subscription","src/shared/lib/ota",
    "src/shared/lib/tracer/tracerConfig.self-hosted-ota.test.ts","--reporter=dot"]],
  ["OTA-offline-security-and-CI",["node","--test",
    "apps/mobile/scripts/verify-ota-preview-workflow.test.mjs",
    "apps/mobile/scripts/source-recovery-preflight.test.mjs",
    "apps/mobile/scripts/native-source-fingerprint.test.mjs",
    "apps/mobile/scripts/verify-ota-preview-native-trust.test.mjs",
    "apps/mobile/scripts/prepare-self-hosted-native-build.test.mjs",
    "apps/mobile/scripts/prepare-self-hosted-native-verification.test.mjs",
    "apps/mobile/scripts/self-hosted-ota-artifact.test.mjs",
    "apps/mobile/scripts/self-hosted-native-profile.test.cjs",
    "apps/mobile/scripts/self-hosted-ota-public-env.test.mjs",
    "apps/mobile/scripts/ota-target.test.mjs",
    "apps/mobile/plugins/withIosStoreKitOnlyPodfile.test.cjs",
    "apps/mobile/scripts/verify-ios-payment-native-deps.test.mjs"]],
  ["OTA-S3-and-CDN",["pnpm","--filter","@gafus/cdn-upload","exec","node","--test","scripts/upload-mobile-ota-assets.test.mjs"]],
  ["OTA-real-iOS-graph",["node","apps/mobile/scripts/verify-ios-payment-graph.mjs"]],
  ["OTA-native-payment-pod-audit",["node","apps/mobile/scripts/verify-ios-payment-native-deps.mjs"]],
  ["OTA-API-build",["pnpm","--filter","@gafus/api","build"]],
  ["OTA-admin-build",["pnpm","--filter","@gafus/admin-panel","build"]],
];
if(withDb){
  jobs.push(["OTA-legacy-migration-replay",["node","scripts/verify-ota-migration-upgrade.mjs","--execute"]]);
  jobs.push(["OTA-legacy-Prisma-runtime",["node","scripts/verify-ota-legacy-prisma-compat.mjs","--execute"]]);
  jobs.push(["OTA-isolated-PostgreSQL-and-e2e",["pnpm","--filter","@gafus/mobile-ota-server",
    "exec","vitest","run","--config","vitest.realpg.config.ts","--reporter=dot"]]);
}
const compatDb="postgresql://asmtv1@127.0.0.1:55673/gafus_ota_snapshot_20261112?schema=public";
if(withDb && execute && (process.env.DATABASE_URL!==db ||
   process.env.GAFUS_OTA_TEST_PG_URL!==db || process.env.GAFUS_OTA_TEST_ISOLATED!=="1" ||
   process.env.GAFUS_OTA_COMPAT_DB_URL!==compatDb))
  throw Error("ISOLATED_LOCAL_DATABASE_AND_COMPAT_SNAPSHOT_REQUIRED");
const resultDir=process.env.GAFUS_OTA_QA_OUTPUT_DIR || path.join(os.tmpdir(),"gafus-ota-regression-20261112");
const report={mode:execute?"EXECUTED":"DRY_RUN",root:ROOT,
  isolatedDb:withDb,startedAt:new Date().toISOString(),jobs:[],
  policy:"No production writes, deploy, push, external cloud or native installation; migrations only in freshly created and dropped local QA DB"};
if(execute)fs.mkdirSync(resultDir,{recursive:true});
for(const [name,argv] of jobs){
  const display=argv.join(" ");
  if(!execute){console.log(`${name}: ${display}`);continue;}
  const start=Date.now();
  const env={...process.env};
  if(name==="prisma-schema" && !env.DATABASE_URL)env.DATABASE_URL=db;
  console.log(`BEGIN ${name}`);
  const run=spawnSync(argv[0],argv.slice(1),{cwd:ROOT,env,encoding:"utf8",
    maxBuffer:64*1024*1024,timeout:20*60_000});
  const output=(run.stdout??"")+"\n"+(run.stderr??"");
  const filename=`${String(report.jobs.length+1).padStart(2,"0")}-${name.replace(/[^A-Za-z0-9-]/g,"_")}.log`;
  fs.writeFileSync(path.join(resultDir,filename),output,{mode:0o600});
  const item={name,command:display,exitCode:run.status??-1,
    ms:Date.now()-start,log:filename,pass:run.status===0 && !run.error};
  report.jobs.push(item);
  console.log(`${item.pass?"PASS":"FAIL"} ${name} ${item.ms}ms`);
  if(!item.pass){report.failed=name;break;}
}
if(execute){
  report.finishedAt=new Date().toISOString();
  fs.writeFileSync(path.join(resultDir,"manifest.json"),JSON.stringify(report,null,2),{mode:0o600});
  console.log(`Result manifest: ${path.join(resultDir,"manifest.json")}`);
  if(report.failed)process.exitCode=1;
}else console.log(`DRY_RUN: ${jobs.length} serialized stages; nothing executed.`);
