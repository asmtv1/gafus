/** Database-independent value contracts: all SQL implementation types are owned by Persistence.
 * Prisma delegate promises are represented as ordinary promises; database
 * transactions are opaque and must be passed unchanged to the server adapter. */

export type OfflineMutationTx = unknown;
export interface OfflineMutationRowsPort {
    withOfflineMutationTx: <T>(fn: (tx: OfflineMutationTx) => Promise<T>) => Promise<T>;
    claimPracticeReceipt: (tx: OfflineMutationTx, ownerId: string, eventId: string, operation: string, resource: string, fingerprint: string) => Promise<{
        id: string;
    }[]>;
    findPracticeReceipt: <R>(tx: OfflineMutationTx, ownerId: string, eventId: string) => Promise<R[]>;
    incrementPracticeRevision: (tx: OfflineMutationTx, ownerId: string, resource: string) => Promise<{
        revision: bigint;
    }[]>;
    commitPracticeReceipt: (tx: OfflineMutationTx, revision: bigint, ack: unknown, claimId: string, ownerId: string) => Promise<number>;
    lookupOfflineMutationReceipt: <R>(ownerId: string, eventId: string) => Promise<R[]>;
    lockOwnedPreventionPet: (tx: OfflineMutationTx, petId: string, ownerId: string) => Promise<{
        id: string;
    }[]>;
    claimPreventionReceipt: (tx: OfflineMutationTx, receiptId: string, ownerId: string, eventId: string, resource: string, fingerprint: string) => Promise<{
        id: string;
    }[]>;
    findPreventionReceipt: <R>(tx: OfflineMutationTx, ownerId: string, eventId: string) => Promise<R[]>;
    findPreventionBoundClient: (tx: OfflineMutationTx, petId: string, clientId: string) => Promise<{
        id: string;
    }[]>;
    readPreventionClientRow: (tx: OfflineMutationTx, petId: string, clientId: string) => Promise<{
        id: string;
    } | null>;
    persistPreventionClientBinding: (tx: OfflineMutationTx, ownerId: string, petId: string, clientId: string, payloadHash: string, receiptId: string) => Promise<number>;
    incrementPreventionRevision: (tx: OfflineMutationTx, ownerId: string, resource: string) => Promise<{
        revision: bigint;
    }[]>;
    commitPreventionReceipt: (tx: OfflineMutationTx, revision: bigint, ack: unknown, receiptId: string, ownerId: string) => Promise<number>;
}
export function requireOfflineMutationRowsPort(port: OfflineMutationRowsPort | undefined): Readonly<OfflineMutationRowsPort> {
  if (!port) throw new Error("OFFLINE_MUTATION_ROWS_PORT_UNBOUND");
  return port;
}
