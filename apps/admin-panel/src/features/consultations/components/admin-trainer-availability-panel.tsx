"use client";

import { useMemo } from "react";
import type {
  ConsultationAvailabilityRuleDto,
  ConsultationSlotDto,
} from "@gafus/consultation-shared";

import {
  addAdminDayOffAction,
  addAdminSlotExceptionAction,
  removeAdminDayOffAction,
  removeAdminSlotExceptionAction,
  saveAdminTrainerAvailabilityAction,
} from "../lib/admin-availability-actions";
import type { TrainerAvailabilityInitial } from "@trainer-panel/features/consultations/components/trainer-availability-panel";
import { TrainerAvailabilityPanel } from "@trainer-panel/features/consultations/components/trainer-availability-panel";

interface AdminTrainerAvailabilityPanelProps {
  trainerUserId: string;
  initial: TrainerAvailabilityInitial;
  editableSlots: ConsultationSlotDto[];
  slotPickerMinDayKey: string;
  slotPickerMaxDayKey: string;
}

/**
 * Расписание выбранного тренера для админки (server actions с revalidate админ-страницы).
 */
export function AdminTrainerAvailabilityPanel({
  trainerUserId,
  ...rest
}: AdminTrainerAvailabilityPanelProps) {
  const handlers = useMemo(
    () => ({
      saveRules: (rules: Omit<ConsultationAvailabilityRuleDto, "id">[]) =>
        saveAdminTrainerAvailabilityAction(trainerUserId, { rules }),
      addDayOff: (date: string) => addAdminDayOffAction(trainerUserId, date),
      removeDayOff: (id: string) => removeAdminDayOffAction(trainerUserId, id),
      addSlotException: (startAt: string, endAt: string) =>
        addAdminSlotExceptionAction(trainerUserId, startAt, endAt),
      removeSlotException: (id: string) => removeAdminSlotExceptionAction(trainerUserId, id),
    }),
    [trainerUserId],
  );

  return <TrainerAvailabilityPanel {...rest} handlers={handlers} />;
}
