import type {GafusStatusDto,GafusHistoryEntry} from
  "@gafus/types";
import {apiRequest} from "../../shared/api/client";

/** WEB-URL-027: existing Hono self-wallet read contract, no payment/unlock. */
export type WalletStatus=Pick<GafusStatusDto,"serverNow"|"wallet"|"activity"|
  "rules"|"enabled"|"settingsRevision">;
export type WalletTransaction=Pick<GafusHistoryEntry,
  "id"|"kind"|"delta"|"balanceAfter"|"createdAt"|"rewardKind">;
export type WalletHistory={items:WalletTransaction[];nextCursor:string|null};
export type WalletSourceMock={
  fixtureKind:"AG2_WALLET_SYNTHETIC_SELF_GET_ONLY";
  status:()=>Promise<unknown>;
  history:(cursor:string|null)=>Promise<unknown>;
};
const object=(raw:unknown):Record<string,unknown>|null=>
  raw!==null&&typeof raw==="object"&&!Array.isArray(raw)?
    raw as Record<string,unknown>:null;
const int=(v:unknown,limit=1000000000):v is number=>
  typeof v==="number"&&Number.isSafeInteger(v)&&v>=0&&v<=limit;
const signed=(v:unknown):v is number=>typeof v==="number"&&
  Number.isSafeInteger(v)&&Math.abs(v)<=1000000000;
const cursor=(v:unknown):v is string=>
  typeof v==="string"&&/^[A-Za-z0-9_-]{1,128}$/.test(v);
const iso=(v:unknown):v is string=>
  typeof v==="string"&&v.length<=40&&Number.isFinite(Date.parse(v));
const reject=():never=>{throw Error("INVALID_GAFUS_WALLET_DTO");};
const rewardKinds=[
  "POST_PUBLISHED","QUESTION_CREATED","ANSWER_CREATED",
  "POST_REACTION_MILESTONE","BEST_ANSWER",
];
const kinds=["EARN","SPEND","ADMIN_CREDIT","ADMIN_DEBIT","LEGACY_IMPORT"];

export function projectWalletStatus(raw:unknown):WalletStatus{
  const data=object(raw);
  if(!data)throw Error("INVALID_GAFUS_WALLET_DTO");
  const wallet=object(data.wallet),activity=object(data.activity);
  const rules=object(data.rules),enabled=object(data.enabled);
  if(!wallet||!activity||!rules||!enabled)
    throw Error("INVALID_GAFUS_WALLET_DTO");
  if(!iso(data.serverNow)||
    !int(wallet.balance)||!int(data.settingsRevision)||
    !int(activity.earned)||!int(activity.limit)||
    !int(activity.remaining)||!int(activity.windowSeconds,10000000)||
    activity.windowSeconds===0||activity.remaining>activity.limit||
    activity.earned+activity.remaining<activity.limit||
    !(activity.nextCapacityAt===null||iso(activity.nextCapacityAt))||
    Object.keys(enabled).some(k=>!["economy","earning","spending"].includes(k))||
    ["economy","earning","spending"].some(k=>typeof enabled[k]!=="boolean")||
    ["postReward","questionReward","answerReward","reactionThreshold",
      "reactionReward","bestAnswerReward","courseStepCost","miniGuideCost",
      "accessDurationSeconds"].some(k=>!int(rules[k],10000000))||
    (rules.accessDurationSeconds as number)===0)
    throw Error("INVALID_GAFUS_WALLET_DTO");
  return {
    serverNow:data.serverNow as string,
    wallet:{balance:wallet.balance as number},
    activity:{
      earned:activity.earned as number,limit:activity.limit as number,
      windowSeconds:activity.windowSeconds as number,
      remaining:activity.remaining as number,
      nextCapacityAt:activity.nextCapacityAt as string|null,
    },
    rules:{
      postReward:rules.postReward as number,
      questionReward:rules.questionReward as number,
      answerReward:rules.answerReward as number,
      reactionThreshold:rules.reactionThreshold as number,
      reactionReward:rules.reactionReward as number,
      bestAnswerReward:rules.bestAnswerReward as number,
      courseStepCost:rules.courseStepCost as number,
      miniGuideCost:rules.miniGuideCost as number,
      accessDurationSeconds:rules.accessDurationSeconds as number,
    },
    enabled:{
      economy:enabled.economy as boolean,earning:enabled.earning as boolean,
      spending:enabled.spending as boolean,
    },settingsRevision:data.settingsRevision as number,
  };
}
export function projectWalletHistory(raw:unknown):WalletHistory{
  const page=object(raw);
  if(!page||!Array.isArray(page.items)||page.items.length>100||
    !(page.nextCursor===null||cursor(page.nextCursor)))
    throw Error("INVALID_GAFUS_WALLET_DTO");
  const ids=new Set<string>();
  const items:WalletTransaction[]=page.items.map((unknownItem:unknown)=>{
    const item=object(unknownItem);
    if(!item||!cursor(item.id)||ids.has(item.id)||
      !kinds.includes(String(item.kind))||!signed(item.delta)||
      !int(item.balanceAfter)||!iso(item.createdAt)||
      !(item.rewardKind===null||rewardKinds.includes(String(item.rewardKind))))
      throw Error("INVALID_GAFUS_WALLET_DTO");
    ids.add(item.id as string);
    // Never cache source user/entity identifiers, target keys or metadata.
    return {
      id:item.id as string,kind:item.kind as WalletTransaction["kind"],
      delta:item.delta as number,balanceAfter:item.balanceAfter as number,
      createdAt:item.createdAt as string,
      rewardKind:item.rewardKind as WalletTransaction["rewardKind"],
    };
  });
  return {items,nextCursor:page.nextCursor as string|null};
}
export async function getWalletStatus(signal?: AbortSignal){
  return projectWalletStatus(await apiRequest<unknown>("/api/v1/gafus/status",{
    method:"GET",browserAuth:true,expectedStatus:200,
    ...(signal ? { signal } : {}),
  }));
}
export async function getWalletHistory(nextCursor:string|null=null){
  if(nextCursor!==null&&!cursor(nextCursor))reject();
  return projectWalletHistory(await apiRequest<unknown>(
    "/api/v1/gafus/history?limit=20"+
    (nextCursor===null?"":"&cursor="+encodeURIComponent(nextCursor)),{
      method:"GET",browserAuth:true,expectedStatus:200,
    }));
}
