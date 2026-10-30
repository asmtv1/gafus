/** AG4 TR013 public list scoped DTO freeze. NOT mounted; Hono implementation pending. */
import { z } from "zod";
import type {
  TrainerPublicStepTemplateItem,
  TrainerPublicStepTemplatesRead,
} from "../../../../packages/types/src/data/trainer-read-contracts";
const short = z.string().min(1);
export const templateListItemSchema = z
  .object({
    id: short,
    title: z.string(),
    description: z.string(),
    durationSec: z.number().nullable(),
    type: z.string(),
    imageUrls: z.array(z.string()),
    pdfUrls: z.array(z.string()),
    videoUrl: z.string().nullable(),
    checklist: z.unknown(),
    requiresVideoReport: z.boolean(),
    requiresWrittenFeedback: z.boolean(),
    hasTestQuestions: z.boolean(),
    surveySlug: z.string().nullable(),
    tags: z.array(z.string()),
    isPublic: z.literal(true),
    usageCount: z.number().int().nonnegative(),
    category: z
      .object({ id: short, name: z.string(), icon: z.string().nullable() })
      .strict()
      .nullable(),
    author: z.object({ id: short, username: z.string() }).strict(),
    createdAt: z.string().datetime({ offset: true }),
  })
  .strict();
export type PublicTemplateListItem = TrainerPublicStepTemplateItem;
/** Explicit panel-authenticated path; not public/guest endpoint. */
export const TR013_PUBLIC_TEMPLATE_LIST_PATH = "/api/v1/trainer/templates" as const;
export const tr013PublicTemplateReadFreeze = {
  method: "GET",
  path: TR013_PUBLIC_TEMPLATE_LIST_PATH,
  query: "optional categoryId; omitted/empty means no filter",
  roles: ["TRAINER", "ADMIN", "MODERATOR"],
  scope: "isPublic true across all authors",
  order: "usageCount desc, createdAt desc",
  dto: "explicit strict StepTemplateWithCategory projection, ISO createdAt",
  privateCache: "private,no-store",
  errors: [400, 401, 403, 500],
  status: "AG4_CONTRACT_FREEZE_AG1_ROUTE_UNREGISTERED",
} as const;
const envelope = z
  .object({ success: z.literal(true), data: z.array(templateListItemSchema) })
  .strict();
export type TemplateListReadConfig = {
  enabled: true;
  role: "TRAINER" | "ADMIN" | "MODERATOR";
  actorId: string;
  categoryId?: string;
  signal: AbortSignal;
  isCurrent: () => boolean;
  transport: (
    path: string,
    signal: AbortSignal,
  ) => Promise<{ status: number; headers: Record<string, string>; body: unknown }>;
};
/** No default URL, no default transport, no fetch, no privilege from UI alone. */
export async function readPublicTemplates(
  config: { enabled: false } | TemplateListReadConfig,
): Promise<PublicTemplateListItem[]> {
  if (!config.enabled) throw Error("TR013_NOT_APPROVED");
  if (!["TRAINER", "ADMIN", "MODERATOR"].includes(config.role) || !config.actorId.trim())
    throw Error("TR013_UNAPPROVED_CONTRACT");
  if (config.signal.aborted || !config.isCurrent()) throw Error("SESSION_RETIRED");
  const path = config.categoryId
    ? `${TR013_PUBLIC_TEMPLATE_LIST_PATH}?categoryId=${encodeURIComponent(config.categoryId)}`
    : TR013_PUBLIC_TEMPLATE_LIST_PATH;
  const res = await config.transport(path, config.signal);
  if (config.signal.aborted || !config.isCurrent()) throw Error("SESSION_RETIRED");
  const cc =
    res.headers["cache-control"]
      ?.toLowerCase()
      .split(",")
      .map((x) => x.trim()) ?? [];
  if (!cc.includes("private") || !cc.includes("no-store") || cc.includes("public"))
    throw Error("UNSAFE_TEMPLATE_CACHE");
  if (res.status !== 200) throw Error(`HTTP_${res.status}`);
  // Zod infers z.unknown() as optional; materialize the required wire key without a cast.
  const parsed: TrainerPublicStepTemplatesRead["data"] = envelope
    .parse(res.body)
    .data.map((item) => ({ ...item, checklist: item.checklist }));
  if (config.signal.aborted || !config.isCurrent()) throw Error("SESSION_RETIRED");
  return parsed;
}
