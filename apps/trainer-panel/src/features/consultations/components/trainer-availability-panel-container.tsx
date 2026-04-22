"use client";

import type { ConsultationAvailabilityRuleDto, ConsultationSlotDto } from "@gafus/core";
import { useMemo } from "react";

import {
  addDayOffAction,
  addSlotExceptionAction,
  removeDayOffAction,
  removeSlotExceptionAction,
  saveTrainerAvailabilityAction,
} from "../lib/trainer-availability-actions";
import type { TrainerAvailabilityInitial } from "./trainer-availability-panel";
import { TrainerAvailabilityPanel } from "./trainer-availability-panel";

interface TrainerAvailabilityPanelContainerProps {
  trainerUserId: string;
  initial: TrainerAvailabilityInitial;
  editableSlots: ConsultationSlotDto[];
  slotPickerMinDayKey: string;
  slotPickerMaxDayKey: string;
}

/**
 * Обёртка над панелью: передаёт server actions для выбранного тренера.
 */
export function TrainerAvailabilityPanelContainer({
  trainerUserId,
  ...rest
}: TrainerAvailabilityPanelContainerProps) {
  const handlers = useMemo(
    () => ({
      saveRules: (rules: Omit<ConsultationAvailabilityRuleDto, "id">[]) =>
        saveTrainerAvailabilityAction(trainerUserId, { rules }),
      addDayOff: (date: string) => addDayOffAction(trainerUserId, date),
      removeDayOff: (id: string) => removeDayOffAction(trainerUserId, id),
      addSlotException: (startAt: string, endAt: string) =>
        addSlotExceptionAction(trainerUserId, startAt, endAt),
      removeSlotException: (id: string) => removeSlotExceptionAction(trainerUserId, id),
    }),
    [trainerUserId],
  );

  return <TrainerAvailabilityPanel {...rest} handlers={handlers} />;
}
