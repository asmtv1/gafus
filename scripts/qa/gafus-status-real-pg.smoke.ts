/** Owner-safe Gafus status read; all writes are disposable setup fixtures. */
import assert from "node:assert/strict";
import {prisma} from "@gafus/prisma";
import {listGrantedGafusActivity} from "@gafus/gafus-server/activity-read";
import {getGafusSettingsRow} from "@gafus/gafus-server/settings-read";
import {getGafusSettings} from "../../packages/core/src/services/gafus/settingsService.js";
import {getGafusStatus} from "../../packages/core/src/services/gafus/statusService.js";
const url=new URL(process.env.DATABASE_URL??"http://invalid");
if(process.env.GAFUS_LOCAL_ISOLATED_API!=="1" || process.env.GAFUS_STATUS_REAL_PG!=="1" ||
   url.protocol!=="postgresql:" || url.hostname!=="127.0.0.1" ||
   url.pathname!=="/gafus_refactor_gafus_status")
  throw Error("REFUSING_NON_DISPOSABLE_GAFUS_STATUS_DB");
const now=new Date("2026-11-07T10:00:00.000Z");
const cutoff=new Date(now.getTime()-86400_000);
async function main(){
  const [a,b]=await Promise.all([
    prisma.user.create({data:{username:"status_user_a",password:"synthetic-disposable"}}),
    prisma.user.create({data:{username:"status_user_b",password:"synthetic-disposable"}}),
  ]);
  const create=(owner:string,key:string,cls:"ACTIVITY"|"BONUS",decision:"GRANTED"|"DENIED_ACTIVITY_LIMIT",when:Date,amount=1)=>({
    userId:owner,eventKey:key,rewardClass:cls,rewardKind:"POST_PUBLISHED" as const,
    decision,occurredAt:when,settingsRevision:1,amount,
  });
  await prisma.gafusRewardEvent.createMany({data:[
    create(a.id,"inside-first","ACTIVITY","GRANTED",new Date(now.getTime()-23*3600000)),
    create(a.id,"inside-second","ACTIVITY","GRANTED",new Date(now.getTime()-2000)),
    create(a.id,"at-cutoff","ACTIVITY","GRANTED",cutoff),
    create(a.id,"outside-old","ACTIVITY","GRANTED",new Date(cutoff.getTime()-1)),
    create(a.id,"bonus-not-activity","BONUS","GRANTED",new Date(now.getTime()-3000),2),
    create(a.id,"denied-not-activity","ACTIVITY","DENIED_ACTIVITY_LIMIT",new Date(now.getTime()-3000),0),
    create(a.id,"future-grant","ACTIVITY","GRANTED",new Date(now.getTime()+1000)),
    create(b.id,"other-user","ACTIVITY","GRANTED",new Date(now.getTime()-1000)),
  ]});
  assert.equal(await getGafusSettingsRow(),null);
  const defaults=await getGafusSettings();
  assert.equal(defaults.activityLimit,3);
  assert.equal(defaults.courseStepCost,1);
  assert.equal(defaults.accessDurationSeconds,604800);
  const aActivity=await listGrantedGafusActivity(a.id,cutoff,now);
  assert.equal(aActivity.length,2,"excluded cutoff, future, denied, bonus and foreign event");
  const result=await getGafusStatus(a.id,now);
  assert.deepEqual({earned:result.activity.earned,remaining:result.activity.remaining,limit:result.activity.limit},
    {earned:2,remaining:1,limit:3});
  assert.equal(result.wallet.balance,0);
  assert.equal(result.activity.nextCapacityAt,null);
  await prisma.gafusSettings.create({data:{key:"default",revision:7,economyEnabled:false,
    courseStepCost:9,miniGuideCost:17,accessDurationSeconds:100}});
  const hardened=await getGafusStatus(a.id,now);
  assert.equal(hardened.settingsRevision,7);
  assert.equal(hardened.enabled.economy,false);
  assert.equal(hardened.rules.courseStepCost,1);
  assert.equal(hardened.rules.miniGuideCost,1);
  assert.equal(hardened.rules.accessDurationSeconds,604800);
  assert.equal((await getGafusStatus(b.id,now)).activity.earned,1);
  await assert.rejects(listGrantedGafusActivity("",cutoff,now),/GAFUS_STATUS_OWNER_REQUIRED/);
  console.log("GAFUS_STATUS_REAL_PG_PASS: strict (cutoff,now], activity/denial/bonus/foreign exclusions, read-only wallet, immutable 1-Gafus 7-day price");
}
main().then(async()=>prisma.$disconnect())
  .catch(async(error)=>{console.error(error);await prisma.$disconnect();process.exitCode=1;});
