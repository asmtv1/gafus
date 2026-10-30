/** AG1 / OFF-021: current step completion != Gafus earn. Real rewardService,
 * controlled in-memory Prisma Tx: NO real database, mail, network or native storage.
 * Path assertions target concrete existing code, not future v2 protocol guarantees.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { GafusTx } from "./types";
import { awardActivityTx, awardBonusTx } from "./rewardService";
import { DEFAULT_GAFUS_SETTINGS } from "./settingsService";

const core = (relative: string) =>
  readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");
const section = (source: string, start: string, end: string) => {
  const a=source.indexOf(start);const b=source.indexOf(end,a+start.length);
  expect(a).toBeGreaterThanOrEqual(0);expect(b).toBeGreaterThan(a);
  return source.slice(a,b);
};

type LedgerEvent = {
  id: string; eventKey: string; userId: string; rewardKind: string;
  sourceEntityId: string; rewardClass: string; decision: string;
  amount: number; occurredAt: Date; contentFingerprint?: string | null;
  transactionId?: string | null;
};
function fakeLedgerTx() {
  const events=new Map<string,LedgerEvent>();
  const lines=new Map<string,{id:string;userId:string;delta:number;kind:string;balanceAfter:number;targetKey:string|null}>();
  let balance=0, walletExists=false;
  const settings={...DEFAULT_GAFUS_SETTINGS,economyEnabled:true,earningEnabled:true,spendingEnabled:true};
  const tx={
    $queryRaw:async()=>[{pg_advisory_xact_lock:null}],
    gafusSettings:{findUnique:async()=>settings},
    gafusNotificationOutbox:{upsert:async()=>({})},
    gafusWallet:{
      findUnique:async()=>walletExists?{balance}:null,
      upsert:async()=>{walletExists=true;return {balance};},
      updateMany:async({where,data}:{where:{balance?:{gte:number}};data:{balance:{increment?:number;decrement?:number}}})=>{
        if(where.balance && balance<where.balance.gte)return {count:0};
        balance+=(data.balance.increment??0)-(data.balance.decrement??0);return {count:1};
      },
    },
    gafusTransaction:{
      findUnique:async({where}:{where:{idempotencyKey:string}})=>lines.get(where.idempotencyKey)??null,
      create:async({data}:{data:{idempotencyKey:string;userId:string;delta:number;kind:string;balanceAfter:number;targetKey?:string|null}})=>{
        const row={...data,id:`tx-${lines.size+1}`,targetKey:data.targetKey??null};lines.set(data.idempotencyKey,row);return row;
      },
    },
    gafusRewardEvent:{
      findUnique:async({where}:{where:{eventKey:string}})=>events.get(where.eventKey)??null,
      findFirst:async({where}:{where:{userId:string;contentFingerprint:string;occurredAt:{gte:Date;lte:Date}}})=>
        [...events.values()].find(e=>e.userId===where.userId && e.contentFingerprint===where.contentFingerprint
          && e.occurredAt>=where.occurredAt.gte && e.occurredAt<=where.occurredAt.lte)??null,
      aggregate:async({where}:{where:{userId:string;rewardClass:string;decision:string;occurredAt:{gt:Date;lte:Date}}})=>({
        _sum:{amount:[...events.values()].filter(e=>e.userId===where.userId && e.rewardClass===where.rewardClass && e.decision===where.decision && e.occurredAt>where.occurredAt.gt && e.occurredAt<=where.occurredAt.lte).reduce((sum,e)=>sum+e.amount,0)},
      }),
      create:async({data}:{data:Omit<LedgerEvent,"id">})=>{const row={...data,id:`event-${events.size+1}`};events.set(data.eventKey,row);return row;},
    },
  };
  return {tx:tx as unknown as GafusTx,lines,events,balance:()=>balance};
}
const occurredAt=new Date("2026-10-10T10:00:00.000Z");
const post=(eventKey:string,sourceEntityId:string)=>({userId:"synthetic-user-A",kind:"POST_PUBLISHED" as const,eventKey,sourceEntityId,occurredAt,
  content:"Подробная история о тренировках и прогулках с собакой в октябре"});

describe("AG1 OFF021 existing training vs earning boundary (NO real DB)",()=>{
  it("RW01 current Gafus reward kinds have NO training-completion earning kind",()=>{
    const types=core("./types.ts"),schema=core("../../../../prisma/schema.prisma");
    const expected=["POST_PUBLISHED","QUESTION_CREATED","ANSWER_CREATED","POST_REACTION_MILESTONE","BEST_ANSWER"];
    const union=section(types,"export type GafusRewardKind =","export type GafusActivityKind");
    const model=section(schema,"enum GafusRewardKind {","enum GafusRewardDecision {");
    for(const kind of expected){expect(union).toContain(`"${kind}"`);expect(model).toContain(kind);}
    expect(union).not.toMatch(/TRAINING|STEP_COMPLETED|DAILY_COURSE/);
    expect(model).not.toMatch(/TRAINING|STEP_COMPLETED|DAILY_COURSE/);
  });
  it("RW02 practice and theory API completion contain NO Gafus award or grant call",()=>{
    const source=core("../../../../../apps/api/src/routes/v1/training.ts");
    const span=section(source,'trainingRoutes.post(\n  "/step/complete/practice",', "const postDiaryBodySchema");
    expect(span).toContain("await writeStepProgressApplication.execute(");
    expect(span).toContain("await syncUserCourseStatusFromDays(");
    expect(span).not.toMatch(/awardActivityTx|awardBonusTx|changeGafusBalanceTx|grantRewardedCreditsToWallet|gafusRewardEvent/);
    expect(span).toContain("return c.json({ success: true })");
  });
  it("RW03 daily completion uses progress service only, not Gafus award/grant",()=>{
    const source=core("../../../../../apps/api/src/routes/v1/daily-course.ts");
    const span=section(source,'dailyCourseRoutes.post("/step/complete",',"\n}");
    expect(span).toContain("await dayAndStepCommandsApplication.updateStep(");
    expect(span).not.toMatch(/awardActivityTx|awardBonusTx|changeGafusBalanceTx|grantRewardedCreditsToWallet|gafusRewardEvent/);
  });
  it("RW04 actual Core step/daily complete state transitions never directly write Gafus wallets/events",()=>{
    const training=core("../training/trainingService.ts");
    const daily=core("../dailyCourse/dailyCourseService.ts");
    const step=section(training,"export async function updateStepAndDay(","export async function syncUserCourseStatusFromDays(");
    const day=section(daily,"export async function updateDailyCourseStepAndDay(","export async function getDailyCourseScheduleStatistics(");
    for(const s of [step,day]){
      expect(s).toContain("stepJustCompleted");
      expect(s).not.toMatch(/awardActivityTx|awardBonusTx|gafusRewardEvent|gafusTransaction|gafusWallet|grantRewardedCreditsToWallet/);
    }
  });
  it("RW05 real Gafus awardActivityTx REPLAY of same already-granted eventKey does not increment balance again",async()=>{
    const ledger=fakeLedgerTx();
    const first=await awardActivityTx(ledger.tx,post("activity:post:synthetic-1","post-1"));
    const replay=await awardActivityTx(ledger.tx,post("activity:post:synthetic-1","post-1"));
    expect(first).toMatchObject({decision:"GRANTED",amount:1,replay:false});
    expect(replay).toMatchObject({decision:"GRANTED",amount:1,replay:true});
    expect(ledger.balance()).toBe(1);expect(ledger.lines.size).toBe(1);expect(ledger.events.size).toBe(1);
  });
  it("RW06 replay key reused for different reward source is rejected, no second wallet mutation",async()=>{
    const ledger=fakeLedgerTx();
    await awardActivityTx(ledger.tx,post("activity:post:synthetic-1","post-1"));
    await expect(awardActivityTx(ledger.tx,post("activity:post:synthetic-1","post-2"))).rejects.toThrow("Reward event key belongs to another event");
    expect(ledger.balance()).toBe(1);expect(ledger.events.size).toBe(1);
  });
  it("RW07 a NEW legitimate distinct publication event earns independently; no training completion award kind exists",async()=>{
    const ledger=fakeLedgerTx();
    const first=await awardActivityTx(ledger.tx,post("activity:post:synthetic-1","post-1"));
    const next=await awardActivityTx(ledger.tx,{
      ...post("activity:post:synthetic-2","post-2"),
      content:"Отдельный подробный рассказ о социализации щенка на занятиях с кинологом",
    });
    expect(first.amount).toBe(1);expect(next.amount).toBe(1);
    expect(ledger.balance()).toBe(2);expect(ledger.lines.size).toBe(2);
  });
  it("RW08 bonus BEST_ANSWER replay same event key does not double credit",async()=>{
    const ledger=fakeLedgerTx();
    const input={userId:"synthetic-user-A",kind:"BEST_ANSWER" as const,eventKey:"bonus:best-answer:synthetic-1",sourceEntityId:"answer-1",occurredAt};
    const a=await awardBonusTx(ledger.tx,input),b=await awardBonusTx(ledger.tx,input);
    expect(a).toMatchObject({decision:"GRANTED",amount:1,replay:false});
    expect(b).toMatchObject({replay:true});
    expect(ledger.balance()).toBe(1);expect(ledger.lines.size).toBe(1);
  });
});
