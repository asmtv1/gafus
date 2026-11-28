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
export function requirePreventionRowsPort(port: PreventionRowsPort | undefined): Readonly<PreventionRowsPort> {
  if (!port) throw new Error("PREVENTION_ROWS_PORT_UNBOUND");
  return port;
}
