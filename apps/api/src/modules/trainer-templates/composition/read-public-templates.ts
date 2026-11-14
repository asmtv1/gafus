import { withCorrelatedUseCase } from "../../../lib/operation-observability.js";
/** AG1-001/TR013: lazy forwarding to the existing Core public templates getter. */
import { getStepTemplates } from "@gafus/core/services/trainerStep";
import { createReadPublicTemplatesApplication } from "../application/read-public-templates.js";

export const readPublicTemplatesApplication = createReadPublicTemplatesApplication({
  readTemplates: (categoryId) => withCorrelatedUseCase("trainer.templates.public.read", () => getStepTemplates(categoryId)),
});
