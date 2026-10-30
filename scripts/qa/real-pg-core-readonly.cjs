"use strict";
/** This executable never logs actual data/IDs/credentials; all DB connections local. */
const fs=require("node:fs");
const path=require("node:path");
const dotenv=require("dotenv");
const {Client}=require("pg");
const env={...dotenv.parse(fs.readFileSync(".env")),...(fs.existsSync(".env.local")?dotenv.parse(fs.readFileSync(".env.local")):{})};
const url=new URL(env.DATABASE_URL);
if(!["localhost","127.0.0.1","::1"].includes(url.hostname))throw Error("REFUSE_REMOTE_DATABASE");
url.hostname="127.0.0.1";
url.pathname="/gafus_qa_migration_rehearsal_c_20261029";
url.searchParams.set("schema","public");
url.searchParams.set("options","-c default_transaction_read_only=on");
process.env.DATABASE_URL=url.toString();
process.env.NODE_ENV="test";
const evidence={database:"gafus_qa_migration_rehearsal_c_20261029",readOnly:false,checks:[]};
function assert(label,ok){
 evidence.checks.push({label,pass:!!ok});
 if(!ok)throw Error("QA_ASSERT_FAILED:"+label);
}
async function run(){
 const c=new Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:3000});
 await c.connect();
 let actorId, petId,ownCount;
 try{
  await c.query("BEGIN READ ONLY");
  const t=await c.query("SELECT current_database() AS db, current_setting('default_transaction_read_only') AS readonly");
  assert("DB_IS_EXACT_QA_CLONE",t.rows[0].db===evidence.database);
  assert("PG_SESSION_READ_ONLY",t.rows[0].readonly==="on");
  evidence.readOnly=true;
  const p=await c.query('SELECT "ownerId" FROM "Pet" GROUP BY "ownerId" ORDER BY COUNT(*) DESC LIMIT 1');
  assert("PET_FIXTURE_OWNER_PRESENT",p.rows.length===1);
  actorId=p.rows[0].ownerId;
  const stats=await c.query('SELECT COUNT(*)::int AS cnt, MIN(id) AS one_id FROM "Pet" WHERE "ownerId"=$1',[actorId]);
  ownCount=stats.rows[0].cnt;petId=stats.rows[0].one_id;
  assert("AT_LEAST_ONE_REAL_PET",ownCount>=1);
  const domains=["User","UserProfile","Pet","Course","UserCourse","UserStep","Step","Article","Question","QuestionAnswer","Reminder","GalleryAlbum","GalleryPhoto","FeedPost","FeedComment","FeedMediaAsset","ConsultationBooking","Chat2Conversation","Chat2Message","Chat2Media","AccountStorageCleanup","ReminderMutationReceipt"];
  for(const table of domains){
   const r=await c.query('SELECT COUNT(*)::int AS cnt FROM "'+table+'"');
   assert("REAL_SQL_READ_"+table,Number.isSafeInteger(r.rows[0].cnt));
  }
  const q=await c.query('SELECT COUNT(*)::int cnt FROM "Pet" p LEFT JOIN "User" u ON u.id=p."ownerId" WHERE u.id IS NULL');
  assert("PET_OWNER_FK_NO_ORPHANS",q.rows[0].cnt===0);
  const migration=await c.query('SELECT count(*)::int total, count(*) FILTER (WHERE finished_at IS NULL AND rolled_back_at IS NULL)::int incomplete FROM _prisma_migrations');
  assert("MIGRATION_LEDGER_160_PLUS",migration.rows[0].total>=160);
  assert("MIGRATION_LEDGER_NO_INCOMPLETE",migration.rows[0].incomplete===0);
  await c.query("ROLLBACK");
 }finally{await c.end()}
 const {prisma}=await import(path.resolve("packages/prisma/dist/index.js"));
 try{
  const m=await prisma.$queryRawUnsafe("SELECT current_setting('default_transaction_read_only') AS readonly");
  assert("PRISMA_RUNTIME_READONLY",m[0]?.readonly==="on");
  const {getUserPets,getPetById}=await import(path.resolve("packages/core/dist/core/src/services/pets/petsReadService.js"));
  const pets=await getUserPets(actorId,{throwOnError:true});
  assert("REAL_CORE_PET_LIST_MATCHES_SQL",Array.isArray(pets)&&pets.length===ownCount);
  assert("REAL_CORE_PET_LIST_OWNER_ISOLATED",pets.every(p=>p.ownerId===actorId));
  const pet=await getPetById(petId,actorId);
  assert("REAL_CORE_PET_DETAIL_OWNER_SUCCESS",pet?.id===petId);
  const missing=await getPetById(petId,"qa_nonowner_20261029");
  assert("REAL_CORE_PET_DETAIL_OTHER_OWNER_DENIED",missing===null);
 }finally{await prisma.$disconnect()}
}
run().then(()=>{
 fs.writeFileSync(".local-pg-scratch/qa-logs/real-pg-core-readonly-20261029.json",JSON.stringify(evidence,null,2));
 console.log("REAL_POSTGRESQL_CORE_READONLY",{checks:evidence.checks.length,passed:evidence.checks.filter(x=>x.pass).length,database:evidence.database});
}).catch(error=>{
 fs.writeFileSync(".local-pg-scratch/qa-logs/real-pg-core-readonly-20261029.json",JSON.stringify({...evidence,failed:true,lastErrorCode:error.code||error.message.split(":")[0]},null,2));
 console.log("REAL_POSTGRESQL_CORE_FAIL",error.code||String(error.message).slice(0,160));
 process.exitCode=1;
});
