import { withCorrelatedUseCase } from "../../../lib/operation-observability.js";
/** AG1-001/TR013: lazy forwarding to the existing Core public templates getter. */
import { getStepTemplates, type TrainerStepRowsPort } from "@gafus/core/services/trainerStep";
import { createReadPublicTemplatesApplication } from "../application/read-public-templates.js";

export function createPublicTemplatesApplicationForRows(rowsPort?: TrainerStepRowsPort) {
 return createReadPublicTemplatesApplication({
  readTemplates: (categoryId) => withCorrelatedUseCase("trainer.templates.public.read", () => rowsPort
    ? getStepTemplates(categoryId, rowsPort)
    : getStepTemplates(categoryId)),
 });
}
export const readPublicTemplatesApplication = createPublicTemplatesApplicationForRows();
