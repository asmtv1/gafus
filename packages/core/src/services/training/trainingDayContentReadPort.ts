import type { StepType } from "@gafus/types/training-client";

/** Owner-neutral lesson snapshot. Owner/paid/private authorization is never
 * cached here: that check runs on each learner/video request separately.
 * Only Persistence reads the projection, Core owns TTL/revision/eviction.
 */
type JsonValue = string | number | boolean | null | JsonValue[] | { [key in string]?: JsonValue };
export type TrainingDayContentRow = {
  id: string;
  order: number;
  courseId: string;
  course: { duration: string; isPersonalized: boolean };
  day: {
    id: string;
    title: string;
    description: string;
    type: string;
    showCoursePathExport: boolean;
    stepLinks: {
      id: string;
      order: number;
      step: {
        id: string;
        title: string;
        description: string;
        durationSec: number | null;
        estimatedDurationSec: number | null;
        videoUrl: string | null;
        videoUrls: string[];
        imageUrls: string[];
        pdfUrls: string[];
        type: StepType;
        checklist: JsonValue;
        requiresVideoReport: boolean;
        requiresWrittenFeedback: boolean;
        hasTestQuestions: boolean;
        surveySlug: string | null;
      };
    }[];
  };
};
export interface TrainingDayContentReadPort {
  readTrainingDayContent(courseType: string, dayOnCourseId: string): Promise<TrainingDayContentRow | null>;
}
let bound: Readonly<TrainingDayContentReadPort> | null = null;
export function registerTrainingDayContentReadPort(port: TrainingDayContentReadPort): void {
  if (bound !== null && bound !== port) throw new Error("TRAINING_DAY_CONTENT_READ_PORT_ALREADY_BOUND");
  bound = port;
}
export function requireTrainingDayContentReadPort(): Readonly<TrainingDayContentReadPort> {
  if (!bound) throw new Error("TRAINING_DAY_CONTENT_READ_PORT_UNBOUND");
  return bound;
}
