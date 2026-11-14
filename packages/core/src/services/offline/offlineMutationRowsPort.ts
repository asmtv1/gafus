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
let installed: Readonly<OfflineMutationRowsPort> | null = null;
export function registerOfflineMutationRowsPort(port: OfflineMutationRowsPort): void {
    if (installed && installed !== port)
        throw new Error("OFFLINE_MUTATION_ROWS_PORT_ALREADY_BOUND");
    installed = port;
}
function requireRows(): Readonly<OfflineMutationRowsPort> {
    if (!installed)
        throw new Error("OFFLINE_MUTATION_ROWS_PORT_UNBOUND");
    return installed;
}
export const withOfflineMutationTx: OfflineMutationRowsPort["withOfflineMutationTx"] = (...args) => requireRows().withOfflineMutationTx(...args);
export const claimPracticeReceipt: OfflineMutationRowsPort["claimPracticeReceipt"] = (...args) => requireRows().claimPracticeReceipt(...args);
export const findPracticeReceipt: OfflineMutationRowsPort["findPracticeReceipt"] = (...args) => requireRows().findPracticeReceipt(...args);
export const incrementPracticeRevision: OfflineMutationRowsPort["incrementPracticeRevision"] = (...args) => requireRows().incrementPracticeRevision(...args);
export const commitPracticeReceipt: OfflineMutationRowsPort["commitPracticeReceipt"] = (...args) => requireRows().commitPracticeReceipt(...args);
export const lookupOfflineMutationReceipt: OfflineMutationRowsPort["lookupOfflineMutationReceipt"] = (...args) => requireRows().lookupOfflineMutationReceipt(...args);
export const lockOwnedPreventionPet: OfflineMutationRowsPort["lockOwnedPreventionPet"] = (...args) => requireRows().lockOwnedPreventionPet(...args);
export const claimPreventionReceipt: OfflineMutationRowsPort["claimPreventionReceipt"] = (...args) => requireRows().claimPreventionReceipt(...args);
export const findPreventionReceipt: OfflineMutationRowsPort["findPreventionReceipt"] = (...args) => requireRows().findPreventionReceipt(...args);
export const findPreventionBoundClient: OfflineMutationRowsPort["findPreventionBoundClient"] = (...args) => requireRows().findPreventionBoundClient(...args);
export const readPreventionClientRow: OfflineMutationRowsPort["readPreventionClientRow"] = (...args) => requireRows().readPreventionClientRow(...args);
export const persistPreventionClientBinding: OfflineMutationRowsPort["persistPreventionClientBinding"] = (...args) => requireRows().persistPreventionClientBinding(...args);
export const incrementPreventionRevision: OfflineMutationRowsPort["incrementPreventionRevision"] = (...args) => requireRows().incrementPreventionRevision(...args);
export const commitPreventionReceipt: OfflineMutationRowsPort["commitPreventionReceipt"] = (...args) => requireRows().commitPreventionReceipt(...args);
