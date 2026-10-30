/** AG1-001/TR012: two existing course READs with original strict projections. */
import type {
  getCourseDraftWithRelations,
  getCourseEditorSnapshot,
} from "@gafus/core/services/trainerCourse";
import type {
  TrainerCourseDraftItem,
  TrainerCourseEditorSnapshotItem,
} from "../../../../../../packages/types/src/data/trainer-read-contracts";

type DraftReader = typeof getCourseDraftWithRelations;
type SnapshotReader = typeof getCourseEditorSnapshot;

const trainingLevels = ["BEGINNER", "INTERMEDIATE", "ADVANCED", "EXPERT"];

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("INVALID_COURSE_DRAFT");
  }
  return value as Record<string, unknown>;
}
function stringField(value: unknown, nonempty = false): string {
  if (typeof value !== "string" || nonempty && value.length === 0) {
    throw new Error("INVALID_COURSE_DRAFT");
  }
  return value;
}
function nullableString(value: unknown): string | null {
  if (value === null) return null;
  return stringField(value);
}
function booleanField(value: unknown): boolean {
  if (typeof value !== "boolean") throw new Error("INVALID_COURSE_DRAFT");
  return value;
}
function positiveInt(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    throw new Error("INVALID_COURSE_DRAFT");
  }
  return value;
}

/** Only known Core CourseDraftDto fields; reject invalid references, strip ORM extras. */
function projectCourseDraft(source: unknown, requestedId: string): TrainerCourseDraftItem {
  const raw = record(source);
  if (stringField(raw.id, true) !== requestedId) {
    throw new Error("MISMATCHED_COURSE_DRAFT_ID");
  }
  if (!Array.isArray(raw.dayLinks) || !Array.isArray(raw.access)) {
    throw new Error("INVALID_COURSE_DRAFT_RELATIONS");
  }
  const dayLinks = raw.dayLinks.map((sourceLink: unknown) => {
    const link = record(sourceLink);
    const day = record(link.day);
    const dayId = stringField(link.dayId, true);
    const id = stringField(day.id, true);
    if (id !== dayId) throw new Error("MISMATCHED_DRAFT_DAY");
    return {
      id: stringField(link.id, true),
      dayId, order: positiveInt(link.order),
      day: { id, title: stringField(day.title) },
    };
  });
  const access = raw.access.map((sourceLink: unknown) => {
    const link = record(sourceLink);
    const user = record(link.user);
    const userId = stringField(link.userId, true);
    const id = stringField(user.id, true);
    if (id !== userId) throw new Error("MISMATCHED_DRAFT_USER");
    return {
      userId, user: { id, username: stringField(user.username) },
    };
  });
  const trainingLevel = stringField(raw.trainingLevel);
  if (!trainingLevels.includes(trainingLevel)) throw new Error("INVALID_TRAINING_LEVEL");
  return {
    id: requestedId,
    name: stringField(raw.name, true),
    guideContent: nullableString(raw.guideContent),
    shortDesc: stringField(raw.shortDesc),
    description: stringField(raw.description),
    duration: stringField(raw.duration, true),
    videoUrl: nullableString(raw.videoUrl),
    logoImg: stringField(raw.logoImg),
    isPrivate: booleanField(raw.isPrivate),
    isPaid: booleanField(raw.isPaid),
    showInProfile: booleanField(raw.showInProfile),
    isPersonalized: booleanField(raw.isPersonalized),
    equipment: stringField(raw.equipment),
    trainingLevel,
    dayLinks, access,
  };
}

/**
 * Project AG4 exact versionedCourseEditorSnapshotSchema.
 * The old /draft is intentionally unchanged; its strict clients reject extras.
 */
function projectEditorSnapshot(
  source: unknown, requestedId: string,
): TrainerCourseEditorSnapshotItem {
  const raw = record(source);
  const version = positiveInt(raw.version);
  if (version > 2147483647) throw new Error("INVALID_COURSE_VERSION");
  return { ...projectCourseDraft(source, requestedId), version };
}

export function createReadCourseEditorApplication(dependencies: {
  readDraft: DraftReader;
  readEditorSnapshot: SnapshotReader;
}) {
  return {
    async draft(
      courseId: string,
      actorUserId: string,
      options: Parameters<DraftReader>[2],
    ): Promise<TrainerCourseDraftItem | null> {
      const source = await dependencies.readDraft(courseId, actorUserId, options);
      // Existing Core maps missing/foreign and swallowed DB failures to null.
      return source ? projectCourseDraft(source, courseId) : null;
    },
    async editorSnapshot(courseId: string, actor: Parameters<SnapshotReader>[1]): Promise<
      Exclude<Awaited<ReturnType<SnapshotReader>>, { status: "found" }> |
      { status: "found"; data: TrainerCourseEditorSnapshotItem }
    > {
      // One coherent Core snapshot call, never draft+version subreads.
      const result = await dependencies.readEditorSnapshot(courseId, actor);
      if (result.status !== "found") return result;
      return { status: "found" as const, data: projectEditorSnapshot(result.data, courseId) };
    },
  };
}
