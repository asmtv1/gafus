/** AG1-001: existing trainer visible-days READ port and exact safe metadata projection. */
import type { getVisibleDays } from "@gafus/core/services/trainingDay";

type VisibleDaysReader = typeof getVisibleDays;

type PlainObject = Record<string, unknown>;
import type { TrainerVisibleDayItem } from
  "../../../../../../packages/types/src/data/trainer-read-contracts";
/** Backward-compatible name for consumers of the previous route/application type. */
export type VisibleDayDto = TrainerVisibleDayItem;

function invalidData(): never {
  throw new Error("TRAINER_VISIBLE_DAYS_INVALID_CORE_DATA");
}
function obj(value: unknown): PlainObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalidData();
  return value as PlainObject;
}
function arr(value: unknown): unknown[] {
  if (!Array.isArray(value)) invalidData();
  return value;
}
function str(value: unknown, required = false): string {
  if (typeof value !== "string" || (required && value.length === 0)) invalidData();
  return value;
}
function bool(value: unknown): boolean {
  if (typeof value !== "boolean") invalidData();
  return value;
}
function order(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) invalidData();
  return value;
}
function nullableStr(value: unknown): string | null {
  return value === null ? null : str(value);
}
function iso(value: unknown): string {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) invalidData();
  return value.toISOString();
}
function sortedLinks<T extends { order: number }>(links: T[]): T[] {
  for (let i = 1; i < links.length; i++) {
    if (links[i - 1]!.order > links[i]!.order) invalidData();
  }
  return links;
}

function projectDays(input: unknown, actorId: string, elevated: boolean): TrainerVisibleDayItem[] {
  const rows = arr(input);
  const projected = rows.map(raw => {
    const day = obj(raw);
    const authorId = str(day.authorId, true);
    if (!elevated && authorId !== actorId) invalidData();
    const author = obj(day.author);
    const profile = author.profile === null ? null : obj(author.profile);
    const stepLinks = sortedLinks(arr(day.stepLinks).map(rawLink => {
      const link = obj(rawLink);
      const step = obj(link.step);
      return {
        id: str(link.id, true),
        order: order(link.order),
        step: { id: str(step.id, true), title: str(step.title) },
      };
    }));
    const dayLinks = sortedLinks(arr(day.dayLinks).map(rawLink => {
      const link = obj(rawLink);
      const course = obj(link.course);
      return {
        id: str(link.id, true),
        order: order(link.order),
        course: { id: str(course.id, true), name: str(course.name) },
      };
    }));
    return {
      id: str(day.id, true),
      title: str(day.title),
      equipment: str(day.equipment),
      description: str(day.description),
      type: str(day.type),
      authorId,
      showCoursePathExport: bool(day.showCoursePathExport),
      shareProgressAcrossCourses: bool(day.shareProgressAcrossCourses),
      createdAt: iso(day.createdAt),
      updatedAt: iso(day.updatedAt),
      author: {
        username: str(author.username),
        profile: profile === null ? null : { fullName: nullableStr(profile.fullName) },
      },
      stepLinks,
      dayLinks,
    };
  });
  // Core orders by createdAt DESC; no new sorting / pagination is invented.
  for (let i = 1; i < projected.length; i++) {
    if (projected[i - 1]!.createdAt < projected[i]!.createdAt) invalidData();
  }
  return projected;
}

export function createReadVisibleDaysApplication(dependencies: {
  readVisibleDays: VisibleDaysReader;
}) {
  return {
    async execute({ actorUserId, elevated }: {
      actorUserId: string;
      elevated: boolean;
    }): Promise<TrainerVisibleDayItem[]> {
      const rows = await dependencies.readVisibleDays(actorUserId, elevated);
      return projectDays(rows, actorUserId, elevated);
    },
  };
}
