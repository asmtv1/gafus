/** Compatibility registrar, not imported by production API bootstrap. */
import { registerTrainingDayRowsPort } from "@gafus/core/services/trainingDay";
import { trainingDayRows } from "./training-day-rows-instance.js";
registerTrainingDayRowsPort(trainingDayRows);
