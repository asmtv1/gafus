/** WEB4 physical WORK SQL: real publication/question/answer into unified wallet. */
import {randomUUID} from "node:crypto";
import {afterAll,beforeAll,describe,expect,it} from "vitest";
import {prisma} from "@gafus/prisma";
import {createFeedService} from "./service";
import {createQuestion,createQuestionAnswer} from "../questions/service";
import type {FeedStoragePort} from "./ports";
const active=process.env.WEB4_WALLET_WORK_PG==="1"?describe:describe.skip;
const uri=new URL(process.env.DATABASE_URL??"postgresql://invalid/invalid");
const owner=randomUUID(),visitor=randomUUID();
const storage:FeedStoragePort={enabled:false,
 presignPost:async()=>{throw Error("NO_PROVIDER");},
 head:async()=>{throw Error("NO_PROVIDER");},
 signCdn:async()=>{throw Error("NO_PROVIDER");}};
const feed=createFeedService({db:prisma,storage,enabled:()=>true});
let postId="",questionId="",answerId="";
async function guard(){
 expect([uri.protocol,uri.hostname,uri.port,uri.pathname,uri.username,uri.search]).toEqual([
  "postgresql:","127.0.0.1","55921","/gafus_refactor_real_work_20261024",
  "gafus_refactor_local_real","?schema=public"]);
 const rows=await prisma.$queryRaw<{db:string;role:string}[]>`SELECT current_database() AS db,current_user AS role`;
 expect(rows).toEqual([{db:"gafus_refactor_real_work_20261024",role:"gafus_refactor_local_real"}]);
}
active("WEB4 source feed/questions -> actual GafusWallet ledger in WORK PG18",()=>{
 beforeAll(async()=>{
  await guard();
  await prisma.user.createMany({data:[owner,visitor].map(id=>({
   id,username:"web4_wallet_"+id.replaceAll("-",""),password:"synthetic_only",
   registrationPending:false,role:"USER" as const}))});
 },30000);
 afterAll(async()=>{
  const ids=[owner,visitor];
  await prisma.gafusNotificationOutbox.deleteMany({where:{userId:{in:ids}}});
  await prisma.gafusFraudSignal.deleteMany({where:{userId:{in:ids}}});
  if(postId){
   await prisma.gafusPostReactionMilestone.deleteMany({where:{postId}});
   await prisma.gafusPostReactionProgram.deleteMany({where:{postId}});
   await prisma.feedStorageJob.deleteMany({where:{postId,ownerId:owner}});
   await prisma.feedPost.deleteMany({where:{id:postId,authorId:owner}});
  }
  if(questionId) await prisma.question.deleteMany({where:{id:questionId,authorId:owner}});
  // FK user cascade owns only those synthetic wallets/ledger/rewards.
  await prisma.user.deleteMany({where:{id:{in:ids}}});
  expect(await prisma.user.count({where:{id:{in:ids}}})).toBe(0);
  expect(await prisma.gafusTransaction.count({where:{userId:{in:ids}}})).toBe(0);
  expect(await prisma.gafusRewardEvent.count({where:{userId:{in:ids}}})).toBe(0);
  await prisma.$disconnect();
 },30000);
 it("publish/retry + question/retry + answer + limit 3 share same atomic wallet",async()=>{
  const post=await feed.create(owner,{clientRequestId:randomUUID()});postId=post.id;
  await feed.saveRevision(owner,postId,{clientRequestId:randomUUID(),expectedVersion:0,
   text:"Сегодня мы последовательно обучали собаку спокойной прогулке на поводке",attachmentIds:[]});
  await feed.publish(owner,postId,{clientRequestId:randomUUID()});
  await feed.publish(owner,postId,{clientRequestId:randomUUID()});
  const qKey=randomUUID();
  const question={title:"Как обучать спокойному ожиданию на прогулке?",
   body:"Мой молодой пёс учится ждать спокойно на улице. Как закрепить выдержку постепенно?",
   category:"Поведение" as const,tags:["поведение"],photoIds:[],clientRequestId:qKey};
  questionId=(await createQuestion(owner,question)).id;
  expect((await createQuestion(owner,question)).id).toBe(questionId);
  const answerKey=randomUUID();
  answerId=(await createQuestionAnswer(visitor,questionId,{
   body:"Начните с очень короткой паузы и поддерживайте успех вниманием и наградой.",
   photoIds:[],clientRequestId:answerKey})).id;
  expect((await createQuestionAnswer(visitor,questionId,{
   body:"Начните с очень короткой паузы и поддерживайте успех вниманием и наградой.",
   photoIds:[],clientRequestId:answerKey})).id).toBe(answerId);
  const ownerRewards=await prisma.gafusRewardEvent.findMany({where:{userId:owner}});
  const visitorRewards=await prisma.gafusRewardEvent.findMany({where:{userId:visitor}});
  expect(ownerRewards.map(x=>x.rewardKind).sort()).toEqual(["POST_PUBLISHED","QUESTION_CREATED"]);
  expect(visitorRewards.map(x=>x.rewardKind)).toEqual(["ANSWER_CREATED"]);
  const all=[...ownerRewards,...visitorRewards];
  expect(all.every(x=>x.decision==="GRANTED"&&x.amount===1)).toBe(true);
  const walletA=await prisma.gafusWallet.findUniqueOrThrow({where:{userId:owner}});
  const walletB=await prisma.gafusWallet.findUniqueOrThrow({where:{userId:visitor}});
  expect([walletA.balance,walletB.balance]).toEqual([2,1]);
  const ledger=await prisma.gafusTransaction.findMany({where:{userId:{in:[owner,visitor]}}});
  expect(ledger).toHaveLength(3);
  expect(ledger.reduce((sum,x)=>sum+x.delta,0)).toBe(3);
  expect(new Set(ledger.map(x=>x.idempotencyKey)).size).toBe(3);
 });
});
