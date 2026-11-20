/** Production personalization adapter acceptance on a disposable loopback PG. */
import {beforeAll,afterAll,describe,expect,it} from "vitest";
import {randomUUID} from "node:crypto";
import {prisma} from "@gafus/prisma";
import {createSmartFeedPreferences} from "@gafus/core/services/feed";
import {smartFeedPreferencesRows} from "./smartPreferencesRows.js";
let safe=false;
try{const u=new URL(process.env.DATABASE_URL??"");safe=
 process.env.GAFUS_FEED_QA==="1"&&u.hostname==="127.0.0.1"&&u.username==="qafeed"&&
 /^\/feed_parity_[a-f0-9]{12}$/.test(u.pathname)&&u.protocol==="postgresql:"&&
 process.env.GAFUS_FEED_QA_DB_NAME===u.pathname.slice(1);}catch{/* fail closed */}
const suite=safe?describe:describe.skip;
let viewer="";
suite("smart feed personalization SQL ownership and reset",()=>{
 const prefs=createSmartFeedPreferences(smartFeedPreferencesRows);
 beforeAll(async()=>{
  const [db]=await prisma.$queryRaw<{db:string}[]>`SELECT current_database() AS db`;
  expect(db.db).toBe(process.env.GAFUS_FEED_QA_DB_NAME);
  viewer=(await prisma.user.create({data:{username:"feed-pref-qa-"+randomUUID(),password:"test-only"}})).id;
 });
 afterAll(async()=>{await prisma.$disconnect();});
 it("rejects missing actor and reads defaults without a row",async()=>{
  await expect(prefs.get("nonexistent-feed-viewer")).rejects.toMatchObject({status:401});
  expect(await prefs.get(viewer)).toEqual({enabled:true,useCity:true,usePets:true,useBehavior:true,exploration:true});
  expect(await prisma.feedPersonalizationPreference.count({where:{userId:viewer}})).toBe(0);
 });
 it("patches only caller-owned preferences and rejects unknown fields",async()=>{
  expect(await prefs.patch(viewer,{useCity:false,exploration:false})).toMatchObject({enabled:true,useCity:false,exploration:false});
  expect(await prisma.feedPersonalizationPreference.count({where:{userId:viewer}})).toBe(1);
  await expect(prefs.patch(viewer,{userId:"someone-else"})).rejects.toMatchObject({status:400});
  expect((await prefs.get(viewer)).useCity).toBe(false);
 });
 it("reset stamps history and restores clean preference baseline without deleting it",async()=>{
  const result=await prefs.reset(viewer);
  expect(result.reset).toBe(true);
  const row=await prisma.feedPersonalizationPreference.findUniqueOrThrow({where:{userId:viewer}});
  expect(row.historyResetAt?.toISOString()).toBe(result.resetAt);
  expect(row.useCity).toBe(false); // reset clears derived signals, not explicit choices
  expect(await prisma.feedPersonalizationPreference.count({where:{userId:viewer}})).toBe(1);
 });
});
