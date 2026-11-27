/** Database-independent value contracts: all SQL implementation types are owned by Persistence.
 * Prisma delegate promises are represented as ordinary promises; database
 * transactions are opaque and must be passed unchanged to the server adapter. */

export type VetVisitDbTx = unknown;
export type VetVisitDbRow = Awaited<ReturnType<VetVisitRowsPort["listOwnPetVetRows"]>>["rows"][number];
export type VetVisitDbFailure = 'pet' | 'visit' | 'attachment' | 'limit' | 'reservation';
export type VetVisitOutboxEnqueue = (tx: never, ownerId: string, keys: (string | null | undefined)[], availableAt: Date, dedupeKey: string) => Promise<unknown>;
export type VetVisitDbError = {
    readonly kind: VetVisitDbFailure;
};
export interface VetVisitRowsPort {
    ownPetForVet: (petId: string, ownerId: string) => Promise<void>;
    lockVetPetRowTx: (tx: VetVisitDbTx, petId: string, ownerId: string) => Promise<void>;
    listOwnPetVetRows: (petId: string, ownerId: string) => Promise<{
        rows: ({
            attachments: {
                id: string;
                name: string;
                createdAt: Date;
                visitId: string;
                mimeType: string;
                sizeBytes: number;
                originalKey: string;
                previewKey: string | null;
            }[];
        } & {
            id: string;
            ownerId: string;
            notes: string;
            createdAt: Date;
            updatedAt: Date;
            petId: string;
            visitedOn: Date;
            specialty: string;
            doctorName: string;
            clinic: string;
            diagnosis: string;
            conclusion: string;
        })[];
        pending: Set<string>;
    }>;
    upsertOwnPetVetVisit: (petId: string, ownerId: string, data: {
        visitedOn: Date;
        specialty: string;
        doctorName: string;
        clinic: string;
        diagnosis: string;
        conclusion: string;
        notes: string;
    }, id?: string) => Promise<VetVisitDbRow>;
    removeOwnPetVetVisit: (petId: string, ownerId: string, id: string, enqueue: VetVisitOutboxEnqueue) => Promise<void>;
    requireOwnPetVetVisit: (petId: string, ownerId: string, id: string) => Promise<void>;
    reservePetVetAttachment: (petId: string, ownerId: string, visitId: string, keys: {
        originalKey: string;
        previewKey: string | null;
    }, dedupeKey: string, enqueue: VetVisitOutboxEnqueue) => Promise<void>;
    commitPetVetAttachment: (petId: string, ownerId: string, visitId: string, input: {
        id: string;
        keys: {
            originalKey: string;
            previewKey: string | null;
        };
        dedupeKey: string;
        name: string;
        mimeType: string;
        sizeBytes: number;
    }) => Promise<void>;
    removeOwnPetVetAttachment: (petId: string, ownerId: string, visitId: string, id: string, enqueue: VetVisitOutboxEnqueue) => Promise<void>;
    readOwnPetVetAttachment: (petId: string, ownerId: string, visitId: string, id: string) => Promise<{
        id: string;
        name: string;
        createdAt: Date;
        visitId: string;
        mimeType: string;
        sizeBytes: number;
        originalKey: string;
        previewKey: string | null;
    }>;
    enqueueOwnPetVetCleanupTx: (tx: VetVisitDbTx, petId: string, ownerId: string, enqueue: VetVisitOutboxEnqueue) => Promise<void>;
    isVetVisitDbError(error: unknown): error is VetVisitDbError;
}
export function requireVetVisitRowsPort(port: VetVisitRowsPort | undefined): Readonly<VetVisitRowsPort> {
  if (!port) throw new Error("VET_VISIT_ROWS_PORT_UNBOUND");
  return port;
}
