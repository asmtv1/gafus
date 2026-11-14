/** Disposable Trainer AI staff-role, rollback, history and configuration acceptance. */
import assert from "node:assert/strict";
import {prisma} from "@gafus/prisma";
import {
  readTrainerAIActorRole,readTrainerAIHistoryRows,readTrainerAISettingsSummary,
  saveTrainerAIExchangeAuthorized,clearTrainerAIHistoryAuthorized,saveTrainerAIConfigAuthorized,
} from "@gafus/trainer-ai-server/persistence";
import {
  getTrainerAIHistory,
  saveTrainerAIExchange,
  assertTrainerAIAccess,
  saveTrainerAIConfiguration,
} from "../../apps/api/src/modules/trainer-ai/composition/trainer-ai.js";
const db=new URL(process.env.DATABASE_URL??"http://invalid");
if(process.env.GAFUS_LOCAL_ISOLATED_API!=="1" || process.env.GAFUS_TRAINER_AI_REAL_PG!=="1" ||
   db.protocol!=="postgresql:" || db.hostname!=="127.0.0.1" ||
   db.pathname!=="/gafus_refactor_trainer_ai")throw Error("REFUSING_NON_DISPOSABLE_TRAINER_AI_DB");
const roles=["TRAINER","ADMIN","MODERATOR"] as const;
async function main(){
  const [trainer,admin,outsider]=await Promise.all([
    prisma.user.create({data:{username:"ai_trainer",role:"TRAINER",password:"synthetic-disposable"}}),
    prisma.user.create({data:{username:"ai_admin",role:"ADMIN",password:"synthetic-disposable"}}),
    prisma.user.create({data:{username:"ai_other",role:"USER",password:"synthetic-disposable"}}),
  ]);
  assert.equal(await readTrainerAIActorRole(trainer.id),"TRAINER");
  assert.equal(await readTrainerAIActorRole(outsider.id),"USER");
  await assert.rejects(assertTrainerAIAccess(outsider.id),/FORBIDDEN/);
  await assert.rejects(saveTrainerAIExchangeAuthorized({
    trainerId:outsider.id,content:"private",reply:"secret",model:"x"
  },roles),/FORBIDDEN/);
  assert.equal(await prisma.trainerAIChat.count({where:{trainerId:outsider.id}}),0);
  const config={
    where:{trainerId:trainer.id},
    create:{trainerId:trainer.id,model:"meta-llama/llama-3.3-70b-instruct",enabled:true,provider:"openrouter",apiKey:"synthetic-secret"},
    update:{model:"meta-llama/llama-3.3-70b-instruct",enabled:true,provider:"openrouter",apiKey:"synthetic-secret"},
  };
  await assert.rejects(saveTrainerAIConfigAuthorized(outsider.id,config,["ADMIN","MODERATOR"]),/Недостаточно прав/);
  assert.equal(await prisma.trainerAIConfig.count(),0);
  await saveTrainerAIConfiguration(admin.id,config);
  assert.deepEqual(await readTrainerAISettingsSummary(trainer.id,roles),{
    model:"meta-llama/llama-3.3-70b-instruct",enabled:true,hasCustomKey:true,
  });
  assert.equal(await readTrainerAISettingsSummary(outsider.id,roles),null);
  assert.equal(await readTrainerAISettingsSummary(trainer.id,[]),null);
  const saved=await saveTrainerAIExchange({
    trainerId:trainer.id,content:"question",reply:"answer",model:"meta-llama/llama-3.3-70b-instruct",tokensUsed:19,
  });
  assert.equal(saved.role,"assistant");
  const history=await getTrainerAIHistory(trainer.id);
  assert.deepEqual(history.messages.map(x=>x.role),["user","assistant"]);
  assert.equal(history.total,2);
  assert.equal((await readTrainerAIHistoryRows(outsider.id,0,20,roles)).messages.length,0);
  await prisma.$executeRawUnsafe(`
    CREATE FUNCTION reject_ai_second_insert() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN IF NEW."role" = 'assistant' THEN RAISE EXCEPTION 'synthetic-second-message-rejection'; END IF;
    RETURN NEW; END; $$;
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TRIGGER trainer_ai_second_insert_reject BEFORE INSERT ON "TrainerAIChat"
      FOR EACH ROW EXECUTE FUNCTION reject_ai_second_insert();
  `);
  await assert.rejects(saveTrainerAIExchangeAuthorized({
    trainerId:trainer.id,content:"must roll back",reply:"rejected",model:"x",
  },roles));
  assert.equal(await prisma.trainerAIChat.count({where:{trainerId:trainer.id}}),2,
    "failed second insertion cannot leave a partial first message");
  await prisma.$executeRawUnsafe('DROP TRIGGER trainer_ai_second_insert_reject ON "TrainerAIChat"');
  await prisma.$executeRawUnsafe('DROP FUNCTION reject_ai_second_insert()');
  await prisma.user.update({where:{id:trainer.id},data:{role:"USER"}});
  await assert.rejects(clearTrainerAIHistoryAuthorized(trainer.id,roles),/FORBIDDEN/);
  await assert.rejects(saveTrainerAIExchangeAuthorized({
    trainerId:trainer.id,content:"revoked",reply:"must reject",model:"x",
  },roles),/FORBIDDEN/);
  assert.equal((await readTrainerAIHistoryRows(trainer.id,0,20,roles)).messages.length,0);
  assert.equal(await readTrainerAISettingsSummary(trainer.id,roles),null);
  assert.equal(await prisma.trainerAIChat.count({where:{trainerId:trainer.id}}),2);
  await prisma.user.update({where:{id:trainer.id},data:{role:"TRAINER"}});
  assert.equal(await clearTrainerAIHistoryAuthorized(trainer.id,roles),2);
  assert.equal(await prisma.trainerAIChat.count({where:{trainerId:trainer.id}}),0);
  console.log("TRAINER_AI_REAL_PG_PASS: staff-only reads, API-key-safe summary, owner history, atomic exchange rollback after second insert, revoked staff deny and safe clear");
}
main().then(async()=>prisma.$disconnect())
 .catch(async(error)=>{console.error(error);await prisma.$disconnect();process.exitCode=1;});
