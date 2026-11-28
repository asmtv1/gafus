import { createRequire } from "node:module";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import type { WalkFix } from "@gafus/core-client/walk-tracking";

interface SqlStatement {
  run(...args: unknown[]): unknown;
  get(...args: unknown[]): unknown;
  all(...args: unknown[]): unknown[];
}
interface SqlDatabase {
  exec(sql: string): void;
  prepare(sql: string): SqlStatement;
  close(): void;
}
// The test exercises real SQLite, not a mock of query results. Node 20 CI
// skips this suite; run it explicitly under Node 22+ with built-in SQLite.
const runtime = vi.hoisted(() => ({
  db: null as SqlDatabase | null,
  failNextCheckpoint: false,
  queue: Promise.resolve(),
  keys: new Map<string,Uint8Array>(),
}));
let DatabaseSync: (new (name: string) => SqlDatabase) | undefined;
try { DatabaseSync = createRequire(import.meta.url)("node:sqlite").DatabaseSync; } catch { /* Node <22 */ }

vi.mock("expo-sqlite", () => {
  const adapter = {
    execAsync: async (sql: string) => runtime.db!.exec(sql),
    runAsync: async (sql: string,...args: unknown[]) => {
      if (runtime.failNextCheckpoint && sql.includes("INSERT INTO gps_tracking_checkpoint")) {
        runtime.failNextCheckpoint = false;
        throw new Error("injected write failure");
      }
      return runtime.db!.prepare(sql).run(...args);
    },
    getFirstAsync: async (sql: string,...args: unknown[]) => runtime.db!.prepare(sql).get(...args) ?? null,
    getAllAsync: async (sql: string,...args: unknown[]) => runtime.db!.prepare(sql).all(...args),
    withExclusiveTransactionAsync: async (fn: (tx: unknown) => Promise<void>) => {
      const run = runtime.queue.then(async () => {
        runtime.db!.exec("BEGIN IMMEDIATE");
        try { await fn(adapter); runtime.db!.exec("COMMIT"); }
        catch (e) { runtime.db!.exec("ROLLBACK"); throw e; }
      });
      runtime.queue = run.catch(() => undefined);
      return run;
    },
  };
  return { openDatabaseAsync: async () => adapter };
});
// Native SecureStore/AES bridge is mocked; the ciphertext itself uses real Node AES-256-GCM.
vi.mock("./walkQaCrypto",async()=>{
  const {randomBytes,createCipheriv,createDecipheriv}=await import("node:crypto");
  return {
    createQaKey:async(id:string)=>{runtime.keys.set(id,Uint8Array.from(randomBytes(32)));},
    deleteQaKey:async(id:string)=>{runtime.keys.delete(id);},
    sealQaBatch:async(id:string,aad:string,value:unknown)=>{
      const nonce=Uint8Array.from(randomBytes(12)),cipher=createCipheriv("aes-256-gcm",runtime.keys.get(id)!,nonce);
      cipher.setAAD(Uint8Array.from(Buffer.from(aad)));
      return Buffer.concat([nonce,Uint8Array.from(cipher.update(JSON.stringify(value))),Uint8Array.from(cipher.final()),Uint8Array.from(cipher.getAuthTag())]).toString("base64");
    },
    openQaBatch:async(id:string,aad:string,value:string)=>{
      const data=Uint8Array.from(Buffer.from(value,"base64")),cipher=createDecipheriv("aes-256-gcm",runtime.keys.get(id)!,data.subarray(0,12));
      cipher.setAAD(Uint8Array.from(Buffer.from(aad)));cipher.setAuthTag(data.subarray(-16));
      return JSON.parse(Buffer.concat([Uint8Array.from(cipher.update(data.subarray(12,-16))),Uint8Array.from(cipher.final())]).toString());
    }
  };
});
vi.mock("./walkQaSensors",()=>({sampleQaSteps:async()=>({kind:"unknown",reason:"unavailable"})}));
const start = 1_800_000_000_000;
const d = 180 / (Math.PI*6371008.8);
function fix(sec: number, x: number, speed = 1): WalkFix {
  return { timestamp:start+sec*1000, latitude:0,longitude:x*d,accuracy:5,speed };
}
const samples = [fix(0,0),fix(4,4),fix(8,8),fix(12,12)];
function getDocument() {
  const row = runtime.db!.prepare("SELECT document FROM gps_tracking_checkpoint WHERE ownerId='a' AND walkId='walk'").get() as {document:string};
  return JSON.parse(row.document);
}
describe.skipIf(!DatabaseSync)("GPS SQLite integration (real database)", () => {
  let store: typeof import("./walkGpsStorage");
  beforeEach(async () => {
    runtime.db = new DatabaseSync!(":memory:");
    runtime.queue = Promise.resolve();
    runtime.failNextCheckpoint = false;
    runtime.keys.clear();
    vi.stubEnv("EXPO_PUBLIC_WALK_QA_CAPTURE","");
    vi.stubEnv("EXPO_PUBLIC_WALK_TRACKING_ENGINE","v2");
    vi.stubEnv("EXPO_PUBLIC_WALK_TRACKING_VARIANT","");
    vi.spyOn(Date,"now").mockReturnValue(start);
    vi.resetModules();
    store = await import("./walkGpsStorage");
  });
  afterEach(() => {
    runtime.db?.close();
    runtime.db = null;
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });
  it("probes only stored points for the exact owner and walk", async () => {
    await store.activateGpsSession("a","walk");
    expect(await store.hasStoredGpsPoint("a","walk")).toBe(false);
    await store.persistGpsBatch(samples,start+12000);
    await store.deactivateGpsSession("a","walk",start+12000);
    expect(await store.hasStoredGpsPoint("a","walk")).toBe(true);
    expect(await store.hasStoredGpsPoint("b","walk")).toBe(false);
    expect(await store.hasStoredGpsPoint("a","other")).toBe(false);
  });
  it("persists only canonical points, flushes finish and is idempotent across restart", async () => {
    await store.activateGpsSession("a","walk");
    await store.persistGpsBatch(samples,start+15_000);
    const first = await store.readGpsPoints("a","walk");
    expect(first.length).toBeGreaterThan(0);
    vi.resetModules();
    store = await import("./walkGpsStorage");
    await store.persistGpsBatch(samples,start+16_000);
    expect(await store.readGpsPoints("a","walk")).toEqual(first);
    vi.spyOn(Date,"now").mockReturnValue(start+20_000);
    await store.deactivateGpsSession("a","walk");
    const points = await store.readGpsPoints("a","walk");
    expect(points.map(p=>p.seq)).toEqual([1,2,3,4]);
    expect(points.every(p=>p.accepted)).toBe(true);
    expect(await store.gpsWalkMeters("a","walk")).toBe(12);
    expect(getDocument().pending).toEqual([]);
    expect(getDocument().motionWindow).toEqual([]);
  });
  it("pins the median config, commits the filtered tail at finish and wipes raw smoothing state", async () => {
    vi.stubEnv("EXPO_PUBLIC_WALK_TRACKING_VARIANT","median");
    await store.activateGpsSession("a","walk");
    await store.persistGpsBatch(samples,start+15_000);
    expect(getDocument().configVersion).toBe(2);
    expect(getDocument().pendingCanonical).not.toBeNull();
    vi.stubEnv("EXPO_PUBLIC_WALK_TRACKING_VARIANT","");
    vi.resetModules();
    store = await import("./walkGpsStorage");
    vi.spyOn(Date,"now").mockReturnValue(start+20_000);
    await store.deactivateGpsSession("a","walk");
    expect(await store.gpsWalkMeters("a","walk")).toBe(12);
    expect((await store.readGpsPoints("a","walk")).map(p=>p.seq)).toEqual([1,2,3,4]);
    expect(getDocument().pendingCanonical).toBeNull();
    expect(getDocument().previousCanonical).toBeNull();
    vi.spyOn(Date,"now").mockReturnValue(start+30_000);
    await store.activateGpsSession("a","walk");
    expect(getDocument().configVersion).toBe(2);
  });
  it("rolls back canonical points, distance and checkpoint together on write failure", async () => {
    await store.activateGpsSession("a","walk");
    const before = getDocument();
    runtime.failNextCheckpoint = true;
    await expect(store.persistGpsBatch(samples,start+15_000)).rejects.toThrow("injected");
    expect(await store.readGpsPoints("a","walk")).toEqual([]);
    expect(getDocument()).toEqual(before);
    expect(await store.gpsWalkMeters("a","walk")).toBeNull();
    await store.persistGpsBatch(samples,start+15_000);
    expect(await store.gpsWalkMeters("a","walk")).toBe(8);
  });
  it("pins the engine and rejects stale batches across pause and owner change", async () => {
    await store.activateGpsSession("a","walk");
    await store.persistGpsBatch(samples,start+15_000);
    vi.spyOn(Date,"now").mockReturnValue(start+20_000);
    await store.deactivateGpsSession("a","walk");
    vi.stubEnv("EXPO_PUBLIC_WALK_TRACKING_ENGINE","shadow");
    vi.spyOn(Date,"now").mockReturnValue(start+30_000);
    await store.activateGpsSession("a","walk");
    expect(await store.isV2GpsSession("a","walk")).toBe(true);
    const before = await store.readGpsPoints("a","walk");
    await store.persistGpsBatch(samples,start+31_000);
    expect(await store.readGpsPoints("a","walk")).toEqual(before);
    await store.persistGpsBatch([fix(30,100),fix(34,104),fix(38,108)],start+40_000);
    vi.spyOn(Date,"now").mockReturnValue(start+50_000);
    await store.deactivateGpsSession("a","walk");
    const points = await store.readGpsPoints("a","walk");
    expect(points.filter(p=>p.reason==="first").map(p=>p.deltaMeters)).toEqual([0,0]);
    expect(await store.gpsWalkMeters("a","walk")).toBe(20);
    vi.stubEnv("EXPO_PUBLIC_WALK_TRACKING_ENGINE","v2");
    await store.activateGpsSession("b","other");
    await store.persistGpsBatch(samples,start+55_000);
    expect(await store.readGpsPoints("b","other")).toEqual([]);
    expect(await store.readGpsPoints("a","walk")).toEqual(points);
  });
  it("keeps old walks on v1 and does not replace legacy statistics in shadow mode", async () => {
    vi.stubEnv("EXPO_PUBLIC_WALK_TRACKING_ENGINE","");
    await store.activateGpsSession("a","walk");
    await store.persistGpsBatch([fix(0,0),fix(4,4)],start+5_000);
    vi.spyOn(Date,"now").mockReturnValue(start+10_000);
    await store.deactivateGpsSession("a","walk");
    vi.stubEnv("EXPO_PUBLIC_WALK_TRACKING_ENGINE","v2");
    await store.activateGpsSession("a","walk");
    expect(await store.isV2GpsSession("a","walk")).toBe(false);
    vi.spyOn(Date,"now").mockReturnValue(start+20_000);
    vi.stubEnv("EXPO_PUBLIC_WALK_TRACKING_ENGINE","shadow");
    await store.activateGpsSession("b","shadow");
    await store.persistGpsBatch([fix(20,0,0),fix(24,15,0),fix(28,0,0)],start+30_000);
    expect(await store.gpsWalkMeters("b","shadow")).toBe(30);
    const row = runtime.db!.prepare("SELECT document FROM gps_tracking_checkpoint WHERE ownerId='b'").get() as {document:string};
    expect(JSON.parse(row.document).meters).toBe(0);
  });
  it("distinguishes a confirmed stop from no GPS and removes the private checkpoint on delete", async () => {
    await store.activateGpsSession("a","walk");
    expect(await store.gpsWalkMeters("a","walk")).toBeNull();
    await store.persistGpsBatch([fix(0,0,0),fix(4,0,0),fix(8,0,0)],start+9_000);
    expect(await store.gpsWalkMeters("a","walk")).toBe(0);
    await store.markGpsWalkDeleted("a","walk");
    expect(await store.readGpsPoints("a","walk")).toEqual([]);
    expect(runtime.db!.prepare("SELECT COUNT(*) AS n FROM gps_tracking_checkpoint").get()).toMatchObject({n:0});
    expect(await store.gpsWalkMeters("a","walk")).toBeNull();
    await expect(store.activateGpsSession("a","walk")).rejects.toThrow("WALK_ALREADY_DELETED");
  });
  it("keeps identical canonical output across callback partitions and concurrent duplicate retries", async () => {
    await store.activateGpsSession("a","walk");
    const ordered = [fix(0,0),fix(4,4),fix(5,5),fix(8,8),fix(12,12)];
    // The 1-second permutation fits the shared 2-second reorder window.
    const events = [ordered[0]!,ordered[2]!,ordered[1]!,ordered[3]!,ordered[4]!];
    await store.persistGpsBatch(events,start+15_000);
    vi.spyOn(Date,"now").mockReturnValue(start+20_000);
    await store.deactivateGpsSession("a","walk");
    const expected = await store.readGpsPoints("a","walk");
    vi.spyOn(Date,"now").mockReturnValue(start);
    await store.activateGpsSession("b","partitioned");
    for (const sample of events) await store.persistGpsBatch([sample],start+15_000);
    await Promise.all([store.persistGpsBatch(events,start+16_000),store.persistGpsBatch(events,start+16_000)]);
    vi.spyOn(Date,"now").mockReturnValue(start+20_000);
    await store.deactivateGpsSession("b","partitioned");
    expect(await store.readGpsPoints("b","partitioned")).toEqual(expected);
  });
  it("honors the user's pause boundary even if a later callback committed first", async () => {
    await store.activateGpsSession("a","walk");
    await store.persistGpsBatch(samples,start+15_000);
    await store.deactivateGpsSession("a","walk",start+5_000);
    const points=await store.readGpsPoints("a","walk");
    expect(points.map(p=>p.timestamp)).toEqual([start,start+4_000]);
    expect(await store.gpsWalkMeters("a","walk")).toBe(4);
    expect(getDocument().pending).toEqual([]);
  });
  it("replays the median tail when a late pause would retain a future-dependent vertex", async () => {
    vi.stubEnv("EXPO_PUBLIC_WALK_TRACKING_VARIANT","median");
    const trace = [fix(0,0),{...fix(4,5),latitude:5*d},fix(8,10),fix(12,15)];
    await store.activateGpsSession("a","walk");
    await store.persistGpsBatch(trace,start+15_000);
    const before = await store.readGpsPoints("a","walk");
    expect(before[1]?.latitude).toBe(0);
    await store.deactivateGpsSession("a","walk",start+5_000);
    const after = await store.readGpsPoints("a","walk");
    expect(after.map(p=>p.timestamp)).toEqual([start,start+4000]);
    expect(after[1]?.latitude).toBeCloseTo(5*d,12);
    expect(await store.gpsWalkMeters("a","walk")).toBe(7);
    expect(runtime.db!.prepare("SELECT COUNT(*) AS n FROM gps_tracking_tail").get()).toEqual({n:0});
  });
  it("does not retain a future-dependent median vertex without a usable tail", async () => {
    vi.stubEnv("EXPO_PUBLIC_WALK_TRACKING_VARIANT","median");
    await store.activateGpsSession("a","walk");
    await store.persistGpsBatch([fix(0,0),{...fix(4,5),latitude:5*d},fix(8,10),fix(12,15)],start+15_000);
    runtime.db!.exec("DELETE FROM gps_tracking_tail");
    await store.deactivateGpsSession("a","walk",start+5000);
    const points=await store.readGpsPoints("a","walk");
    expect(points.map(p=>p.timestamp)).toEqual([start]);
    expect(await store.gpsWalkMeters("a","walk")).toBe(0);
  });
  it("excludes a fix measured exactly at the manual pause boundary",async()=>{
    await store.activateGpsSession("a","walk");
    await store.persistGpsBatch(samples,start+15_000);
    await store.deactivateGpsSession("a","walk",start+8000);
    expect((await store.readGpsPoints("a","walk")).map(p=>p.timestamp)).toEqual([start,start+4000]);
  });
  it("records QA only with explicit opt-in, encrypted payloads, owner scope and TTL",async()=>{
    const id="00000000-0000-4000-8000-000000000011",capture="00000000-0000-4000-8000-000000000012";
    await store.writePersistedWalkJournal("a",JSON.stringify({active:{clientId:id,startedAtMs:start,finishedAtMs:null},completed:[]}));
    await expect(store.beginWalkQaCapture("a",id,capture,()=>true)).rejects.toThrow("WALK_QA_DISABLED");
    vi.stubEnv("EXPO_PUBLIC_WALK_QA_CAPTURE","1");
    await store.activateGpsSession("a",id);
    await store.persistGpsBatch(samples,start+15_000);
    expect(await store.getWalkQaCapture("a")).toBeNull();
    await store.beginWalkQaCapture("a",id,capture,()=>true);
    await store.persistGpsBatch(samples,start+15_000);
    const meta=await store.getWalkQaCapture("a");
    expect(meta?.sampleCount).toBe(4);
    expect(await store.getWalkQaCapture("b")).toBeNull();
    const raw=runtime.db!.prepare("SELECT sealed FROM walk_qa_batches").get() as {sealed:string};
    expect(raw.sealed).not.toContain("latitude");
    expect(raw.sealed).not.toContain("1800000000000");
    await expect(store.exportWalkQaCapture("b",id,()=>true)).rejects.toThrow("WALK_QA_UNAVAILABLE");
    await expect(store.exportWalkQaCapture("a",id,()=>false)).rejects.toThrow("WALK_QA_DISABLED");
    const exported=JSON.parse(await store.exportWalkQaCapture("a",id,()=>true));
    expect(exported.batches.find((b:{fixes?:unknown})=>b.fixes).fixes).toHaveLength(4);
    expect(exported.batches.find((b:{fixes?:unknown})=>b.fixes).stepObservation.kind).toBe("unknown");
    vi.spyOn(Date,"now").mockReturnValue(start+24*60*60*1000);
    await expect(store.exportWalkQaCapture("a",id,()=>true)).rejects.toThrow("WALK_QA_UNAVAILABLE");
    await store.purgeWalkQa("a");
    expect(runtime.keys.has(capture)).toBe(false);
    expect(runtime.db!.prepare("SELECT COUNT(*) AS n FROM walk_qa_batches").get()).toEqual({n:0});
  });
  it("keeps the QA shadow separate from the canonical writer and closes to aggregates",async()=>{
    vi.stubEnv("EXPO_PUBLIC_WALK_QA_CAPTURE","1");
    vi.stubEnv("EXPO_PUBLIC_WALK_QA_GPS_PROFILE","fast");
    const id="00000000-0000-4000-8000-000000000041",capture="00000000-0000-4000-8000-000000000042";
    await store.writePersistedWalkJournal("a",JSON.stringify({active:{clientId:id,startedAtMs:start,finishedAtMs:null},completed:[]}));
    await store.beginWalkQaCapture("a",id,capture,()=>true);
    vi.stubEnv("EXPO_PUBLIC_WALK_QA_GPS_PROFILE","control");
    expect(await store.getWalkQaGpsProfile("a",id)).toBe("fast");
    await store.activateGpsSession("a",id);
    await store.persistGpsBatch([fix(0,60,0),...Array.from({length:10},(_,i)=>fix((i+1)*4,0,0))],start+45000);
    await store.deactivateGpsSession("a",id,start+46000);
    const exported=JSON.parse(await store.exportWalkQaCapture("a",id,()=>true));
    expect(exported.profile).toBe("fast");
    expect(exported.shadow[0]).toMatchObject({candidateMeters:0,closed:true,incomplete:false});
    expect(exported.shadow[0].baselineMeters).toBeCloseTo(60,6);
    expect(await store.gpsWalkMeters("a",id)).toBe(60);
    expect(exported.shadow[0].baseline).toBeUndefined();
    expect(exported.batches.map((b:{kind:string})=>b.kind)).toEqual(["open","fixes","close"]);
    await store.deleteWalkQaCapture("a",id);
    expect(runtime.db!.prepare("SELECT COUNT(*) AS n FROM walk_qa_shadow").get()).toEqual({n:0});
  });
  it("removes private QA data when account changes or the walk is deleted",async()=>{
    vi.stubEnv("EXPO_PUBLIC_WALK_QA_CAPTURE","1");
    const id="00000000-0000-4000-8000-000000000021",capture="00000000-0000-4000-8000-000000000022";
    await store.writePersistedWalkJournal("a",JSON.stringify({active:{clientId:id,startedAtMs:start,finishedAtMs:null},completed:[]}));
    await store.beginWalkQaCapture("a",id,capture,()=>true);
    await store.activateGpsSession("a",id);
    await store.persistGpsBatch(samples,start+15_000);
    await store.purgeWalkQa("b");
    expect(runtime.keys.has(capture)).toBe(false);
    expect(await store.getWalkQaCapture("a")).toBeNull();
    await store.beginWalkQaCapture("a",id,capture,()=>true);
    await store.markGpsWalkDeleted("a",id);
    expect(runtime.keys.has(capture)).toBe(false);
    expect(await store.getWalkQaCapture("a")).toBeNull();
  });
  it("legacy sessions reject previous-owner fixes and half-open pause boundaries",async()=>{
    vi.stubEnv("EXPO_PUBLIC_WALK_TRACKING_ENGINE","");
    await store.activateGpsSession("a","one");
    await store.persistGpsBatch(samples,start+15000);
    vi.spyOn(Date,"now").mockReturnValue(start+20_000);
    await store.activateGpsSession("b","two");
    await store.persistGpsBatch([fix(12,12),fix(20,50),fix(24,54),fix(28,58)],start+30_000);
    await store.deactivateGpsSession("b","two",start+28_000);
    const points=await store.readGpsPoints("b","two");
    expect(points.map(p=>p.timestamp)).toEqual([start+20_000,start+24_000]);
    expect(await store.gpsWalkMeters("b","two")).toBe(4);
  });
  it("publishes a versioned final display atomically without changing canonical meters",async()=>{
    const id="00000000-0000-4000-8000-000000000031";
    const active={clientId:id,startedAtMs:start,finishedAtMs:null};
    await store.writePersistedWalkJournal("a",JSON.stringify({active,completed:[]}));
    await store.activateGpsSession("a",id);
    await store.persistGpsBatch(samples,start+15_000);
    expect(await store.getOrFinalizeGpsDisplay("a",id)).toBeNull();
    await store.deactivateGpsSession("a",id,start+20_000);
    await store.writePersistedWalkJournal("a",JSON.stringify({active:null,completed:[{...active,finishedAtMs:start+20_000}]}));
    const points=await store.readGpsPoints("a",id),meters=await store.gpsWalkMeters("a",id);
    const first=await store.getOrFinalizeGpsDisplay("a",id);
    expect(first?.features).toHaveLength(1);
    expect(await store.getOrFinalizeGpsDisplay("a",id)).toEqual(first);
    expect(await store.readGpsPoints("a",id)).toEqual(points);
    expect(await store.gpsWalkMeters("a",id)).toBe(meters);
    await store.markGpsWalkDeleted("a",id);
    expect(await store.getOrFinalizeGpsDisplay("a",id)).toBeNull();
    expect(runtime.db!.prepare("SELECT COUNT(*) AS n FROM gps_final_display").get()).toEqual({n:0});
  });
  it("reads long history to the final row and clears the temporary tail on logout", async () => {
    await store.activateGpsSession("a","walk");
    await store.persistGpsBatch(samples,start+15_000);
    await store.deactivateAllGpsSessions();
    expect(getDocument().pending).toEqual([]);
    expect(getDocument().anchor).toBeNull();
    expect(getDocument().lastGood).toBeNull();
    const insert=runtime.db!.prepare("INSERT INTO gps_points(ownerId,walkId,seq,segment,latitude,longitude,timestamp,accuracy,speed,accepted,reason,deltaMeters) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)");
    runtime.db!.exec("BEGIN");
    for(let i=1;i<=10001;i++) insert.run("a","long",i,1,0,i*d,start+i*1000,5,1,1,i===1?"first":"ok",i===1?0:1);
    runtime.db!.exec("COMMIT");
    expect((await store.allGpsPoints("a","long")).at(-1)?.seq).toBe(10001);
    const tail=await store.readGpsTrackSnapshot("a","long",10000);
    expect(tail.points.map(p=>p.seq)).toEqual([10001]);
  });
  it("rejects competing screen/widget starts and a stale start after completion", async () => {
    const first = {clientId:"00000000-0000-4000-8000-000000000003",startedAtMs:start,finishedAtMs:null};
    const second = {...first,clientId:"00000000-0000-4000-8000-000000000004"};
    const document = (active:typeof first|null,completed:unknown[]=[])=>JSON.stringify({active,completed});
    const results = await Promise.allSettled([
      store.writePersistedWalkJournal("a",document(first)),
      store.writePersistedWalkJournal("a",document(second)),
    ]);
    expect(results.map(r=>r.status)).toEqual(["fulfilled","rejected"]);
    expect(await store.readPersistedWalkJournal("a")).toBe(document(first));
    await expect(store.writePersistedWalkJournal("a",document(null))).rejects.toThrow("WALK_JOURNAL_CONFLICT");
    await store.writePersistedWalkJournal("a",document(null,[{...first,finishedAtMs:start+1000}]));
    await expect(store.writePersistedWalkJournal("a",document(first))).rejects.toThrow("WALK_JOURNAL_CONFLICT");
  });
  it("pins engine at journal creation even when GPS is enabled only after OTA", async () => {
    const id = "00000000-0000-4000-8000-000000000001";
    vi.stubEnv("EXPO_PUBLIC_WALK_TRACKING_VARIANT","median");
    const doc = JSON.stringify({active:{clientId:id,startedAtMs:start,finishedAtMs:null},completed:[]});
    await store.writePersistedWalkJournal("a",doc);
    vi.stubEnv("EXPO_PUBLIC_WALK_TRACKING_ENGINE","");
    vi.stubEnv("EXPO_PUBLIC_WALK_TRACKING_VARIANT","");
    await store.writePersistedWalkJournal("a",doc);
    await store.activateGpsSession("a",id);
    const row = runtime.db!.prepare("SELECT document FROM gps_tracking_checkpoint WHERE walkId=?").get(id) as {document:string};
    expect(JSON.parse(row.document).configVersion).toBe(2);
  });
  it("pins an existing unversioned journal to legacy, even with no GPS session", async () => {
    const id = "00000000-0000-4000-8000-000000000002";
    await store.readPersistedWalkJournal("a");
    const doc = JSON.stringify({active:{clientId:id,startedAtMs:start,finishedAtMs:null},completed:[]});
    runtime.db!.prepare("INSERT INTO walk_journals(ownerId,document) VALUES(?,?)").run("a",doc);
    await store.activateGpsSession("a",id);
    expect(await store.isV2GpsSession("a",id)).toBe(false);
  });
  it("does not replace a future checkpoint with an old writer", async () => {
    await store.activateGpsSession("a","walk");
    await store.persistGpsBatch(samples,start+15_000);
    const points = await store.readGpsPoints("a","walk");
    const future = JSON.stringify({...getDocument(),configVersion:99});
    runtime.db!.prepare("UPDATE gps_tracking_checkpoint SET document=?").run(future);
    await expect(store.persistGpsBatch([fix(20,20)],start+22_000)).rejects.toThrow("WALK_TRACKING_CODEC_UNSUPPORTED");
    await store.deactivateGpsSession("a","walk");
    expect(await store.activeGpsSession()).toBeNull();
    expect(getDocument().configVersion).toBe(99);
    expect(await store.readGpsPoints("a","walk")).toEqual(points);
  });
  it("recovers a damaged median checkpoint without switching to config 1", async () => {
    vi.stubEnv("EXPO_PUBLIC_WALK_TRACKING_VARIANT","median");
    await store.activateGpsSession("a","walk");
    await store.persistGpsBatch(samples,start+15_000);
    runtime.db!.exec("UPDATE gps_tracking_checkpoint SET document='{}'");
    await store.persistGpsBatch([fix(20,20)],start+22_000);
    expect(getDocument().configVersion).toBe(2);
  });
  it("recovers corrupted checkpoints without replacing committed distance or seq", async () => {
    await store.activateGpsSession("a","walk");
    await store.persistGpsBatch(samples,start+15_000);
    const old = await store.readGpsPoints("a","walk");
    runtime.db!.exec("UPDATE gps_tracking_checkpoint SET document='{}'");
    await store.persistGpsBatch([fix(16,100),fix(20,104),fix(24,108)],start+16_000);
    await store.persistGpsBatch([fix(20,104),fix(24,108),fix(28,112)],start+30_000);
    const points = await store.readGpsPoints("a","walk");
    expect(points.slice(0,old.length)).toEqual(old);
    expect(points[old.length]?.reason).toBe("first");
    expect(points[old.length]?.deltaMeters).toBe(0);
  });
});
