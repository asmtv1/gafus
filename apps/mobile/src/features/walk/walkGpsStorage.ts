import * as SQLite from "expo-sqlite";
import {
  advanceTracking, createTrackingCheckpoint, TRACKING_CONFIG_V2,
  appendWalkTrackPage, WALK_TRACK_PAGE_SIZE, WALK_TRACK_MAX_POINTS, finalizeWalkDisplay, WALK_DISPLAY_GEOMETRY_VERSION, type WalkGeoJson,
  type TrackingCheckpoint, type CanonicalPoint, type WalkFix, type TrackingEvent,
} from "@gafus/core-client/walk-tracking";
import { classifyGpsSample, normalizeGpsBatch, type GpsSample } from "./walkGpsMath";
import { DEFAULT_WALK_GPS_POLICY, type WalkGpsPolicyState } from "./walkAdaptiveGps";

export interface StoredGpsPoint extends GpsSample {
  seq: number;
  segment: number;
  accepted: boolean;
  reason: string;
  deltaMeters: number;
}
interface GpsSession {
  ownerId: string;
  walkId: string;
  segment: number;
  active: number;
  distanceMeters: number;
  lastLatitude: number | null;
  lastLongitude: number | null;
  lastTimestamp: number | null;
  lastAccuracy: number | null;
  lastSpeed: number | null;
}
let database: ReturnType<typeof SQLite.openDatabaseAsync> | null = null;
async function openDb() {
  if (!database) {
    database = (async () => {
      const db = await SQLite.openDatabaseAsync("gafus-walk-gps-v1.db");
      await db.execAsync(`PRAGMA journal_mode=WAL;
        CREATE TABLE IF NOT EXISTS gps_sessions (
          ownerId TEXT NOT NULL, walkId TEXT NOT NULL, segment INTEGER NOT NULL DEFAULT 0,
          active INTEGER NOT NULL DEFAULT 0, distanceMeters REAL NOT NULL DEFAULT 0,
          lastLatitude REAL, lastLongitude REAL, lastTimestamp INTEGER, lastAccuracy REAL, lastSpeed REAL,
          PRIMARY KEY (ownerId, walkId)
        );
        CREATE TABLE IF NOT EXISTS gps_points (
          ownerId TEXT NOT NULL, walkId TEXT NOT NULL, seq INTEGER NOT NULL, segment INTEGER NOT NULL,
          latitude REAL NOT NULL, longitude REAL NOT NULL, timestamp INTEGER NOT NULL,
          accuracy REAL, speed REAL, accepted INTEGER NOT NULL, reason TEXT NOT NULL,
          deltaMeters REAL NOT NULL DEFAULT 0,
          PRIMARY KEY (ownerId, walkId, seq)
        );
        CREATE INDEX IF NOT EXISTS gps_points_by_session ON gps_points(ownerId,walkId,segment,seq);
        CREATE TABLE IF NOT EXISTS gps_tracking_checkpoint (
          ownerId TEXT NOT NULL, walkId TEXT NOT NULL,
          mode TEXT NOT NULL, epoch TEXT NOT NULL, startedAt INTEGER NOT NULL,
          document TEXT NOT NULL, PRIMARY KEY(ownerId,walkId)
        );
        CREATE TABLE IF NOT EXISTS gps_route_revision (
          ownerId TEXT NOT NULL, walkId TEXT NOT NULL, revision INTEGER NOT NULL,
          PRIMARY KEY(ownerId,walkId)
        );
        CREATE TABLE IF NOT EXISTS gps_final_display (
          ownerId TEXT NOT NULL, walkId TEXT NOT NULL, version INTEGER NOT NULL,
          inputSeq INTEGER NOT NULL, inputRevision INTEGER NOT NULL, document TEXT NOT NULL,
          PRIMARY KEY(ownerId,walkId)
        );
        CREATE TABLE IF NOT EXISTS gps_session_epochs (
          ownerId TEXT NOT NULL, walkId TEXT NOT NULL, startedAt INTEGER NOT NULL,
          firstSeq INTEGER NOT NULL, generation INTEGER NOT NULL,
          PRIMARY KEY(ownerId,walkId)
        );
        CREATE TABLE IF NOT EXISTS walk_qa_capture (
          ownerId TEXT NOT NULL, walkId TEXT NOT NULL, captureId TEXT NOT NULL UNIQUE,
          startedAt INTEGER NOT NULL, expiresAt INTEGER NOT NULL, sampleCount INTEGER NOT NULL DEFAULT 0,
          truncated INTEGER NOT NULL DEFAULT 0, lastMeasuredAt INTEGER, lastGeneration INTEGER, profile TEXT NOT NULL DEFAULT 'control', PRIMARY KEY(ownerId,walkId)
        );
        CREATE TABLE IF NOT EXISTS walk_qa_shadow (
          captureId TEXT NOT NULL, generation INTEGER NOT NULL, sealed TEXT NOT NULL,
          PRIMARY KEY(captureId,generation)
        );
        CREATE TABLE IF NOT EXISTS walk_qa_batches (
          captureId TEXT NOT NULL, seq INTEGER NOT NULL, sealed TEXT NOT NULL,
          PRIMARY KEY(captureId,seq)
        );
        CREATE TABLE IF NOT EXISTS gps_tracking_tail (
          ownerId TEXT NOT NULL, walkId TEXT NOT NULL, document TEXT NOT NULL,
          PRIMARY KEY(ownerId,walkId)
        );
        CREATE TABLE IF NOT EXISTS walk_tracking_pins (
          ownerId TEXT NOT NULL, walkId TEXT NOT NULL,
          mode TEXT NOT NULL, configVersion INTEGER NOT NULL,
          PRIMARY KEY(ownerId,walkId)
        );
        CREATE TABLE IF NOT EXISTS gps_motion_policy (
          ownerId TEXT NOT NULL, walkId TEXT NOT NULL,
          state TEXT NOT NULL, PRIMARY KEY(ownerId,walkId)
        );
        CREATE TABLE IF NOT EXISTS gps_sync_cursor (
          ownerId TEXT NOT NULL, walkId TEXT NOT NULL, lastSeq INTEGER NOT NULL DEFAULT 0,
          PRIMARY KEY(ownerId,walkId)
        );
        CREATE TABLE IF NOT EXISTS walk_delete_markers (
          ownerId TEXT NOT NULL, walkId TEXT NOT NULL, deletedAt INTEGER NOT NULL,
          pending INTEGER NOT NULL DEFAULT 1,
          PRIMARY KEY(ownerId,walkId)
        );
        CREATE TABLE IF NOT EXISTS walk_history_sync (
          ownerId TEXT PRIMARY KEY, cursor TEXT, confirmed TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS walk_journals (
          ownerId TEXT NOT NULL PRIMARY KEY,
          document TEXT NOT NULL,
          revision INTEGER NOT NULL DEFAULT 0
        );
      `);
      return db;
    })().catch((error) => {
      // A transient SQLite open/initialization failure must not poison every
      // subsequent headless task until the user force-closes the app.
      database = null;
      throw error;
    });
  }
  return database;
}

const QA_TTL_MS=24*60*60*1000;
const QA_MAX_SAMPLES=20_000;
const QA_MAX_BATCH=256;
interface QaCapture {ownerId:string;walkId:string;captureId:string;startedAt:number;expiresAt:number;sampleCount:number;truncated:number;lastMeasuredAt:number|null;lastGeneration:number|null;profile:"control"|"fast"}
const qaAad=(row:QaCapture,seq:number)=>JSON.stringify([1,row.ownerId,row.walkId,row.captureId,seq]);
export const walkQaEnabled=()=>process.env.EXPO_PUBLIC_WALK_QA_CAPTURE==="1";

async function purgeQaRows(db:SQLite.SQLiteDatabase, rows:QaCapture[]) {
  if(!rows.length) return;
  const crypto=await import("./walkQaCrypto");
  for(const row of rows) {
    // Revoke access before removing ciphertext. Retry key erasure on the next cleanup
    // if the OS keychain is temporarily locked.
    await db.runAsync("UPDATE walk_qa_capture SET expiresAt=0 WHERE captureId=?",row.captureId);
    await db.runAsync("DELETE FROM walk_qa_batches WHERE captureId=?",row.captureId);
    await db.runAsync("DELETE FROM walk_qa_shadow WHERE captureId=?",row.captureId);
    try { await crypto.deleteQaKey(row.captureId); }
    catch { continue; }
    await db.runAsync("DELETE FROM walk_qa_capture WHERE captureId=?",row.captureId);
  }
}
export async function purgeWalkQa(verifiedOwner:string|null, isCurrent:()=>boolean=()=>true):Promise<void> {
  const db=await openDb();
  await db.withExclusiveTransactionAsync(async tx=>{
    if(!isCurrent()) return;
    const rows=await tx.getAllAsync<QaCapture>(
      "SELECT * FROM walk_qa_capture WHERE expiresAt<=? OR ownerId<>?",Date.now(),verifiedOwner??"");
    await purgeQaRows(tx,rows);
  });
}
export async function beginWalkQaCapture(ownerId:string,walkId:string,captureId:string,isCurrent:()=>boolean):Promise<void> {
  if(!walkQaEnabled() || !isCurrent() || !/^[0-9a-f-]{36}$/i.test(captureId)) throw new Error("WALK_QA_DISABLED");
  const db=await openDb();
  await db.withExclusiveTransactionAsync(async tx=>{
    if(!isCurrent()) throw new Error("WALK_QA_DISABLED");
    const journal=await tx.getFirstAsync<{document:string}>("SELECT document FROM walk_journals WHERE ownerId=?",ownerId);
    if(activeJournalId(journal?.document??null)!==walkId) throw new Error("WALK_QA_SESSION_MISMATCH");
    const existing=await tx.getAllAsync<QaCapture>("SELECT * FROM walk_qa_capture WHERE ownerId=?",ownerId);
    if(existing.some(row=>row.walkId===walkId && row.expiresAt>Date.now())) return;
    await purgeQaRows(tx,existing);
    // Do not silently replace a capture whose secure key could not be revoked.
    const remaining=await tx.getFirstAsync<QaCapture>("SELECT * FROM walk_qa_capture WHERE ownerId=? LIMIT 1",ownerId);
    if(remaining) throw new Error("WALK_QA_CLEANUP_PENDING");
    const crypto=await import("./walkQaCrypto");
    await crypto.createQaKey(captureId);
    if(!isCurrent()) { await crypto.deleteQaKey(captureId); throw new Error("WALK_QA_DISABLED"); }
    const now=Date.now();
    const profile=process.env.EXPO_PUBLIC_WALK_QA_GPS_PROFILE==="fast"?"fast":"control";
    try {
      await tx.runAsync("INSERT INTO walk_qa_capture(ownerId,walkId,captureId,startedAt,expiresAt,profile) VALUES(?,?,?,?,?,?)",ownerId,walkId,captureId,now,now+QA_TTL_MS,profile);
    } catch(error) {
      try { await crypto.deleteQaKey(captureId); } catch { /* no ciphertext was written */ }
      throw error;
    }
  });
}
export async function getWalkQaGpsProfile(ownerId:string,walkId:string):Promise<"control"|"fast"|null> {
  if(!walkQaEnabled()) return null;
  const db=await openDb();
  const row=await db.getFirstAsync<QaCapture>("SELECT * FROM walk_qa_capture WHERE ownerId=? AND walkId=? AND expiresAt>?",ownerId,walkId,Date.now());
  return row?.profile==="fast"?"fast":row?"control":null;
}
interface QaShadow {
  schema:1; generation:number; startedAt:number; observations:number;
  baseline:TrackingCheckpoint|null; candidate:TrackingCheckpoint|null;
  baselineMeters:number; candidateMeters:number; baselinePoints:number; candidatePoints:number;
  closed:boolean; incomplete:boolean;
}
const shadowAad=(row:QaCapture,generation:number)=>JSON.stringify(["shadow",1,row.ownerId,row.walkId,row.captureId,generation]);
async function loadQaShadow(db:SQLite.SQLiteDatabase,row:QaCapture,generation:number):Promise<QaShadow|null> {
  const value=await db.getFirstAsync<{sealed:string}>("SELECT sealed FROM walk_qa_shadow WHERE captureId=? AND generation=?",row.captureId,generation);
  if(!value) return null;
  const crypto=await import("./walkQaCrypto");
  const state=await crypto.openQaBatch(row.captureId,shadowAad(row,generation),value.sealed) as QaShadow;
  if(state?.schema!==1||state.generation!==generation||!Number.isFinite(state.startedAt)) throw new Error("WALK_QA_SHADOW_INVALID");
  return state;
}
async function saveQaShadow(db:SQLite.SQLiteDatabase,row:QaCapture,state:QaShadow) {
  const crypto=await import("./walkQaCrypto");
  const sealed=await crypto.sealQaBatch(row.captureId,shadowAad(row,state.generation),state);
  await db.runAsync(`INSERT INTO walk_qa_shadow(captureId,generation,sealed) VALUES(?,?,?)
    ON CONFLICT(captureId,generation) DO UPDATE SET sealed=excluded.sealed`,row.captureId,state.generation,sealed);
}
async function advanceQaShadow(db:SQLite.SQLiteDatabase,row:QaCapture,generation:number,startedAt:number,
  fixes:WalkFix[],receivedAt:number) {
  const epoch=`qa:${generation}:${startedAt}`;
  let state=await loadQaShadow(db,row,generation);
  if(!state) state={schema:1,generation,startedAt,observations:0,
    baseline:createTrackingCheckpoint(epoch,startedAt,2),candidate:createTrackingCheckpoint(epoch,startedAt,3),
    baselineMeters:0,candidateMeters:0,baselinePoints:0,candidatePoints:0,closed:false,incomplete:row.startedAt>startedAt};
  if(state.closed||state.startedAt!==startedAt||!state.baseline||!state.candidate) throw new Error("WALK_QA_SHADOW_EPOCH");
  for(const fix of fixes) {
    const event={type:"fix" as const,epoch,receivedAt,fix};
    const baseline=advanceTracking(state.baseline!,event),candidate=advanceTracking(state.candidate!,event);
    state.baseline=baseline.checkpoint;state.candidate=candidate.checkpoint;
    state.baselinePoints+=baseline.points.length;state.candidatePoints+=candidate.points.length;state.observations++;
  }
  state.baselineMeters=state.baseline!.meters;state.candidateMeters=state.candidate!.meters;
  await saveQaShadow(db,row,state);
}
async function finishQaShadow(db:SQLite.SQLiteDatabase,row:QaCapture,generation:number,at:number) {
  const state=await loadQaShadow(db,row,generation);
  if(!state||state.closed||!state.baseline||!state.candidate) return;
  const cutoff=Math.ceil(at)-1;
  for(const key of ["baseline","candidate"] as const) {
    const checkpoint=state[key]!;
    if(cutoff<checkpoint.watermark||cutoff<checkpoint.startedAt) {state.incomplete=true;continue;}
    const closed=advanceTracking(checkpoint,{type:"finish",epoch:checkpoint.epoch,at:cutoff});
    if(key==="baseline"){state.baselineMeters=closed.checkpoint.meters;state.baselinePoints+=closed.points.length;}
    else{state.candidateMeters=closed.checkpoint.meters;state.candidatePoints+=closed.points.length;}
  }
  state.closed=true;state.baseline=null;state.candidate=null; // only aggregate survives closure
  await saveQaShadow(db,row,state);
}
async function appendQaBoundary(db:SQLite.SQLiteDatabase,ownerId:string,walkId:string,generation:number,at:number,kind:"open"|"close") {
  if(!walkQaEnabled()) return;
  const row=await db.getFirstAsync<QaCapture>("SELECT * FROM walk_qa_capture WHERE ownerId=? AND walkId=? AND expiresAt>?",ownerId,walkId,Date.now());
  if(!row) return;
  try {
    const last=await db.getFirstAsync<{seq:number}>("SELECT COALESCE(MAX(seq),0) AS seq FROM walk_qa_batches WHERE captureId=?",row.captureId);
    const seq=(last?.seq??0)+1;
    if(seq>QA_MAX_SAMPLES+1000) throw new Error("WALK_QA_LIMIT");
    const crypto=await import("./walkQaCrypto");
    const sealed=await crypto.sealQaBatch(row.captureId,qaAad(row,seq),{kind,generation,at});
    await db.runAsync("INSERT INTO walk_qa_batches(captureId,seq,sealed) VALUES(?,?,?)",row.captureId,seq,sealed);
    if(kind==="close") await finishQaShadow(db,row,generation,at);
  } catch {
    await db.runAsync("UPDATE walk_qa_capture SET truncated=1 WHERE captureId=?",row.captureId);
  }
}
export async function getWalkQaCapture(ownerId:string):Promise<{walkId:string;sampleCount:number;truncated:boolean;expiresAt:number}|null> {
  const db=await openDb();
  const row=await db.getFirstAsync<QaCapture>("SELECT * FROM walk_qa_capture WHERE ownerId=? AND expiresAt>? ORDER BY startedAt DESC LIMIT 1",ownerId,Date.now());
  return row?{walkId:row.walkId,sampleCount:row.sampleCount,truncated:!!row.truncated,expiresAt:row.expiresAt}:null;
}
export async function deleteWalkQaCapture(ownerId:string,walkId:string):Promise<void> {
  const db=await openDb();
  await db.withExclusiveTransactionAsync(async tx=>{
    await purgeQaRows(tx,await tx.getAllAsync<QaCapture>("SELECT * FROM walk_qa_capture WHERE ownerId=? AND walkId=?",ownerId,walkId));
  });
}
export async function exportWalkQaCapture(ownerId:string,walkId:string,isCurrent:()=>boolean):Promise<string> {
  if(!walkQaEnabled()||!isCurrent()) throw new Error("WALK_QA_DISABLED");
  const db=await openDb();
  let output="";
  await db.withExclusiveTransactionAsync(async tx=>{
    const row=await tx.getFirstAsync<QaCapture>("SELECT * FROM walk_qa_capture WHERE ownerId=? AND walkId=? AND expiresAt>?",ownerId,walkId,Date.now());
    if(!row||!isCurrent()) throw new Error("WALK_QA_UNAVAILABLE");
    const crypto=await import("./walkQaCrypto");
    const batches=await tx.getAllAsync<{seq:number;sealed:string}>("SELECT seq,sealed FROM walk_qa_batches WHERE captureId=? ORDER BY seq",row.captureId);
    const values:unknown[]=[];
    for(const batch of batches) {
      if(!isCurrent()||row.expiresAt<=Date.now()) throw new Error("WALK_QA_UNAVAILABLE");
      values.push(await crypto.openQaBatch(row.captureId,qaAad(row,batch.seq),batch.sealed));
    }
    if(!isCurrent()||row.expiresAt<=Date.now()) throw new Error("WALK_QA_UNAVAILABLE");
    const generations=await tx.getAllAsync<{generation:number}>("SELECT generation FROM walk_qa_shadow WHERE captureId=? ORDER BY generation",row.captureId);
    const shadow=[];
    for(const {generation} of generations) {
      const state=await loadQaShadow(tx,row,generation);
      if(state) shadow.push({generation,observations:state.observations,baselineMeters:state.baselineMeters,
        candidateMeters:state.candidateMeters,baselinePoints:state.baselinePoints,candidatePoints:state.candidatePoints,
        closed:state.closed,incomplete:state.incomplete});
    }
    if(!isCurrent()||row.expiresAt<=Date.now()) throw new Error("WALK_QA_UNAVAILABLE");
    output=JSON.stringify({schema:1,captureId:row.captureId,startedAt:row.startedAt,expiresAt:row.expiresAt,
      sampleCount:row.sampleCount,truncated:!!row.truncated,profile:row.profile,batches:values,shadow});
  });
  return output;
}
async function captureQaBatch(ownerId:string,walkId:string,samples:readonly WalkFix[],receivedAt:number,generation:number) {
  if(!walkQaEnabled()) return;
  const db=await openDb();
  const observed=await db.getFirstAsync<QaCapture>("SELECT * FROM walk_qa_capture WHERE ownerId=? AND walkId=? AND expiresAt>?",ownerId,walkId,Date.now());
  if(!observed) return;
  const epoch=await readSessionEpoch(db,ownerId,walkId);
  if(!epoch||epoch.generation!==generation) return;
  const fromBoundary=Math.max(observed.startedAt,epoch.startedAt);
  const clean=samples.filter(f=>Number.isFinite(f.timestamp)&&f.timestamp>=fromBoundary&&
    f.timestamp<=receivedAt+1000&&Number.isFinite(f.latitude)&&Math.abs(f.latitude)<=90&&Number.isFinite(f.longitude)&&Math.abs(f.longitude)<=180)
    .map(f=>({measuredAt:f.timestamp,latitude:f.latitude,longitude:f.longitude,accuracy:f.accuracy,speed:f.speed,course:f.course??null}));
  if(!clean.length) return;
  const earliest=Math.min(...clean.map(f=>f.measuredAt));
  const latest=Math.max(...clean.map(f=>f.measuredAt));
  const from=observed.lastGeneration===generation?observed.lastMeasuredAt??earliest:earliest;
  // No native call inside the GPS transaction. The session generation is checked
  // again after the bounded, best-effort sensor request.
  const {sampleQaSteps}=await import("./walkQaSensors");
  const stepObservation=await sampleQaSteps(ownerId,walkId,from,latest);
  await db.withExclusiveTransactionAsync(async tx=>{
    await purgeQaRows(tx,await tx.getAllAsync<QaCapture>("SELECT * FROM walk_qa_capture WHERE expiresAt<=?",Date.now()));
    const row=await tx.getFirstAsync<QaCapture>("SELECT * FROM walk_qa_capture WHERE ownerId=? AND walkId=? AND expiresAt>?",ownerId,walkId,Date.now());
    if(!row||row.captureId!==observed.captureId||receivedAt<row.startedAt) return;
    if(row.sampleCount>=QA_MAX_SAMPLES) {
      await tx.runAsync("UPDATE walk_qa_capture SET truncated=1 WHERE captureId=?",row.captureId);
      return;
    }
    const session=await tx.getFirstAsync<GpsSession>("SELECT * FROM gps_sessions WHERE ownerId=? AND walkId=? AND active=1",ownerId,walkId);
    const currentEpoch=await readSessionEpoch(tx,ownerId,walkId);
    if(!session||currentEpoch?.generation!==generation) {
      await tx.runAsync("UPDATE walk_qa_capture SET truncated=1 WHERE captureId=?",row.captureId);
      return;
    }
    const checkpoint=await readCheckpoint(tx,ownerId,walkId,false);
    const keep=clean.slice(0,Math.min(QA_MAX_SAMPLES-row.sampleCount,QA_MAX_BATCH));
    const lastBatch=await tx.getFirstAsync<{seq:number}>("SELECT COALESCE(MAX(seq),0) AS seq FROM walk_qa_batches WHERE captureId=?",row.captureId);
    const seq=(lastBatch?.seq??0)+1;
    const sensor=observed.lastMeasuredAt===row.lastMeasuredAt&&observed.lastGeneration===row.lastGeneration
      ?stepObservation:{kind:"unknown",reason:"concurrent-delivery"};
    const crypto=await import("./walkQaCrypto");
    const sealed=await crypto.sealQaBatch(row.captureId,qaAad(row,seq),{kind:"fixes",receivedAt,segment:session.segment,
      generation,epochStartedAt:currentEpoch.startedAt,epoch:checkpoint?.epoch??null,fixes:keep,stepObservation:sensor});
    await tx.runAsync("INSERT INTO walk_qa_batches(captureId,seq,sealed) VALUES(?,?,?)",row.captureId,seq,sealed);
    // Same receipt stream, isolated shadow. Its points/metrics are never
    // published to the journal, canonical GPS tables or API.
    await advanceQaShadow(tx,row,generation,currentEpoch.startedAt,keep.map(f=>({
      timestamp:f.measuredAt,latitude:f.latitude,longitude:f.longitude,accuracy:f.accuracy,speed:f.speed,course:f.course,
    })),receivedAt);
    const end=Math.max(...keep.map(f=>f.measuredAt));
    const last=row.lastGeneration===generation?Math.max(row.lastMeasuredAt??end,end):end;
    await tx.runAsync("UPDATE walk_qa_capture SET sampleCount=sampleCount+?,truncated=MAX(truncated,?),lastMeasuredAt=?,lastGeneration=? WHERE captureId=?",
      keep.length,keep.length<clean.length?1:0,last,generation,row.captureId);
  });
}

type TrackingMode = "shadow" | "v2";
interface CheckpointRow { mode: TrackingMode; epoch: string; startedAt: number; document: string }

function configuredTrackingMode(): TrackingMode | null {
  // Release default stays v1 until the independent device/field acceptance gate.
  const mode = process.env.EXPO_PUBLIC_WALK_TRACKING_ENGINE;
  return mode === "shadow" || mode === "v2" ? mode : null;
}

type TrackingPin = { mode: "v1" | TrackingMode; configVersion: number };

function configuredTrackingPin(): TrackingPin {
  const mode = configuredTrackingMode();
  return { mode: mode ?? "v1", configVersion: mode && process.env.EXPO_PUBLIC_WALK_TRACKING_VARIANT === "median" ? 2 : 1 };
}

function journalWalkId(walk: {clientId?:unknown;startedAtMs?:unknown} | null): string | null {
  if (!walk) return null;
  if (typeof walk.clientId === "string" && /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(walk.clientId)) return walk.clientId;
  if (typeof walk.startedAtMs !== "number" || !Number.isFinite(walk.startedAtMs)) return null;
  return "00000000-0000-4000-8000-" + Math.max(0, Math.floor(walk.startedAtMs)).toString(16).padStart(12,"0").slice(-12);
}
function activeJournalId(document: string | null): string | null {
  try {
    const active = JSON.parse(document ?? "null")?.active;
    return active?.finishedAtMs === null ? journalWalkId(active) : null;
  } catch { return null; }
}
function completedJournalHas(document: string | null, walkId: string): boolean {
  try {
    const completed: unknown = JSON.parse(document ?? "null")?.completed;
    return Array.isArray(completed) && completed.some(walk => walk && walk.finishedAtMs != null && journalWalkId(walk) === walkId);
  } catch { return false; }
}

function isUnsupportedCodec(error: unknown): boolean {
  return error instanceof Error && error.message === "WALK_TRACKING_CODEC_UNSUPPORTED";
}

async function readCheckpoint(db: SQLite.SQLiteDatabase, ownerId: string, walkId: string, forWrite = true) {
  const row = await db.getFirstAsync<CheckpointRow>(
    "SELECT mode,epoch,startedAt,document FROM gps_tracking_checkpoint WHERE ownerId=? AND walkId=?",
    ownerId, walkId,
  );
  if (row && forWrite) {
    // A future format is not corrupt data. Never run destructive recovery on it.
    if (row.mode !== "v2" && row.mode !== "shadow") throw new Error("WALK_TRACKING_CODEC_UNSUPPORTED");
    let header: {version?: number; configVersion?: number} | null = null;
    try { header = JSON.parse(row.document); } catch { /* damaged known codec */ }
    if (header && ((Number.isInteger(header.version) && header.version! !== 2) ||
      (Number.isInteger(header.configVersion) && header.configVersion !== 1 && header.configVersion !== 2))) {
      throw new Error("WALK_TRACKING_CODEC_UNSUPPORTED");
    }
  }
  return row;
}

async function pinTracking(db: SQLite.SQLiteDatabase, ownerId: string, walkId: string, legacy: boolean): Promise<TrackingPin> {
  const existing = await db.getFirstAsync<TrackingPin>("SELECT mode,configVersion FROM walk_tracking_pins WHERE ownerId=? AND walkId=?",ownerId,walkId);
  if (existing) {
    if (!["v1","v2","shadow"].includes(existing.mode) || ![1,2].includes(existing.configVersion)) {
      throw new Error("WALK_TRACKING_CODEC_UNSUPPORTED");
    }
    return existing;
  }
  const checkpoint = await readCheckpoint(db,ownerId,walkId);
  const gps = await db.getFirstAsync<{walkId:string}>("SELECT walkId FROM gps_sessions WHERE ownerId=? AND walkId=?",ownerId,walkId);
  const pin: TrackingPin = checkpoint
    ? {mode:checkpoint.mode, configVersion:decodeCheckpoint(checkpoint)?.configVersion ?? 1}
    : legacy || gps ? {mode:"v1",configVersion:1} : configuredTrackingPin();
  await db.runAsync("INSERT INTO walk_tracking_pins(ownerId,walkId,mode,configVersion) VALUES(?,?,?,?)",ownerId,walkId,pin.mode,pin.configVersion);
  return pin;
}

function decodeCheckpoint(row: CheckpointRow): (TrackingCheckpoint & { configVersion: 1 | 2 }) | null {
  try {
    const s = JSON.parse(row.document) as TrackingCheckpoint;
    const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
    const validFix = (f: WalkFix | null) => f === null || (
      !!f && finite(f.latitude) && Math.abs(f.latitude) <= 90 &&
      finite(f.longitude) && Math.abs(f.longitude) <= 180 && finite(f.timestamp) &&
      (f.accuracy === null || finite(f.accuracy)) && (f.speed === null || finite(f.speed))
    );
    if (!s || s.version !== 2 || (s.configVersion !== 1 && s.configVersion !== 2) || s.epoch !== row.epoch || s.startedAt !== row.startedAt ||
      typeof s.active !== "boolean" || typeof s.sufficient !== "boolean" ||
      !Number.isSafeInteger(s.seq) || s.seq < 0 ||
      !Number.isSafeInteger(s.epochStartSeq) || s.epochStartSeq < 0 || s.epochStartSeq > s.seq || !Number.isSafeInteger(s.segment) || s.segment < 1 ||
      !finite(s.meters) || s.meters < 0 || !finite(s.watermark) || !finite(s.maxMeasuredAt) ||
      !Number.isSafeInteger(s.rejected) || s.rejected < 0 ||
      !["moving","possible_stop","stationary","resuming"].includes(s.motion) ||
      !["unknown","good","lost"].includes(s.quality) ||
      !Array.isArray(s.pending) || s.pending.length > TRACKING_CONFIG_V2.maxPending ||
      !Array.isArray(s.motionWindow) || s.motionWindow.length > TRACKING_CONFIG_V2.maxWindow ||
      !s.pending.every(f => f !== null && validFix(f)) ||
      !s.motionWindow.every(f => f !== null && validFix(f)) ||
      !validFix(s.lastGood) || !validFix(s.anchor) || !validFix(s.lastOutput) ||
      !validFix(s.previousCanonical) || !validFix(s.pendingCanonical)) return null;
    return s as TrackingCheckpoint & { configVersion: 1 | 2 };
  } catch { return null; }
}

async function writeCheckpoint(db: SQLite.SQLiteDatabase, ownerId: string, walkId: string, mode: TrackingMode, state: TrackingCheckpoint) {
  await db.runAsync(
    `INSERT INTO gps_tracking_checkpoint(ownerId,walkId,mode,epoch,startedAt,document)
    VALUES(?,?,?,?,?,?) ON CONFLICT(ownerId,walkId) DO UPDATE SET
    mode=excluded.mode,epoch=excluded.epoch,startedAt=excluded.startedAt,document=excluded.document`,
    ownerId, walkId, mode, state.epoch, state.startedAt, JSON.stringify(state),
  );
}

async function lastSequence(db: SQLite.SQLiteDatabase, ownerId: string, walkId: string) {
  const row = await db.getFirstAsync<{ seq: number }>(
    "SELECT COALESCE(MAX(seq),0) AS seq FROM gps_points WHERE ownerId=? AND walkId=?", ownerId, walkId,
  );
  return row?.seq ?? 0;
}

function newSegment(session: GpsSession, at: number, seq: number, old: TrackingCheckpoint | null, mode: TrackingMode, configVersion: 1 | 2 = 1) {
  const segment = Math.max(session.segment + 1, old?.segment ?? 1);
  const state = createTrackingCheckpoint(`${session.walkId}:${at}:${segment}`, at, old?.configVersion ?? configVersion);
  state.segment = segment;
  state.seq = mode === "v2" ? seq : old?.seq ?? 0;
  state.epochStartSeq = state.seq;
  state.meters = mode === "v2" ? session.distanceMeters : old?.meters ?? 0;
  state.sufficient = old?.sufficient ?? (mode === "v2" && seq > 0);
  state.rejected = old?.rejected ?? 0;
  return state;
}

async function writeCanonical(db: SQLite.SQLiteDatabase, session: GpsSession, state: TrackingCheckpoint, points: readonly CanonicalPoint[]) {
  for (const point of points) {
    await db.runAsync(
      `INSERT INTO gps_points(ownerId,walkId,seq,segment,latitude,longitude,timestamp,accuracy,speed,accepted,reason,deltaMeters)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,
      session.ownerId, session.walkId, point.seq, point.segment, point.latitude, point.longitude,
      point.timestamp, point.accuracy, point.speed, 1, point.reason, point.deltaMeters,
    );
  }
  const anchor = state.lastOutput;
  await db.runAsync(
    `UPDATE gps_sessions SET segment=?,distanceMeters=?,lastLatitude=?,lastLongitude=?,lastTimestamp=?,lastAccuracy=?,lastSpeed=?
    WHERE ownerId=? AND walkId=?`,
    state.segment, state.meters, anchor?.latitude ?? null, anchor?.longitude ?? null,
    anchor?.timestamp ?? null, anchor?.accuracy ?? null, anchor?.speed ?? null, session.ownerId, session.walkId,
  );
}

// A bounded, local-only undo window. The base contains the already committed
// prefix; replaying the suffix restores the exact reducer state at a late pause.
type TailFix = Extract<TrackingEvent,{type:"fix"}>;
interface TrackingTail {
  version: 1;
  base: TrackingCheckpoint;
  events: TailFix[];
}
const MAX_TRACKING_TAIL = 64;

async function readTrackingTail(db: SQLite.SQLiteDatabase, session: GpsSession, state: TrackingCheckpoint): Promise<TrackingTail | null> {
  const row = await db.getFirstAsync<{document:string}>(
    "SELECT document FROM gps_tracking_tail WHERE ownerId=? AND walkId=?",session.ownerId,session.walkId);
  if (!row) return null;
  try {
    const tail = JSON.parse(row.document) as TrackingTail;
    if (tail.version !== 1 || tail.base.epoch !== state.epoch || tail.base.configVersion !== state.configVersion ||
        !Array.isArray(tail.events) || tail.events.length > MAX_TRACKING_TAIL) return null;
    const base = decodeCheckpoint({mode:"v2",epoch:state.epoch,startedAt:state.startedAt,document:JSON.stringify(tail.base)});
    if (!base) return null;
    let replayed: TrackingCheckpoint = base;
    for (const event of tail.events) {
      if (event.type !== "fix" || event.epoch !== state.epoch || !Number.isFinite(event.receivedAt)) return null;
      replayed = advanceTracking(replayed,event).checkpoint;
    }
    // Never use a stale/corrupt undo log to overwrite a committed prefix.
    return JSON.stringify(replayed) === JSON.stringify(state) ? tail : null;
  } catch { return null; }
}

async function saveTrackingTail(db: SQLite.SQLiteDatabase, session: GpsSession, tail: TrackingTail) {
  while (tail.events.length > MAX_TRACKING_TAIL) {
    tail.base = advanceTracking(tail.base,tail.events.shift()!).checkpoint;
  }
  await db.runAsync(
    `INSERT INTO gps_tracking_tail(ownerId,walkId,document) VALUES(?,?,?)
    ON CONFLICT(ownerId,walkId) DO UPDATE SET document=excluded.document`,
    session.ownerId,session.walkId,JSON.stringify(tail));
}

async function clearTrackingTail(db: SQLite.SQLiteDatabase, ownerId: string, walkId: string) {
  await db.runAsync("DELETE FROM gps_tracking_tail WHERE ownerId=? AND walkId=?",ownerId,walkId);
}

async function routeRevision(db:SQLite.SQLiteDatabase,ownerId:string,walkId:string) {
  return (await db.getFirstAsync<{revision:number}>("SELECT revision FROM gps_route_revision WHERE ownerId=? AND walkId=?",ownerId,walkId))?.revision??0;
}
async function invalidateRouteDisplay(db:SQLite.SQLiteDatabase,ownerId:string,walkId:string) {
  await db.runAsync(`INSERT INTO gps_route_revision(ownerId,walkId,revision) VALUES(?,?,1)
    ON CONFLICT(ownerId,walkId) DO UPDATE SET revision=gps_route_revision.revision+1`,ownerId,walkId);
  await db.runAsync("DELETE FROM gps_final_display WHERE ownerId=? AND walkId=?",ownerId,walkId);
}
async function rewindTrackingTail(db: SQLite.SQLiteDatabase, session: GpsSession, state: TrackingCheckpoint, at: number) {
  const tail = await readTrackingTail(db,session,state);
  if (!tail || tail.base.maxMeasuredAt > at) return null;
  const synced=await db.getFirstAsync<{lastSeq:number}>("SELECT lastSeq FROM gps_sync_cursor WHERE ownerId=? AND walkId=?",session.ownerId,session.walkId);
  if((synced?.lastSeq??0)>tail.base.seq) return null;
  let replayed = tail.base;
  const points: CanonicalPoint[] = [];
  for (const event of tail.events) {
    if (event.fix.timestamp > at) continue;
    const result = advanceTracking(replayed,event);
    replayed = result.checkpoint;
    points.push(...result.points);
  }
  const closed = advanceTracking(replayed,{type:"pause",epoch:state.epoch,at});
  if (closed.checkpoint.active) return null;
  points.push(...closed.points);
  await db.runAsync("DELETE FROM gps_points WHERE ownerId=? AND walkId=? AND seq>?",session.ownerId,session.walkId,tail.base.seq);
  await invalidateRouteDisplay(db,session.ownerId,session.walkId);
  return {checkpoint:closed.checkpoint,points};
}

async function closeCheckpoint(db: SQLite.SQLiteDatabase, session: GpsSession, at: number, discard: boolean) {
  const row = await readCheckpoint(db, session.ownerId, session.walkId);
  if (!row) return;
  const seq = await lastSequence(db, session.ownerId, session.walkId);
  const decoded = decodeCheckpoint(row);
  let state: TrackingCheckpoint | null = decoded;
  if (!state || (row.mode === "v2" && (state.seq !== seq || state.meters !== session.distanceMeters))) {
    const pin = await pinTracking(db,session.ownerId,session.walkId,true);
    state = newSegment(session, at, seq, null, row.mode, pin.configVersion as 1 | 2);
  }
  // Active interval is [start, pause). An observation at the exact pause
  // timestamp belongs to neither the closing epoch nor a future resumption.
  const cutoff=discard?at:Math.ceil(at)-1;
  if(!discard&&cutoff<state.startedAt) {
    await clearTrackingTail(db,session.ownerId,session.walkId);
  }
  let result = !discard && cutoff < state.watermark && row.mode === "v2" && state.configVersion === 2
    ? await rewindTrackingTail(db,session,state,cutoff) : null;
  if (!result && (discard || cutoff < state.watermark || cutoff < state.startedAt)) {
    // An OS callback may commit just before the queued pause operation acquires
    // SQLite. Only trim the current (not yet synced) epoch, never older segments.
    if (!discard && row.mode === "v2") {
      const synced=await db.getFirstAsync<{lastSeq:number}>("SELECT lastSeq FROM gps_sync_cursor WHERE ownerId=? AND walkId=?",session.ownerId,session.walkId);
      const unsafe=await db.getFirstAsync<{seq:number}>(
        "SELECT MIN(seq) AS seq FROM gps_points WHERE ownerId=? AND walkId=? AND seq>? AND timestamp>?",
        session.ownerId,session.walkId,state.epochStartSeq,cutoff);
      const preceding=state.configVersion===2 ? await db.getFirstAsync<{seq:number;reason:string}>(
        "SELECT seq,reason FROM gps_points WHERE ownerId=? AND walkId=? AND seq>? AND timestamp<=? ORDER BY seq DESC LIMIT 1",
        session.ownerId,session.walkId,state.epochStartSeq,cutoff):null;
      // In a centered filter the final retained non-anchor vertex may have used
      // a later observation. Without the exact undo log, discard it rather
      // than present future-dependent geometry as evidence.
      const firstUnsafe=Math.min(unsafe?.seq??Infinity,preceding&&preceding.reason!=="first"?preceding.seq:Infinity);
      if(Number.isFinite(firstUnsafe)) {
        if((synced?.lastSeq??0)>=firstUnsafe) throw new Error("WALK_TRACKING_BOUNDARY_SYNC_CONFLICT");
        await db.runAsync("DELETE FROM gps_points WHERE ownerId=? AND walkId=? AND seq>=?",session.ownerId,session.walkId,firstUnsafe);
        await invalidateRouteDisplay(db,session.ownerId,session.walkId);
      }
      const remaining = await db.getFirstAsync<{ seq: number; meters: number }>(
        "SELECT COALESCE(MAX(seq),0) AS seq, COALESCE(SUM(deltaMeters),0) AS meters FROM gps_points WHERE ownerId=? AND walkId=?",
        session.ownerId, session.walkId,
      );
      state = { ...state, seq: remaining?.seq ?? 0, meters: remaining?.meters ?? 0,
        sufficient: (remaining?.seq ?? 0) > 0 };
    }
    result = {
      checkpoint: { ...state, active: false, anchor: null, lastOutput: null, previousCanonical: null, pendingCanonical: null, lastGood: null, pending: [], motionWindow: [], quality: "lost" as const },
      points: [] as CanonicalPoint[],
    };
  } else if (!result) {
    result = advanceTracking(state, { type: "pause", epoch: state.epoch, at:cutoff });
  }
  if (row.mode === "v2") await writeCanonical(db, session, result.checkpoint, result.points);
  await writeCheckpoint(db, session.ownerId, session.walkId, row.mode, result.checkpoint);
  await clearTrackingTail(db,session.ownerId,session.walkId);
}

interface SessionEpoch {startedAt:number;firstSeq:number;generation:number}
async function readSessionEpoch(db:SQLite.SQLiteDatabase,ownerId:string,walkId:string) {
  return db.getFirstAsync<SessionEpoch>("SELECT startedAt,firstSeq,generation FROM gps_session_epochs WHERE ownerId=? AND walkId=?",ownerId,walkId);
}
async function openSessionEpoch(db:SQLite.SQLiteDatabase,ownerId:string,walkId:string,startedAt:number,firstSeq:number) {
  await db.runAsync(`INSERT INTO gps_session_epochs(ownerId,walkId,startedAt,firstSeq,generation) VALUES(?,?,?,?,1)
    ON CONFLICT(ownerId,walkId) DO UPDATE SET startedAt=excluded.startedAt,firstSeq=excluded.firstSeq,generation=gps_session_epochs.generation+1`,
    ownerId,walkId,startedAt,firstSeq);
}
function journalAllowsGps(document:string|null,walkId:string):boolean {
  if(!document) return true; // compatible legacy/orphan database; no journal to compare
  try {
    const active=JSON.parse(document).active;
    return activeJournalId(document)===walkId && active?.runningSinceMs!==null;
  } catch { return false; }
}
async function trimLegacyBoundary(db:SQLite.SQLiteDatabase,session:GpsSession,epoch:SessionEpoch,at:number) {
  const first=await db.getFirstAsync<{seq:number|null}>("SELECT MIN(seq) AS seq FROM gps_points WHERE ownerId=? AND walkId=? AND seq>? AND timestamp>=?",
    session.ownerId,session.walkId,epoch.firstSeq,at);
  if(first?.seq==null) return;
  const synced=await db.getFirstAsync<{lastSeq:number}>("SELECT lastSeq FROM gps_sync_cursor WHERE ownerId=? AND walkId=?",session.ownerId,session.walkId);
  if((synced?.lastSeq??0)>=first.seq) throw new Error("WALK_TRACKING_BOUNDARY_SYNC_CONFLICT");
  await db.runAsync("DELETE FROM gps_points WHERE ownerId=? AND walkId=? AND seq>=?",session.ownerId,session.walkId,first.seq);
  await invalidateRouteDisplay(db,session.ownerId,session.walkId);
  await db.runAsync(`UPDATE gps_sessions SET distanceMeters=(SELECT COALESCE(SUM(deltaMeters),0) FROM gps_points WHERE ownerId=? AND walkId=?),
    lastLatitude=NULL,lastLongitude=NULL,lastTimestamp=NULL,lastAccuracy=NULL,lastSpeed=NULL WHERE ownerId=? AND walkId=?`,
    session.ownerId,session.walkId,session.ownerId,session.walkId);
}

export async function activateGpsSession(ownerId: string, walkId: string): Promise<void> {
  const db = await openDb();
  await db.withExclusiveTransactionAsync(async (tx) => {
    const at = Date.now();
    const deleted = await tx.getFirstAsync<{ walkId: string }>(
      "SELECT walkId FROM walk_delete_markers WHERE ownerId=? AND walkId=?", ownerId, walkId,
    );
    if (deleted) throw new Error("WALK_ALREADY_DELETED");
    const current = await tx.getFirstAsync<GpsSession>(
      "SELECT * FROM gps_sessions WHERE ownerId=? AND walkId=?", ownerId, walkId,
    );
    const journal = await tx.getFirstAsync<{document:string}>("SELECT document FROM walk_journals WHERE ownerId=?",ownerId);
    if(!journalAllowsGps(journal?.document??null,walkId)) throw new Error("WALK_JOURNAL_CONFLICT");
    if (current?.active) {
      const checkpoint=await readCheckpoint(tx, ownerId, walkId);
      if(!(await readSessionEpoch(tx,ownerId,walkId))) {
        await openSessionEpoch(tx,ownerId,walkId,checkpoint?.startedAt??at,
          checkpoint?decodeCheckpoint(checkpoint)?.epochStartSeq??await lastSequence(tx,ownerId,walkId):await lastSequence(tx,ownerId,walkId));
      }
      await pinTracking(tx,ownerId,walkId,true);
      return;
    }
    const pin = await pinTracking(tx,ownerId,walkId,activeJournalId(journal?.document ?? null) === walkId);
    const previous = await tx.getFirstAsync<GpsSession>("SELECT * FROM gps_sessions WHERE active=1 LIMIT 1");
    if (previous) {
      try { await closeCheckpoint(tx, previous, at, true); }
      catch(error) { if(!isUnsupportedCodec(error)) throw error; }
    }
    await tx.runAsync("UPDATE gps_sessions SET active=0 WHERE active=1");
    await openSessionEpoch(tx,ownerId,walkId,at,await lastSequence(tx,ownerId,walkId));
    if (!current) {
      await tx.runAsync("INSERT INTO gps_sessions(ownerId,walkId,segment,active) VALUES (?,?,1,1)", ownerId, walkId);
      const mode = pin.mode;
      if (mode !== "v1") {
        const configVersion = pin.configVersion as 1 | 2;
        await writeCheckpoint(tx, ownerId, walkId, mode, createTrackingCheckpoint(`${walkId}:${at}:1`, at, configVersion));
      }
    } else {
      const row = await readCheckpoint(tx, ownerId, walkId);
      const state = row ? newSegment(current, at, await lastSequence(tx, ownerId, walkId), decodeCheckpoint(row), row.mode, pin.configVersion as 1 | 2) : null;
      await tx.runAsync(
        `UPDATE gps_sessions SET active=1, segment=?,
        lastLatitude=NULL,lastLongitude=NULL,lastTimestamp=NULL,lastAccuracy=NULL,lastSpeed=NULL
        WHERE ownerId=? AND walkId=?`,
        state?.segment ?? current.segment + 1, ownerId, walkId,
      );
      if (row && state) await writeCheckpoint(tx, ownerId, walkId, row.mode, state);
    }
    const epoch=await readSessionEpoch(tx,ownerId,walkId);
    if(epoch) await appendQaBoundary(tx,ownerId,walkId,epoch.generation,at,"open");
  });
}
export async function deactivateGpsSession(ownerId: string, walkId: string, boundaryAt = Date.now()): Promise<void> {
  const db = await openDb();
  await db.withExclusiveTransactionAsync(async (tx) => {
    const session = await tx.getFirstAsync<GpsSession>(
      "SELECT * FROM gps_sessions WHERE ownerId=? AND walkId=? AND active=1", ownerId, walkId,
    );
    if (session) {
      const epoch=await readSessionEpoch(tx,ownerId,walkId);
      if(epoch&&boundaryAt<epoch.startedAt) return;
      try {
        const row = await readCheckpoint(tx, ownerId, walkId);
        if (row && boundaryAt < row.startedAt) return; // late command for an older epoch
        await closeCheckpoint(tx, session, boundaryAt, false);
        if(epoch&&row?.mode!=="v2") await trimLegacyBoundary(tx,session,epoch,boundaryAt);
        if(epoch) await appendQaBoundary(tx,ownerId,walkId,epoch.generation,boundaryAt,"close");
      } catch (error) {
        if (!isUnsupportedCodec(error)) throw error;
        // Preserve the future checkpoint verbatim, but disable collection.
      }
    }
    await tx.runAsync("UPDATE gps_sessions SET active=0 WHERE ownerId=? AND walkId=?", ownerId, walkId);
    await tx.runAsync("DELETE FROM gps_motion_policy WHERE ownerId=? AND walkId=?", ownerId, walkId);
  });
}
export async function deactivateAllGpsSessions(): Promise<void> {
  const db = await openDb();
  await db.withExclusiveTransactionAsync(async (tx) => {
    const session = await tx.getFirstAsync<GpsSession>("SELECT * FROM gps_sessions WHERE active=1 LIMIT 1");
    if (session) {
      try { await closeCheckpoint(tx, session, Date.now(), true); }
      catch (error) { if (!isUnsupportedCodec(error)) throw error; }
    }
    await tx.runAsync("UPDATE gps_sessions SET active=0 WHERE active=1");
    await tx.runAsync("DELETE FROM gps_motion_policy");
  });
}

export async function isV2GpsSession(ownerId: string, walkId: string): Promise<boolean> {
  const db = await openDb();
  return (await readCheckpoint(db, ownerId, walkId))?.mode === "v2";
}

export async function activeGpsSession(): Promise<{ ownerId: string; walkId: string } | null> {
  const db = await openDb();
  return db.getFirstAsync<{ ownerId: string; walkId: string }>(
    "SELECT ownerId,walkId FROM gps_sessions WHERE active=1 LIMIT 1",
  );
}

/** Called from the headless Expo TaskManager runtime; never touches React. */
export async function persistGpsBatch(samples: WalkFix[], receivedAt = Date.now()): Promise<number> {
  const safe = normalizeGpsBatch(samples);
  if (!safe.length) return 0;
  const db = await openDb();
  let stored = 0;
  let capture: {ownerId:string;walkId:string;generation:number}|null=null;
  await db.withExclusiveTransactionAsync(async (tx) => {
    const session = await tx.getFirstAsync<GpsSession>(
      "SELECT * FROM gps_sessions WHERE active=1 LIMIT 1",
    );
    if (!session) return;
    const journal=await tx.getFirstAsync<{document:string}>("SELECT document FROM walk_journals WHERE ownerId=?",session.ownerId);
    if(!journalAllowsGps(journal?.document??null,session.walkId)) return;
    const count = await tx.getFirstAsync<{ seq: number }>(
      "SELECT COALESCE(MAX(seq),0) AS seq FROM gps_points WHERE ownerId=? AND walkId=?",
      session.ownerId,
      session.walkId,
    );
    let seq = count?.seq ?? 0;
    const row = await readCheckpoint(tx, session.ownerId, session.walkId);
    let epoch=await readSessionEpoch(tx,session.ownerId,session.walkId);
    if(!epoch) {
      const startedAt=row?.startedAt??receivedAt;
      await openSessionEpoch(tx,session.ownerId,session.walkId,startedAt,row?decodeCheckpoint(row)?.epochStartSeq??seq:seq);
      epoch=await readSessionEpoch(tx,session.ownerId,session.walkId);
    }
    if(!epoch||!Number.isFinite(receivedAt)||receivedAt<epoch.startedAt) return;
    capture={ownerId:session.ownerId,walkId:session.walkId,generation:epoch.generation};
    const eligible=(fix:WalkFix)=>Number.isFinite(fix.timestamp)&&fix.timestamp>=epoch!.startedAt&&fix.timestamp<=receivedAt+1000;
    if (row) {
      // The callback's arrival time cannot precede the active epoch. Old native
      // batches measured before a pause/owner change are filtered by the core.
      if (receivedAt < row.startedAt) return;
      let state: TrackingCheckpoint | null = decodeCheckpoint(row);
      if (!state || !state.active || (row.mode === "v2" &&
          (state.seq !== seq || state.meters !== session.distanceMeters))) {
        const pin = await pinTracking(tx,session.ownerId,session.walkId,true);
        state = newSegment(session, receivedAt, seq, null, row.mode, pin.configVersion as 1 | 2);
      }
      const points: CanonicalPoint[] = [];
      const tail = row.mode === "v2" && state.configVersion === 2
        ? await readTrackingTail(tx,session,state) ?? {version:1 as const,base:state,events:[] as TailFix[]}
        : null;
      // Process receipt order; the same bounded reorder buffer works across callbacks.
      for (const fix of samples.filter(eligible)) {
        const event: TailFix = { type: "fix", epoch: state.epoch, receivedAt, fix };
        const result = advanceTracking(state, event);
        if (tail) tail.events.push(event);
        state = result.checkpoint;
        points.push(...result.points);
      }
      if (row.mode === "v2") {
        await writeCanonical(tx, session, state, points);
        stored = points.length;
      }
      await writeCheckpoint(tx, session.ownerId, session.walkId, row.mode, state);
      if (tail) await saveTrackingTail(tx,session,tail);
      if (row.mode === "v2") return;
    }
    for (const sample of safe.filter(eligible)) {
      // Stop/pause changes use the same exclusive transaction barrier.
      const previous: GpsSample | null =
        session.lastTimestamp === null
          ? null
          : {
              latitude: session.lastLatitude!,
              longitude: session.lastLongitude!,
              timestamp: session.lastTimestamp,
              accuracy: session.lastAccuracy,
              speed: session.lastSpeed,
            };
      let decision = classifyGpsSample(previous, sample);
      if (
        decision.reason === "jump" &&
        previous &&
        sample.timestamp - previous.timestamp > 90_000
      ) {
        session.segment += 1;
        decision = classifyGpsSample(null, sample);
      }
      seq += 1;
      await tx.runAsync(
        `INSERT INTO gps_points(ownerId,walkId,seq,segment,latitude,longitude,timestamp,accuracy,speed,accepted,reason,deltaMeters)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,
        session.ownerId,
        session.walkId,
        seq,
        session.segment,
        sample.latitude,
        sample.longitude,
        sample.timestamp,
        sample.accuracy,
        sample.speed,
        decision.accepted ? 1 : 0,
        decision.reason,
        decision.meters,
      );
      stored++;
      if (decision.accepted) {
        session.distanceMeters += decision.meters;
        session.lastLatitude = sample.latitude;
        session.lastLongitude = sample.longitude;
        session.lastTimestamp = sample.timestamp;
        session.lastAccuracy = sample.accuracy;
        session.lastSpeed = sample.speed;
      }
    }
    await tx.runAsync(
      `UPDATE gps_sessions SET segment=?,distanceMeters=?,lastLatitude=?,lastLongitude=?,lastTimestamp=?,lastAccuracy=?,lastSpeed=?
      WHERE ownerId=? AND walkId=?`,
      session.segment,
      session.distanceMeters,
      session.lastLatitude,
      session.lastLongitude,
      session.lastTimestamp,
      session.lastAccuracy,
      session.lastSpeed,
      session.ownerId,
      session.walkId,
    );
  });
  const scope=capture as {ownerId:string;walkId:string;generation:number}|null;
  if(scope) {
    try { await captureQaBatch(scope.ownerId,scope.walkId,samples,receivedAt,scope.generation); }
    catch {
      // Mark an incomplete QA trace, without exposing coordinates or breaking the writer.
      try { await db.runAsync("UPDATE walk_qa_capture SET truncated=1 WHERE ownerId=? AND walkId=?",scope.ownerId,scope.walkId); } catch {
        console.warn("WALK_QA_CAPTURE_TRUNCATION_MARK_FAILED");
      }
    }
  }
  return stored;
}
/** Bounded owner-scoped existence probe for completion diagnostics. */
export async function hasStoredGpsPoint(ownerId: string, walkId: string): Promise<boolean> {
  const db = await openDb();
  return Boolean(await db.getFirstAsync<{seq: number}>(
    "SELECT seq FROM gps_points WHERE ownerId=? AND walkId=? LIMIT 1", ownerId, walkId,
  ));
}

export async function gpsWalkMeters(ownerId: string, walkId: string): Promise<number | null> {
  return readGpsMeters(await openDb(), ownerId, walkId);
}
async function readGpsMeters(db: SQLite.SQLiteDatabase, ownerId: string, walkId: string): Promise<number | null> {
  const session = await db.getFirstAsync<{ distanceMeters: number }>(
    "SELECT distanceMeters FROM gps_sessions WHERE ownerId=? AND walkId=?",
    ownerId,
    walkId,
  );
  if (!session) return null;
  const checkpoint = await readCheckpoint(db, ownerId, walkId, false);
  if (checkpoint?.mode === "v2") {
    const decoded = decodeCheckpoint(checkpoint);
    if (decoded?.sufficient) return Math.round(session.distanceMeters);
    if (!decoded) {
      const recorded = await db.getFirstAsync<{seq:number}>(
        "SELECT seq FROM gps_points WHERE ownerId=? AND walkId=? AND accepted=1 LIMIT 1",ownerId,walkId);
      if (recorded) return Math.round(session.distanceMeters);
    }
  }
  const anyAccepted = await db.getFirstAsync<{ seq: number }>(
    "SELECT seq FROM gps_points WHERE ownerId=? AND walkId=? AND accepted=1 AND deltaMeters>0 LIMIT 1",
    ownerId,
    walkId,
  );
  return anyAccepted ? Math.round(session.distanceMeters) : null;
}
export interface GpsLiveStatus {
  timestamp: number | null;
  accuracy: number | null;
  quality: "good" | "lost" | "unknown";
  position?: {latitude:number;longitude:number;timestamp:number;accuracy:number|null}|null;
}

/** Signal freshness is independent of how often the canonical route grows. */
export async function readGpsLiveStatus(ownerId: string, walkId: string): Promise<GpsLiveStatus | null> {
  return readLiveStatus(await openDb(), ownerId, walkId);
}
async function readLiveStatus(db: SQLite.SQLiteDatabase, ownerId: string, walkId: string): Promise<GpsLiveStatus | null> {
  const row = await readCheckpoint(db, ownerId, walkId, false);
  if(row?.mode==="v2") {
    const state=decodeCheckpoint(row);
    if(!state) return {timestamp:null,accuracy:null,quality:"unknown",position:null};
    const position=state.lastGood?{latitude:state.lastGood.latitude,longitude:state.lastGood.longitude,
      timestamp:state.lastGood.timestamp,accuracy:state.lastGood.accuracy}:null;
    return {timestamp:position?.timestamp??null,accuracy:position?.accuracy??null,quality:state.quality,position};
  }
  // Legacy marker uses the very same observation as the age/accuracy label,
  // never a separate MapLibre location provider with unrelated timestamps.
  const epoch=await readSessionEpoch(db,ownerId,walkId);
  const point=await db.getFirstAsync<{latitude:number;longitude:number;timestamp:number;accuracy:number|null;reason:string;accepted:number}>(
    "SELECT latitude,longitude,timestamp,accuracy,reason,accepted FROM gps_points WHERE ownerId=? AND walkId=? AND timestamp>=? AND reason NOT IN ('invalid','out_of_order','jump') ORDER BY timestamp DESC,seq DESC LIMIT 1",
    ownerId,walkId,epoch?.startedAt??0);
  if(!point) return {timestamp:null,accuracy:null,quality:"unknown",position:null};
  const position={latitude:point.latitude,longitude:point.longitude,timestamp:point.timestamp,accuracy:point.accuracy};
  return {timestamp:position.timestamp,accuracy:position.accuracy,quality:point.accepted||point.reason==="stationary"?"good":"unknown",position};
}

export async function readGpsPoints(
  ownerId: string,
  walkId: string,
  afterSeq = 0,
  limit = 200,
): Promise<StoredGpsPoint[]> {
  return readPointPage(await openDb(), ownerId, walkId, afterSeq, limit);
}
async function readPointPage(db: SQLite.SQLiteDatabase, ownerId: string, walkId: string, afterSeq: number, limit: number): Promise<StoredGpsPoint[]> {
  const rows = await db.getAllAsync<{
    seq: number;
    segment: number;
    latitude: number;
    longitude: number;
    timestamp: number;
    accuracy: number | null;
    speed: number | null;
    accepted: number;
    reason: string;
    deltaMeters: number;
  }>(
    "SELECT seq,segment,latitude,longitude,timestamp,accuracy,speed,accepted,reason,deltaMeters FROM gps_points WHERE ownerId=? AND walkId=? AND seq>? ORDER BY seq ASC LIMIT ?",
    ownerId,
    walkId,
    afterSeq,
    Math.min(200, Math.max(1, limit)),
  );
  return rows.map((row) => ({ ...row, accepted: row.accepted === 1 }));
}

export interface GpsTrackSnapshot {
  points: StoredGpsPoint[];
  meters: number | null;
  status: GpsLiveStatus | null;
  generation: number;
  lastSeq: number;
  routeRevision:number;
}

/** A bounded read transaction yields route deltas and their matching statistics. */
export async function readGpsTrackSnapshot(ownerId: string, walkId: string, afterSeq: number): Promise<GpsTrackSnapshot> {
  const db = await openDb();
  let snapshot: GpsTrackSnapshot | undefined;
  await db.withExclusiveTransactionAsync(async tx => {
    const points = await readPointPage(tx, ownerId, walkId, afterSeq, WALK_TRACK_PAGE_SIZE);
    snapshot = { points, meters: await readGpsMeters(tx, ownerId, walkId), status: await readLiveStatus(tx, ownerId, walkId),
      generation:(await readSessionEpoch(tx,ownerId,walkId))?.generation??0,lastSeq:await lastSequence(tx,ownerId,walkId),
      routeRevision:await routeRevision(tx,ownerId,walkId) };
  });
  if (!snapshot) throw new Error("WALK_TRACK_SNAPSHOT_UNAVAILABLE");
  return snapshot;
}

export async function getGpsSyncCursor(ownerId: string, walkId: string): Promise<number> {
  const db = await openDb();
  const row = await db.getFirstAsync<{ lastSeq: number }>(
    "SELECT lastSeq FROM gps_sync_cursor WHERE ownerId=? AND walkId=?",
    ownerId,
    walkId,
  );
  return row?.lastSeq ?? 0;
}
export async function markGpsSynced(
  ownerId: string,
  walkId: string,
  lastSeq: number,
): Promise<void> {
  const db = await openDb();
  await db.runAsync(
    `INSERT INTO gps_sync_cursor(ownerId,walkId,lastSeq) VALUES(?,?,?)
    ON CONFLICT(ownerId,walkId) DO UPDATE SET lastSeq=MAX(lastSeq,excluded.lastSeq)`,
    ownerId,
    walkId,
    lastSeq,
  );
}
/** Compatibility reader; long routes are never silently truncated. */
export async function allGpsPoints(ownerId: string, walkId: string, limit = WALK_TRACK_MAX_POINTS): Promise<StoredGpsPoint[]> {
  const points: StoredGpsPoint[] = [];
  let cursor = 0;
  for (;;) {
    const page = await readGpsPoints(ownerId, walkId, cursor, WALK_TRACK_PAGE_SIZE);
    if (points.length + page.length > limit) throw new Error("WALK_TRACK_LIMIT");
    cursor = appendWalkTrackPage(points, page, cursor);
    if (page.length < WALK_TRACK_PAGE_SIZE) return points;
  }
}

/** Optional local derivative only. Canonical points/meters and API are never
 * rewritten. Compute outside the write transaction; publish only if the
 * completed journal, tombstone, input revision and max seq still match. */
export async function getOrFinalizeGpsDisplay(ownerId:string,walkId:string):Promise<WalkGeoJson|null> {
  const db=await openDb();
  const input=async(tx:SQLite.SQLiteDatabase)=>{
    const journal=await tx.getFirstAsync<{document:string}>("SELECT document FROM walk_journals WHERE ownerId=?",ownerId);
    if(!completedJournalHas(journal?.document??null,walkId)) return null;
    const deleted=await tx.getFirstAsync<{walkId:string}>("SELECT walkId FROM walk_delete_markers WHERE ownerId=? AND walkId=?",ownerId,walkId);
    const active=await tx.getFirstAsync<{active:number}>("SELECT active FROM gps_sessions WHERE ownerId=? AND walkId=?",ownerId,walkId);
    if(deleted||active?.active) return null;
    return {seq:await lastSequence(tx,ownerId,walkId),revision:await routeRevision(tx,ownerId,walkId)};
  };
  const before=await input(db);
  if(!before||!before.seq) return null;
  const cached=await db.getFirstAsync<{document:string}>("SELECT document FROM gps_final_display WHERE ownerId=? AND walkId=? AND version=? AND inputSeq=? AND inputRevision=?",
    ownerId,walkId,WALK_DISPLAY_GEOMETRY_VERSION,before.seq,before.revision);
  // A cache is a hint, never a new source of canonical history. Verify source
  // identity again before returning it, even if another runtime deletes it.
  if(cached) {
    try {
      const parsed=JSON.parse(cached.document) as WalkGeoJson;
      const current=await input(db);
      if(current?.seq===before.seq&&current.revision===before.revision&&parsed.type==="FeatureCollection"&&Array.isArray(parsed.features)) return parsed;
    } catch { /* recreate derivative */ }
  }
  const points=await allGpsPoints(ownerId,walkId);
  const display=finalizeWalkDisplay(points);
  let published:WalkGeoJson|null=null;
  await db.withExclusiveTransactionAsync(async tx=>{
    const current=await input(tx);
    if(current?.seq!==before.seq||current.revision!==before.revision) return;
    await tx.runAsync(`INSERT INTO gps_final_display(ownerId,walkId,version,inputSeq,inputRevision,document) VALUES(?,?,?,?,?,?)
      ON CONFLICT(ownerId,walkId) DO UPDATE SET version=excluded.version,inputSeq=excluded.inputSeq,inputRevision=excluded.inputRevision,document=excluded.document`,
      ownerId,walkId,display.version,before.seq,before.revision,JSON.stringify(display.geometry));
    published=display.geometry;
  });
  return published;
}

/** Durable tombstone is written before local removal; survives offline deletes. */
export async function markGpsWalkDeleted(
  ownerId: string,
  walkId: string,
  pending = true,
): Promise<void> {
  const db = await openDb();
  await db.withExclusiveTransactionAsync(async (tx) => {
    await tx.runAsync(
      `INSERT INTO walk_delete_markers(ownerId,walkId,deletedAt,pending)
      VALUES(?,?,?,?) ON CONFLICT(ownerId,walkId) DO UPDATE SET
      deletedAt=excluded.deletedAt,pending=CASE WHEN walk_delete_markers.pending=1 AND excluded.pending=0 THEN 0 ELSE excluded.pending END`,
      ownerId,
      walkId,
      Date.now(),
      pending ? 1 : 0,
    );
    await tx.runAsync("DELETE FROM gps_points WHERE ownerId=? AND walkId=?", ownerId, walkId);
    await tx.runAsync("DELETE FROM gps_sessions WHERE ownerId=? AND walkId=?", ownerId, walkId);
    await tx.runAsync("DELETE FROM gps_sync_cursor WHERE ownerId=? AND walkId=?", ownerId, walkId);
    await tx.runAsync("DELETE FROM gps_tracking_checkpoint WHERE ownerId=? AND walkId=?", ownerId, walkId);
    await tx.runAsync("DELETE FROM walk_tracking_pins WHERE ownerId=? AND walkId=?", ownerId, walkId);
    await tx.runAsync("DELETE FROM gps_session_epochs WHERE ownerId=? AND walkId=?",ownerId,walkId);
    await tx.runAsync("DELETE FROM gps_route_revision WHERE ownerId=? AND walkId=?",ownerId,walkId);
    await tx.runAsync("DELETE FROM gps_final_display WHERE ownerId=? AND walkId=?",ownerId,walkId);
    await clearTrackingTail(tx,ownerId,walkId);
    await purgeQaRows(tx,await tx.getAllAsync<QaCapture>("SELECT * FROM walk_qa_capture WHERE ownerId=? AND walkId=?",ownerId,walkId));
    await tx.runAsync("DELETE FROM gps_motion_policy WHERE ownerId=? AND walkId=?", ownerId, walkId);
  });
}
export async function getGpsDeletedWalks(
  ownerId: string,
): Promise<{ walkId: string; pending: boolean }[]> {
  const db = await openDb();
  const rows = await db.getAllAsync<{ walkId: string; pending: number }>(
    "SELECT walkId,pending FROM walk_delete_markers WHERE ownerId=? ORDER BY deletedAt ASC",
    ownerId,
  );
  return rows.map((row) => ({ walkId: row.walkId, pending: row.pending === 1 }));
}
export async function confirmGpsWalkDeleted(ownerId: string, walkId: string): Promise<void> {
  const db = await openDb();
  await db.runAsync(
    "UPDATE walk_delete_markers SET pending=0 WHERE ownerId=? AND walkId=?",
    ownerId,
    walkId,
  );
}

/** UI, background/widget actions and GPS points all share one local WAL database. */
export async function readPersistedWalkJournal(ownerId: string): Promise<string | null> {
  const db = await openDb();
  const row = await db.getFirstAsync<{ document: string }>(
    "SELECT document FROM walk_journals WHERE ownerId=?",
    ownerId,
  );
  return row?.document ?? null;
}
export async function writePersistedWalkJournal(ownerId: string, document: string): Promise<void> {
  const db = await openDb();
  await db.withExclusiveTransactionAsync(async (tx) => {
    const previous = await tx.getFirstAsync<{document:string}>("SELECT document FROM walk_journals WHERE ownerId=?",ownerId);
    const walkId = activeJournalId(document);
    const previousId = activeJournalId(previous?.document ?? null);
    // Screen and widgets have separate JS runtimes. A stale save cannot replace
    // another active walk or resurrect an already completed walk.
    if (previousId && previousId !== walkId &&
        (walkId || !completedJournalHas(document,previousId))) {
      throw new Error("WALK_JOURNAL_CONFLICT");
    }
    if (walkId && completedJournalHas(previous?.document ?? null,walkId)) throw new Error("WALK_JOURNAL_CONFLICT");
    if (walkId) {
      const deleted = await tx.getFirstAsync<{walkId:string}>("SELECT walkId FROM walk_delete_markers WHERE ownerId=? AND walkId=?",ownerId,walkId);
      if (deleted) throw new Error("WALK_ALREADY_DELETED");
      await pinTracking(tx,ownerId,walkId,activeJournalId(previous?.document ?? null) === walkId);
    }
    await tx.runAsync(
      `INSERT INTO walk_journals(ownerId,document,revision) VALUES(?,?,1)
      ON CONFLICT(ownerId) DO UPDATE SET document=excluded.document,
      revision=walk_journals.revision+1`,
      ownerId,document,
    );
  });
}

export async function readGpsMotionPolicy(
  ownerId: string,
  walkId: string,
): Promise<WalkGpsPolicyState> {
  const db = await openDb();
  const row = await db.getFirstAsync<{ state: string }>(
    "SELECT state FROM gps_motion_policy WHERE ownerId=? AND walkId=?",
    ownerId,
    walkId,
  );
  if (!row) return DEFAULT_WALK_GPS_POLICY;
  try {
    const state = JSON.parse(row.state) as WalkGpsPolicyState;
    return state &&
      ["walking", "slow", "stationary"].includes(state.mode) &&
      Number.isFinite(state.changedAtMs) &&
      Number.isFinite(state.candidateSinceMs)
      ? state
      : DEFAULT_WALK_GPS_POLICY;
  } catch {
    return DEFAULT_WALK_GPS_POLICY;
  }
}
export async function saveGpsMotionPolicy(
  ownerId: string,
  walkId: string,
  state: WalkGpsPolicyState,
): Promise<void> {
  const db = await openDb();
  await db.runAsync(
    `INSERT INTO gps_motion_policy(ownerId,walkId,state) VALUES(?,?,?)
    ON CONFLICT(ownerId,walkId) DO UPDATE SET state=excluded.state`,
    ownerId,
    walkId,
    JSON.stringify(state),
  );
}

type WalkSyncCheckpoint = { cursor: string | null; confirmed: Record<string, string> };
export async function readWalkSyncCheckpoint(ownerId: string): Promise<WalkSyncCheckpoint> {
  const db = await openDb();
  const row = await db.getFirstAsync<{ cursor: string | null; confirmed: string }>(
    "SELECT cursor, confirmed FROM walk_history_sync WHERE ownerId=?", ownerId);
  return { cursor: row?.cursor ?? null, confirmed: row ? JSON.parse(row.confirmed) : {} };
}

/** Advance the cursor only in the same commit as the corresponding local history. */
export async function commitWalkSyncPage<T>(
  ownerId: string, previous: WalkSyncCheckpoint, cursor: string | null, current: () => boolean,
  merge: (document: string | null, deleted: Set<string>) => { document: string; confirmed: Record<string, string>; result: T },
): Promise<T> {
  const db = await openDb();
  let result!: T;
  await db.withExclusiveTransactionAsync(async tx => {
    if (!current()) throw new Error("WALK_SYNC_ACTOR_CHANGED");
    const checkpoint = await tx.getFirstAsync<{ cursor: string | null; confirmed: string }>(
      "SELECT cursor, confirmed FROM walk_history_sync WHERE ownerId=?", ownerId);
    const oldConfirmed = JSON.stringify(previous.confirmed);
    if ((checkpoint?.cursor ?? null) !== previous.cursor || (checkpoint?.confirmed ?? "{}") !== oldConfirmed)
      throw new Error("WALK_SYNC_CONCURRENT");
    const journal = await tx.getFirstAsync<{ document: string }>("SELECT document FROM walk_journals WHERE ownerId=?", ownerId);
    const markers = await tx.getAllAsync<{walkId:string}>("SELECT walkId FROM walk_delete_markers WHERE ownerId=?", ownerId);
    const merged = merge(journal?.document ?? null, new Set(markers.map(row => row.walkId)));
    if (merged.document !== journal?.document) {
      await tx.runAsync(`INSERT INTO walk_journals(ownerId,document,revision) VALUES(?,?,1)
        ON CONFLICT(ownerId) DO UPDATE SET document=excluded.document,revision=walk_journals.revision+1`, ownerId, merged.document);
    }
    const confirmed = JSON.stringify(merged.confirmed);
    if (!checkpoint || previous.cursor !== cursor || confirmed !== oldConfirmed)
      await tx.runAsync(`INSERT INTO walk_history_sync(ownerId,cursor,confirmed) VALUES(?,?,?)
        ON CONFLICT(ownerId) DO UPDATE SET cursor=excluded.cursor,confirmed=excluded.confirmed`, ownerId,cursor,confirmed);
    if (!current()) throw new Error("WALK_SYNC_ACTOR_CHANGED");
    result = merged.result;
  });
  return result;
}

export async function listPendingGpsWalks(ownerId: string): Promise<string[]> {
  const db = await openDb();
  const rows = await db.getAllAsync<{ walkId: string }>(`SELECT s.walkId FROM gps_sessions s
    WHERE s.ownerId=? AND EXISTS (SELECT 1 FROM gps_points p
      WHERE p.ownerId=s.ownerId AND p.walkId=s.walkId AND p.seq > COALESCE(
        (SELECT lastSeq FROM gps_sync_cursor c WHERE c.ownerId=s.ownerId AND c.walkId=s.walkId), 0))`, ownerId);
  return rows.map(row => row.walkId);
}
