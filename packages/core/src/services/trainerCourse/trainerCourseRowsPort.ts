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
export function requireTrainerCourseRowsPort(port: TrainerCourseRowsPort | undefined): Readonly<TrainerCourseRowsPort> {
  if (!port) throw new Error("TRAINER_COURSE_ROWS_PORT_UNBOUND");
  return port;
}
