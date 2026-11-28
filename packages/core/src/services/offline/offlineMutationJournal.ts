/**
 * OFF021 NEW-only V2 training practice completion journal, AG4-approved local
 * source slice.  No DDL, old route changes, historical replay, or new rewards.
 * Until AG4 approves+applies isolated additive schema, POST/GET fail closed 503.
 *
 * Atomic boundary: reservation + existing Core step mutation + course sync +
 * monotonic revision + persisted response are ONE actual Prisma transaction.
 */
import { createHash, randomUUID } from "node:crypto";
import { requireOfflineMutationRowsPort, type OfflineMutationRowsPort } from "./offlineMutationRowsPort";
import type { StepOccurrenceBinding, StepOperation } from "../training/trainingServiceContract";
import type { PreventionRowsPort } from "../petPrevention/preventionRowsPort";
import { batchRequestSchema, type BatchEntryInput } from "../petPrevention/schemas";

export type JournalOperation = "training.complete.practice" | "training.complete.theory";
export type NewOfflinePracticeMutation = {
  ownerId: string;
  eventId: string;
  operation: JournalOperation;
  courseId: string;
  dayOnCourseId: string;
  stepIndex: number;
  expectedStepOnDayId?: string;
  expectedStepId?: string;
  expectedVersion?: string;
  previousEventId?: string;
};
export type JournalAck = {
  protocol: 2;
  eventId: string;
  state: "COMMITTED";
  replayed: boolean;
  operation: JournalOperation;
  serverRevision: string;
  result: { courseId: string; allCompleted: boolean; stepJustCompleted: boolean; progressVersion?: string };
};
export type JournalResponse = { success: true; ack: JournalAck };

export class OfflineMutationJournalError extends Error {
  constructor(
    public readonly code:
      | "IDEMPOTENCY_KEY_CONFLICT"
      | "JOURNAL_UNAVAILABLE"
      | "PET_NOT_FOUND"
      | "INVALID_BATCH_INPUT",
  ) {
    super(code);
    this.name = "OfflineMutationJournalError";
  }
}

type Receipt = {
  method: string;
  operation: string;
  resourceKey: string;
  payloadHash: string;
  state: string;
  responseBody: JournalResponse | PreventionJournalResponse | DailyJournalResponse | TimerJournalResponse | VideoJournalResponse | null;
};
const operationResource = (input: NewOfflinePracticeMutation) =>
  input.expectedStepOnDayId ? `training:${input.dayOnCourseId}:occurrence:${input.expectedStepOnDayId}` :
    `training:${input.dayOnCourseId}:step:${input.stepIndex}`;
// No raw user-controlled JSON hash: canonical scalar validated fields only.
const mutationHash = (input: NewOfflinePracticeMutation) =>
  createHash("sha256")
    .update(
      JSON.stringify({
        method: "POST",
        operation: input.operation,
        courseId: input.courseId,
        dayOnCourseId: input.dayOnCourseId,
        stepIndex: input.stepIndex,
        ...(input.expectedStepOnDayId && input.expectedStepId ? {
          expectedStepOnDayId: input.expectedStepOnDayId, expectedStepId: input.expectedStepId,
        } : {}),
        ...versionFields(input),
      }),
    )
    .digest("hex");

type JournalVersionBase = { expectedVersion?: string; previousEventId?: string };
function versionFields(input: JournalVersionBase): JournalVersionBase {
  return {
    ...(input.expectedVersion !== undefined ? { expectedVersion: input.expectedVersion } : {}),
    ...(input.previousEventId !== undefined ? { previousEventId: input.previousEventId } : {}),
  };
}
const validVersion = (value: unknown): value is string =>
  typeof value === "string" && /^(?:none|[0-9a-f]{64})$/.test(value);

async function resolveJournalVersion(
  rows: Readonly<OfflineMutationRowsPort>, tx: unknown, ownerId: string,
  resource: string, eventId: string, base: JournalVersionBase,
): Promise<string | undefined> {
  if (base.expectedVersion !== undefined && base.previousEventId !== undefined)
    throw new Error("STALE_PROGRESS_VERSION");
  if (base.expectedVersion !== undefined) {
    if (!validVersion(base.expectedVersion)) throw new Error("STALE_PROGRESS_VERSION");
    return base.expectedVersion;
  }
  if (base.previousEventId === undefined) return undefined;
  if (base.previousEventId === eventId) throw new Error("STALE_PROGRESS_VERSION");
  const [previous] = await rows.findPracticeReceipt<Receipt>(tx, ownerId, base.previousEventId);
  const ack = previous?.responseBody?.ack;
  const result = ack && "result" in ack ? ack.result : null;
  if (previous?.method !== "POST" || previous.resourceKey !== resource ||
      previous.state !== "COMMITTED" || ack?.state !== "COMMITTED" ||
      ack.eventId !== base.previousEventId || !result || !("progressVersion" in result) ||
      !validVersion(result.progressVersion)) throw new Error("STALE_PROGRESS_VERSION");
  return result.progressVersion;
}

function isTableAbsent(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const p = error as { code?: string; meta?: { code?: string } };
  return p.code === "P2021" || (p.code === "P2010" && p.meta?.code === "42P01");
}
function isRetryableSql(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const p = error as { code?: string; meta?: { code?: string } };
  return (
    p.code === "P2034" || p.code === "P2028" || p.meta?.code === "40P01" || p.meta?.code === "40001"
  );
}
function parseCommittedReceipt(row: Receipt, input: NewOfflinePracticeMutation): JournalResponse {
  if (
    row.method !== "POST" ||
    row.operation !== input.operation ||
    row.resourceKey !== operationResource(input) ||
    row.payloadHash !== mutationHash(input)
  ) {
    throw new OfflineMutationJournalError("IDEMPOTENCY_KEY_CONFLICT");
  }
  if (
    row.state !== "COMMITTED" ||
    !row.responseBody?.ack ||
    row.responseBody.ack.eventId !== input.eventId ||
    row.responseBody.ack.state !== "COMMITTED"
  ) {
    throw new OfflineMutationJournalError("JOURNAL_UNAVAILABLE");
  }
  return { success: true, ack: { ...(row.responseBody.ack as JournalAck), replayed: true } };
}

/** The mounted API passes its authorized occurrence through to the same
 * transaction that commits the receipt. Historical v2 request hashes remain
 * unchanged. Source-only SQL fixtures may exercise the legacy index contract. */
export async function submitNewOfflinePracticeMutation(
  input: NewOfflinePracticeMutation,
  training?: Pick<import("../training/trainingServiceContract").TrainingServiceApi, "applyStepDayAndCourseTx">,
  rowsPort?: OfflineMutationRowsPort,
  binding?: StepOccurrenceBinding,
): Promise<JournalResponse> {
  if ((input.operation === "training.complete.theory" || input.expectedStepOnDayId || input.expectedStepId) &&
      (!input.expectedStepOnDayId || !input.expectedStepId ||
       binding?.expectedCourseId !== input.courseId ||
       binding.expectedStepOnDayId !== input.expectedStepOnDayId ||
       binding.expectedStepId !== input.expectedStepId)) {
    throw new Error("STALE_STEP_BINDING");
  }
  const { withOfflineMutationTx, claimPracticeReceipt, findPracticeReceipt,
    incrementPracticeRevision, commitPracticeReceipt } = requireOfflineMutationRowsPort(rowsPort);
  const fingerprint = mutationHash(input);
  const resource = operationResource(input);
  try {
    return await withOfflineMutationTx(async (tx) => {
      // ON CONFLICT waits for a competing open transaction: no externally visible
      // RESERVED rows. Second SELECT gets a fresh READ COMMITTED snapshot.
      const claim = await claimPracticeReceipt(
        tx,
        input.ownerId,
        input.eventId,
        input.operation,
        resource,
        fingerprint,
      );
      if (claim.length === 0) {
        const existing = await findPracticeReceipt<Receipt>(tx, input.ownerId, input.eventId);
        if (!existing[0]) throw new OfflineMutationJournalError("JOURNAL_UNAVAILABLE");
        return parseCommittedReceipt(existing[0], input);
      }

      // The shared atomic use case runs inside THIS transaction.
      if (!training) throw new OfflineMutationJournalError("JOURNAL_UNAVAILABLE");
      const mutation = training;
      const expectedVersion = await resolveJournalVersion(requireOfflineMutationRowsPort(rowsPort),
        tx, input.ownerId, resource, input.eventId, input);
      if (expectedVersion !== undefined && !binding) throw new Error("STALE_STEP_BINDING");
      const progress = await mutation.applyStepDayAndCourseTx(
        tx,
        input.ownerId,
        input.dayOnCourseId,
        input.stepIndex,
        { type: "complete" },
        binding ? {
          ...binding,
          allowedStepTypes: input.operation === "training.complete.theory"
            ? ["THEORY", "DIARY"] : ["TRAINING", "PRACTICE", "BREAK"],
          journal: { expectedVersion },
        } : undefined,
      );
      if (progress.courseId !== input.courseId) throw new Error("COURSE_DAY_MISMATCH");

      const revision = await incrementPracticeRevision(tx, input.ownerId, resource);
      if (!revision[0]) throw new OfflineMutationJournalError("JOURNAL_UNAVAILABLE");
      const ack: JournalResponse = {
        success: true,
        ack: {
          protocol: 2,
          eventId: input.eventId,
          state: "COMMITTED",
          replayed: false,
          operation: input.operation,
          serverRevision: String(revision[0].revision),
          result: progress,
        },
      };
      const committed = await commitPracticeReceipt(
        tx,
        revision[0].revision,
        ack,
        claim[0].id,
        input.ownerId,
      );
      if (committed !== 1) throw new OfflineMutationJournalError("JOURNAL_UNAVAILABLE");
      return ack;
    });
  } catch (error) {
    if (error instanceof OfflineMutationJournalError) throw error;
    if (isTableAbsent(error) || isRetryableSql(error)) {
      throw new OfflineMutationJournalError("JOURNAL_UNAVAILABLE");
    }
    throw error;
  }
}

export type NewOfflineDailyCompletion = {
  ownerId: string;
  eventId: string;
  operation: "daily.complete";
  scheduleId: string;
  stepIndex: number;
  expectedBundleStepId: string;
  expectedStepId: string;
  expectedVersion?: string;
  previousEventId?: string;
};
export type DailyJournalResponse = {
  success: true;
  ack: {
    protocol: 2;
    eventId: string;
    operation: "daily.complete";
    state: "COMMITTED";
    replayed: boolean;
    serverRevision: string;
    result: { scheduleId: string; allCompleted: boolean; stepJustCompleted: boolean; progressVersion?: string };
  };
};
export type DailyJournalPort = (
  tx: unknown, ownerId: string, scheduleId: string, stepIndex: number,
  operation: StepOperation,
  binding: { expectedBundleStepId: string; expectedStepId: string; journal?: { expectedVersion?: string; recordedAt?: number } },
) => Promise<{ allCompleted: boolean; stepJustCompleted: boolean; progressVersion?: string }>;

export async function submitNewOfflineDailyCompletion(
  input: NewOfflineDailyCompletion, apply: DailyJournalPort | undefined,
  rowsPort?: OfflineMutationRowsPort,
): Promise<DailyJournalResponse> {
  if (!apply) throw new OfflineMutationJournalError("JOURNAL_UNAVAILABLE");
  const rows = requireOfflineMutationRowsPort(rowsPort);
  const resource = `daily:${input.scheduleId}:occurrence:${input.expectedBundleStepId}`;
  const fingerprint = createHash("sha256").update(JSON.stringify({
    method: "POST", operation: input.operation, scheduleId: input.scheduleId,
    stepIndex: input.stepIndex, expectedBundleStepId: input.expectedBundleStepId,
    expectedStepId: input.expectedStepId,
    ...versionFields(input),
  })).digest("hex");
  try {
    return await rows.withOfflineMutationTx(async tx => {
      const claim = await rows.claimPracticeReceipt(tx, input.ownerId, input.eventId, input.operation, resource, fingerprint);
      if (!claim[0]) {
        const [stored] = await rows.findPracticeReceipt<Receipt>(tx, input.ownerId, input.eventId);
        if (!stored) throw new OfflineMutationJournalError("JOURNAL_UNAVAILABLE");
        if (stored.method !== "POST" || stored.operation !== input.operation ||
            stored.resourceKey !== resource || stored.payloadHash !== fingerprint)
          throw new OfflineMutationJournalError("IDEMPOTENCY_KEY_CONFLICT");
        const ack = stored.responseBody?.ack;
        if (stored.state !== "COMMITTED" || ack?.operation !== input.operation ||
            ack.state !== "COMMITTED" || ack.eventId !== input.eventId ||
            ack.result.scheduleId !== input.scheduleId)
          throw new OfflineMutationJournalError("JOURNAL_UNAVAILABLE");
        return { success: true, ack: { ...ack, replayed: true } };
      }
      const expectedVersion = await resolveJournalVersion(rows, tx, input.ownerId, resource, input.eventId, input);
      const progress = await apply(tx, input.ownerId, input.scheduleId, input.stepIndex, { type: "complete" }, {
        expectedBundleStepId: input.expectedBundleStepId, expectedStepId: input.expectedStepId, journal: { expectedVersion },
      });
      const [revision] = await rows.incrementPracticeRevision(tx, input.ownerId, resource);
      if (!revision) throw new OfflineMutationJournalError("JOURNAL_UNAVAILABLE");
      const response: DailyJournalResponse = {
        success: true, ack: { protocol: 2, eventId: input.eventId, operation: input.operation,
          state: "COMMITTED", replayed: false, serverRevision: String(revision.revision),
          result: { scheduleId: input.scheduleId, ...progress } },
      };
      if (await rows.commitPracticeReceipt(tx, revision.revision, response, claim[0].id, input.ownerId) !== 1)
        throw new OfflineMutationJournalError("JOURNAL_UNAVAILABLE");
      return response;
    });
  } catch (error) {
    if (error instanceof OfflineMutationJournalError) throw error;
    if (isTableAbsent(error) || isRetryableSql(error)) throw new OfflineMutationJournalError("JOURNAL_UNAVAILABLE");
    throw error;
  }
}

type TimerCommon = JournalVersionBase & {
  ownerId: string; eventId: string; stepIndex: number;
  expectedStepId: string; action: "start" | "pause" | "resume" | "reset";
  remainingSec?: number; recordedAt: number;
};
export type NewOfflineTimerMutation = TimerCommon & (
  | { operation: "training.timer"; courseId: string; dayOnCourseId: string; expectedStepOnDayId: string }
  | { operation: "daily.timer"; scheduleId: string; expectedBundleStepId: string }
);
export type TimerJournalResponse = {
  success: true;
  ack: {
    protocol: 2; eventId: string; operation: NewOfflineTimerMutation["operation"];
    state: "COMMITTED"; replayed: boolean; serverRevision: string;
    result: { courseId?: string; scheduleId?: string; progressVersion: string; allCompleted: boolean; stepJustCompleted: boolean };
  };
};
export async function submitNewOfflineTimerMutation(
  input: NewOfflineTimerMutation,
  training: Pick<import("../training/trainingServiceContract").TrainingServiceApi, "applyStepDayAndCourseTx">,
  daily: DailyJournalPort | undefined,
  rowsPort: OfflineMutationRowsPort | undefined,
  binding?: StepOccurrenceBinding,
): Promise<TimerJournalResponse> {
  const needsTime = input.action === "start" || input.action === "pause";
  if (!Number.isSafeInteger(input.recordedAt) || input.recordedAt <= 0 ||
      input.recordedAt > Date.now() + 5 * 60_000 ||
      (needsTime ? !Number.isSafeInteger(input.remainingSec) || input.remainingSec! < 0 || input.remainingSec! > 86400
        : input.remainingSec !== undefined) ||
      Boolean(input.expectedVersion) === Boolean(input.previousEventId))
    throw new Error("INVALID_STATE: invalid offline timer");
  if (input.operation === "training.timer" &&
      (!binding || binding.expectedCourseId !== input.courseId ||
        binding.expectedStepOnDayId !== input.expectedStepOnDayId || binding.expectedStepId !== input.expectedStepId))
    throw new Error("STALE_STEP_BINDING");
  if (input.operation === "daily.timer" && !daily)
    throw new OfflineMutationJournalError("JOURNAL_UNAVAILABLE");
  const rows = requireOfflineMutationRowsPort(rowsPort);
  const scope = input.operation === "training.timer"
    ? { courseId: input.courseId, dayOnCourseId: input.dayOnCourseId, expectedStepOnDayId: input.expectedStepOnDayId }
    : { scheduleId: input.scheduleId, expectedBundleStepId: input.expectedBundleStepId };
  const resource = input.operation === "training.timer"
    ? `training:${input.dayOnCourseId}:occurrence:${input.expectedStepOnDayId}`
    : `daily:${input.scheduleId}:occurrence:${input.expectedBundleStepId}`;
  const fingerprint = createHash("sha256").update(JSON.stringify({
    method: "POST", operation: input.operation, ...scope, stepIndex: input.stepIndex,
    expectedStepId: input.expectedStepId, action: input.action, recordedAt: input.recordedAt,
    ...(needsTime ? { remainingSec: input.remainingSec } : {}), ...versionFields(input),
  })).digest("hex");
  try {
    return await rows.withOfflineMutationTx(async tx => {
      const claim = await rows.claimPracticeReceipt(tx, input.ownerId, input.eventId, input.operation, resource, fingerprint);
      if (!claim[0]) {
        const [stored] = await rows.findPracticeReceipt<Receipt>(tx, input.ownerId, input.eventId);
        if (!stored) throw new OfflineMutationJournalError("JOURNAL_UNAVAILABLE");
        if (stored.method !== "POST" || stored.operation !== input.operation ||
            stored.resourceKey !== resource || stored.payloadHash !== fingerprint)
          throw new OfflineMutationJournalError("IDEMPOTENCY_KEY_CONFLICT");
        const ack = stored.responseBody?.ack;
        if (stored.state !== "COMMITTED" || ack?.operation !== input.operation ||
            ack.state !== "COMMITTED" || ack.eventId !== input.eventId || !validVersion(ack.result.progressVersion))
          throw new OfflineMutationJournalError("JOURNAL_UNAVAILABLE");
        return { success: true, ack: { ...ack, replayed: true } };
      }
      const expectedVersion = await resolveJournalVersion(rows, tx, input.ownerId, resource, input.eventId, input);
      if (expectedVersion === undefined) throw new Error("STALE_PROGRESS_VERSION");
      const journal = { expectedVersion, recordedAt: input.recordedAt };
      const operation: StepOperation = input.action === "start" || input.action === "pause"
        ? { type: input.action, remainingSec: input.remainingSec! }
        : { type: input.action };
      const progress = input.operation === "training.timer"
        ? await training.applyStepDayAndCourseTx(tx, input.ownerId, input.dayOnCourseId, input.stepIndex, operation, {
            ...binding!, allowedStepTypes: ["TRAINING", "PRACTICE", "BREAK"], journal,
          })
        : await daily!(tx, input.ownerId, input.scheduleId, input.stepIndex, operation, {
            expectedBundleStepId: input.expectedBundleStepId, expectedStepId: input.expectedStepId, journal,
          });
      if (!validVersion(progress.progressVersion)) throw new OfflineMutationJournalError("JOURNAL_UNAVAILABLE");
      const [revision] = await rows.incrementPracticeRevision(tx, input.ownerId, resource);
      if (!revision) throw new OfflineMutationJournalError("JOURNAL_UNAVAILABLE");
      const result: TimerJournalResponse = { success: true, ack: {
        protocol: 2, eventId: input.eventId, operation: input.operation, state: "COMMITTED", replayed: false,
        serverRevision: String(revision.revision),
        result: { ...(input.operation === "training.timer" ? { courseId: input.courseId } : { scheduleId: input.scheduleId }),
          allCompleted: progress.allCompleted, stepJustCompleted: progress.stepJustCompleted, progressVersion: progress.progressVersion },
      } };
      if (await rows.commitPracticeReceipt(tx, revision.revision, result, claim[0].id, input.ownerId) !== 1)
        throw new OfflineMutationJournalError("JOURNAL_UNAVAILABLE");
      return result;
    });
  } catch (error) {
    if (error instanceof OfflineMutationJournalError) throw error;
    if (isTableAbsent(error) || isRetryableSql(error)) throw new OfflineMutationJournalError("JOURNAL_UNAVAILABLE");
    throw error;
  }
}

export type NewOfflineVideoProgress = JournalVersionBase & {
  ownerId:string; eventId:string; operation:"video.progress"; videoId:string; positionSec:number;
};
export type VideoJournalResult = { videoId:string; lastPositionSec:number; progressVersion:string };
export type VideoJournalPort = (tx:unknown,ownerId:string,videoId:string,positionSec:number,expectedVersion:string)=>Promise<VideoJournalResult>;
export type VideoJournalResponse = {
  success:true;
  ack:{protocol:2;eventId:string;operation:"video.progress";state:"COMMITTED";replayed:boolean;serverRevision:string;result:VideoJournalResult};
};

export async function submitNewOfflineVideoProgress(
  input:NewOfflineVideoProgress, apply:VideoJournalPort|undefined, rowsPort?:OfflineMutationRowsPort,
):Promise<VideoJournalResponse>{
  if (!apply) throw new OfflineMutationJournalError("JOURNAL_UNAVAILABLE");
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(input.videoId) || !Number.isSafeInteger(input.positionSec) ||
      input.positionSec<0 || input.positionSec>2073600 ||
      Boolean(input.expectedVersion)===Boolean(input.previousEventId)) throw new Error("INVALID_STATE: invalid video position");
  const rows=requireOfflineMutationRowsPort(rowsPort);
  const resource="video:"+input.videoId;
  const fingerprint=createHash("sha256").update(JSON.stringify({
    method:"POST",operation:input.operation,videoId:input.videoId,positionSec:input.positionSec,...versionFields(input),
  })).digest("hex");
  try{
    return await rows.withOfflineMutationTx(async tx=>{
      const [claim]=await rows.claimPracticeReceipt(tx,input.ownerId,input.eventId,input.operation,resource,fingerprint);
      if(!claim){
        const [stored]=await rows.findPracticeReceipt<Receipt>(tx,input.ownerId,input.eventId);
        if(!stored)throw new OfflineMutationJournalError("JOURNAL_UNAVAILABLE");
        if(stored.method!=="POST"||stored.operation!==input.operation||stored.resourceKey!==resource||stored.payloadHash!==fingerprint)
          throw new OfflineMutationJournalError("IDEMPOTENCY_KEY_CONFLICT");
        const ack=stored.responseBody?.ack;
        if(stored.state!=="COMMITTED"||ack?.operation!==input.operation||ack.state!=="COMMITTED"||
          ack.eventId!==input.eventId||ack.result.videoId!==input.videoId||!validVersion(ack.result.progressVersion))
          throw new OfflineMutationJournalError("JOURNAL_UNAVAILABLE");
        return {success:true,ack:{...ack,replayed:true}};
      }
      const expected=await resolveJournalVersion(rows,tx,input.ownerId,resource,input.eventId,input);
      if(!expected)throw new Error("STALE_PROGRESS_VERSION");
      const result=await apply(tx,input.ownerId,input.videoId,input.positionSec,expected);
      if(result.videoId!==input.videoId||result.lastPositionSec!==input.positionSec||!validVersion(result.progressVersion))
        throw new OfflineMutationJournalError("JOURNAL_UNAVAILABLE");
      const [revision]=await rows.incrementPracticeRevision(tx,input.ownerId,resource);
      if(!revision)throw new OfflineMutationJournalError("JOURNAL_UNAVAILABLE");
      const response:VideoJournalResponse={success:true,ack:{protocol:2,eventId:input.eventId,operation:input.operation,
        state:"COMMITTED",replayed:false,serverRevision:String(revision.revision),result}};
      if(await rows.commitPracticeReceipt(tx,revision.revision,response,claim.id,input.ownerId)!==1)
        throw new OfflineMutationJournalError("JOURNAL_UNAVAILABLE");
      return response;
    });
  }catch(error){
    if(error instanceof OfflineMutationJournalError)throw error;
    if(isTableAbsent(error)||isRetryableSql(error))throw new OfflineMutationJournalError("JOURNAL_UNAVAILABLE");
    throw error;
  }
}

export async function findNewOfflineMutationReceipt(
  ownerId: string,
  eventId: string,
  rowsPort?: OfflineMutationRowsPort,
): Promise<JournalResponse | PreventionJournalResponse | DailyJournalResponse | TimerJournalResponse | VideoJournalResponse | null> {
  const { lookupOfflineMutationReceipt } = requireOfflineMutationRowsPort(rowsPort);
  try {
    const rows = await lookupOfflineMutationReceipt<Pick<Receipt, "state" | "responseBody">>(
      ownerId,
      eventId,
    );
    const row = rows[0];
    if (!row) return null;
    if (
      row.state !== "COMMITTED" ||
      !row.responseBody?.ack ||
      row.responseBody.ack.eventId !== eventId
    )
      throw new OfflineMutationJournalError("JOURNAL_UNAVAILABLE");
    if (row.responseBody.ack.operation === "prevention.batch") {
      return {
        success: true,
        ack: { ...row.responseBody.ack, replayed: true },
      } as PreventionJournalResponse;
    }
    if (row.responseBody.ack.operation === "daily.complete") {
      return { success: true, ack: { ...row.responseBody.ack, replayed: true } } as DailyJournalResponse;
    }
    if (row.responseBody.ack.operation === "training.timer" || row.responseBody.ack.operation === "daily.timer")
      return { success: true, ack: { ...row.responseBody.ack, replayed: true } } as TimerJournalResponse;
    if (row.responseBody.ack.operation === "video.progress")
      return { success: true, ack: { ...row.responseBody.ack, replayed: true } } as VideoJournalResponse;
    return { success: true, ack: { ...row.responseBody.ack, replayed: true } } as JournalResponse;
  } catch (error) {
    if (error instanceof OfflineMutationJournalError) throw error;
    if (isTableAbsent(error) || isRetryableSql(error))
      throw new OfflineMutationJournalError("JOURNAL_UNAVAILABLE");
    throw error;
  }
}

/** AG4 method-scope receipt ebcfd43: NEW-only v2 prevention batch. */
export type NewOfflinePreventionItem = {
  eventId: string; // UUIDv4 per-item, NOT historical/native queue identifier
  clientId: string; // UUIDv4 immutable (petId,clientId) key
  type: "VACCINATION" | "DEWORMING" | "TICKS_FLEAS";
  performedAt: string;
  productName?: string;
  notes?: string;
  reminderEnabled?: boolean;
  reminderKind?: "AFTER_DAYS" | "ON_DATE";
  reminderDaysAfter?: number | null;
  reminderOnDate?: string | null;
  reminderTimes?: string[];
};
export type NewOfflinePreventionBatch = {
  ownerId: string;
  eventId: string; // parent receipt UUIDv4
  operation: "prevention.batch";
  petId: string;
  entries: NewOfflinePreventionItem[];
};
export type PreventionItemAck = {
  eventId: string;
  clientId: string;
  state: "COMMITTED";
  result: "CREATED";
  serverRowId: string;
};
export type PreventionJournalResponse = {
  success: true;
  ack: {
    protocol: 2;
    eventId: string;
    operation: "prevention.batch";
    state: "COMMITTED";
    replayed: boolean;
    serverRevision: string;
    items: PreventionItemAck[];
  };
};

const OFF021_UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
function canonicalPreventionItem(entry: BatchEntryInput): Record<string, unknown> {
  return {
    clientId: entry.clientId,
    type: entry.type,
    performedAt: entry.performedAt.toISOString(),
    productName: entry.productName ?? null,
    notes: entry.notes ?? null,
    reminderEnabled: entry.reminderEnabled ?? true,
    reminderKind: entry.reminderKind ?? "AFTER_DAYS",
    reminderDaysAfter: entry.reminderDaysAfter ?? null,
    reminderOnDate: entry.reminderOnDate?.toISOString() ?? null,
    reminderTimes: entry.reminderTimes ?? ["09:00"],
  };
}
function preventionHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

/**
 * Exactly one SQL transaction binds all new PetPreventionEntry rows,
 * immutable per-clientId bindings, resource revision and stored per-item ACK.
 * A new batch with ANY preexisting bound/unbound clientId is a 409 with NO ACK.
 * No legacy upsert, no nested $transaction, no history adoption or replay.
 */
export async function submitNewOfflinePreventionBatch(
  input: NewOfflinePreventionBatch,
  rowsPort?: OfflineMutationRowsPort,
  preventionRows?: PreventionRowsPort,
): Promise<PreventionJournalResponse> {
  const { withOfflineMutationTx, lockOwnedPreventionPet, claimPreventionReceipt,
    findPreventionReceipt, findPreventionBoundClient, readPreventionClientRow,
    persistPreventionClientBinding, incrementPreventionRevision,
    commitPreventionReceipt } = requireOfflineMutationRowsPort(rowsPort);
  const seenClient = new Set<string>();
  const seenItemEvent = new Set<string>();
  if (
    !OFF021_UUID_V4.test(input.eventId) ||
    input.operation !== "prevention.batch" ||
    !input.petId ||
    input.petId.length > 128 ||
    input.entries.length < 1 ||
    input.entries.length > 50
  ) {
    throw new OfflineMutationJournalError("INVALID_BATCH_INPUT");
  }
  for (const item of input.entries) {
    if (
      !OFF021_UUID_V4.test(item.eventId) ||
      !OFF021_UUID_V4.test(item.clientId) ||
      seenClient.has(item.clientId) ||
      seenItemEvent.has(item.eventId)
    ) {
      throw new OfflineMutationJournalError("INVALID_BATCH_INPUT");
    }
    seenClient.add(item.clientId);
    seenItemEvent.add(item.eventId);
  }
  // Reuse existing validation and reminder-normalization, not historical writes.
  const entries = batchRequestSchema.parse({
    entries: input.entries.map((i) => ({
      ...i,
      performedAt: new Date(i.performedAt),
      reminderOnDate: i.reminderOnDate == null ? i.reminderOnDate : new Date(i.reminderOnDate),
    })),
  }).entries;
  const normalized = input.entries.map((i, n) => ({
    eventId: i.eventId,
    ...canonicalPreventionItem(entries[n]!),
  }));
  const fingerprint = preventionHash({
    method: "POST",
    operation: input.operation,
    petId: input.petId,
    entries: normalized,
  });
  const resource = "prevention:" + input.petId;
  try {
    return await withOfflineMutationTx(async (tx) => {
      // Every request, including duplicate ACK lookup, needs current pet ownership.
      // Row lock serializes independent eventIds on the same pet.
      const owned = await lockOwnedPreventionPet(tx, input.petId, input.ownerId);
      if (owned.length !== 1) throw new OfflineMutationJournalError("PET_NOT_FOUND");

      // Unique claim is uncommitted until ALL business rows and ACK commit.
      const receiptId = randomUUID();
      const claim = await claimPreventionReceipt(
        tx,
        receiptId,
        input.ownerId,
        input.eventId,
        resource,
        fingerprint,
      );
      if (!claim.length) {
        const rows = await findPreventionReceipt<Receipt>(tx, input.ownerId, input.eventId);
        const row = rows[0];
        if (!row) throw new OfflineMutationJournalError("JOURNAL_UNAVAILABLE");
        if (
          row.method !== "POST" ||
          row.operation !== "prevention.batch" ||
          row.resourceKey !== resource ||
          row.payloadHash !== fingerprint
        ) {
          throw new OfflineMutationJournalError("IDEMPOTENCY_KEY_CONFLICT");
        }
        const stored = row.responseBody as PreventionJournalResponse | null;
        if (
          row.state !== "COMMITTED" ||
          stored?.ack.operation !== "prevention.batch" ||
          stored.ack.eventId !== input.eventId ||
          stored.ack.state !== "COMMITTED" ||
          stored.ack.items.length !== entries.length
        ) {
          throw new OfflineMutationJournalError("JOURNAL_UNAVAILABLE");
        }
        return {
          success: true,
          ack: { ...stored.ack, replayed: true },
        } as PreventionJournalResponse;
      }

      const { createNewPreventionEntryTx } = await import("../petPrevention/petPreventionService");
      const itemAcks: PreventionItemAck[] = [];
      for (let index = 0; index < entries.length; index++) {
        const item = input.entries[index]!;
        const normalizedItem = normalized[index];
        // New v2 never accepts a legacy/unbound clientId or updates it.
        const bound = await findPreventionBoundClient(tx, input.petId, item.clientId);
        if (bound.length) throw new OfflineMutationJournalError("IDEMPOTENCY_KEY_CONFLICT");
        const oldRow = await readPreventionClientRow(tx, input.petId, item.clientId);
        if (oldRow) throw new OfflineMutationJournalError("IDEMPOTENCY_KEY_CONFLICT");
        const created = await createNewPreventionEntryTx(
          tx,
          input.ownerId,
          input.petId,
          entries[index]!,
          preventionRows,
        );
        await persistPreventionClientBinding(
          tx,
          input.ownerId,
          input.petId,
          item.clientId,
          preventionHash(normalizedItem),
          receiptId,
        );
        itemAcks.push({
          eventId: item.eventId,
          clientId: item.clientId,
          state: "COMMITTED",
          result: "CREATED",
          serverRowId: created.id,
        });
      }
      const rev = await incrementPreventionRevision(tx, input.ownerId, resource);
      if (!rev[0]) throw new OfflineMutationJournalError("JOURNAL_UNAVAILABLE");
      const ack: PreventionJournalResponse = {
        success: true,
        ack: {
          protocol: 2,
          eventId: input.eventId,
          operation: "prevention.batch",
          state: "COMMITTED",
          replayed: false,
          serverRevision: String(rev[0].revision),
          items: itemAcks,
        },
      };
      const committed = await commitPreventionReceipt(
        tx,
        rev[0].revision,
        ack,
        receiptId,
        input.ownerId,
      );
      if (committed !== 1) throw new OfflineMutationJournalError("JOURNAL_UNAVAILABLE");
      return ack;
    });
  } catch (error) {
    if (error instanceof OfflineMutationJournalError) throw error;
    const e = error as { code?: string };
    if (e?.code === "P2002") throw new OfflineMutationJournalError("IDEMPOTENCY_KEY_CONFLICT");
    if (isRetryableSql(error) || isTableAbsent(error))
      throw new OfflineMutationJournalError("JOURNAL_UNAVAILABLE");
    throw error;
  }
}
