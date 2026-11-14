/** Rewarded-ad settings persistence. Core owns validation, safe defaults,
 * platform-version flags, placement configuration and staff route policy.
 * No external ad-provider calls are performed by this adapter.
 */
import {prisma} from "@gafus/prisma";
export type RewardedSettingsRow={
 androidEnabled:boolean;
 iosEnabled:boolean;
 dailyAdLimit:number;
 yandexAndroidPlacementId:string|null;
 yandexIosPlacementId:string|null;
 testMode:boolean;
};
export async function readRewardedAdSettingsRow(){
 return prisma.rewardedAdSettings.findUnique({where:{key:"default"}});
}
export async function writeRewardedAdSettingsRow(settings:RewardedSettingsRow,actorId?:string|null){
 const data={...settings,updatedById:actorId??null};
 return prisma.rewardedAdSettings.upsert({
  where:{key:"default"},create:{key:"default",...data},update:data,
 });
}
