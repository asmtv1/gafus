#!/usr/bin/env node
/** Apply only in a disposable sandbox; local delivery/production are untouched. */
import fs from "node:fs";
import path from "node:path";
import { dryRunSourceRecovery } from "./source-recovery-preflight.mjs";

const OPTIONS=new Set(["repository","base-sha","patch","definition","output"]);
function argvOptions(args) {
  if(args.length!==OPTIONS.size*2) throw Error("RECOVERY_PREFLIGHT_ARGUMENTS_REQUIRED");
  const result={};
  for(let i=0;i<args.length;i+=2) {
    if(!args[i]?.startsWith("--") || !OPTIONS.has(args[i].slice(2)) ||
      !args[i+1] || args[i+1].startsWith("--") || args[i].slice(2) in result)
      throw Error("RECOVERY_PREFLIGHT_UNKNOWN_OR_DUPLICATE_ARGUMENT");
    result[args[i].slice(2)]=args[i+1];
  }
  return result;
}
try {
  const args=argvOptions(process.argv.slice(2));
  const definition=JSON.parse(fs.readFileSync(path.resolve(args.definition),"utf8"));
  const result=dryRunSourceRecovery({
    repositoryRoot:args.repository,baseSha:args["base-sha"],
    patchPath:args.patch,definition,outputDir:args.output,
  });
  console.log(JSON.stringify(result));
} catch(e) {
  console.error(e instanceof Error?e.message:String(e));
  process.exitCode=1;
}
