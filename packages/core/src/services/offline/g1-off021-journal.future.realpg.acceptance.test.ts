/** OFF-021 AG1 future journal acceptance: intentionally NOT an implementation.
 * This suite skips unless AG4 has issued a NEW explicit SQL journal lease AND
 * a transaction-aware implementation is available. It must not be run against
 * an old native PG lease, production, or historical events.
 *
 * Expected future journal implementation API contract (reviewable by AG4):
 * packages/core/src/services/offline/offlineMutationJournal.ts must export
 * `createOfflineJournalAcceptanceAdapter({databaseUrl})` implementing the
 * functions specified below. The adapter must use real PostgreSQL transactions,
 * real journal constraints and disposable synthetic fixture rows. It must not
 * mock or fake receipt writes or tests will be invalid.
 */
import { beforeAll, afterAll, beforeEach, describe, expect, it } from "vitest";
import { readFileSync, lstatSync, realpathSync } from "node:fs";
import { randomUUID } from "node:crypto";
const ROOT="/Users/asmtv1/Desktop/gafus-refactor";
const env=process.env.AG1_OFF021_JOURNAL_PG_URL;
const leasePath=process.env.AG1_OFF021_JOURNAL_LEASE_FILE;
const match=env && leasePath;
if (Boolean(env)!==Boolean(leasePath)) throw Error("OFF021_PG_AND_AG4_LEASE_MUST_BE_SUPPLIED_TOGETHER");

type MutationResult={status:number;body:{success:boolean;ack?:{eventId:string;state:"COMMITTED";replayed:boolean;serverRevision:string;result:unknown;items?:{eventId:string;clientId:string;state:"COMMITTED";result:"CREATED"|"UPDATED"}[]};code?:string}};
type Input={ownerId:string;eventId:string;operation:"training.complete"|"training.reset"|"prevention.batch"|"video.position"|"training.start";resourceKey:string;payload:unknown;failpoint?:"AFTER_SQL_STATE_UPDATE"|"BEFORE_COMMIT"|"NONE"};
type Snapshot={stateMutations:number;gafusEarnMutations:number;notificationsScheduled:number;receiptCount:number;trainingCycle:number;videoPosition:number;videoRevision:number;preventionRows:number;itemAckCount:number};
type FutureRealSqlAdapter={
 seedOwners():Promise<{ownerA:string;ownerB:string;trainingResource:string;preventionResource:string;videoResource:string}>;
 execute(input:Input):Promise<MutationResult>;
 snapshot(ownerId:string):Promise<Snapshot>;
 lookup(ownerId:string,eventId:string):Promise<MutationResult>;
 discardOnlySyntheticFixtures():Promise<void>;
 disconnect():Promise<void>;
};
let adapter:FutureRealSqlAdapter;
let own:{ownerA:string;ownerB:string;trainingResource:string;preventionResource:string;videoResource:string};
function command(operation:Input["operation"],payload:unknown,overrides:Partial<Input>={}):Input{
 return {ownerId:own.ownerA,eventId:randomUUID(),operation,resourceKey:own.trainingResource,payload,...overrides};
}
(match ? describe : describe.skip)("AG4-LEASED FUTURE v2 offline journal true PG invariants — NOT IMPLEMENTED NOW",()=>{
 beforeAll(async()=>{
  if (!env || !leasePath) throw Error("OFF021_NO_JOURNAL_SQL_LEASE");
  if (!leasePath.startsWith(ROOT+"/apps/admin-panel/.ag4-") || !leasePath.endsWith(".json"))throw Error("OFF021_AG4_LEASE_PATH_NOT_ALLOWED");
  if(lstatSync(leasePath).isSymbolicLink() || realpathSync(leasePath)!==leasePath)throw Error("OFF021_LEASE_SYMLINK_FORBIDDEN");
  const lease=JSON.parse(readFileSync(leasePath,"utf8")) as Record<string,unknown>;
  if(lease.root!==ROOT || lease.branch!=="vite" || lease.resourceOwner!=="AG4" || lease.executor!=="AG1" || lease.state!=="ACTIVE_AG1_OFF021_JOURNAL_SQL_ONLY")throw Error("OFF021_ACTIVE_JOURNAL_LEASE_REQUIRED");
  const url=new URL(env);
  if(url.protocol!=="postgresql:" || url.hostname!=="127.0.0.1" || !/^gafus_off021_journal_ag1_[a-z0-9_]+$/.test(url.pathname.slice(1)))throw Error("OFF021_ONLY_NEW_AG4_ISOLATED_DB_ALLOWED");
  if (lease.database!==url.pathname.slice(1) || Number(lease.port)!==Number(url.port))throw Error("OFF021_AG4_LEASE_DB_PORT_MISMATCH");
  const expiry=Date.parse(String(lease.expiresAtUTC));if(!Number.isFinite(expiry)||expiry<=Date.now())throw Error("OFF021_EXPIRED_JOURNAL_LEASE");
  // Module does not exist now. Never import it unless AG4 supplies matching ACTIVE lease.
  const entry=ROOT+"/packages/core/src/services/offline/offlineMutationJournal.ts";
  const real=await import(/* @vite-ignore */ entry) as {createOfflineJournalAcceptanceAdapter?:(p:{databaseUrl:string})=>Promise<FutureRealSqlAdapter>};
  if(typeof real.createOfflineJournalAcceptanceAdapter!=="function")throw Error("OFF021_JOURNAL_REAL_PG_ADAPTER_NOT_IMPLEMENTED");
  adapter=await real.createOfflineJournalAcceptanceAdapter({databaseUrl:env});
 },120000);
 beforeEach(async()=>{
  if(adapter)await adapter.discardOnlySyntheticFixtures();
  own=await adapter.seedOwners();
 },120000);
 afterAll(async()=>{
  if(adapter){await adapter.discardOnlySyntheticFixtures();await adapter.disconnect();}
 },120000);
 it("JTX01 first complete and same exact event replay return one stable COMMITTED ACK and one business mutation",async()=>{
  const input=command("training.complete",{stepIndex:0});const first=await adapter.execute(input);const before=await adapter.snapshot(own.ownerA);
  const replay=await adapter.execute(input);const after=await adapter.snapshot(own.ownerA);
  expect(first.status).toBe(200);expect(first.body.ack).toMatchObject({eventId:input.eventId,state:"COMMITTED",replayed:false});
  expect(replay.body.ack).toMatchObject({eventId:input.eventId,state:"COMMITTED",replayed:true});
  expect(replay.body.ack?.serverRevision).toBe(first.body.ack?.serverRevision);expect(after).toEqual(before);
 });
 it("JTX02 exact event id with different payload returns explicit 409/no ACK; state unchanged",async()=>{
  const input=command("training.complete",{stepIndex:0});await adapter.execute(input);const before=await adapter.snapshot(own.ownerA);
  const reply=await adapter.execute({...input,payload:{stepIndex:1}});
  expect(reply.status).toBe(409);expect(reply.body.code).toBe("IDEMPOTENCY_KEY_CONFLICT");expect(reply.body.ack).toBeUndefined();expect(await adapter.snapshot(own.ownerA)).toEqual(before);
 });
 it("JTX03 same key with different operation/resource is conflict and cannot mutate",async()=>{
  const input=command("training.start",{durationSec:30});await adapter.execute(input);const before=await adapter.snapshot(own.ownerA);
  const reply=await adapter.execute({...input,operation:"training.reset"});expect(reply.status).toBe(409);expect(reply.body.ack).toBeUndefined();
  expect(await adapter.snapshot(own.ownerA)).toEqual(before);
 });
 it("JTX04 concurrent identical POST on two PG transactions commits business mutation once",async()=>{
  const input=command("training.complete",{stepIndex:0});const responses=await Promise.all([adapter.execute(input),adapter.execute(input)]);
  expect(responses.every(x=>x.status===200)).toBe(true);expect(responses.map(x=>x.body.ack?.replayed).sort()).toEqual([false,true]);
  const snap=await adapter.snapshot(own.ownerA);expect(snap.stateMutations).toBe(1);expect(snap.receiptCount).toBe(1);
 });
 it("JTX05 concurrent mismatched payloads same event produce one committed ACK and one 409, not both mutations",async()=>{
  const input=command("training.complete",{stepIndex:0});const replies=await Promise.all([adapter.execute(input),adapter.execute({...input,payload:{stepIndex:1}})]);
  expect(replies.map(r=>r.status).sort()).toEqual([200,409]);expect((await adapter.snapshot(own.ownerA)).stateMutations).toBe(1);
 });
 it("JTX06 injected failure AFTER true SQL state write rolls back both state AND receipt",async()=>{
  const input=command("training.complete",{stepIndex:0},{failpoint:"AFTER_SQL_STATE_UPDATE"});await expect(adapter.execute(input)).rejects.toThrow();
  const snap=await adapter.snapshot(own.ownerA);expect(snap.stateMutations).toBe(0);expect(snap.receiptCount).toBe(0);
  const retry=await adapter.execute({...input,failpoint:"NONE"});expect(retry.body.ack?.replayed).toBe(false);
 });
 it("JTX07 timeout-after-commit replay same event never repeats side effect or Gafus mutation",async()=>{
  const input=command("training.complete",{stepIndex:0});void(await adapter.execute(input));const original=await adapter.snapshot(own.ownerA);
  const replay=await adapter.execute(input);expect(replay.body.ack?.replayed).toBe(true);expect(await adapter.snapshot(own.ownerA)).toEqual(original);
  expect(original.gafusEarnMutations).toBe(0);
 });
 it("JTX08 legitimate reset and recomplete use NEW event IDs; old completion replay cannot undo later state",async()=>{
  const complete=command("training.complete",{stepIndex:0}),reset=command("training.reset",{stepIndex:0}),repeat=command("training.complete",{stepIndex:0});
  expect((await adapter.execute(complete)).status).toBe(200);expect((await adapter.execute(reset)).status).toBe(200);expect((await adapter.execute(repeat)).status).toBe(200);
  const before=await adapter.snapshot(own.ownerA);expect(before.trainingCycle).toBe(2);
  expect((await adapter.execute(complete)).body.ack?.replayed).toBe(true);expect(await adapter.snapshot(own.ownerA)).toEqual(before);
 });
 it("JTX09 different authenticated owner may not replay/extract first owner's ACK or mutate their resource",async()=>{
  const input=command("training.complete",{stepIndex:0});await adapter.execute(input);
  const чужой=await adapter.lookup(own.ownerB,input.eventId);expect(чужой.body.ack).toBeUndefined();expect([403,404]).toContain(чужой.status);
  const attempt=await adapter.execute({...input,ownerId:own.ownerB});expect([403,404]).toContain(attempt.status);expect(attempt.body.ack).toBeUndefined();
 });
 it("JTX10 prevention same clientId identical item receives explicit stable item ACK; changed payload produces 409",async()=>{
  const clientId=randomUUID(),itemEventId=randomUUID();
  const item={eventId:itemEventId,clientId,type:"VACCINATION",productName:"Synthetic"};
  const input=command("prevention.batch",{items:[item]},{resourceKey:own.preventionResource});
  const first=await adapter.execute(input);const replay=await adapter.execute(input);
  expect(first.status).toBe(200);expect(first.body.ack?.items).toEqual([{eventId:itemEventId,clientId,state:"COMMITTED",result:"CREATED"}]);
  expect(replay.body.ack?.replayed).toBe(true);expect(replay.body.ack?.items).toEqual(first.body.ack?.items);
  const conflict=await adapter.execute({...input,eventId:randomUUID(),payload:{items:[{...item,eventId:randomUUID(),productName:"Changed"}]}});
  expect(conflict.status).toBe(409);expect(conflict.body.ack).toBeUndefined();expect((await adapter.snapshot(own.ownerA)).preventionRows).toBe(1);
 });
 it("JTX11 prevention batch fails after second real SQL item and rolls back all items and ACK",async()=>{
  const input=command("prevention.batch",{items:[{clientId:randomUUID(),type:"VACCINATION"},{clientId:randomUUID(),type:"VACCINATION"}]},{resourceKey:own.preventionResource,failpoint:"AFTER_SQL_STATE_UPDATE"});
  await expect(adapter.execute(input)).rejects.toThrow();const snap=await adapter.snapshot(own.ownerA);expect(snap.preventionRows).toBe(0);expect(snap.receiptCount).toBe(0);
 });
 it("JTX12 stale video revision cannot override newer position and returns no ACK",async()=>{
  const newer=command("video.position",{positionSec:110,expectedVersion:0},{resourceKey:own.videoResource});expect((await adapter.execute(newer)).status).toBe(200);
  const prev=await adapter.snapshot(own.ownerA);
  const stale=await adapter.execute(command("video.position",{positionSec:50,expectedVersion:0},{resourceKey:own.videoResource}));
  expect(stale.status).toBe(409);expect(stale.body.ack).toBeUndefined();expect(await adapter.snapshot(own.ownerA)).toEqual(prev);
 });
 it("JTX13 START retry does not reschedule notification outbox twice",async()=>{
  const input=command("training.start",{durationSec:40});await adapter.execute(input);await adapter.execute(input);
  expect((await adapter.snapshot(own.ownerA)).notificationsScheduled).toBe(1);
 });
});
