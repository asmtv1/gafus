/** CI033 machine-readable allowlisted summary. Never persist child stdout/stderr. */
import {spawnSync} from "node:child_process";
import {mkdirSync,writeFileSync} from "node:fs";
import {resolve} from "node:path";

const commands={fixtures:["--test","scripts/refactor/verify_vite_browser_boundary.test.mjs"],boundary:["scripts/refactor/verify_vite_browser_boundary.mjs"]};
const kind=process.argv[2];
if(!Object.hasOwn(commands,kind)){console.error("CI033_INVALID_STAGE");process.exit(2)}
const args=commands[kind];
const result=spawnSync(process.execPath,args,{cwd:process.cwd(),encoding:"utf8",maxBuffer:2*1024*1024,timeout:180000});
const code=result.error?1:typeof result.status==="number"?result.status:1;
// Deliberately do not persist raw logs, environment, source paths, stderr or stack traces.
const body={schema:"ci033-architecture-summary-v1",stage:kind,status:code===0?"pass":"fail",exitCode:code,revision:/^[a-f0-9]{40}$/.test(process.env.GITHUB_SHA??"")?process.env.GITHUB_SHA:"unavailable",errorCategory:result.error?"EXECUTION_ERROR":code===0?"NONE":"CHECK_FAILED"};
const output=resolve(process.cwd(),".ci033-report",kind+".json");
mkdirSync(resolve(process.cwd(),".ci033-report"),{recursive:true,mode:0o700});
writeFileSync(output,JSON.stringify(body,null,2)+"\n",{mode:0o600});
console.log(`CI033_${kind.toUpperCase()}_${body.status.toUpperCase()} exit_code=${code} report_written=true`);
process.exitCode=code;
