/** Legacy test startup. Production uses trainer-step-rows-instance directly. */
import { registerTrainerStepRowsPort } from "@gafus/core/services/trainerStep";
import { trainerStepRows } from "./trainer-step-rows-instance.js";
registerTrainerStepRowsPort(trainerStepRows);
