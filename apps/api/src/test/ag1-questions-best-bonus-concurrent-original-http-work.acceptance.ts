/** Genuine registered Hono + JWT + WORK PG18: questions, answers, moderation. */
import { randomBytes, randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@gafus/prisma";

const prefix = "ag1_best_reward_20261025_" + randomBytes(6).toString("hex");
const base = "http://127.0.0.1:3001/api/v1";
type Actor = { id: string; username: string; password: string; token?: string };
const actors: Actor[] = [];
const questionIds: string[] = [];
const rewardAnswerIds: string[] = [];
function ensure(c: unknown, name: string): asserts c {
  if (!c) throw Error("ASSERT_" + name);
}
function pass(name: string) {
  console.warn("AG1_BEST_LEDGER_ORIGINAL_HTTP " + name + "=PASS");
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
async function main() {
  ensure(process.env.AG1_BEST_REWARD_REAL_HTTP === '1', 'LOCAL_OPT_IN');
  ensure(process.env.NODE_ENV === 'development' && process.env.GAFUS_LOCAL_ISOLATED_API === '1', 'ISOLATED_ONLY');
  const u=new URL(process.env.DATABASE_URL ?? '');
  ensure(u.hostname==='127.0.0.1'&&u.port==='55921'&&u.username==='gafus_refactor_local_real'&&u.pathname==='/gafus_refactor_real_work_20261024','WORK_ONLY');
  const metadata=await prisma.$queryRaw<{db:string,v:string}[]>`SELECT current_database() AS db,current_setting('server_version_num') AS v`;
  ensure(metadata[0]?.db==='gafus_refactor_real_work_20261024'&&metadata[0]?.v==='180004','RESTRICTED_PG18');
  ensure((await fetch('http://127.0.0.1:3001/ready',{signal:AbortSignal.timeout(4000)})).status===200,'ORIGINAL_HONO_READY');
  const baseline={users:await prisma.user.count(),events:await prisma.gafusRewardEvent.count(),outbox:await prisma.gafusNotificationOutbox.count(),wallets:await prisma.gafusWallet.count()};
  const owner=await createActor('USER','owner');
  const first=await createActor('USER','first');
  const second=await createActor('USER','second');
  const q=await http('/questions','POST',owner,payload('Как тренировать переключение внимания собаки?'));
  ensure(q.status===200&&typeof obj(q.data.data).id==='string','QUESTION_CREATED');
  const qid=obj(q.data.data).id as string;questionIds.push(qid);
  for (const [a,body] of [[first,'Подкрепляйте спокойное поведение и короткие переключения.'],[second,'Меняйте среду постепенно и сохраняйте короткие занятия.']] as const){
    const r=await http(`/questions/${qid}/answers`,'POST',a,{body,photoIds:[],clientRequestId:randomUUID()});
    ensure(r.status===200&&typeof obj(r.data.data).id==='string','TWO_DISTINCT_ANSWERS_CREATED');
    rewardAnswerIds.push(obj(r.data.data).id as string);
  }
  const [answerA,answerB]=rewardAnswerIds;
  const balanceA=(await prisma.gafusWallet.findUnique({where:{userId:first.id}}))?.balance??0;
  const balanceB=(await prisma.gafusWallet.findUnique({where:{userId:second.id}}))?.balance??0;
  ensure((await prisma.question.findUnique({where:{id:qid,},select:{bestAnswerId:true}}))?.bestAnswerId===null,'BEST_UNSET');
  pass('THREE_OWN_REAL_JWT_QUESTION_TWO_ANSWER_AUTHORS_AND_BASELINE_BALANCES');
  const unauthorized=await http(`/questions/${qid}/best`,'POST',first,{answerId:answerA});
  ensure(unauthorized.status===403&&!(await rewardState(answerA)).event,'FOREIGN_BEST_NO_REWARD');
  pass('FOREIGN_ANSWER_AUTHOR_BEST403_ZERO_BONUS');
  const [r1,r2]=await Promise.all([
    http(`/questions/${qid}/best`,'POST',owner,{answerId:answerA}),
    http(`/questions/${qid}/best`,'POST',owner,{answerId:answerA}),
  ]);
  console.warn('AG1_BEST_ANSWER_SIMULTANEOUS_HTTP_STATUSES='+[r1.status,r2.status].sort().join(','));
  const eventA=await rewardState(answerA);
  const activeBest=(await prisma.question.findUnique({where:{id:qid},select:{bestAnswerId:true}}))?.bestAnswerId;
  console.warn('AG1_BEST_ANSWER_SIMULTANEOUS_SQL='+JSON.stringify({selected:activeBest===answerA,event:eventA.event?.decision,amount:eventA.event?.amount,transactions:eventA.transactions.length,outbox:eventA.outbox.length}));
  ensure(r1.status===200&&r2.status===200&&activeBest===answerA,'SIMULTANEOUS_SAME_BEST_TWO_HTTP200');
  ensure(eventA.event?.rewardKind==='BEST_ANSWER'&&eventA.event.userId===first.id&&eventA.event.decision==='GRANTED'&&eventA.event.amount===1&&eventA.event.sourceEntityId===answerA,'ONE_GRANTED_EVENT_A');
  ensure(eventA.transactions.length===1&&eventA.transactions[0].id===eventA.event.transactionId&&eventA.transactions[0].delta===1&&eventA.transactions[0].userId===first.id,'EXACTLY_ONE_TRANSACTION_A');
  ensure(eventA.outbox.length===1&&eventA.outbox[0].userId===first.id,'EXACTLY_ONE_DURABLE_BONUS_OUTBOX_A');
  ensure((await prisma.gafusWallet.findUnique({where:{userId:first.id}}))?.balance===balanceA+1,'BALANCE_A_PLUS_ONE');
  pass('SIMULTANEOUS_TWO_REAL_TCP_BEST_ONE_REWARD_EVENT_ONE_LEDGER_TX_ONE_OUTBOX_ONE_WALLET_DELTA');
  const unset=await http(`/questions/${qid}/best`,'POST',owner,{answerId:null});
  const repeat=await http(`/questions/${qid}/best`,'POST',owner,{answerId:answerA});
  const afterA=await rewardState(answerA);
  ensure(unset.status===200&&repeat.status===200&&afterA.transactions.length===1&&afterA.outbox.length===1,'RESELECT_A_NO_NEW_TX');
  ensure((await prisma.gafusWallet.findUnique({where:{userId:first.id}}))?.balance===balanceA+1,'RESELECT_A_NO_SECOND_WALLET_DELTA');
  pass('UNSELECT_RESELECT_SAME_ANSWER_NO_SECOND_REWARD');
  const switchBest=await http(`/questions/${qid}/best`,'POST',owner,{answerId:answerB});
  const eventB=await rewardState(answerB);
  ensure(switchBest.status===200&&eventB.event?.decision==='GRANTED'&&eventB.event.amount===1&&eventB.event.userId===second.id,'OTHER_ANSWER_OWN_GRANTED_EVENT');
  ensure(eventB.transactions.length===1&&eventB.outbox.length===1,'OTHER_ANSWER_OWN_SINGLE_TX_AND_OUTBOX');
  ensure((await prisma.gafusWallet.findUnique({where:{userId:second.id}}))?.balance===balanceB+1,'OTHER_ANSWER_WALLET_PLUS_ONE');
  ensure((await prisma.gafusWallet.findUnique({where:{userId:first.id}}))?.balance===balanceA+1,'OLD_FIRST_REWARD_NOT_REVOKED');
  pass('DISTINCT_NEW_BEST_ANSWER_OWN_BONUS_OLD_GRANTED_REWARD_NOT_REVOKED');
  const close=await http(`/questions/${qid}/close`,'POST',owner,{closed:true});
  const denied=await http(`/questions/${qid}/answers`,'POST',first,{body:'Этот ответ после закрытия не должен сохраниться.',photoIds:[],clientRequestId:randomUUID()});
  const foreignReopen=await http(`/questions/${qid}/close`,'POST',second,{closed:false});
  ensure(close.status===200&&denied.status===409&&denied.data.code==='QUESTION_CLOSED'&&foreignReopen.status===403,'CLOSE_AND_DENIAL_POLICY');
  const invalid=await http(`/questions/${qid}/best`,'POST',owner,{answerId:'synthetic-unavailable-answer'});
  ensure([400,404].includes(invalid.status),'INVALID_BEST_REJECTED');
  ensure((await prisma.question.findUnique({where:{id:qid},select:{bestAnswerId:true}}))?.bestAnswerId===answerB,'INVALID_NO_CHANGE');
  ensure((await rewardState(answerB)).transactions.length===1,'INVALID_NO_NEW_BONUS');
  pass('CLOSED_DENIES_NEW_ANSWER_FOREIGN_REOPEN_DENIED_INVALID_BEST_NO_REWARD');
  const deleted=await http(`/questions/answers/${answerB}`,'DELETE',second);
  ensure(deleted.status===200&&(await prisma.question.findUnique({where:{id:qid},select:{bestAnswerId:true}}))?.bestAnswerId===null,'DELETE_CHOSEN_CLEARS_POINTER');
  ensure((await rewardState(answerB)).transactions.length===1&&(await prisma.gafusWallet.findUnique({where:{userId:second.id}}))?.balance===balanceB+1,'B_REWARD_NOT_REVOKED_BY_DELETE');
  pass('SOFT_DELETING_BEST_CLEARS_POINTER_PRESERVES_HISTORICAL_GRANTED_BONUS');
  await cleanup();
  ensure(await prisma.user.count()===baseline.users&&await prisma.gafusRewardEvent.count()===baseline.events&&await prisma.gafusNotificationOutbox.count()===baseline.outbox&&await prisma.gafusWallet.count()===baseline.wallets,'ORIGINAL_WORK_BASELINE_COUNTS_RESTORED');
  pass('EXACT_OWN_USERS_EVENTS_WALLET_AND_UNREFERENCED_BONUS_OUTBOX_CLEANED');
  pass('ORIGINAL_HONO_SIMULTANEOUS_BEST_ANSWER_REWARD_LEDGER_ACCEPTED');
}
void (async()=>{try{await main();}catch(e){process.exitCode=1;console.error('AG1_BEST_ANSWER_REWARD_FAILED',e instanceof Error&&e.message.startsWith('ASSERT_')?e.message:'UNEXPECTED_REDACTED');}finally{try{await cleanup();console.warn('AG1_BEST_ANSWER_REWARD_OWN_CLEANUP=PASS');}catch{process.exitCode=1;console.error('AG1_BEST_ANSWER_REWARD_CLEANUP_REVIEW_REQUIRED');}await prisma.$disconnect();}})();
