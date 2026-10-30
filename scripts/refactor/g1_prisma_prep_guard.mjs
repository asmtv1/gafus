/** AG4 read-only scoped lease and expiry guard, no Prisma command. */
import fs from "node:fs";
import path from "node:path";
const ROOT="/Users/asmtv1/Desktop/gafus-refactor";
const ID="G1-PRISMA-AG1-20261016-01";
function stop(why){ throw new Error("AG4_PREP_STOP:"+why); }
const mode=process.argv[2];
if(!["--prepare","--core-wiring"].includes(mode)||process.argv.length!==3) stop("MODE");
if(process.cwd()!==ROOT||fs.realpathSync(ROOT)!==ROOT)stop("ROOT");
const leasePath=path.join(ROOT,"apps/admin-panel/AG4_G1_PRISMA_ACTIVE_LEASE.json");
if(!fs.existsSync(leasePath)||fs.lstatSync(leasePath).isSymbolicLink())stop("LEASE_NOT_FOUND");
const lease=JSON.parse(fs.readFileSync(leasePath,"utf8"));
if(lease.id!==ID||lease.state!=="ACTIVE"||lease.phase!=="SCRATCH_CLIENT_PREP_ONLY"||lease.executor!=="AG1")stop("INACTIVE_OR_WRONG_SCOPE");
const start=Date.parse(lease.startAtUTC),expiry=Date.parse(lease.expiresAtUTC);
if(!Number.isFinite(start)||!Number.isFinite(expiry)||expiry<=start||Date.now()<start||Date.now()>=expiry)stop("EXPIRED");
const scratch=lease.scratchPath;
if(typeof scratch!=="string"||path.dirname(scratch)!==path.join(ROOT,"apps/api")||
  !/^\.g1-prisma-checkpoint\.[a-z0-9_-]{8,64}$/.test(path.basename(scratch))||
  path.normalize(scratch)!==scratch)stop("SCRATCH_PATH");
if(lease.facadePath!==path.join(scratch,"client-facade.ts"))stop("FACADE_PATH");
const db=/^postgresql:\/\/g1@127\.0\.0\.1:55442\/gafus_consultation_limit_test_[a-z0-9_]{8,64}$/;
if(!db.test(lease.databaseURL)||!lease.databaseURL.endsWith(path.basename(scratch).slice(".g1-prisma-checkpoint.".length)))stop("URL_SCOPE");
if(process.env.DATABASE_URL&&process.env.DATABASE_URL!==lease.databaseURL)stop("DATABASE_URL");
if(process.env.NODE_PATH||process.env.NODE_OPTIONS)stop("MODULE_OVERRIDE");
let parent=ROOT;
for(const segment of path.relative(ROOT,scratch).split(path.sep)){
  parent=path.join(parent,segment);
  if(fs.existsSync(parent)&&fs.lstatSync(parent).isSymbolicLink())stop("SCRATCH_SYMLINK");
}
if(fs.existsSync(scratch)){
  const marker=path.join(scratch,".g1-owner");
  if(!fs.existsSync(marker)||fs.lstatSync(marker).isSymbolicLink()||
     fs.readFileSync(marker,"utf8").trim()!=="PRISMA-TEST-TEMP-ONLY")stop("SCRATCH_UNOWNED");
}
if(mode==="--core-wiring"&&!fs.existsSync(lease.facadePath))stop("FACADE_MISSING");
console.log(JSON.stringify({window:ID,status:"PREP_ONLY",expiresAtUTC:lease.expiresAtUTC,
scratchPath:scratch,allowMigration:false,allowDatabaseStart:false}));
