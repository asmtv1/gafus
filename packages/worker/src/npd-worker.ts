import { decryptRefreshToken, encryptRefreshToken, NpdGateway, NpdGatewayError } from "@gafus/npd";
import { createWorkerLogger } from "@gafus/logger";
import {
  persistNpdIssuedReceipt as persistIssuedReceipt,
  persistNpdRefreshedConnection,
  getNpdWorkerDatabase,
  reconciliationMatches,
  buildNpdCreateReceiptPayload,
  processDueNpdReceiptOperationsCore,
  NPD_RECONCILIATION_WINDOW_MS,
  type NpdReceiptWorkerDb as Db,
  type NpdClaimedOperation as Operation,
} from "@gafus/core/services/appSubscription";

export { reconciliationMatches } from "@gafus/core/services/appSubscription";

const logger = createWorkerLogger("npd-worker");



function enabled() {
  return process.env.NPD_PROCESSING_ENABLED === "true";
}

function safeError(error: unknown) {
  if (error instanceof NpdGatewayError) return { code: error.code, message: error.message.slice(0, 512) };
  return { code: "INTERNAL", message: "NPD operation failed" };
}

async function requireGateway(db: Db, op: Operation) {
  const connection = op.receipt.connection;
  if (!connection?.fiscalizationStartedAt || connection.status !== "ACTIVE") {
    throw new NpdGatewayError("UNAVAILABLE", "NPD connection is not active");
  }
  const refreshToken = decryptRefreshToken({ cipher: connection.refreshTokenCipher, iv: connection.refreshTokenIv, tag: connection.refreshTokenTag, keyVersion: connection.refreshTokenKeyVersion });
  const gateway = new NpdGateway({ deviceId: connection.deviceId, timeoutMs: Number(process.env.NPD_REQUEST_TIMEOUT_MS ?? 10_000) });
  const tokens = await gateway.refresh(refreshToken);
  const profile = await gateway.getProfile();
  if (profile.inn !== connection.inn) throw new NpdGatewayError("UNAUTHORIZED", "NPD profile INN mismatch");
  const encrypted = encryptRefreshToken(tokens.refreshToken);
  await persistNpdRefreshedConnection(db, connection.id, encrypted);
  return gateway;
}

/**
 * A timed-out create is never sent a second time. We only bind it when the
 * history has exactly one receipt that proves it came from this device and
 * matches every immutable receipt field. Zero or multiple matches stay in
 * review; this is intentionally more conservative than a retry.
 */
async function reconcileAmbiguousCreate(db: Db, op: Operation): Promise<boolean> {
  const gateway = await requireGateway(db, op);
  const receipts = await gateway.listRecentReceipts({ from: new Date(op.receipt.operationAt.getTime() - NPD_RECONCILIATION_WINDOW_MS) });
  const matches = reconciliationMatches(op, receipts);
  if (matches.length !== 1) return false;
  const verified = await gateway.getReceipt(op.receipt.connection.inn, matches[0].receiptUuid);
  if (verified.cancelled) return false;
  await persistIssuedReceipt(db, op, verified);
  return true;
}





/** Worker is only the provider/queue/crypto transport adapter. */
export async function processDueNpdReceiptOperations(params: { batchSize?: number; db?: Db } = {}) {
  const db = params.db ?? getNpdWorkerDatabase();
  return processDueNpdReceiptOperationsCore(db, {
    safeError,
    onCrash(error, op) {
      logger.error("NPD operation crashed", error as Error, { operationId: op.id, type: op.type });
    },
    reconcile: reconcileAmbiguousCreate,
    async create(db, op) {
      const gateway = await requireGateway(db, op);
      return gateway.createReceipt(buildNpdCreateReceiptPayload(op));
    },
    async cancel(db, op) {
      const receiptId = op.receipt.providerReceiptId;
      if (!receiptId) throw new NpdGatewayError("AMBIGUOUS_WRITE", "Missing confirmed receipt identifier");
      const gateway = await requireGateway(db, op);
      const existing = await gateway.getReceipt(op.receipt.connection.inn, receiptId);
      if (!existing.cancelled) {
        await gateway.cancelReceipt({
          receiptUuid: receiptId, reason: "REFUND", comment: "Возврат средств",
        });
      }
      const confirmed = await gateway.getReceipt(op.receipt.connection.inn, receiptId);
      if (!confirmed.cancelled) throw new NpdGatewayError("AMBIGUOUS_WRITE", "NPD cancellation was not confirmed");
    },
  }, {
    batchSize: params.batchSize ?? Number(process.env.NPD_BATCH_SIZE ?? 20),
    enabled: enabled(),
  });
}
