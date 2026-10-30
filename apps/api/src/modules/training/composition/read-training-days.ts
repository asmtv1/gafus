/** AG1-001: bind the existing training-day list Core getter. */
import { getTrainingDays } from "@gafus/core/services/training";
import { createReadTrainingDaysApplication } from "../application/read-training-days.js";

export const readTrainingDaysApplication = createReadTrainingDaysApplication({
  readDays: (actorUserId, courseType) => getTrainingDays(actorUserId, courseType),
});
