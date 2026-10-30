/** AG4 read-only one-use Prisma scratch/Core lease guard. Never runs Prisma. */
import fs from "node:fs";
import path from "node:path";
const ROOT="/Users/asmtv1/Desktop/gafus-refactor";
const ID="G1-PRISMA-AG1-20261016-02";
const LEASE=path.join(ROOT,"apps/admin-panel/AG4_G1_PRISMA_CORE_LEASE_02.json");
const OLD=path.join(ROOT,"apps/admin-panel/AG4_G1_PRISMA_ACTIVE_LEASE.json");
const stop=(reason)=>{throw new Error("AG4_G1_CORE_LEASE_STOP:"+reason);};
const mode=process.argv[2];
if(!["--setup","--generate","--core"].includes(mode)||process.argv.length!==3)stop("INVALID_ACTION");
if(fs.realpathSync(ROOT)!==ROOT)stop("ROOT");
for(const file of [LEASE,OLD]){
 if(!fs.existsSync(file)||fs.lstatSync(file).isSymbolicLink())stop("UNSAFE_LEASE_FILE");
}
const old=JSON.parse(fs.readFileSync(OLD,"utf8"));
if(old.state!=="CLOSED"||old.id!=="G1-PRISMA-AG1-20261016-01")stop("OLD_LEASE_NOT_CLOSED");
const a=JSON.parse(fs.readFileSync(LEASE,"utf8"));
if(a.id!==ID||a.state!=="ACTIVE"||a.phase!=="SCRATCH_CORE_WIRING_NON_DB_ONLY"||a.executor!=="AG1")stop("NOT_ACTIVE");
if(a.root!==ROOT||a.branch!=="vite")stop("WRONG_PROJECT");
const start=Date.parse(a.startAtUTC),expire=Date.parse(a.expiresAtUTC);
if(!Number.isFinite(start)||!Number.isFinite(expire)||expire<=start||Date.now()<start||Date.now()>=expire)stop("EXPIRED");
const scratch=a.scratchPath;
if(typeof scratch!=="string"||path.dirname(scratch)!==path.join(ROOT,"apps/api")||
 !/^\.g1-prisma-checkpoint\.[a-z0-9_]{8,64}$/.test(path.basename(scratch))||
 path.normalize(scratch)!==scratch)stop("SCRATCH_PATH");
if(a.facadePath!==path.join(scratch,"client-facade.ts")||
 a.testConfigPath!==path.join(scratch,"scratch-vitest.config.ts"))stop("SCRATCH_CONFIG");
const expected="postgresql://g1@127.0.0.1:55442/gafus_consultation_limit_test_"+path.basename(scratch).slice(".g1-prisma-checkpoint.".length);
if(a.databaseURL!==expected||process.env.DATABASE_URL!==expected)stop("DATABASE_URL");
if(process.env.G1_AG4_ACTIVE_LEASE_ID!==ID)stop("LEASE_TOKEN");
if(process.env.NODE_PATH||process.env.NODE_OPTIONS)stop("EXTERNAL_MODULE_ENV");
const cwd=process.cwd();
if(mode==="--setup"){if(cwd!==ROOT&&cwd!==scratch)stop("SETUP_CWD");}
else if(cwd!==scratch||fs.realpathSync(cwd)!==scratch)stop("CORE_CWD_NOT_SCRATCH");
let comp=ROOT;
for(const seg of path.relative(ROOT,scratch).split(path.sep)){
 comp=path.join(comp,seg);
 if(fs.existsSync(comp)&&fs.lstatSync(comp).isSymbolicLink())stop("SCRATCH_SYMLINK");
}
if(fs.existsSync(scratch)){
 const marker=path.join(scratch,".g1-owner");
 if(!fs.existsSync(marker)||fs.lstatSync(marker).isSymbolicLink()||
 fs.readFileSync(marker,"utf8").trim()!=="PRISMA-TEST-TEMP-ONLY")stop("SCRATCH_OWNER");
}
if(mode!=="--setup"){
 const cache=path.join(scratch,"node_modules");
 if(!fs.existsSync(cache)||fs.lstatSync(cache).isSymbolicLink()||!fs.lstatSync(cache).isDirectory())stop("NO_PHYSICAL_SCRATCH_NODE_MODULES");
}
if(mode==="--core"){
 for(const file of [a.facadePath,a.testConfigPath,path.join(scratch,"generated/client/index.js"),path.join(scratch,"generated/client/schema.prisma")]){
 if(!fs.existsSync(file)||fs.lstatSync(file).isSymbolicLink())stop("CORE_ARTIFACT_MISSING");
 }
 const config=fs.readFileSync(a.testConfigPath,"utf8");
 if(!config.includes(ID)||!config.includes("AG4_G1_PRISMA_CORE_LEASE_02.json")||
 config.includes("AG4_G1_PRISMA_ACTIVE_LEASE.json")||config.includes("G1-PRISMA-AG1-20261016-01"))stop("STALE_ALIAS_ATTESTATION");
}
console.log(JSON.stringify({status:"ONE_USE_NON_DB_ONLY",id:ID,mode,expiresAtUTC:a.expiresAtUTC, scratch,allowSql:false,allowMigrate:false}));
