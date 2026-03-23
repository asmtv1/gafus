/**
 * Типы для журнала профилактики питомца
 */
export type PetPreventionType = "VACCINATION" | "DEWORMING" | "TICKS_FLEAS";

export type PetPreventionReminderKind = "AFTER_DAYS" | "ON_DATE";

export interface PetPreventionEntry {
  id: string;
  petId?: string;
  type: PetPreventionType;
  performedAt: string;
  productName?: string | null;
  notes?: string | null;
  clientId?: string | null;
  reminderEnabled?: boolean;
  reminderKind?: PetPreventionReminderKind;
  reminderDaysAfter?: number | null;
  reminderOnDate?: string | null;
  remindAt?: string | null;
  lastNotifiedForRemindAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePreventionEntryData {
  type: PetPreventionType;
  performedAt: string;
  productName?: string;
  notes?: string;
  reminderEnabled?: boolean;
  reminderKind?: PetPreventionReminderKind;
  reminderDaysAfter?: number;
  reminderOnDate?: string;
}

export interface BatchPreventionEntry extends CreatePreventionEntryData {
  clientId: string;
}
