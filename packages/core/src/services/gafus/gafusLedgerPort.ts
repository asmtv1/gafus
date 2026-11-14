import type { GafusLedgerMetadata } from "@gafus/types";
import type { GafusTx } from "./types";

/** Core-facing, transaction-local wallet row projections. The DB still owns
 * balance CAS (including >= amount), idempotency UNIQUE and owner-scoped
 * history ordering. The caller MUST acquire the same PostgreSQL wallet lock.
 */
export type GafusLedgerKind = "EARN" | "SPEND" | "ADMIN_CREDIT" | "ADMIN_DEBIT" | "LEGACY_IMPORT";
export type GafusLedgerRewardKind = "POST_PUBLISHED" | "QUESTION_CREATED" | "ANSWER_CREATED" | "POST_REACTION_MILESTONE" | "BEST_ANSWER";
export type GafusLedgerTargetType = "COURSE_STEP" | "MINI_GUIDE" | "ARTICLE";
export interface GafusLedgerAppend {
  userId: string;
  kind: GafusLedgerKind;
  delta: number;
  balanceBefore: number;
  balanceAfter: number;
  idempotencyKey: string;
  rewardKind?: GafusLedgerRewardKind;
  sourceEntityType?: string;
  sourceEntityId?: string;
  targetType?: GafusLedgerTargetType;
  targetKey?: string;
  settingsRevision?: number;
  metadata?: GafusLedgerMetadata;
}
export interface GafusLedgerReplayRow {
  id: string;
  userId: string;
  delta: number;
  kind: GafusLedgerKind;
  targetKey: string | null;
  balanceAfter: number;
}
export interface GafusLedgerHistoryRow {
  id: string;
  kind: GafusLedgerKind;
  delta: number;
  balanceAfter: number;
  createdAt: Date;
  rewardKind: GafusLedgerRewardKind | null;
  sourceEntityType: string | null;
  sourceEntityId: string | null;
  targetKey: string | null;
}
export interface GafusLedgerRowsPort {
  ensureWalletRow(tx: GafusTx, userId: string): Promise<{ balance: number }>;
  findLedgerEntry(tx: GafusTx, idempotencyKey: string): Promise<GafusLedgerReplayRow | null>;
  updateWalletBalanceRow(tx: GafusTx, userId: string, delta: number): Promise<{ count: number }>;
  appendLedgerEntry(tx: GafusTx, entry: GafusLedgerAppend): Promise<{ id: string }>;
  readWalletBalanceRow(userId: string): Promise<{ balance: number } | null>;
  readWalletLedgerRows(userId: string, cursor: string | undefined, limit: number): Promise<GafusLedgerHistoryRow[]>;
}
let installedGafusLedgerPort: Readonly<GafusLedgerRowsPort> | null = null;
export function registerGafusLedgerRowsPort(port: GafusLedgerRowsPort): void {
  if (installedGafusLedgerPort !== null && installedGafusLedgerPort !== port) {
    throw new Error("GAFUS_LEDGER_PORT_ALREADY_BOUND");
  }
  installedGafusLedgerPort = port;
}
export function requireGafusLedgerRowsPort(): Readonly<GafusLedgerRowsPort> {
  if (!installedGafusLedgerPort) throw new Error("GAFUS_LEDGER_PORT_UNBOUND");
  return installedGafusLedgerPort;
}
