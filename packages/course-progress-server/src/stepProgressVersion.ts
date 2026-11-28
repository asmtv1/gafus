import { createHash } from "node:crypto";

type ProgressRow = {
  id: string;
  status: string;
  paused?: boolean;
  remainingSec?: number | null;
  updatedAt?: Date;
};

/** Opaque snapshot of the persisted row, not a client clock or step index.
 * Unknown legacy projections cannot authorize a conditional write. */
export function stepProgressVersion(row: ProgressRow | null | undefined): string | undefined {
  if (!row) return "none";
  if (!(row.updatedAt instanceof Date) || !Number.isFinite(row.updatedAt.getTime()) ||
      typeof row.paused !== "boolean") return undefined;
  return createHash("sha256").update(JSON.stringify([
    row.id, row.status, row.paused, row.remainingSec ?? null, row.updatedAt.toISOString(),
  ])).digest("hex");
}

export function assertStepProgressVersion(row: ProgressRow | null, expected: string | undefined): void {
  if (expected !== undefined && stepProgressVersion(row) !== expected) {
    throw new Error("STALE_PROGRESS_VERSION");
  }
}

/** Client time can only shorten an existing countdown. It never increases access,
 * awards a completion, or permits overwriting a changed server version. */
export function remainingAfterOfflineDelay(remainingSec: number, recordedAt: number, now = Date.now()): number {
  return Math.max(0, remainingSec - Math.max(0, Math.floor((now - recordedAt) / 1000)));
}
