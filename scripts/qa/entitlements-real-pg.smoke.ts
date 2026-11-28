/** Real owner/expiry entitlement parity in an ephemeral PostgreSQL-only database. */
import assert from "node:assert/strict";
import {prisma} from "@gafus/prisma";
import {
 readAccessActorRole,hasCurrentPaidSubscription,hasAssignedPrivateCourse,hasActiveGafusArticleAccess,hasPaidChatDisplaySubscription,
} from "@gafus/entitlements-server/policy-reads";
import {resolveCourseEntitlement,resolveArticleEntitlement} from "../../apps/api/src/modules/content-access/composition/content-policy-instance.js";
import {getChatDisplayRole} from "../../packages/core/src/services/user/chatDisplayRole.js";
const url=new URL(process.env.DATABASE_URL??"http://invalid");
if(process.env.GAFUS_LOCAL_ISOLATED_API!=="1" || process.env.GAFUS_ENTITLEMENTS_REAL_PG!=="1" ||
   url.protocol!=="postgresql:" || url.hostname!=="127.0.0.1" ||
   url.pathname!=="/gafus_refactor_entitlements") throw Error("REFUSING_NON_DISPOSABLE_ENTITLEMENTS_DB");
const now=new Date("2026-11-07T12:00:00.000Z");
const later=new Date(now.getTime()+3600_000);
async function main(){
 const [user,other,trainer]=await Promise.all([
   prisma.user.create({data:{username:"policy_user",password:"synthetic-disposable"}}),
   prisma.user.create({data:{username:"policy_other",password:"synthetic-disposable"}}),
   prisma.user.create({data:{username:"policy_trainer",role:"TRAINER",password:"synthetic-disposable"}}),
 ]);
 assert.equal(await readAccessActorRole(user.id),"USER");
 assert.equal(await readAccessActorRole(trainer.id),"TRAINER");
 assert.equal(await readAccessActorRole("missing"),null);
 assert.equal(await hasCurrentPaidSubscription(user.id,now),false);
 const subscription=await prisma.appSubscription.create({data:{
   userId:user.id,provider:"MANUAL",status:"ACTIVE",planCode:"MONTHLY",currentPeriodEnd:later,
 }});
 assert.equal(await hasCurrentPaidSubscription(user.id,now),true);
 assert.equal(await hasCurrentPaidSubscription(other.id,now),false);
 assert.equal((await resolveCourseEntitlement({id:"paid",isPrivate:false,isPaid:true},user.id,now)).source,"SUBSCRIPTION");
 assert.equal(await hasPaidChatDisplaySubscription(user.id,now),false,
   "a free trial/active status alone cannot display a paid badge");
 const payment=await prisma.appSubscriptionPayment.create({data:{
   userId:user.id,subscriptionId:subscription.id,provider:"MANUAL",kind:"INITIAL",status:"PENDING",
   amount:100,idempotenceKey:"local-chat-badge-payment",
 }});
 assert.equal(await hasPaidChatDisplaySubscription(user.id,now),false);
 await prisma.appSubscriptionPayment.update({where:{id:payment.id},data:{status:"SUCCEEDED",amount:0}});
 assert.equal(await hasPaidChatDisplaySubscription(user.id,now),false,"zero-ruble payment is not a paid subscriber");
 await prisma.appSubscriptionPayment.update({where:{id:payment.id},data:{amount:100}});
 assert.equal(await hasPaidChatDisplaySubscription(user.id,now),true);
 assert.equal(await hasPaidChatDisplaySubscription(other.id,now),false);
 assert.equal(await getChatDisplayRole({id:user.id,role:"USER"},hasPaidChatDisplaySubscription,now),"subscriber");
 await prisma.appSubscription.update({where:{id:subscription.id},data:{currentPeriodEnd:now}});
 assert.equal(await hasCurrentPaidSubscription(user.id,now),false,"period equal to now is expired");
 assert.equal(await hasPaidChatDisplaySubscription(user.id,now),false);
 assert.equal((await resolveCourseEntitlement({id:"paid",isPrivate:false,isPaid:true},user.id,now)).allowed,false);
 await prisma.appSubscription.update({where:{id:subscription.id},data:{isLifetime:true}});
 assert.equal(await hasCurrentPaidSubscription(user.id,now),true);
 assert.equal(await hasPaidChatDisplaySubscription(user.id,now),true);
 await prisma.appSubscription.update({where:{id:subscription.id},data:{status:"EXPIRED"}});
 assert.equal(await hasCurrentPaidSubscription(user.id,now),false,"lifetime with expired status is denied");
 assert.equal(await hasPaidChatDisplaySubscription(user.id,now),false);
 const course=await prisma.course.create({data:{
   name:"Private ACL",type:"PRIVATE",duration:"7",logoImg:"",trainingLevel:"BEGINNER",
   authorId:trainer.id,isPaid:false,isPrivate:true,
 }});
 const c={id:course.id,isPrivate:true,isPaid:false};
 assert.equal(await hasAssignedPrivateCourse(user.id,course.id),false);
 assert.equal((await resolveCourseEntitlement(c,user.id,now)).allowed,false);
 assert.equal((await resolveCourseEntitlement(c,trainer.id,now)).allowed,false,
   "private access never inherited from trainer role");
 await prisma.courseAccess.create({data:{userId:user.id,courseId:course.id}});
 assert.equal(await hasAssignedPrivateCourse(user.id,course.id),true);
 assert.equal(await hasAssignedPrivateCourse(other.id,course.id),false);
 assert.equal((await resolveCourseEntitlement(c,user.id,now)).source,"PRIVATE_ASSIGNMENT");
 assert.equal((await resolveCourseEntitlement(c,other.id,now)).allowed,false);
 const trx=await prisma.gafusTransaction.create({data:{
   userId:user.id,kind:"SPEND",delta:-1,balanceBefore:1,balanceAfter:0,
   idempotencyKey:"local-entitlements-grant",targetType:"ARTICLE",targetKey:"article:one",settingsRevision:1,
 }});
 await prisma.gafusTargetAccess.create({data:{
   userId:user.id,targetType:"ARTICLE",targetKey:"article:one",transactionId:trx.id,
   settingsRevision:1,grantedAt:now,expiresAt:later,
 }});
 assert.equal(await hasActiveGafusArticleAccess(user.id,"one",now),true);
 assert.equal(await hasActiveGafusArticleAccess(user.id,"two",now),false);
 assert.equal(await hasActiveGafusArticleAccess(other.id,"one",now),false);
 assert.equal(await hasActiveGafusArticleAccess(user.id,"one",later),false,
   "the exact expiration instant is never accepted");
 assert.equal((await resolveArticleEntitlement("one",user.id,"IOS",now)).source,"GAFUS");
 assert.equal((await resolveArticleEntitlement("one",other.id,"ANDROID",now)).allowed,false);
 assert.equal((await resolveArticleEntitlement("one",user.id,"WEB_DESKTOP",later)).allowed,false);
 console.log("ENTITLEMENTS_REAL_PG_PASS: active/expired/lifetime, role/principal, private ACL, paid badge requires settled positive payment, seven-day Gafus article owner+expiry, Core policy parity");
}
main().then(async()=>prisma.$disconnect())
 .catch(async(error)=>{console.error(error);await prisma.$disconnect();process.exitCode=1;});
