import * as SQLite from "expo-sqlite";
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

export async function activateGpsSession(ownerId: string, walkId: string): Promise<void> {
  const db = await openDb();
  await db.withExclusiveTransactionAsync(async (tx) => {
    // Only one user's one walk can receive the global OS location task.
    await tx.runAsync("UPDATE gps_sessions SET active = 0 WHERE active = 1");
    const current = await tx.getFirstAsync<GpsSession>(
      "SELECT * FROM gps_sessions WHERE ownerId = ? AND walkId = ?",
      ownerId,
      walkId,
    );
    if (!current) {
      await tx.runAsync(
        "INSERT INTO gps_sessions(ownerId,walkId,segment,active) VALUES (?,?,1,1)",
        ownerId,
        walkId,
      );
    } else if (!current.active) {
      // A new segment never connects across pauses or process restarts.
      await tx.runAsync(
        `UPDATE gps_sessions SET active=1, segment=segment+1,
        lastLatitude=NULL,lastLongitude=NULL,lastTimestamp=NULL,lastAccuracy=NULL,lastSpeed=NULL
        WHERE ownerId=? AND walkId=?`,
        ownerId,
        walkId,
      );
    }
  });
}
export async function deactivateGpsSession(ownerId: string, walkId: string): Promise<void> {
  const db = await openDb();
  await db.withExclusiveTransactionAsync(async (tx) => {
    await tx.runAsync(
      "UPDATE gps_sessions SET active=0 WHERE ownerId=? AND walkId=?",
      ownerId,
      walkId,
    );
    await tx.runAsync(
      "DELETE FROM gps_motion_policy WHERE ownerId=? AND walkId=?",
      ownerId,
      walkId,
    );
  });
}
export async function deactivateAllGpsSessions(): Promise<void> {
  const db = await openDb();
  await db.runAsync("UPDATE gps_sessions SET active=0 WHERE active=1");
}
export async function activeGpsSession(): Promise<{ ownerId: string; walkId: string } | null> {
  const db = await openDb();
  return db.getFirstAsync<{ ownerId: string; walkId: string }>(
    "SELECT ownerId,walkId FROM gps_sessions WHERE active=1 LIMIT 1",
  );
}

/** Called from the headless Expo TaskManager runtime; never touches React. */
export async function persistGpsBatch(samples: GpsSample[]): Promise<number> {
  const safe = normalizeGpsBatch(samples);
  if (!safe.length) return 0;
  const db = await openDb();
  let stored = 0;
  await db.withExclusiveTransactionAsync(async (tx) => {
    const session = await tx.getFirstAsync<GpsSession>(
      "SELECT * FROM gps_sessions WHERE active=1 LIMIT 1",
    );
    if (!session) return;
    const count = await tx.getFirstAsync<{ seq: number }>(
      "SELECT COALESCE(MAX(seq),0) AS seq FROM gps_points WHERE ownerId=? AND walkId=?",
      session.ownerId,
      session.walkId,
    );
    let seq = count?.seq ?? 0;
    for (const sample of safe) {
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
  return stored;
}
export async function gpsWalkMeters(ownerId: string, walkId: string): Promise<number | null> {
  const db = await openDb();
  const session = await db.getFirstAsync<{ distanceMeters: number }>(
    "SELECT distanceMeters FROM gps_sessions WHERE ownerId=? AND walkId=?",
    ownerId,
    walkId,
  );
  if (!session) return null;
  const anyAccepted = await db.getFirstAsync<{ seq: number }>(
    "SELECT seq FROM gps_points WHERE ownerId=? AND walkId=? AND accepted=1 AND deltaMeters>0 LIMIT 1",
    ownerId,
    walkId,
  );
  return anyAccepted ? Math.round(session.distanceMeters) : null;
}
export async function readGpsPoints(
  ownerId: string,
  walkId: string,
  afterSeq = 0,
  limit = 200,
): Promise<StoredGpsPoint[]> {
  const db = await openDb();
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
export async function allGpsPoints(
  ownerId: string,
  walkId: string,
  limit = 10000,
): Promise<StoredGpsPoint[]> {
  const db = await openDb();
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
    "SELECT seq,segment,latitude,longitude,timestamp,accuracy,speed,accepted,reason,deltaMeters FROM gps_points WHERE ownerId=? AND walkId=? ORDER BY seq ASC LIMIT ?",
    ownerId,
    walkId,
    Math.min(50000, limit),
  );
  return rows.map((row) => ({ ...row, accepted: row.accepted === 1 }));
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
  await db.runAsync(
    `INSERT INTO walk_journals(ownerId,document,revision) VALUES(?,?,1)
    ON CONFLICT(ownerId) DO UPDATE SET document=excluded.document,
    revision=walk_journals.revision+1`,
    ownerId,
    document,
  );
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
