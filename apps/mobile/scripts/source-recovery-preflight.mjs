/**
 * Private, source-only recovery patch preflight. NEVER an OTA update.
 * Git operations occur in a temporary, separate lightweight clone, not in
 * the shared working tree. No arbitrary build commands or shell scripts run.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";

const SOURCE_SHA = /^[a-f\d]{40}$/i;
const SHA256 = /^[a-f\d]{64}$/i;
const SEMVER = /^\d+\.\d+\.\d+$/;
const SAFE_PATH = /^(?:apps\/mobile\/src\/(?:features\/app-subscription|shared\/lib)\/[A-Za-z0-9_.\/-]+|apps\/api\/src\/(?:routes\/v1\/app-subscription|modules\/app-subscription)\/[A-Za-z0-9_.\/-]+|apps\/api\/src\/routes\/v1\/app-subscription\.(?:ts|test\.ts))$/;
const SHA = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
function need(ok, code) { if (!ok) throw new Error(code); }
function git(cwd, args) {
  return execFileSync("git", args, {cwd,encoding:"utf8",maxBuffer:16*1024*1024,timeout:120_000});
}
export function checkSourceRecoveryDefinition(input, patchBytes) {
  need(input && typeof input === "object" && !Array.isArray(input), "INVALID_SOURCE_PATCH_DEFINITION");
  const keys=Object.keys(input);
  const permitted=["version", "kind", "sha256", "allowedBases", "allowedPaths", "nativeRequirements", "sourceLocation"];
  need(keys.every(x=>permitted.includes(x)) && permitted.every(x=>keys.includes(x)), "UNRECOGNIZED_PATCH_DEFINITION_FIELD");
  need(SEMVER.test(input.version) && input.kind === "IOS_CHECKOUT_SOURCE_RECOVERY" &&
    input.nativeRequirements?.publication === "NEW_NATIVE_BUILD_AND_APP_REVIEW" &&
    input.nativeRequirements?.targetPlatform === "ios" &&
    SEMVER.test(input.nativeRequirements?.minimumVersion ?? "") &&
    input.sourceLocation?.startsWith("private://mobile-patches/") &&
    !input.sourceLocation.includes(".."), "INVALID_PATCH_PUBLICATION_SCOPE");
  need(Buffer.isBuffer(patchBytes) && patchBytes.length > 0 && patchBytes.length <= 5*1024*1024 &&
    SHA256.test(input.sha256) && SHA(patchBytes) === input.sha256,
    "SOURCE_PATCH_SHA256_MISMATCH");
  need(Array.isArray(input.allowedBases) && input.allowedBases.length > 0 &&
    input.allowedBases.length <= 40 && input.allowedBases.every(x=>typeof x==="string" && SOURCE_SHA.test(x)) &&
    new Set(input.allowedBases).size===input.allowedBases.length,
    "SOURCE_PATCH_BASES_INVALID");
  need(Array.isArray(input.allowedPaths) && input.allowedPaths.length > 0 &&
    input.allowedPaths.length <= 40 && input.allowedPaths.every(x=>
      typeof x==="string" && SAFE_PATH.test(x) &&
      !x.split("/").some(part => part===".." || part==="." || part==="") &&
      !x.endsWith(".sh") && !x.endsWith(".mjs") && !x.endsWith(".cjs")) &&
    new Set(input.allowedPaths).size===input.allowedPaths.length,
    "SOURCE_PATCH_PATHS_NOT_ALLOWED");
  return true;
}

export function dryRunSourceRecovery({repositoryRoot,baseSha,patchPath,definition,outputDir}) {
  need(SOURCE_SHA.test(baseSha) && definition.allowedBases.includes(baseSha),
    "SOURCE_PATCH_BASE_NOT_APPROVED");
  const repository = path.resolve(repositoryRoot);
  need(fs.existsSync(path.join(repository,".git")) ||
    git(repository,["rev-parse","--is-inside-work-tree"]).trim()==="true",
    "SOURCE_REPOSITORY_INVALID");
  need(git(repository,["cat-file","-t",baseSha]).trim()==="commit", "SOURCE_BASE_COMMIT_MISSING");
  const patchBytes=fs.readFileSync(patchPath);
  checkSourceRecoveryDefinition(definition,patchBytes);
  need(!definition.nativeRequirements?.otaCompatible,
    "SOURCE_RECOVERY_MUST_NOT_BE_OTA_COMPATIBLE");
  const output=path.resolve(outputDir);
  need(!fs.existsSync(output) || fs.readdirSync(output).length===0,
    "RECOVERY_OUTPUT_MUST_BE_EMPTY");
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"gafus-recovery-preflight-"));
  const checkout=path.join(root,"source");
  try {
    // Lightweight clone shares only immutable Git objects; it is NOT a worktree
    // and cannot alter the source index or any uncommitted agent changes.
    git(repository,["clone","--shared","--quiet","--no-checkout",repository,checkout]);
    git(checkout,["checkout","--quiet","--detach",baseSha]);
    need(git(checkout,["status","--porcelain"]).trim()==="", "RECOVERY_SANDBOX_NOT_CLEAN");
    const numstat=git(checkout,["apply","--numstat","--",path.resolve(patchPath)]);
    const summary=git(checkout,["apply","--summary","--",path.resolve(patchPath)]);
    need(!/(rename|copy|mode change|create mode 120000|delete mode 120000)/i.test(summary),
      "SOURCE_PATCH_UNSAFE_FILE_OPERATION");
    const touched = numstat.trim().split("\n").filter(Boolean).map(x=>{
      const parts=x.split("\t");
      need(parts.length===3 && /^(?:\d+|-)$/.test(parts[0]) && /^(?:\d+|-)$/.test(parts[1]),
        "SOURCE_PATCH_UNSUPPORTED_DIFF");
      return parts[2];
    });
    need(touched.length>0 && touched.length<=definition.allowedPaths.length &&
      touched.every(x=>definition.allowedPaths.includes(x)) && new Set(touched).size===touched.length,
      "SOURCE_PATCH_TOUCHES_FORBIDDEN_PATH");
    git(checkout,["apply","--check","--",path.resolve(patchPath)]);
    git(checkout,["apply","--index","--",path.resolve(patchPath)]);
    const staged=git(checkout,["diff","--cached","--name-only","--"])
      .trim().split("\n").filter(Boolean);
    need(staged.length===touched.length && staged.every(x=>touched.includes(x)),
      "SOURCE_PATCH_STAGED_DIFF_MISMATCH");
    git(checkout,["diff","--cached","--check"]);
    const resultTree=git(checkout,["write-tree"]).trim();
    const patchSha256=SHA(patchBytes);
    const record={
      type:"PRIVATE_SOURCE_RECOVERY_CHECK_ONLY", compatible:true,
      sourceBaseSha:baseSha,resultTreeSha:resultTree,
      patchSha256,patchVersion:definition.version,changedPaths:staged.sort(),
      nativeRequirements:definition.nativeRequirements,
      status:"DRY_RUN_PASS_NO_PRODUCTION_CHANGE",
    };
    fs.mkdirSync(output,{recursive:true,mode:0o700});
    fs.writeFileSync(path.join(output,"verification.json"),
      JSON.stringify(record,null,2),{flag:"wx",mode:0o600});
    return record;
  } finally { fs.rmSync(root,{recursive:true,force:true}); }
}
