import type { CreateTrainingDayInput, UpdateTrainingDayInput } from "./schemas";

/** Owner/actor-scoped trainer day row projections and atomic writes. SQL
 * checks step authorship in the same transaction as create/update/delete.
 * Core alone owns cache revision publication and public ActionResult errors.
 */
export type TrainingDayActor = { id: string; role: "TRAINER" | "ADMIN" };
export type TrainingDayDbRow = {
  id: string;
  title: string;
  equipment: string;
  description: string;
  type: string;
  authorId: string;
  showCoursePathExport: boolean;
  shareProgressAcrossCourses: boolean;
  createdAt: Date;
  updatedAt: Date;
};
export type TrainingDayStepLink = { id: string; dayId: string; stepId: string; order: number };
export type TrainingDayReadRow = TrainingDayDbRow & { stepLinks: TrainingDayStepLink[] };
export type TrainingDayVisibleRow = TrainingDayDbRow & {
  author: { username: string; profile: { fullName: string | null } | null };
  stepLinks: (TrainingDayStepLink & { step: { id: string; title: string } })[];
  dayLinks: {
    id: string; courseId: string; dayId: string; order: number;
    course: { id: string; name: string };
  }[];
};
export interface TrainingDayRowsPort {
  readTrainingDayForEdit(id: string, actor?: TrainingDayActor): Promise<TrainingDayReadRow | null>;
  insertTrainingDay(input: CreateTrainingDayInput, actor?: TrainingDayActor): Promise<{ id: string }>;
  replaceTrainingDay(input: UpdateTrainingDayInput, actor?: TrainingDayActor): Promise<unknown>;
  deleteTrainingDayRows(dayIds: string[], actor?: TrainingDayActor): Promise<{courseIds:string[];deletedDayIds:string[]} | null>;
  listVisibleTrainingDays(authorId: string | null, isAdminOrModerator: boolean): Promise<TrainingDayVisibleRow[]>;
}
export function requireTrainingDayRowsPort(port: TrainingDayRowsPort | undefined): Readonly<TrainingDayRowsPort> {
  if (!port) throw new Error("TRAINING_DAY_ROWS_PORT_UNBOUND");
  return port;
}
