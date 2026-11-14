/** Owning API composition: step Persistence. The Core facade has no
 * SQL imports; this binds the ORIGINAL transactional implementation. */
import { registerTrainerStepRowsPort, type TrainerStepRowsPort } from "@gafus/core/services/trainerStep";
import * as sql from "@gafus/course-progress-server/trainer-step-rows";

/** Exact SQL rows still carry Prisma delegate/transaction types. The bridge at
 * this application-owned boundary is solely a TypeScript representation
 * conversion; it does not wrap/replace the SQL, lock, CAS, or owner checks.
 * Non-cast methods remain checked structurally by the Port contract. */
const rows: TrainerStepRowsPort = {
  readTrainerVideoRows: sql.readTrainerVideoRows,
  readTrainerStepForEdit: sql.readTrainerStepForEdit as unknown as TrainerStepRowsPort["readTrainerStepForEdit"],
  readTrainerStepMediaRow: sql.readTrainerStepMediaRow,
  readTrainerStepImageRow: sql.readTrainerStepImageRow,
  readTrainerStepDeletionRows: sql.readTrainerStepDeletionRows,
  readVisibleTrainerSteps: sql.readVisibleTrainerSteps as unknown as TrainerStepRowsPort["readVisibleTrainerSteps"],
  createTrainerStepRecord: sql.createTrainerStepRecord as unknown as TrainerStepRowsPort["createTrainerStepRecord"],
  updateTrainerStepRecord: sql.updateTrainerStepRecord as unknown as TrainerStepRowsPort["updateTrainerStepRecord"],
  updateTrainerStepImageRow: sql.updateTrainerStepImageRow as unknown as TrainerStepRowsPort["updateTrainerStepImageRow"],
  deleteLegacyTrainerStepRows: sql.deleteLegacyTrainerStepRows,
  deleteOwnedTrainerStepRows: sql.deleteOwnedTrainerStepRows,
  readTrainerTemplateForDisplay: sql.readTrainerTemplateForDisplay as unknown as TrainerStepRowsPort["readTrainerTemplateForDisplay"],
  readTrainerTemplateForCreation: sql.readTrainerTemplateForCreation as unknown as TrainerStepRowsPort["readTrainerTemplateForCreation"],
  readPublicTrainerStepTemplates: sql.readPublicTrainerStepTemplates as unknown as TrainerStepRowsPort["readPublicTrainerStepTemplates"],
  searchPublicTrainerStepTemplates: sql.searchPublicTrainerStepTemplates as unknown as TrainerStepRowsPort["searchPublicTrainerStepTemplates"],
  readPublicTrainerStepCategories: sql.readPublicTrainerStepCategories,
  createStepFromTemplateRow: sql.createStepFromTemplateRow as unknown as TrainerStepRowsPort["createStepFromTemplateRow"],
  deleteTrainerTemplateRow: sql.deleteTrainerTemplateRow as unknown as TrainerStepRowsPort["deleteTrainerTemplateRow"],
  createTrainerTemplateRow: sql.createTrainerTemplateRow as unknown as TrainerStepRowsPort["createTrainerTemplateRow"],
  createTrainerStepCategoryRow: sql.createTrainerStepCategoryRow,
};
registerTrainerStepRowsPort(rows);
