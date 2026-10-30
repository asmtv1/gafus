#!/usr/bin/env node
/** AG2 G05 runner. NO real POST without standalone AG4 WEB grant+AG3 DONE+AG1 READY+AG4 lease. */
import {spawnSync} from "node:child_process";
import {readG05WebGate,ROOT} from "./g05-web-gate.mjs";

const [mode,flag,path,confirm] = process.argv.slice(2);
function usage(){
  process.stderr.write("Modes: --dry-run | --check-gate --grant <project-relative-path> | --real --grant <path> --I-ACKNOWLEDGE-WEB-LOCAL-POST\n");
  process.exitCode=64;
}
if(mode==="--dry-run" && !flag){
  const local=spawnSync("pnpm",["--filter","@gafus/web-vite","exec","vitest",
    "run","src/features/pets/g05WebRealConsumerAdapter.integration.test.ts",
    "--reporter=dot"],{cwd:ROOT,stdio:"inherit",
    env:{...process.env,G05_AG2_WEB_RUN:"0"}});
  if(local.error||local.status!==0){process.exitCode=local.status||1;}
  else {
    const guards=spawnSync("node",["--test","apps/web-vite/scripts/g05-web-gate.test.mjs"],
      {cwd:ROOT,stdio:"inherit",env:{...process.env,G05_AG2_WEB_RUN:"0"}});
    process.exitCode=guards.status||0;
  }
}else if((mode==="--check-gate" || mode==="--real") &&
  flag==="--grant"&&typeof path==="string"&&
  (mode==="--check-gate"?!confirm:confirm==="--I-ACKNOWLEDGE-WEB-LOCAL-POST")){
  try{
    if(mode==="--real" && process.env.G05_AG2_WEB_REAL_EXPLICIT!=="YES")throw Error("NO_EXPLICIT_OPTIN");
    const gate=readG05WebGate(path);
    // Never print tokens, body, UUIDs or server credentials.
    process.stdout.write("G05 Web exclusive gate ACCEPTED (isolated synthetic only); cases "+
      gate.allowedCases.join(", ")+"\n");
    if(mode==="--real"){
      const run=spawnSync("pnpm",["--filter","@gafus/web-vite","exec","vitest",
        "run","src/features/pets/g05WebRealConsumer.real.test.ts",
        "--reporter=dot"],{cwd:ROOT,stdio:"inherit",env:{
          ...process.env,G05_AG2_WEB_RUN:"1",G05_AG2_WEB_GRANT_RELATIVE:path,
        }});
      process.exitCode=run.status||0;
      if(run.error)process.exitCode=1;
    }
  }catch{
    process.stderr.write("G05_WEB_GATE_DENIED: no network request made by runner\n");
    process.exitCode=78;
  }
}else usage();
