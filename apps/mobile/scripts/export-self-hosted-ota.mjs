#!/usr/bin/env node
/** Build JS with an embedded monotonic revision in an isolated, clean checkout. */
import path from "node:path";
import fs from "node:fs";
import { spawnSync, execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { withCompiledOtaRevision } from "./ota-revision-release.mjs";

const mobileRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const repoRoot = path.resolve(mobileRoot,"../..");
function run(program,args, stdio="inherit") {
  const out = spawnSync(program,args,{cwd:mobileRoot,env:process.env,stdio,
    encoding: stdio==="pipe"?"utf8":undefined, maxBuffer:16*1024*1024});
  if (out.error) throw out.error;
  if (out.status!==0) throw Error(`SELF_HOSTED_EXPORT_COMMAND_FAILED_${program}_${out.status}`);
  return out.stdout;
}
async function main() {
  const [platform,revisionRaw,outputDir,configFile]=process.argv.slice(2);
  const revision=Number(revisionRaw);
  if (!["ios","android"].includes(platform) || !/^[1-9]\d*$/.test(revisionRaw??"") ||
      !Number.isSafeInteger(revision) || !outputDir || !configFile)
    throw Error("USAGE: export-self-hosted-ota.mjs <ios|android> <revision> <outputDir> <configFile>");
  if (process.env.GAFUS_OTA_TRANSPORT!=="self-hosted" ||
      process.env.GAFUS_OTA_TARGET_PLATFORM!==platform)
    throw Error("SELF_HOSTED_EXPORT_NATIVE_PROFILE_REQUIRED");
  if (execFileSync("git",["status","--porcelain"],{cwd:repoRoot,encoding:"utf8"}).trim())
    throw Error("SELF_HOSTED_EXPORT_CHECKOUT_MUST_BE_CLEAN");
  const target=path.resolve(outputDir);
  if (fs.existsSync(target) && fs.readdirSync(target).length)
    throw Error("SELF_HOSTED_EXPORT_OUTPUT_MUST_BE_EMPTY");
  fs.mkdirSync(path.dirname(target),{recursive:true});
  await withCompiledOtaRevision(revision, async()=>{
    run("pnpm",["exec","expo","export","--platform",platform,
      "--output-dir",target,"--source-maps","external"]);
    const configJson=run("pnpm",["exec","expo","config","--type","public","--json"],"pipe");
    const config=JSON.parse(configJson);
    if (config.updates?.url===undefined ||
        config.extra?.otaTransport!=="self-hosted" || config.version===undefined ||
        config.extra?.otaTracerVersion!==process.env.EXPO_PUBLIC_APP_VERSION)
      throw Error("EXPORTED_NATIVE_PROFILE_OR_TRACER_VERSION_MISMATCH");
    fs.writeFileSync(configFile,JSON.stringify(config,null,2),{flag:"wx",mode:0o600});
  });
  if (execFileSync("git",["status","--porcelain"],{cwd:repoRoot,encoding:"utf8"}).trim())
    throw Error("SELF_HOSTED_EXPORT_DID_NOT_RESTORE_SOURCE");
  console.log(JSON.stringify({status:"EXPORTED_UNPUBLISHED",platform,revision,outputDir:target,configFile}));
}
main().catch(err=>{console.error(err instanceof Error?err.message:String(err));process.exitCode=1;});
