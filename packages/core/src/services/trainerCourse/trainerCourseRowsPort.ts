import type { CreateTrainerCourseInput, UpdateTrainerCourseInput } from "./schemas";
import type { CourseVersionActor } from "./courseVersionService";
import type { CourseDraftDto } from "./trainerCourseService";

/** Trainer course SQL CAS and delete dependencies remain in Persistence.
 * The business service owns ACL, stale/hidden error decisions and caching. */
export interface TrainerCourseRowsPort {
  createRow(input: CreateTrainerCourseInput, authorId: string, type: string,
    isPrivate: boolean,
    dayLinksCreate: { day: { connect: { id: string } }; order: number }[]): Promise<void>;
  updateRows(input: UpdateTrainerCourseInput, actor: CourseVersionActor, isPrivate: boolean): Promise<number>;
  readLogo(courseId: string): Promise<{ logoImg: string } | null>;
  readAuthor(courseId: string): Promise<{ authorId: string } | null>;
  readDraft(courseId: string): Promise<(CourseDraftDto & { authorId: string }) | null>;
  readVisibleAfterStale(courseId: string, actor: CourseVersionActor): Promise<{ id: string }[]>;
  deleteDependencies(courseId: string): Promise<void>;
  isVersionMismatch(error: unknown): boolean;
}
let bound: Readonly<TrainerCourseRowsPort> | null = null;
export function registerTrainerCourseRowsPort(port: TrainerCourseRowsPort): void {
  if (bound && bound !== port) throw new Error("TRAINER_COURSE_ROWS_PORT_ALREADY_BOUND");
  bound = port;
}
function requireRows(): Readonly<TrainerCourseRowsPort> {
  if (!bound) throw new Error("TRAINER_COURSE_ROWS_PORT_UNBOUND");
  return bound;
}
export function createTrainerCourseRow(...args: Parameters<TrainerCourseRowsPort["createRow"]>) {
  return requireRows().createRow(...args);
}
export function updateTrainerCourseRows(...args: Parameters<TrainerCourseRowsPort["updateRows"]>) {
  return requireRows().updateRows(...args);
}
export function readCourseRowLogo(courseId: string) { return requireRows().readLogo(courseId); }
export function readCourseRowAuthor(courseId: string) { return requireRows().readAuthor(courseId); }
export function readCourseDraftRow(courseId: string) { return requireRows().readDraft(courseId); }
export function readCourseRowVisibleAfterStale(...args: Parameters<TrainerCourseRowsPort["readVisibleAfterStale"]>) {
  return requireRows().readVisibleAfterStale(...args);
}
export function deleteTrainerCourseRowDependencies(courseId: string) { return requireRows().deleteDependencies(courseId); }
export function isCourseVersionNoMatch(error: unknown): boolean { return requireRows().isVersionMismatch(error); }
