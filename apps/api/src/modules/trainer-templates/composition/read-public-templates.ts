/** AG1-001/TR013: lazy forwarding to the existing Core public templates getter. */
import { getStepTemplates } from "@gafus/core/services/trainerStep";
import { createReadPublicTemplatesApplication } from "../application/read-public-templates.js";

export const readPublicTemplatesApplication = createReadPublicTemplatesApplication({
  readTemplates: (categoryId) => getStepTemplates(categoryId),
});
