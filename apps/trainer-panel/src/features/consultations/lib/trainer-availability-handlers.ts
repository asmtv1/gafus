import type { ConsultationAvailabilityRuleDto } from "@gafus/consultation-shared";

/** Инъекция server actions для панели расписания (тренер vs админка). */
export type TrainerAvailabilityActionOk = { success: true } | { success: false; error: string };

export interface TrainerAvailabilityHandlers {
  saveRules: (
    rules: Omit<ConsultationAvailabilityRuleDto, "id">[],
  ) => Promise<TrainerAvailabilityActionOk>;
  addDayOff: (date: string) => Promise<TrainerAvailabilityActionOk>;
  removeDayOff: (dayOffId: string) => Promise<TrainerAvailabilityActionOk>;
  addSlotException: (startAt: string, endAt: string) => Promise<TrainerAvailabilityActionOk>;
  removeSlotException: (exceptionId: string) => Promise<TrainerAvailabilityActionOk>;
}
