/**
 * Manual first-install entrypoint for an operator-created NEW OWNED loopback PG18.
 * No production support; never creates/drops/repairs a database. By default it
 * refuses to run. Existing DBs / partial migration journals are never resumed.
 * Example and prerequisites are in README.md. No secrets are logged.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { installFreshV1, verifyOwnedNewDatabaseUrl, verifyFreshV1Source } from './fresh-v1-installer.mjs';

const here=dirname(fileURLToPath(import.meta.url));
const root=resolve(here,'../../..');
const cli=join(root,'packages/prisma/node_modules/.bin/prisma');
const bin='/opt/homebrew/opt/postgresql@18/bin';
const dburl=process.env.GAFUS_NEW_DB_BOOTSTRAP_URL;
if(process.argv.length!==3 || process.argv[2]!=='--apply') {
  console.log('REFUSED: --apply + NEW_DB_BOOTSTRAP=1 + confirmed fresh-owned localhost PG18 URL required. No DB touched.');
  process.exit(2);
}
assert.equal(process.env.NEW_DB_BOOTSTRAP,'1','EXPLICIT_FRESH_BOOTSTRAP_OPT_IN_REQUIRED');
assert(dburl,'FRESH_ONLY_EXPLICIT_NEW_DB_URL_REQUIRED');
const db=verifyOwnedNewDatabaseUrl(dburl);
assert.equal(process.env.GAFUS_NEW_DB_CONFIRM_NAME,db,'FRESH_ONLY_CONFIRM_EXACT_DB_NAME');
verifyFreshV1Source();
assert(existsSync(cli),'LOCAL_PRISMA_CLI_REQUIRED');
assert(existsSync(join(bin,'psql')),'OWNED_LOCAL_POSTGRES18_PSQL_REQUIRED');
const url=new URL(dburl);
const home=join(root,'.gafus-refactoring/architecture-qa-20261103-local/bootstrap');
mkdirSync(home,{recursive:true});
const scratch=mkdtempSync(join(home,'option-a-v1-manual-own-'));
const env={
  PATH:`${bin}:${process.env.PATH??'/usr/bin:/bin'}`,
  HOME:scratch,LC_ALL:'C',LANG:'C',NODE_ENV:'test',
  PRISMA_HIDE_UPDATE_MESSAGE:'true', PGCONNECT_TIMEOUT:'3',
  PGAPPNAME:'gafus_fresh_v1_manual_owned_only',
};
const pgArgs=['-h','127.0.0.1','-p',url.port,'-U',url.username,'-d',db,
  '-X','-q','-v','ON_ERROR_STOP=1'];
function run(command,args,extraEnv={},timeout=35000) {
  const r=spawnSync(command,args,{cwd:root,env:{...env,...extraEnv},
    encoding:'utf8',timeout,maxBuffer:4*1024*1024});
  if(r.status!==0) throw Error(`${command.split('/').at(-1)} failed. Database may have a PARTIAL baseline:
    do not retry or run on an existing database; reprovision a NEW empty DB after review.
    ${String(r.stderr).slice(-800)}`);
  return r.stdout.trim();
}
try {
  const schemaDir=join(scratch,'schema');
  mkdirSync(schemaDir,{recursive:true});
  const schemaFile=join(schemaDir,'schema.prisma');
  copyFileSync(join(root,'packages/prisma/schema.prisma'),schemaFile);
  cpSync(join(root,'packages/prisma/migrations'),join(schemaDir,'migrations'),{recursive:true});
  const query=sql=>run(join(bin,'psql'),[...pgArgs,'-A','-t','-c',sql]);
  const applyCandidate=()=>run(join(bin,'psql'),[...pgArgs,'--single-transaction',
    '-f',join(here,'fresh-only-precondition.sql'),
    '-f',join(here,'fresh-only-bootstrap.candidate.sql')],{},100000);
  let resolved=0;
  const prisma=args=>{
    const stdout=run(cli,args,{DATABASE_URL:dburl},60000);
    if(args[1]==='resolve') {resolved++;if(resolved%25===0 || resolved===163)
      console.log(`BASELINE_V1 ${resolved}/163`);}
    return stdout;
  };
  const result=installFreshV1({databaseUrl:dburl,schemaFile,query,applyCandidate,prisma});
  console.log(`PASS GAFUS FRESH_V1 installed on new owned localhost DB: historical=${result.recorded}, forwards=${result.forwardApplied}, total=${result.total}`);
  console.log('Never apply this entrypoint to existing PostgreSQL/production.');
} finally {
  // Only our private copied schema/scripts are deleted; no database deletion.
  rmSync(scratch,{recursive:true,force:true});
}
