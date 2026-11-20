/** Legacy isolated-test registrar. Production SQL content reads enter
 * createTrainingService as an explicit dependency, never as global setup. */
import { registerTrainingDayContentReadPort } from "@gafus/core/services/training";
import { dayContentReadPort } from "./training-content-rows-instance.js";
registerTrainingDayContentReadPort(dayContentReadPort);
