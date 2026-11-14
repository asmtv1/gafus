/** Database-independent value contracts: all SQL implementation types are owned by Persistence.
 * Prisma delegate promises are represented as ordinary promises; database
 * transactions are opaque and must be passed unchanged to the server adapter. */
export type PortableJsonValue = null | string | number | boolean | { readonly [key: string]: PortableJsonValue } | readonly PortableJsonValue[];
export type PortableRowFields = Record<string, unknown>;
export type PetPreventionType = "VACCINATION" | "DEWORMING" | "TICKS_FLEAS";
export type PetPreventionReminderKind = "AFTER_DAYS" | "ON_DATE";
export type PreventionTx = unknown;
export type PreventionCreate = Omit<PortableRowFields, "sentTimesForRemindAt">;
export type PreventionUpdate = Omit<PortableRowFields, "sentTimesForRemindAt">;
export interface PreventionRowsPort {
    readOwnedPreventionPet: (userId: string, petId: string) => Promise<{
        id: string;
    } | null>;
    readOwnedPreventionEntryForUpdate: (userId: string, petId: string, entryId: string) => Promise<{
        id: string;
        type: PetPreventionType;
        notes: string | null;
        remindAt: Date | null;
        productName: string | null;
        reminderTimes: PortableJsonValue;
        performedAt: Date;
        reminderEnabled: boolean;
        reminderKind: PetPreventionReminderKind;
        reminderDaysAfter: number | null;
        reminderOnDate: Date | null;
        lastNotifiedForRemindAt: Date | null;
    } | null>;
    readOwnedPreventionEntryId: (userId: string, petId: string, entryId: string) => Promise<{
        id: string;
    } | null>;
    createPreventionRow: (data: PreventionCreate) => Promise<{
        id: string;
        type: PetPreventionType;
        notes: string | null;
        createdAt: Date;
        updatedAt: Date;
        remindAt: Date | null;
        productName: string | null;
        reminderTimes: PortableJsonValue;
        sentTimesForRemindAt: PortableJsonValue;
        performedAt: Date;
        clientId: string | null;
        reminderEnabled: boolean;
        reminderKind: PetPreventionReminderKind;
        reminderDaysAfter: number | null;
        reminderOnDate: Date | null;
        lastNotifiedForRemindAt: Date | null;
    }>;
    updateOwnedPreventionRow: (userId: string, petId: string, entryId: string, data: PreventionUpdate, resetSentTimes: boolean) => Promise<{
        id: string;
        type: PetPreventionType;
        notes: string | null;
        createdAt: Date;
        updatedAt: Date;
        remindAt: Date | null;
        productName: string | null;
        reminderTimes: PortableJsonValue;
        sentTimesForRemindAt: PortableJsonValue;
        performedAt: Date;
        clientId: string | null;
        reminderEnabled: boolean;
        reminderKind: PetPreventionReminderKind;
        reminderDaysAfter: number | null;
        reminderOnDate: Date | null;
        lastNotifiedForRemindAt: Date | null;
    }>;
    deleteOwnedPreventionRow: (userId: string, petId: string, entryId: string) => Promise<void>;
    readPreventionRowsByPet: (userId: string, petId: string) => Promise<{
        id: string;
        type: PetPreventionType;
        notes: string | null;
        createdAt: Date;
        updatedAt: Date;
        remindAt: Date | null;
        productName: string | null;
        reminderTimes: PortableJsonValue;
        sentTimesForRemindAt: PortableJsonValue;
        performedAt: Date;
        clientId: string | null;
        reminderEnabled: boolean;
        reminderKind: PetPreventionReminderKind;
        reminderDaysAfter: number | null;
        reminderOnDate: Date | null;
        lastNotifiedForRemindAt: Date | null;
    }[]>;
    readOwnedPreventionPetIds: (userId: string, petIds: string[]) => Promise<{
        id: string;
    }[]>;
    readPreventionRowsByPets: (userId: string, petIds: string[]) => Promise<{
        id: string;
        type: PetPreventionType;
        notes: string | null;
        createdAt: Date;
        updatedAt: Date;
        petId: string;
        remindAt: Date | null;
        productName: string | null;
        reminderTimes: PortableJsonValue;
        sentTimesForRemindAt: PortableJsonValue;
        performedAt: Date;
        clientId: string | null;
        reminderEnabled: boolean;
        reminderKind: PetPreventionReminderKind;
        reminderDaysAfter: number | null;
        reminderOnDate: Date | null;
        lastNotifiedForRemindAt: Date | null;
    }[]>;
    withPreventionTransaction: <T>(work: (tx: PreventionTx) => Promise<T>) => Promise<T>;
    readExistingPreventionClientRow: (tx: PreventionTx, petId: string, clientId: string) => Promise<{
        id: string;
        remindAt: Date | null;
        lastNotifiedForRemindAt: Date | null;
    } | null>;
    createPreventionRowTx: (tx: PreventionTx, data: PreventionCreate) => Promise<{
        id: string;
    }>;
    updateOwnedPreventionRowTx: (tx: PreventionTx, userId: string, petId: string, entryId: string, data: PreventionUpdate, resetSentTimes: boolean) => Promise<{
        id: string;
        ownerId: string;
        type: PetPreventionType;
        notes: string | null;
        createdAt: Date;
        updatedAt: Date;
        petId: string;
        remindAt: Date | null;
        productName: string | null;
        reminderTimes: PortableJsonValue;
        sentTimesForRemindAt: PortableJsonValue | null;
        performedAt: Date;
        clientId: string | null;
        reminderEnabled: boolean;
        reminderKind: PetPreventionReminderKind;
        reminderDaysAfter: number | null;
        reminderOnDate: Date | null;
        lastNotifiedForRemindAt: Date | null;
    }>;
}
let installed: Readonly<PreventionRowsPort> | null = null;
export function registerPreventionRowsPort(port: PreventionRowsPort): void {
    if (installed && installed !== port)
        throw new Error("PREVENTION_ROWS_PORT_ALREADY_BOUND");
    installed = port;
}
function requireRows(): Readonly<PreventionRowsPort> {
    if (!installed)
        throw new Error("PREVENTION_ROWS_PORT_UNBOUND");
    return installed;
}
export const readOwnedPreventionPet: PreventionRowsPort["readOwnedPreventionPet"] = (...args) => requireRows().readOwnedPreventionPet(...args);
export const readOwnedPreventionEntryForUpdate: PreventionRowsPort["readOwnedPreventionEntryForUpdate"] = (...args) => requireRows().readOwnedPreventionEntryForUpdate(...args);
export const readOwnedPreventionEntryId: PreventionRowsPort["readOwnedPreventionEntryId"] = (...args) => requireRows().readOwnedPreventionEntryId(...args);
export const createPreventionRow: PreventionRowsPort["createPreventionRow"] = (...args) => requireRows().createPreventionRow(...args);
export const updateOwnedPreventionRow: PreventionRowsPort["updateOwnedPreventionRow"] = (...args) => requireRows().updateOwnedPreventionRow(...args);
export const deleteOwnedPreventionRow: PreventionRowsPort["deleteOwnedPreventionRow"] = (...args) => requireRows().deleteOwnedPreventionRow(...args);
export const readPreventionRowsByPet: PreventionRowsPort["readPreventionRowsByPet"] = (...args) => requireRows().readPreventionRowsByPet(...args);
export const readOwnedPreventionPetIds: PreventionRowsPort["readOwnedPreventionPetIds"] = (...args) => requireRows().readOwnedPreventionPetIds(...args);
export const readPreventionRowsByPets: PreventionRowsPort["readPreventionRowsByPets"] = (...args) => requireRows().readPreventionRowsByPets(...args);
export const withPreventionTransaction: PreventionRowsPort["withPreventionTransaction"] = (...args) => requireRows().withPreventionTransaction(...args);
export const readExistingPreventionClientRow: PreventionRowsPort["readExistingPreventionClientRow"] = (...args) => requireRows().readExistingPreventionClientRow(...args);
export const createPreventionRowTx: PreventionRowsPort["createPreventionRowTx"] = (...args) => requireRows().createPreventionRowTx(...args);
export const updateOwnedPreventionRowTx: PreventionRowsPort["updateOwnedPreventionRowTx"] = (...args) => requireRows().updateOwnedPreventionRowTx(...args);
