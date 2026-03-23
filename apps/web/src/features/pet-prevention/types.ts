export const PREVENTION_TYPE_LABELS: Record<string, string> = {
  VACCINATION: "Прививка",
  DEWORMING: "Глистогонка",
  TICKS_FLEAS: "Клещи и блохи",
};

export interface PreventionEntryDisplay {
  id: string;
  type: string;
  performedAt: Date;
  productName: string | null;
  notes: string | null;
  clientId: string | null;
  reminderEnabled: boolean;
  reminderKind: string;
  reminderDaysAfter: number | null;
  reminderOnDate: Date | null;
  remindAt: Date | null;
  lastNotifiedForRemindAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
