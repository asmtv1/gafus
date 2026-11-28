import type { GafusSettingsConfig, GafusTx } from "../gafus/types";

/** SQL-free projection of the admin transaction. All operations use the SAME
 * persistence transaction; Core must never start its own transaction here. */
export type GafusAdminFraudStatus = "OPEN" | "RESOLVED" | "DISMISSED";
export type GafusAdminAuditDraft = {
  actorId: string;
  action: string;
  reason: string;
  targetUserId?: string | null;
  transactionId?: string | null;
  before?: unknown;
  after?: unknown;
};
export interface GafusAdminRows {
  readonly rawTx: GafusTx;
  actorRole(actorId: string): Promise<{ role: string } | null>;
  lockSettings(): Promise<void>;
  upsertSettings(next: GafusSettingsConfig, actorId: string): Promise<unknown>;
  appendSettingsRevision(revision: number, actorId: string, snapshot: GafusSettingsConfig): Promise<unknown>;
  appendAudit(draft: GafusAdminAuditDraft): Promise<unknown>;
  findTransactionByKey(key: string): Promise<{
    id: string; userId: string; delta: number; adminActorId: string | null;
    reason: string | null; balanceAfter: number;
  } | null>;
  walletBalance(userId: string): Promise<{ balance: number } | null>;
  annotateTransaction(transactionId: string, adminActorId: string, reason: string): Promise<unknown>;
  walletTotals(): Promise<{ _count: { _all: number }; _sum: { balance: number | null } }>;
  ledgerTotals(): Promise<{
    kind: string; _sum: { delta: number | null }; _count: { _all: number };
  }[]>;
  countOpenFraud(): Promise<number>;
  listFraudSignals(status?: GafusAdminFraudStatus): Promise<{
    id: string; userId: string; severity: string; status: string; kind: string;
    entityType: string | null; entityId: string | null; metadata: unknown;
    createdAt: Date; resolvedAt: Date | null; resolvedById: string | null;
  }[]>;
  findFraudSignal(id: string): Promise<{ id: string; userId: string; status: GafusAdminFraudStatus } | null>;
  updateOpenFraudSignal(id: string, status: GafusAdminFraudStatus, actorId: string): Promise<{ count: number }>;
}
export interface GafusAdminRowsPort {
  withTransaction<T>(operation: (rows: GafusAdminRows) => Promise<T>,
    options?: { maxWait: number; timeout: number }): Promise<T>;
}
export function withGafusAdminRows<T>(operation: (rows: GafusAdminRows) => Promise<T>,
  options?: { maxWait: number; timeout: number }, port?: GafusAdminRowsPort): Promise<T> {
  if (!port) throw new Error("GAFUS_ADMIN_ROWS_PORT_UNBOUND");
  return port.withTransaction(operation, options);
}
