import { createConsultationAvailabilityService } from "@gafus/core/services/consultation/availabilityService";
import { createCynologistService } from "@gafus/core/services/consultation/cynologistService";
import {
  getTrainerEditableSlotsImpl,
  rebuildSlotsForCynologistInTransaction,
} from "@gafus/consultation-server/slot-service";
import {
  ensureCurrentTrainerCynologistRow,
  isCurrentConsultationTrainer,
  readAllTrainerCatalogRows,
  readListedCynologistRows,
  setListedCynologistsAtomic,
} from "@gafus/consultation-query-server/cynologist-catalog-rows";
import {
  applyTrainerScheduleChange,
  hasTrainerScheduleOwnership,
  readCynologistDayOffDates,
  readTrainerSchedule,
  ScheduleRowNotFound,
} from "@gafus/consultation-query-server/schedule-rows";

export const {
  adminSetListedCynologists,
  ensureConsultationCynologistRow,
  listAllTrainersForAdmin,
  listListedCynologists,
  resolveTargetTrainerUserIdForStaff,
} = createCynologistService({
  ensureCurrentTrainerCynologistRow,
  isCurrentConsultationTrainer,
  readAllTrainerCatalogRows,
  readListedCynologistRows,
  setListedCynologistsAtomic,
});

export const {
  addDayOff,
  addSlotException,
  getCynologistDayOffDates,
  getTrainerAvailability,
  removeDayOff,
  removeSlotException,
  setTrainerAvailability,
} = createConsultationAvailabilityService({
  ensureConsultationCynologistRow,
  readTrainerSchedule,
  readCynologistDayOffDates,
  hasTrainerScheduleOwnership,
  async applyScheduleChange(trainerId, cynologistId, change) {
    try {
      await applyTrainerScheduleChange(trainerId, cynologistId, change, (tx, id, days) => {
        const from = new Date();
        const to = new Date(from.getTime() + days * 86_400_000);
        return rebuildSlotsForCynologistInTransaction(tx, id, from, to);
      });
      return "OK";
    } catch (error) {
      if (error instanceof ScheduleRowNotFound) return error.field;
      throw error;
    }
  },
});

export const getTrainerEditableSlots = getTrainerEditableSlotsImpl;
