/** Genuine registered Hono + JWT + WORK PG18: questions, answers, moderation. */
import { randomBytes, randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@gafus/prisma";

const prefix = "ag1_best_distinct_20261025_" + randomBytes(6).toString("hex");
const base = "http://127.0.0.1:3001/api/v1";
type Actor = { id: string; username: string; password: string; token?: string };
const actors: Actor[] = [];
const questionIds: string[] = [];
const rewardAnswerIds: string[] = [];
function ensure(c: unknown, name: string): asserts c {
  if (!c) throw Error("ASSERT_" + name);
}
function pass(name: string) {
  console.warn("AG1_BEST_DISTINCT_REAL_HTTP " + name + "=PASS");
}
function obj(data: unknown): Record<string, unknown> {
  return data !== null && typeof data === "object" && !Array.isArray(data)
    ? (data as Record<string, unknown>)
    : {};
}
async function http(path: string, method = "GET", actor?: Actor, body?: unknown) {
  const res = await fetch(base + path, {
    method,
    headers: {
      ...(actor?.token ? { Authorization: "Bearer " + actor.token } : {}),
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(12000),
  });
  return { status: res.status, data: obj(await res.json()) };
}
async function createActor(role: "USER" | "ADMIN", suffix: string) {
  const password = randomBytes(26).toString("base64url");
  const row = await prisma.user.create({
    data: {
      username: prefix + "_" + suffix,
      password: await bcrypt.hash(password, 10),
      passwordSetAt: new Date(),
      role,
      registrationPending: false,
    },
  });
  const actor = { id: row.id, username: row.username, password };
  actors.push(actor);
  const signed = await http("/auth/login", "POST", undefined, {
    username: actor.username,
    password: actor.password,
  });
  ensure(signed.status === 200 && signed.data.success === true, "AUTH");
  const token = obj(signed.data.data).accessToken;
  ensure(typeof token === "string" && token.length > 40, "JWT");
  (actor as Actor).token = token;
  return actor;
}
function payload(title = "Что делать при сильном возбуждении собаки?") {
  return {
    title,
    body: "Поделитесь личным опытом тренировки собаки, пожалуйста.",
    category: "Поведение",
    tags: ["прогулка"],
    photoIds: [],
    clientRequestId: randomUUID(),
  };
}
async function cleanup() {
  // Bonus outbox has no user FK: remove ONLY reward keys for own answer IDs.
  for (const id of rewardAnswerIds) {
    await prisma.gafusNotificationOutbox.deleteMany({ where: { rewardEventId: `bonus:best-answer:${id}` } });
  }
  // Only synthetic authenticated owners, never restored production rows.
  for (const a of actors) {
    const current = await prisma.user.findUnique({
      where: { id: a.id },
      select: { username: true },
    });
    if (current?.username === a.username && current.username.startsWith(prefix))
      await prisma.user.delete({ where: { id: a.id } });
  }
}
const rewardKey = (answerId: string) => `bonus:best-answer:${answerId}`;
async function rewardState(answerId: string) {
  const key = rewardKey(answerId);
  const event = await prisma.gafusRewardEvent.findUnique({where:{eventKey:key}});
  const transactions = await prisma.gafusTransaction.findMany({where:{idempotencyKey:`gafus:reward:${key}`}});
  const outbox = await prisma.gafusNotificationOutbox.findMany({where:{rewardEventId:key}});
  return {event,transactions,outbox};
}
async function makeQuestion(owner:Actor, a:Actor, b:Actor, tag:string) {
  const q=await http('/questions','POST',owner,payload('Как улучшить переключение собаки: '+tag+'?'));
  ensure(q.status===200&&typeof obj(q.data.data).id==='string','OWN_QUESTION_HTTP200');
  const qid=obj(q.data.data).id as string; questionIds.push(qid);
  const answers: string[]=[];
  for(const [actor,text] of [[a,'Практикуйте короткие занятия и завершайте на успехе.'],[b,'Повышайте сложность постепенно и отслеживайте возбуждение.']] as const) {
    const r=await http(`/questions/${qid}/answers`,'POST',actor,{body:text,photoIds:[],clientRequestId:randomUUID()});
    ensure(r.status===200&&typeof obj(r.data.data).id==='string','OWN_ANSWER_HTTP200');
    const id=obj(r.data.data).id as string;answers.push(id);rewardAnswerIds.push(id);
  }
  return {qid,aId:answers[0],bId:answers[1]};
}
async function state(id:string,userId:string){const {event,transactions,outbox}=await rewardState(id);
  if(event){ensure(event.userId===userId&&event.rewardKind==='BEST_ANSWER'&&event.decision==='GRANTED'&&event.amount===1&&event.sourceEntityId===id,'REWARD_IDENTITY_AMOUNT');ensure(transactions.length===1&&transactions[0].id===event.transactionId&&transactions[0].delta===1&&transactions[0].userId===userId,'ONE_WALLET_LEDGER');ensure(outbox.length===1&&outbox[0].userId===userId,'ONE_DURABLE_PENDING_NOTIFICATION');}
  else ensure(transactions.length===0&&outbox.length===0,'NO_GHOST_TRANSACTION_OUTBOX');
  return Number(Boolean(event));
}
async function main(){
  ensure(process.env.AG1_BEST_DISTINCT_REAL_HTTP==='1'&&process.env.NODE_ENV==='development'&&process.env.GAFUS_LOCAL_ISOLATED_API==='1','EXPLICIT_LOCAL_SCOPE');
  const u=new URL(process.env.DATABASE_URL??'');ensure(u.hostname==='127.0.0.1'&&u.port==='55921'&&u.username==='gafus_refactor_local_real'&&u.pathname==='/gafus_refactor_real_work_20261024','RESTRICTED_WORK_ONLY');
  const m=await prisma.$queryRaw<{db:string,v:string}[]>`SELECT current_database() AS db,current_setting('server_version_num') AS v`;
  ensure(m[0]?.db==='gafus_refactor_real_work_20261024'&&m[0].v==='180004','PG18_ONLY');
  ensure((await fetch('http://127.0.0.1:3001/ready',{signal:AbortSignal.timeout(4000)})).status===200,'ORIGINAL_HONO_READY');
  const baseline={users:await prisma.user.count(),events:await prisma.gafusRewardEvent.count(),wallets:await prisma.gafusWallet.count(),outbox:await prisma.gafusNotificationOutbox.count()};
  const owner=await createActor('USER','owner'), a=await createActor('USER','author_a'),b=await createActor('USER','author_b');
  const firstQ=await makeQuestion(owner,a,b,'разные лучшие');
  const secondQ=await makeQuestion(owner,a,b,'удаление');
  const beforeA=(await prisma.gafusWallet.findUnique({where:{userId:a.id}}))?.balance??0;
  const beforeB=(await prisma.gafusWallet.findUnique({where:{userId:b.id}}))?.balance??0;
  pass('TWO_NEW_OWN_QUESTIONS_FOUR_DIFFERENT_ANSWER_IDS_THREE_REAL_SIGNED_ACTORS');
  const foreign=await Promise.all([
    http(`/questions/${firstQ.qid}/best`,'POST',a,{answerId:firstQ.aId}),
    http(`/questions/${firstQ.qid}/close`,'POST',b,{closed:true}),
    http(`/questions/${secondQ.qid}`,'DELETE',b),
  ]);
  ensure(foreign.every(x=>x.status===403),'FOREIGN_WRITE_ALL_403');
  ensure((await prisma.question.findUnique({where:{id:firstQ.qid},select:{bestAnswerId:true,closedAt:true}}))?.bestAnswerId===null,'FOREIGN_NO_BEST_CHANGE');
  pass('FOREIGN_BEST_CLOSE_DELETE_ALL_FORBIDDEN403_NO_REWARD');
  const [selectA,selectB]=await Promise.all([
    http(`/questions/${firstQ.qid}/best`,'POST',owner,{answerId:firstQ.aId}),
    http(`/questions/${firstQ.qid}/best`,'POST',owner,{answerId:firstQ.bId}),
  ]);
  console.warn('AG1_BEST_DISTINCT_RACE_STATUSES='+[selectA.status,selectB.status].sort().join(','));
  const q1=await prisma.question.findUnique({where:{id:firstQ.qid},select:{bestAnswerId:true,closedAt:true,deletedAt:true}});
  const r1A=await state(firstQ.aId,a.id),r1B=await state(firstQ.bId,b.id);
  console.warn('AG1_BEST_DISTINCT_RACE_SQL='+JSON.stringify({lastA:q1?.bestAnswerId===firstQ.aId,lastB:q1?.bestAnswerId===firstQ.bId,rewardA:r1A,rewardB:r1B}));
  ensure(selectA.status===200&&selectB.status===200,'TWO_DISTINCT_HTTP200_NO500');
  ensure(q1?.deletedAt===null&&q1.closedAt===null&&[firstQ.aId,firstQ.bId].includes(q1.bestAnswerId??''),'FINAL_BEST_ONE_OF_BOTH');
  ensure(r1A===1&&r1B===1,'TWO_DISTINCT_ELIGIBLE_EVENTS_ONCE_EACH');
  ensure((await prisma.gafusWallet.findUnique({where:{userId:a.id}}))?.balance===beforeA+1&&(await prisma.gafusWallet.findUnique({where:{userId:b.id}}))?.balance===beforeB+1,'NO_CLAWBACK_TWO_DISTINCT_WALLETS');
  pass('SIMULTANEOUS_DIFFERENT_BEST200_200_ONE_LAST_POINTER_TWO_ELIGIBLE_BONUSES_NO_DOUBLE');

  const [closed,againA,reopened]=await Promise.all([
    http(`/questions/${firstQ.qid}/close`,'POST',owner,{closed:true}),
    http(`/questions/${firstQ.qid}/best`,'POST',owner,{answerId:firstQ.aId}),
    http(`/questions/${firstQ.qid}/close`,'POST',owner,{closed:false}),
  ]);
  console.warn('AG1_BEST_CLOSE_REOPEN_OVERLAP_STATUSES='+[closed.status,againA.status,reopened.status].sort().join(','));
  ensure(closed.status===200&&againA.status===200&&reopened.status===200,'OWNER_CLOSE_REOPEN_BEST_SERIALIZED_NO500');
  const q1After=await prisma.question.findUnique({where:{id:firstQ.qid},select:{bestAnswerId:true,closedAt:true,deletedAt:true}});
  ensure(q1After?.deletedAt===null&&q1After.bestAnswerId===firstQ.aId,'SERIALIZED_BEST_POINTER_A');
  ensure((await state(firstQ.aId,a.id))===1&&(await state(firstQ.bId,b.id))===1,'NO_REAWARD_DURING_CLOSE_REOPEN_OVERLAP');
  const forcedClose=await http(`/questions/${firstQ.qid}/close`,'POST',owner,{closed:true});
  ensure(forcedClose.status===200,'FORCE_CLOSE200');
  const newAnswer=await http(`/questions/${firstQ.qid}/answers`,'POST',a,{body:'Этот новый ответ должен быть отклонён при закрытии.',photoIds:[],clientRequestId:randomUUID()});
  ensure(newAnswer.status===409&&newAnswer.data.code==='QUESTION_CLOSED','CLOSED_REJECTS_NEW_REPLY');
  const ownOpen=await http(`/questions/${firstQ.qid}/close`,'POST',owner,{closed:false});
  ensure(ownOpen.status===200,'REOPEN200');
  const afterReopen=await prisma.question.findUnique({where:{id:firstQ.qid},select:{closedAt:true,bestAnswerId:true}});
  ensure(afterReopen?.closedAt===null&&afterReopen.bestAnswerId===firstQ.aId,'REOPEN_CLEARS_CLOSE_NOT_BEST');
  pass('SIMULTANEOUS_CLOSE_REOPEN_BEST_NO500_NO_EXTRA_BONUS_FORCED_CLOSE409_REOPEN_PRESERVES_BEST');
  const [deleteQ,deletedChooseA,deletedChooseB]=await Promise.all([
    http(`/questions/${secondQ.qid}`,'DELETE',owner),
    http(`/questions/${secondQ.qid}/best`,'POST',owner,{answerId:secondQ.aId}),
    http(`/questions/${secondQ.qid}/best`,'POST',owner,{answerId:secondQ.bId}),
  ]);
  console.warn('AG1_BEST_DELETE_RACE_HTTP_STATUSES='+[deleteQ.status,deletedChooseA.status,deletedChooseB.status].join(','));
  const q2=await prisma.question.findUnique({where:{id:secondQ.qid},select:{bestAnswerId:true,deletedAt:true,closedAt:true}});
  const deletedGet=await http(`/questions/${secondQ.qid}`,'GET',owner);
  const deletedRewardA=await state(secondQ.aId,a.id);
  const deletedRewardB=await state(secondQ.bId,b.id);
  console.warn('AG1_BEST_DELETE_RACE_SQL='+JSON.stringify({parentDeleted:!!q2?.deletedAt,bestCleared:q2?.bestAnswerId===null,rewardA:deletedRewardA,rewardB:deletedRewardB}));
  ensure(deleteQ.status===200&&[200,404].includes(deletedChooseA.status)&&[200,404].includes(deletedChooseB.status),'DELETE_RACE_ONLY_VALID_200_404_NOT500');
  ensure(q2?.deletedAt instanceof Date&&q2.bestAnswerId===null&&deletedGet.status===404,'SOFT_DELETE_LAST_STATE_NO_LEAK');
  ensure(deletedRewardA===Number(deletedChooseA.status===200)&&deletedRewardB===Number(deletedChooseB.status===200),'BONUS_ONLY_IF_BEST_SELECTION_COMMITTED_BEFORE_DELETE');
  ensure((await prisma.gafusWallet.findUnique({where:{userId:a.id}}))?.balance===beforeA+1+deletedRewardA,'ACTOR_A_NO_CLAWBACK');
  ensure((await prisma.gafusWallet.findUnique({where:{userId:b.id}}))?.balance===beforeB+1+deletedRewardB,'ACTOR_B_NO_CLAWBACK');
  const staleRetry=await http(`/questions/${secondQ.qid}/best`,'POST',owner,{answerId:secondQ.aId});
  const staleReopen=await http(`/questions/${secondQ.qid}/close`,'POST',owner,{closed:false});
  ensure(staleRetry.status===404&&staleReopen.status===404,'DELETED_PARENT_DENIES_REPLAY_OR_REOPEN');
  ensure((await state(secondQ.aId,a.id))===deletedRewardA&&(await state(secondQ.bId,b.id))===deletedRewardB,'RETRY_NO_REWARD_AFTER_DELETE');
  pass('SIMULTANEOUS_DIFFERENT_BEST_VS_QUESTION_DELETE_SERIALIZED_200_OR404_NO500_NO_GHOST_REWARD_REOPEN404');

  // Independent inverse interleaving: a real reward is committed BEFORE
  // deletion races with selection of another distinct eligible answer.
  const thirdQ=await makeQuestion(owner,a,b,'награда перед удалением');
  const baselineAfterNewAnswersA=(await prisma.gafusWallet.findUnique({where:{userId:a.id}}))?.balance??0;
  const baselineAfterNewAnswersB=(await prisma.gafusWallet.findUnique({where:{userId:b.id}}))?.balance??0;
  const committedBeforeDelete=await http(`/questions/${thirdQ.qid}/best`,'POST',owner,{answerId:thirdQ.aId});
  ensure(committedBeforeDelete.status===200&&(await state(thirdQ.aId,a.id))===1,'PREDELETION_A_GRANTED');
  const [attemptB,deleteParent]=await Promise.all([
    http(`/questions/${thirdQ.qid}/best`,'POST',owner,{answerId:thirdQ.bId}),
    http(`/questions/${thirdQ.qid}`,'DELETE',owner),
  ]);
  console.warn('AG1_BEST_REWARDED_PARENT_DELETE_OVERLAP_HTTP_STATUSES='+attemptB.status+','+deleteParent.status);
  const afterDelete=await prisma.question.findUnique({where:{id:thirdQ.qid},select:{bestAnswerId:true,deletedAt:true}});
  const bNewReward=await state(thirdQ.bId,b.id);
  ensure(deleteParent.status===200&&[200,404].includes(attemptB.status),'PREAWARDED_PARENT_CONCURRENT_DELETE_NO500');
  ensure(afterDelete?.deletedAt instanceof Date&&afterDelete.bestAnswerId===null,'PREAWARDED_PARENT_RETIRED_CLEAR_POINTER');
  ensure((await state(thirdQ.aId,a.id))===1&&bNewReward===Number(attemptB.status===200),'PREDELETION_REWARD_RETAINED_NO_GHOST_B');
  ensure((await prisma.gafusWallet.findUnique({where:{userId:a.id}}))?.balance===baselineAfterNewAnswersA+1,'GRANTED_A_NOT_CLAWED_BACK');
  ensure((await prisma.gafusWallet.findUnique({where:{userId:b.id}}))?.balance===baselineAfterNewAnswersB+bNewReward,'B_ONLY_IF_PREDELETION_SELECT_SUCCEEDED');
  ensure((await http(`/questions/${thirdQ.qid}/best`,'POST',owner,{answerId:thirdQ.aId})).status===404,'NO_REAWARD_AFTER_RETIRED_PARENT');
  pass('COMMITTED_AWARD_SURVIVES_CONCURRENT_PARENT_DELETE_AND_DISTINCT_SELECTION_FENCED');

  // Strict cleanup of exact OWN reward outbox entries, which lack user FKs;
  // deleting only the two freshly created users then cascades their own rows.
  await cleanup();
  ensure(await prisma.user.count()===baseline.users&&await prisma.gafusRewardEvent.count()===baseline.events&&await prisma.gafusWallet.count()===baseline.wallets&&await prisma.gafusNotificationOutbox.count()===baseline.outbox,'OWN_CLEANUP_GLOBAL_SQL_COUNTS_RESTORED');
  pass('OWN_EXACT_SIX_REWARD_KEYS_AND_3_USERS_CLEANED_WORK_BASELINE');
  pass('ORIGINAL_HONO_DIFFERENT_BEST_CLOSE_REOPEN_PARENT_DELETE_CONCURRENT_ACCEPTED');
}
void (async()=>{try{await main();}catch(e){process.exitCode=1;console.error('AG1_BEST_DISTINCT_FAILED',e instanceof Error&&e.message.startsWith('ASSERT_')?e.message:'UNEXPECTED_REDACTED');}finally{try{await cleanup();console.warn('AG1_BEST_DISTINCT_OWN_CLEANUP=PASS');}catch{process.exitCode=1;console.error('AG1_BEST_DISTINCT_CLEANUP_REVIEW_REQUIRED');}await prisma.$disconnect();}})();
