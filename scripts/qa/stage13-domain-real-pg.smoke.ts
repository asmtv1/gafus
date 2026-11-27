/** Additional real PG domain assertions, synthetic records only. */
import assert from "node:assert/strict";
import { prisma } from "@gafus/prisma";
import { createQuestionService } from "@gafus/questions-write-server/service";
import { gafusReward } from "../../packages/feed-server/src/gafus-reward-instance.js";
import { transactionalContentPolicy } from "../../apps/api/src/modules/content-access/composition/transactional-policy-instance.js";
import { getAuthorizedMiniGuideContent, listGafusMiniGuides } from "../../packages/course-server/src/miniGuideService.js";
import {
  APP_FEATURE_APP_SUBSCRIPTION_GATING, APP_FEATURE_MOBILE_IOS_RU_CARD_PAYMENT,
  setAppFeatureFlagEnabled, getMobileAppPublicConfig, getMobileFeatureFlagEnabled,
} from "../../packages/feature-flags-server/src/appFeatureFlagsService.js";
import { claimTrainingReminder, releaseFailedTrainingReminderClaim } from "../../packages/notifications-server/src/trainingReminderClaims.js";
import { trainingReminderLocalDayKey, shouldSendTrainingReminder } from "../../packages/core/src/services/reminders/trainingReminderPolicy.js";
import { getAchievementStats } from "../../packages/achievements-server/src/statsService.js";
import { isCurrentTrainerUser } from "../../packages/statistics/src/infra/trainerTargetAccess.js";

const u = new URL(process.env.DATABASE_URL ?? "http://invalid");
if (process.env.GAFUS_STAGE13_QA !== "1" || process.env.GAFUS_LOCAL_ISOLATED_API !== "1" ||
    u.protocol !== "postgresql:" || u.hostname !== "127.0.0.1" || u.username !== "qacourse" ||
    u.pathname !== "/gafus_refactor_trainer_ai" || Number(u.port) <= 10000) throw Error("REFUSING_NON_DISPOSABLE_STAGE13_DB");
const { setQuestionBestAnswer, setQuestionHeart } = createQuestionService(gafusReward);
const now = new Date("2026-11-08T14:30:00Z");
async function main() {
  const [owner, other, trainer] = await Promise.all([
    prisma.user.create({data:{username:"stage13_owner",password:"synthetic-only",registrationPending:false}}),
    prisma.user.create({data:{username:"stage13_other",password:"synthetic-only",registrationPending:false}}),
    prisma.user.create({data:{username:"stage13_trainer",password:"synthetic-only",role:"TRAINER",registrationPending:false}}),
  ]);
  let failed = false;
  const run = async (name:string, task:()=>Promise<void>) => {
    try { await task(); console.log("STAGE13_PASS", name); }
    catch (error) { failed=true; console.error("STAGE13_FAIL", name, error); }
  };
  await run("best-answer-concurrent-replay-ledger-and-heart", async () => {
    const q=await prisma.question.create({data:{authorId:owner.id,clientRequestId:"stage13-q",title:"Synthetic question",body:"Synthetic body",category:"qa"}});
    const a=await prisma.questionAnswer.create({data:{questionId:q.id,authorId:other.id,clientRequestId:"stage13-a",body:"Synthetic answer"}});
    const b=await prisma.questionAnswer.create({data:{questionId:q.id,authorId:trainer.id,clientRequestId:"stage13-b",body:"Synthetic second answer"}});
    await assert.rejects(setQuestionBestAnswer(other.id,q.id,a.id));
    await Promise.all([setQuestionBestAnswer(owner.id,q.id,a.id),setQuestionBestAnswer(owner.id,q.id,a.id)]);
    await setQuestionBestAnswer(owner.id,q.id,b.id);
    await setQuestionBestAnswer(owner.id,q.id,a.id);
    assert.equal((await prisma.question.findUniqueOrThrow({where:{id:q.id}})).bestAnswerId,a.id);
    for (const answer of [a,b]) {
      const key="bonus:best-answer:"+answer.id;
      const event=await prisma.gafusRewardEvent.findUniqueOrThrow({where:{eventKey:key}});
      assert.equal(event.decision,"GRANTED");
      assert.equal(event.userId,answer.authorId);
      assert.equal(await prisma.gafusTransaction.count({where:{sourceEntityId:answer.id,rewardKind:"BEST_ANSWER"}}),1);
      assert.equal(await prisma.gafusNotificationOutbox.count({where:{rewardEventId:key}}),1);
    }
    await prisma.questionAnswer.update({where:{id:b.id},data:{hiddenAt:now}});
    await assert.rejects(setQuestionBestAnswer(owner.id,q.id,b.id));
    await Promise.all([setQuestionHeart(owner.id,a.id,true),setQuestionHeart(owner.id,a.id,true)]);
    assert.equal(await prisma.questionHeart.count({where:{answerId:a.id,userId:owner.id}}),1);
  });
  await run("mini-guide-owner-revocation-flags", async () => {
    const course=await prisma.course.create({data:{name:"Synthetic private mini guide",type:"stage13_private_guide",duration:"7",logoImg:"",trainingLevel:"BEGINNER",authorId:trainer.id,isPrivate:true,isPaid:true,guideContent:"PRIVATE_SYNTHETIC"}});
    const pub=await prisma.course.create({data:{name:"Synthetic public mini guide",type:"stage13_public_guide",duration:"7",logoImg:"",trainingLevel:"BEGINNER",authorId:trainer.id,isPaid:true,guideContent:"PUBLIC_SYNTHETIC"}});
    const read=(userId:string,courseId:string)=>getAuthorizedMiniGuideContent({userId,courseId,now},transactionalContentPolicy);
    await setAppFeatureFlagEnabled(APP_FEATURE_APP_SUBSCRIPTION_GATING,true);
    assert.equal(await read(owner.id,course.id),null);
    assert.equal(await read(other.id,pub.id),null);
    await prisma.courseAccess.create({data:{courseId:course.id,userId:owner.id}});
    assert.equal(await read(owner.id,course.id),"PRIVATE_SYNTHETIC");
    assert.equal(await read(other.id,course.id),null);
    await prisma.courseAccess.deleteMany({where:{courseId:course.id,userId:owner.id}});
    assert.equal(await read(owner.id,course.id),null);
    const catalog=await listGafusMiniGuides(owner.id,transactionalContentPolicy,now);
    assert.equal(catalog.some(x=>x.courseId===course.id),false);
    assert.equal(JSON.stringify(catalog).includes("PUBLIC_SYNTHETIC"),false);
    await setAppFeatureFlagEnabled(APP_FEATURE_APP_SUBSCRIPTION_GATING,false);
    assert.equal(await read(other.id,pub.id),"PUBLIC_SYNTHETIC");
    assert.equal(await read(other.id,course.id),null);
    for (const platform of ["ios","android","unknown"] as const) {
      assert.equal((await getMobileAppPublicConfig({platform,version:"1.7.5"})).appSubscriptionGatingEnabled,false);
    }
    await setAppFeatureFlagEnabled(APP_FEATURE_MOBILE_IOS_RU_CARD_PAYMENT,true);
    assert.equal(await getMobileFeatureFlagEnabled(APP_FEATURE_MOBILE_IOS_RU_CARD_PAYMENT,{platform:"ios",version:"1.7.5"}),false);
    await setAppFeatureFlagEnabled(APP_FEATURE_APP_SUBSCRIPTION_GATING,true);
  });
  await run("notification-owner-timezone-concurrent-claim-release", async () => {
    const r=await prisma.reminder.create({data:{userId:owner.id,type:"training",name:"Synthetic reminder",enabled:true,reminderTime:"09:30",reminderDays:"7",timezone:"America/New_York"}});
    assert.equal(trainingReminderLocalDayKey("America/New_York",new Date("2026-11-08T02:00:00Z")),"2026-11-07");
    assert.equal(shouldSendTrainingReminder(r,now),true);
    assert.equal(await claimTrainingReminder({id:r.id,userId:other.id,lastSentAt:null,now}),false);
    const claim={id:r.id,userId:owner.id,lastSentAt:null,now};
    assert.equal((await Promise.all([claimTrainingReminder(claim),claimTrainingReminder(claim)])).filter(Boolean).length,1);
    assert.equal(await releaseFailedTrainingReminderClaim({id:r.id,userId:other.id,previousLastSentAt:null,claimedAt:now}),false);
    assert.equal(await releaseFailedTrainingReminderClaim({id:r.id,userId:owner.id,previousLastSentAt:null,claimedAt:now}),true);
    assert.equal(await claimTrainingReminder(claim),true);
    assert.equal(shouldSendTrainingReminder(await prisma.reminder.findUniqueOrThrow({where:{id:r.id}}),now),false);
    await prisma.reminder.update({where:{id:r.id},data:{enabled:false}});
    assert.equal(await claimTrainingReminder({...claim,lastSentAt:now,now:new Date(now.getTime()+86400000)}),false);
  });
  await run("achievement-owner-and-current-trainer-role", async () => {
    const c=await prisma.course.create({data:{name:"Synthetic stats",type:"stage13_stats",duration:"7",logoImg:"",trainingLevel:"BEGINNER",authorId:trainer.id}});
    await prisma.userCourse.create({data:{userId:owner.id,courseId:c.id,status:"IN_PROGRESS"}});
    assert.equal((await getAchievementStats(owner.id)).totalCourses,1);
    assert.equal((await getAchievementStats(other.id)).totalCourses,0);
    assert.equal(await isCurrentTrainerUser(trainer.id),true);
    await prisma.user.update({where:{id:trainer.id},data:{role:"USER"}});
    assert.equal(await isCurrentTrainerUser(trainer.id),false);
  });
  if(failed) process.exitCode=1;
}
main().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>prisma.$disconnect());
