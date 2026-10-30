/** AG1-001/TR013: existing visible steps READ, unchanged strict metadata projection. */
import type { getVisibleSteps } from "@gafus/core/services/trainerStep";

type VisibleStepsReader = typeof getVisibleSteps;

type ObjectRecord = Record<string, unknown>;
import type { TrainerVisibleStepItem } from
  "../../../../../../packages/types/src/data/trainer-read-contracts";

function invalid(): never {
  // Internal fixed signal only. No exception from Prisma or DTO source.
  throw new Error("TR013_INVALID_CORE_STEP_RESULT");
}
function record(input: unknown): ObjectRecord {
  if (!input || typeof input !== "object" || Array.isArray(input)) return invalid();
  return input as ObjectRecord;
}
function array(input: unknown): unknown[] {
  if (!Array.isArray(input)) return invalid();
  return input as unknown[];
}
function text(input: unknown, nonempty = false): string {
  if (typeof input !== "string" || nonempty && input.length===0) return invalid();
  return input;
}
function nullableText(input: unknown): string | null {
  if (input === null) return null;
  return text(input);
}
function nullableNumber(input: unknown): number | null {
  if (input === null) return null;
  if (typeof input !== "number" || !Number.isFinite(input)) return invalid();
  return input;
}
function flag(input: unknown): boolean {
  if (typeof input !== "boolean") return invalid();
  return input;
}
function dateIso(input: unknown): string {
  if (!(input instanceof Date) || !Number.isFinite(input.getTime())) return invalid();
  return input.toISOString();
}
function stringArray(input: unknown): string[] {
  return array(input).map(item=>text(item));
}
function coreDto(input: unknown): TrainerVisibleStepItem {
  const step=record(input);
  const author=record(step.author);
  const profile=author.profile===null?null:record(author.profile);
  if (step.checklist === undefined) return invalid();
  return {
    id:text(step.id,true),
    title:text(step.title),
    description:text(step.description),
    durationSec:nullableNumber(step.durationSec),
    estimatedDurationSec:nullableNumber(step.estimatedDurationSec),
    type:text(step.type),
    videoUrl:nullableText(step.videoUrl),
    imageUrls:stringArray(step.imageUrls),
    pdfUrls:stringArray(step.pdfUrls),
    checklist:step.checklist,
    surveySlug:nullableText(step.surveySlug),
    isDailyCourse:flag(step.isDailyCourse),
    authorId:text(step.authorId,true),
    createdAt:dateIso(step.createdAt),
    updatedAt:dateIso(step.updatedAt),
    author:{
      username:text(author.username),
      profile:profile?{fullName:nullableText(profile.fullName)}:null,
    },
    stepLinks:array(step.stepLinks).map(linkInput=>{
      const day=record(record(linkInput).day);
      return {day:{dayLinks:array(day.dayLinks).map(dayLinkInput=>{
        const course=record(record(dayLinkInput).course);
        return {course:{
          id:text(course.id,true),
          name:text(course.name),
          shortDesc:text(course.shortDesc),
          logoImg:text(course.logoImg),
        }};
      })}};
    }),
  };
}

export function createReadVisibleStepsApplication(dependencies: {
  readSteps: VisibleStepsReader;
}) {
  return {
    async execute({ actorUserId, allowMixed, isDailyCourse }: {
      actorUserId: string; allowMixed: boolean; isDailyCourse: boolean;
    }): Promise<TrainerVisibleStepItem[]> {
      const rows: unknown = await dependencies.readSteps(actorUserId, allowMixed, {isDailyCourse});
      const result=array(rows).map(coreDto);
      if (result.some(row=>
        row.isDailyCourse!==isDailyCourse ||
        (!allowMixed && row.authorId!==actorUserId))) return invalid();
      for (let i=1;i<result.length;i++) {
        if (Date.parse(result[i-1]!.createdAt)<Date.parse(result[i]!.createdAt))
          return invalid();
      }
      return result;
    },
  };
}
