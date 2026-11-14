import { createWebLogger } from "@gafus/logger";

import { consultationMskDayKey } from "./consultationMskFormat";
import { ConsultationForbiddenError, ConsultationNotFoundError } from "./errors";
import type {
  ConsultationAvailabilityRuleDto,
  DayOffDto,
  SlotExceptionDto,
} from "./types";
import {
  dayOffInputSchema,
  slotExceptionInputSchema,
  trainerAvailabilityInputSchema,
  type TrainerAvailabilityInput,
} from "./validation";

const logger = createWebLogger("core-consultation-availability");

type ScheduleChange =
  | { kind: "set-rules"; rules: TrainerAvailabilityInput["rules"] }
  | { kind: "upsert-day-off"; date: Date; reason: string | null }
  | { kind: "remove-day-off"; id: string }
  | { kind: "add-exception"; startAt: Date; endAt: Date; reason: string | null }
  | { kind: "remove-exception"; id: string };

export interface ConsultationAvailabilityPort {
  ensureConsultationCynologistRow(trainerId: string): Promise<string>;
  readTrainerSchedule(cynologistId: string): Promise<{
    slotDurationMin: number;
    availabilityRules: ConsultationAvailabilityRuleDto[];
    dayOffs: { id: string; date: Date; reason: string | null }[];
    slotExceptions: { id: string; startAt: Date; endAt: Date; reason: string | null }[];
  } | null>;
  applyScheduleChange(
    trainerId: string,
    cynologistId: string,
    change: ScheduleChange,
  ): Promise<"OK" | "trainer" | "profile" | "day-off" | "exception">;
  readCynologistDayOffDates(
    userId: string,
    fromUtc: Date,
    toUtc: Date,
  ): Promise<Date[] | null>;
  hasTrainerScheduleOwnership(trainerId: string, cynologistId: string): Promise<boolean>;
}

export function createConsultationAvailabilityService(port: ConsultationAvailabilityPort) {
  async function getTrainerAvailability(trainerUserId: string): Promise<{
    rules: ConsultationAvailabilityRuleDto[];
    dayOffs: DayOffDto[];
    exceptions: SlotExceptionDto[];
    slotDurationMin: number;
  }> {
    const cynId = await port.ensureConsultationCynologistRow(trainerUserId);
    const cyn = await port.readTrainerSchedule(cynId);
    if (!cyn) {
      throw new ConsultationNotFoundError("Профиль кинолога");
    }

    return {
      slotDurationMin: cyn.slotDurationMin,
      rules: cyn.availabilityRules.map((r) => ({
        id: r.id,
        weekday: r.weekday,
        startTime: r.startTime,
        endTime: r.endTime,
        isWorkingDay: r.isWorkingDay,
      })),
      dayOffs: cyn.dayOffs.map((d) => ({
        id: d.id,
        date: d.date.toISOString().slice(0, 10),
        reason: d.reason,
      })),
      exceptions: cyn.slotExceptions.map((e) => ({
        id: e.id,
        startAtUtc: e.startAt.toISOString(),
        endAtUtc: e.endAt.toISOString(),
        reason: e.reason,
      })),
    };
  }

  /**
   * A schedule mutation and its materialized slots are one indivisible DB write.
   * Serializing under the same advisory lock used by reader-triggered rebuilds
   * avoids stale configurations overwriting newer slots. On any rebuild error,
   * Prisma rolls back both the changed rule/exception and the slot changes.
   */
  async function mutateTrainerSchedule(
    trainerUserId: string,
    change: ScheduleChange,
  ): Promise<void> {
    const cynId = await port.ensureConsultationCynologistRow(trainerUserId);
    const result = await port.applyScheduleChange(trainerUserId, cynId, change);
    switch (result) {
      case "OK": return;
      case "trainer": throw new ConsultationForbiddenError();
      case "day-off": throw new ConsultationNotFoundError("Выходной");
      case "exception": throw new ConsultationNotFoundError("Исключение");
      case "profile": throw new ConsultationNotFoundError("Профиль кинолога");
    }
  }

  async function setTrainerAvailability(
    trainerUserId: string,
    input: TrainerAvailabilityInput,
  ): Promise<void> {
    // Preserve the same Zod contract even when a Core caller bypasses HTTP.
    const { rules } = trainerAvailabilityInputSchema.parse(input);
    await mutateTrainerSchedule(trainerUserId, { kind: "set-rules", rules });
    logger.success("setTrainerAvailability", { trainerUserId });
  }

  async function addDayOff(
    trainerUserId: string,
    dateIso: string,
    reason?: string,
  ): Promise<void> {
    dayOffInputSchema.parse({ date: dateIso, reason });
    const date = new Date(`${dateIso}T12:00:00.000Z`);
    await mutateTrainerSchedule(trainerUserId, { kind: "upsert-day-off", date, reason: reason ?? null });
  }

  async function removeDayOff(trainerUserId: string, dayOffId: string): Promise<void> {
    await mutateTrainerSchedule(trainerUserId, { kind: "remove-day-off", id: dayOffId });
  }

  async function addSlotException(
    trainerUserId: string,
    startAt: Date,
    endAt: Date,
    reason?: string,
  ): Promise<void> {
    // Reject invalid Date values and overlapping/reversed intervals at Core too.
    slotExceptionInputSchema.parse({
      startAt: Number.isFinite(startAt.getTime()) ? startAt.toISOString() : "invalid",
      endAt: Number.isFinite(endAt.getTime()) ? endAt.toISOString() : "invalid",
      reason,
    });
    await mutateTrainerSchedule(trainerUserId, { kind: "add-exception", startAt, endAt, reason: reason ?? null });
  }

  async function removeSlotException(
    trainerUserId: string,
    exceptionId: string,
  ): Promise<void> {
    await mutateTrainerSchedule(trainerUserId, { kind: "remove-exception", id: exceptionId });
  }

  async function getCynologistDayOffDates(
    cynologistUserId: string,
    fromUtc: Date,
    toUtc: Date,
  ): Promise<string[]> {
    const dates = await port.readCynologistDayOffDates(cynologistUserId, fromUtc, toUtc);
    if (dates === null) throw new ConsultationNotFoundError("Кинолог");
    return dates.map(consultationMskDayKey);
  }

  async function assertTrainerOwnsCynologist(
    trainerUserId: string,
    cynologistId: string,
  ): Promise<void> {
    if (!(await port.hasTrainerScheduleOwnership(trainerUserId, cynologistId)))
      throw new ConsultationForbiddenError();
  }

  return {
    getTrainerAvailability,
    setTrainerAvailability,
    addDayOff,
    removeDayOff,
    addSlotException,
    removeSlotException,
    getCynologistDayOffDates,
    assertTrainerOwnsCynologist,
  };
}
