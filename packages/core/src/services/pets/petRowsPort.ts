/** Database-independent value contracts: all SQL implementation types are owned by Persistence.
 * Prisma delegate promises are represented as ordinary promises; database
 * transactions are opaque and must be passed unchanged to the server adapter. */
export type PortableRowFields = Record<string, unknown>;
export type PetType = "DOG" | "CAT";
import type { PetMediaReason } from "@gafus/pets-shared/pet-media-deletion-outbox";
type Executor = PetSqlTx;
/** An opaque transaction with only the capability needed to enqueue outbox
 * intents. No Prisma delegate types or transaction creation leak into Core. */
export type PetSqlTx = { $executeRaw: (...args: never[]) => Promise<unknown> };
export type PetCreateFields = PortableRowFields;
export type PetProfilePatch = PortableRowFields;
export type PetWithAwards = Awaited<ReturnType<PetRowsPort["createPetWithAwards"]>>;
export type PetCreateReceiptRow = {
    payloadHash: string;
    petId: string;
    responseJson: unknown;
};
export interface PetRowsPort {
    withPetSqlTx: <T>(callback: (tx: PetSqlTx) => Promise<T>, options?: {
        maxWait?: number;
        timeout?: number;
    }) => Promise<T>;
    findCommittedPetReceipt: (ownerId: string, clientRequestId: string) => Promise<PetCreateReceiptRow[]>;
    claimPetCreationReceipt: (tx: PetSqlTx, input: {
        ownerId: string;
        clientRequestId: string;
        payloadHash: string;
        petId: string;
        responseJson: string;
    }) => Promise<{
        petId: string;
    }[]>;
    createPetWithAwards: (fields: PetCreateFields, tx?: PetSqlTx) => Promise<{
        awards: {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            petId: string;
            date: Date | null;
            title: string;
            event: string | null;
            rank: string | null;
            examType: string | null;
            examScore: number | null;
            courseId: string | null;
        }[];
    } & {
        id: string;
        ownerId: string;
        name: string;
        type: PetType;
        breed: string;
        breedKey: string | null;
        birthDate: Date;
        heightCm: number | null;
        weightKg: number | null;
        targetWeightKg: number | null;
        neckGirthCm: number | null;
        muzzleGirthCm: number | null;
        bellyGirthCm: number | null;
        photoUrl: string | null;
        showInProfile: boolean;
        notes: string | null;
        createdAt: Date;
        updatedAt: Date;
    }>;
    findOwnedPet: (ownerId: string, petId: string) => Promise<{
        id: string;
        ownerId: string;
        name: string;
        type: PetType;
        breed: string;
        breedKey: string | null;
        birthDate: Date;
        heightCm: number | null;
        weightKg: number | null;
        targetWeightKg: number | null;
        neckGirthCm: number | null;
        muzzleGirthCm: number | null;
        bellyGirthCm: number | null;
        photoUrl: string | null;
        showInProfile: boolean;
        notes: string | null;
        createdAt: Date;
        updatedAt: Date;
    } | null>;
    existsOwnedPet: (ownerId: string, petId: string, tx?: PetSqlTx) => Promise<{
        id: string;
    } | null>;
    readOwnedPetPhoto: (ownerId: string, petId: string, tx?: PetSqlTx) => Promise<{
        photoUrl: string | null;
    } | null>;
    lockPetOwner: (tx: PetSqlTx, ownerId: string) => Promise<{
        id: string;
    }[]>;
    updateOwnedPetWithAwards: (tx: PetSqlTx, ownerId: string, petId: string, patch: PetProfilePatch) => Promise<{
        awards: {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            petId: string;
            date: Date | null;
            title: string;
            event: string | null;
            rank: string | null;
            examType: string | null;
            examScore: number | null;
            courseId: string | null;
        }[];
    } & {
        id: string;
        ownerId: string;
        name: string;
        type: PetType;
        breed: string;
        breedKey: string | null;
        birthDate: Date;
        heightCm: number | null;
        weightKg: number | null;
        targetWeightKg: number | null;
        neckGirthCm: number | null;
        muzzleGirthCm: number | null;
        bellyGirthCm: number | null;
        photoUrl: string | null;
        showInProfile: boolean;
        notes: string | null;
        createdAt: Date;
        updatedAt: Date;
    }>;
    updateOwnedPetPhoto: (tx: PetSqlTx, ownerId: string, petId: string, photoUrl: string) => Promise<{
        id: string;
        ownerId: string;
        name: string;
        type: PetType;
        breed: string;
        breedKey: string | null;
        birthDate: Date;
        heightCm: number | null;
        weightKg: number | null;
        targetWeightKg: number | null;
        neckGirthCm: number | null;
        muzzleGirthCm: number | null;
        bellyGirthCm: number | null;
        photoUrl: string | null;
        showInProfile: boolean;
        notes: string | null;
        createdAt: Date;
        updatedAt: Date;
    }>;
    listOwnedPetDocuments: (ownerId: string, petId: string) => Promise<{
        id: string;
        ownerId: string;
        name: string;
        createdAt: Date;
        updatedAt: Date;
        petId: string;
        mimeType: string;
        sizeBytes: number;
        url: string;
    }[]>;
    readAllUserPetDocumentRows: (ownerId: string) => Promise<{
        id: string;
        ownerId: string;
        name: string;
        createdAt: Date;
        updatedAt: Date;
        petId: string;
        mimeType: string;
        sizeBytes: number;
        url: string;
    }[]>;
    findOwnedPetDocument: (ownerId: string, documentId: string, petId?: string, tx?: PetSqlTx) => Promise<{
        id: string;
        ownerId: string;
        name: string;
        createdAt: Date;
        updatedAt: Date;
        petId: string;
        mimeType: string;
        sizeBytes: number;
        url: string;
    } | null>;
    findOwnedPetDocumentForDownload: (ownerId: string, documentId: string, petId?: string) => Promise<{
        id: string;
        name: string;
        mimeType: string;
        sizeBytes: number;
        url: string;
    } | null>;
    findPetDocumentByUrl: (ownerId: string, petId: string, url: string) => Promise<{
        id: string;
    } | null>;
    countOwnedPetDocuments: (tx: PetSqlTx, ownerId: string, petId: string) => Promise<number>;
    createOwnedPetDocument: (tx: PetSqlTx, input: {
        petId: string;
        ownerId: string;
        name: string;
        mimeType: string;
        sizeBytes: number;
        url: string;
    }) => Promise<{
        id: string;
        ownerId: string;
        name: string;
        createdAt: Date;
        updatedAt: Date;
        petId: string;
        mimeType: string;
        sizeBytes: number;
        url: string;
    }>;
    deletePetDocumentRow: (documentId: string, tx?: PetSqlTx) => Promise<{
        id: string;
        ownerId: string;
        name: string;
        createdAt: Date;
        updatedAt: Date;
        petId: string;
        mimeType: string;
        sizeBytes: number;
        url: string;
    }>;
    renamePetDocumentRow: (documentId: string, name: string) => Promise<{
        id: string;
        ownerId: string;
        name: string;
        createdAt: Date;
        updatedAt: Date;
        petId: string;
        mimeType: string;
        sizeBytes: number;
        url: string;
    }>;
    readOwnedPetDocumentUrls: (tx: PetSqlTx, ownerId: string, petId: string) => Promise<{
        url: string;
    }[]>;
    deleteOwnedPetRow: (tx: PetSqlTx, ownerId: string, petId: string) => Promise<{
        id: string;
        ownerId: string;
        name: string;
        type: PetType;
        breed: string;
        breedKey: string | null;
        birthDate: Date;
        heightCm: number | null;
        weightKg: number | null;
        targetWeightKg: number | null;
        neckGirthCm: number | null;
        muzzleGirthCm: number | null;
        bellyGirthCm: number | null;
        photoUrl: string | null;
        showInProfile: boolean;
        notes: string | null;
        createdAt: Date;
        updatedAt: Date;
    }>;
    petMediaOutboxEnabled: () => boolean;
    enqueuePetMediaDeletionIntent: (tx: Executor, ownerId: string, petId: string, locator: string, reason: PetMediaReason, availableAt?: Date) => Promise<string>;
    consumePetMediaUploadReservation: (tx: Executor, ownerId: string, locator: string) => Promise<void>;
}
