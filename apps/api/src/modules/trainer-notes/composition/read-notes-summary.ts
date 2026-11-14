import { withCorrelatedUseCase } from "../../../lib/operation-observability.js";
/** AG1-001: only the approved minimal notes snapshot producer is injected. */
import { readTrainerNotesSummarySnapshot } from "../infrastructure/read-notes-summary-snapshot.js";
import { createReadTrainerNotesSummaryApplication } from "../application/read-notes-summary.js";

export const readTrainerNotesSummaryApplication = createReadTrainerNotesSummaryApplication({
  readSnapshot: (...args) => withCorrelatedUseCase("trainer.notes.summary.read", () => readTrainerNotesSummarySnapshot(...args)),
});
