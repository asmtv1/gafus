/** WEB4: actual PG18 WORK, synthetic users only, no S3/production providers. */
import {randomUUID} from 'node:crypto';
import {afterAll,afterEach,beforeAll,beforeEach,describe,expect,it} from 'vitest';
import {prisma} from '@gafus/prisma';
import {createFeedPolls} from './polls';
const active=process.env.WEB4_REAL_WORK_PG==='1'?describe:describe.skip;
const db=prisma;
const expected='/gafus_refactor_real_work_20261024';
const uri=new URL(process.env.DATABASE_URL??'postgresql://invalid/invalid');
const roles=['owner','voter','foreign'] as const;
const ids=roles.map(()=>randomUUID());
let postId='', pollId='', optionIds:string[]=[];
const clock=()=>new Date();
const service=createFeedPolls({db,enabled:()=>true,now:clock,
 storage:{signCdn:async()=>{throw Error('WEB4_NO_MEDIA_PROVIDER');}}});
async function guard(){
 expect(process.env.WEB4_REAL_WORK_PG).toBe('1');
 expect([uri.protocol,uri.hostname,uri.port,uri.pathname,uri.username,uri.search]).toEqual([
 'postgresql:','127.0.0.1','55921',expected,'gafus_refactor_local_real','?schema=public']);
 const meta=await db.$queryRaw<{db:string;version:string;role:string}[]>`
 SELECT current_database() AS db,current_setting('server_version_num') AS version,current_user AS role`;
 expect(meta).toEqual([{db:expected.slice(1),version:'180004',role:'gafus_refactor_local_real'}]);
}
active('WEB4 manual closing and vote races physical WORK SQL',()=>{
 beforeAll(async()=>{
  await guard();
  await db.user.createMany({data:ids.map((id,i)=>({id,username:`web4_sql_${id.replaceAll('-','')}_${i}`,
   password:'non-login-synthetic',role:'USER',registrationPending:false}))});
 },30000);
 beforeEach(async()=>{
  await guard();
  postId=randomUUID();pollId=randomUUID();optionIds=[randomUUID(),randomUUID()];
  await db.feedPost.create({data:{id:postId,authorId:ids[0]!,clientRequestId:randomUUID()}});
  const rev=await db.feedPostRevision.create({data:{postId,revisionNumber:1,status:'ready',text:'Синтетический опрос',clientRequestId:randomUUID()}});
  await db.feedPost.update({where:{id:postId},data:{status:'published',activeRevisionId:rev.id,version:1,publishedAt:clock()}});
  await db.feedPoll.create({data:{id:pollId,postId,question:'Как лучше обучать собаку?',
   hideResults:true,options:{create:optionIds.map((id,position)=>({id,position,text:'Вариант '+(position+1)}))}}});
 },30000);
 afterEach(async()=>{
  await db.feedPost.deleteMany({where:{id:postId,authorId:ids[0]}});
  expect(await db.feedPoll.count({where:{id:pollId}})).toBe(0);
  expect(await db.feedPollVote.count({where:{pollId}})).toBe(0);
  expect(await db.feedPollVoteSelection.count({where:{pollId}})).toBe(0);
 },30000);
 afterAll(async()=>{
  await db.user.deleteMany({where:{id:{in:ids}}});
  expect(await db.user.count({where:{id:{in:ids}}})).toBe(0);
  await db.$disconnect();
 },30000);
 it('owner-only manual close is irreversible, repeat idempotent, visible results unlock',async()=>{
  const before=await service.get(ids[0]!,postId);
  expect(before).toMatchObject({canClose:true,closed:false,totalVotes:null});
  await expect(service.close(ids[1]!,postId)).rejects.toMatchObject({code:'NOT_FOUND',status:404});
  expect((await db.feedPoll.findUniqueOrThrow({where:{id:pollId}})).endDate).toBeNull();
  const first=await service.close(ids[0]!,postId);
  expect(first).toMatchObject({closed:true,canClose:false,totalVotes:0});
  const closedAt=(await db.feedPoll.findUniqueOrThrow({where:{id:pollId}})).endDate?.getTime();
  const second=await service.close(ids[0]!,postId);
  expect(second.closed).toBe(true);
  expect((await db.feedPoll.findUniqueOrThrow({where:{id:pollId}})).endDate?.getTime()).toBe(closedAt);
  await expect(service.vote(ids[2]!,postId,{optionIds:[optionIds[0]!]}))
   .rejects.toMatchObject({code:'POLL_CLOSED',status:409});
  await expect(service.changeVote(ids[2]!,postId,{optionIds:[optionIds[0]!]}))
   .rejects.toMatchObject({code:'POLL_CLOSED',status:409});
 });
 it('manual close vs first vote serializes; eventual close rejects all new votes',async()=>{
  const contenders=await Promise.allSettled([
   service.close(ids[0]!,postId),service.vote(ids[1]!,postId,{optionIds:[optionIds[0]!]})]);
  expect(contenders[0].status).toBe('fulfilled');
  if(contenders[1].status==='rejected')
   expect(contenders[1].reason).toMatchObject({code:'POLL_CLOSED',status:409});
  else expect(contenders[1].value.myOptionIds).toEqual([optionIds[0]]);
  expect((await service.get(ids[2]!,postId)).closed).toBe(true);
  expect(await db.feedPollVote.count({where:{pollId}})).toBe(
   contenders[1].status==='fulfilled'?1:0);
  await expect(service.vote(ids[2]!,postId,{optionIds:[optionIds[1]!]}))
   .rejects.toMatchObject({code:'POLL_CLOSED',status:409});
 });
 it('quiz votes cannot change or cancel, and correct choice is revealed only to eligible viewers',async()=>{
  await db.feedPoll.update({where:{id:pollId},data:{isQuiz:true,hideResults:false}});
  await db.feedPollOption.update({where:{id:optionIds[0]!},data:{isCorrect:true}});
  const waiting=await service.get(ids[2]!,postId);
  expect(waiting.totalVotes).toBeNull();
  expect(waiting.options.every(x=>!('isCorrect' in x))).toBe(true);
  const voted=await service.vote(ids[1]!,postId,{optionIds:[optionIds[1]!]});
  expect(voted.totalVotes).toBe(1);
  expect(voted.options.find(x=>x.id===optionIds[0])?.isCorrect).toBe(true);
  await expect(service.changeVote(ids[1]!,postId,{optionIds:[optionIds[0]!]}))
    .rejects.toMatchObject({code:'QUIZ_VOTE_LOCKED',status:409});
  await expect(service.cancelVote(ids[1]!,postId))
    .rejects.toMatchObject({code:'QUIZ_VOTE_LOCKED',status:409});
  expect(await db.feedPollVoteSelection.count({where:{pollId,userId:ids[1]}})).toBe(1);
  // Owner is permitted to vote in their own quiz.
  await service.vote(ids[0]!,postId,{optionIds:[optionIds[0]!]});
  expect(await db.feedPollVote.count({where:{pollId}})).toBe(2);
  await service.close(ids[0]!,postId);
  const closedViewer=await service.get(ids[2]!,postId);
  expect(closedViewer.totalVotes).toBe(2);
  expect(closedViewer.options.find(x=>x.id===optionIds[0])?.isCorrect).toBe(true);
 });
 it('public voter identity is paginated and only visible after permission is earned',async()=>{
  await db.feedPoll.update({where:{id:pollId},data:{isAnonymous:false,hideResults:false}});
  expect(await service.listVoters(ids[0]!,postId,optionIds[0]!,{pageSize:1})).toMatchObject({items:[],nextCursor:null});
  await expect(service.listVoters(ids[1]!,postId,optionIds[0]!))
    .rejects.toMatchObject({code:'NOT_FOUND',status:404});
  await service.vote(ids[1]!,postId,{optionIds:[optionIds[0]!]});
  await service.vote(ids[2]!,postId,{optionIds:[optionIds[0]!]});
  const first=await service.listVoters(ids[1]!,postId,optionIds[0]!,{pageSize:1});
  expect(first.items).toHaveLength(1);
  expect(first.nextCursor).not.toBeNull();
  const second=await service.listVoters(ids[1]!,postId,optionIds[0]!,{pageSize:1,cursor:first.nextCursor});
  expect(second.items).toHaveLength(1);
  expect(second.nextCursor).toBeNull();
  expect([...first.items,...second.items].map(item=>item.id).sort()).toEqual([ids[1],ids[2]].sort());
  expect([...first.items,...second.items].every(item=>item.username.startsWith('web4_sql_'))).toBe(true);
  expect((await service.listVoters(ids[0]!,postId,optionIds[1]!)).items).toEqual([]);
  await expect(service.listVoters(ids[1]!,postId,randomUUID()))
    .rejects.toMatchObject({code:'NOT_FOUND',status:404});
  await expect(service.listVoters(ids[1]!,postId,optionIds[0]!,{pageSize:21}))
    .rejects.toMatchObject({code:'VALIDATION_ERROR',status:400});
 });
 it('anonymous polls never leak identity, and public hidden results unlock only at close',async()=>{
  await db.feedPoll.update({where:{id:pollId},data:{isAnonymous:true}});
  await service.vote(ids[1]!,postId,{optionIds:[optionIds[0]!]});
  await expect(service.listVoters(ids[1]!,postId,optionIds[0]!))
    .rejects.toMatchObject({code:'NOT_FOUND',status:404});
  await service.close(ids[0]!,postId);
  await expect(service.listVoters(ids[1]!,postId,optionIds[0]!))
    .rejects.toMatchObject({code:'NOT_FOUND',status:404});
  await db.feedPoll.update({where:{id:pollId},data:{isAnonymous:false,endDate:null}});
  await expect(service.listVoters(ids[1]!,postId,optionIds[0]!))
    .rejects.toMatchObject({code:'NOT_FOUND',status:404});
  await service.close(ids[0]!,postId);
  const revealed=await service.listVoters(ids[2]!,postId,optionIds[0]!);
  expect(revealed.items.map(row=>row.id)).toEqual([ids[1]]);
 });
 it('manual close never reopens a past automatic deadline and cannot close a moderated post',async()=>{
  const yesterday=new Date(clock().getTime()-3600_000);
  await db.feedPoll.update({where:{id:pollId},data:{endDate:yesterday}});
  const after=await service.close(ids[0]!,postId);
  expect(after).toMatchObject({closed:true,canClose:false});
  expect((await db.feedPoll.findUniqueOrThrow({where:{id:pollId}})).endDate?.getTime()).toBe(yesterday.getTime());
  await db.feedPost.update({where:{id:postId},data:{moderationState:'hidden'}});
  await expect(service.close(ids[0]!,postId)).rejects.toMatchObject({code:'NOT_FOUND',status:404});
  expect((await db.feedPoll.findUniqueOrThrow({where:{id:pollId}})).endDate?.getTime()).toBe(yesterday.getTime());
 });
 it('concurrent duplicate actor vote reserves exactly one row; other user independent',async()=>{
  const promises=Array.from({length:6},()=>service.vote(ids[1]!,postId,{optionIds:[optionIds[0]!]}));
  const outcome=await Promise.allSettled(promises);
  expect(outcome.filter(x=>x.status==='fulfilled')).toHaveLength(1);
  for(const x of outcome)if(x.status==='rejected')
   expect(x.reason).toMatchObject({code:'ALREADY_VOTED',status:409});
  expect(await db.feedPollVote.count({where:{pollId,userId:ids[1]}})).toBe(1);
  expect(await db.feedPollVoteSelection.count({where:{pollId,userId:ids[1]}})).toBe(1);
  await service.vote(ids[2]!,postId,{optionIds:[optionIds[1]!]});
  const state=await service.get(ids[0]!,postId);
  expect(state.totalVotes).toBeNull(); // hideResults=true, author sees only after manual close
  await service.close(ids[0]!,postId);
  expect((await service.get(ids[0]!,postId)).totalVotes).toBe(2);
 });
});
