export type PetPreventionTypeKey = "VACCINATION" | "DEWORMING" | "TICKS_FLEAS";

export const DEFAULT_REMINDER_DAYS: Record<PetPreventionTypeKey, number> = {
  VACCINATION: 365,
  DEWORMING: 90,
  TICKS_FLEAS: 30,
};
