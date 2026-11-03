/** AG4 TR013 proposed/frozen-for-mock read-only contract. NOT mounted; live AG1 API absent. */
import { z } from "zod/v3";
import type {
  TrainerVisibleStepItem,
  TrainerVisibleStepsRead,
} from "../../../../packages/types/src/data/trainer-read-contracts";
export const TR013_VISIBLE_STEPS_PROPOSED_PATH = "/api/v1/trainer/steps" as const;
const nonempty = z.string().min(1);
const course = z
  .object({ id: nonempty, name: z.string(), shortDesc: z.string(), logoImg: z.string() })
  .strict();
const dayLink = z.object({ course }).strict();
const day = z.object({
  id: nonempty.optional(), title: z.string().optional(), dayLinks: z.array(dayLink),
}).strict();
const stepLink = z.object({ day }).strict();
export const visibleStepSchema = z
  .object({
    id: nonempty,
    title: z.string(),
    description: z.string(),
    durationSec: z.number().nullable(),
    estimatedDurationSec: z.number().nullable(),
    type: z.string(),
    videoUrl: z.string().nullable(),
    imageUrls: z.array(z.string()),
    pdfUrls: z.array(z.string()),
    checklist: z.unknown(),
    surveySlug: z.string().nullable(),
    isDailyCourse: z.boolean(),
    authorId: nonempty,
    createdAt: z.string().datetime({ offset: true }),
    updatedAt: z.string().datetime({ offset: true }),
    author: z
      .object({
        username: z.string(),
        profile: z.object({ fullName: z.string().nullable() }).strict().nullable(),
      })
      .strict(),
    stepLinks: z.array(stepLink),
  })
  .strict();
export type VisibleStepDto = TrainerVisibleStepItem;
const successSchema = z
  .object({ success: z.literal(true), data: z.array(visibleStepSchema) })
  .strict();
export const tr013ApprovedReadContract = {
  method: "GET",
  path: TR013_VISIBLE_STEPS_PROPOSED_PATH,
  defaultIsDailyCourse: false,
  rolePolicy: "TRAINER own authorId; ADMIN and MODERATOR unscoped within isDailyCourse",
  response: "{success:true,data:VisibleStepDto[]}",
  errors: "400/401/403/500, failures not converted to []",
  cache: "private,no-store",
  status: "AG4_MOCK_FREEZE__AG1_NOT_REGISTERED",
} as const;
type Actor = { id: string; role: "TRAINER" | "ADMIN" | "MODERATOR" | "USER" | "PARTNER" | "GUEST" };
export type VisibleStepsReadInput = {
  enabled: true;
  actor: Actor;
  isDailyCourse?: boolean;
  signal: AbortSignal;
  isCurrent: () => boolean;
  transport: (input: {
    method: "GET";
    path: string;
    signal: AbortSignal;
  }) => Promise<{ status: number; headers: Record<string, string>; body: unknown }>;
};
export async function readVisibleSteps(
  input: { enabled: false } | VisibleStepsReadInput,
): Promise<VisibleStepDto[]> {
  if (!input.enabled) throw Error("TR013_DISABLED");
  if (!["TRAINER", "ADMIN", "MODERATOR"].includes(input.actor.role) || !input.actor.id.trim())
    throw Error("TR013_ROLE_DENIED");
  if (input.signal.aborted || !input.isCurrent()) throw Error("TR013_SESSION_RETIRED");
  const daily = input.isDailyCourse ?? false;
  if (typeof daily !== "boolean") throw Error("TR013_BAD_QUERY");
  const path = `${TR013_VISIBLE_STEPS_PROPOSED_PATH}?isDailyCourse=${daily}`;
  const result = await input.transport({ method: "GET", path, signal: input.signal });
  if (input.signal.aborted || !input.isCurrent()) throw Error("TR013_SESSION_RETIRED");
  const cache = (result.headers["cache-control"] ?? "")
    .toLowerCase()
    .split(",")
    .map((x) => x.trim());
  if (!cache.includes("private") || !cache.includes("no-store") || cache.includes("public"))
    throw Error("TR013_UNSAFE_CACHE");
  if (result.status !== 200) throw Error(`TR013_HTTP_${result.status}`);
  // Zod infers z.unknown() as optional; materialize the required wire key without a cast.
  const data: TrainerVisibleStepsRead["data"] = successSchema
    .parse(result.body)
    .data.map((step) => ({ ...step, checklist: step.checklist }));
  if (data.some((step) => step.isDailyCourse !== daily)) throw Error("TR013_WRONG_DAILY_SCOPE");
  if (input.actor.role === "TRAINER" && data.some((step) => step.authorId !== input.actor.id))
    throw Error("TR013_FOREIGN_OWNER");
  if (
    data.some((step, i) => i > 0 && Date.parse(data[i - 1]!.createdAt) < Date.parse(step.createdAt))
  )
    throw Error("TR013_WRONG_ORDER");
  if (input.signal.aborted || !input.isCurrent()) throw Error("TR013_SESSION_RETIRED");
  return data;
}
