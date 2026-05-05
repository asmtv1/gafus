import { z } from "zod";
import { ANALYTICS_EVENT_NAMES, type AnalyticsTrackPayload } from "@gafus/types";

import { MAX_ANALYTICS_PROPS_BYTES } from "./constants";

const canonicalNameSet = new Set<string>(Object.values(ANALYTICS_EVENT_NAMES));

export function isCanonicalEventName(
  name: string,
): name is (typeof ANALYTICS_EVENT_NAMES)[keyof typeof ANALYTICS_EVENT_NAMES] {
  return canonicalNameSet.has(name);
}

const base = z
  .object({
    eventName: z.string(),
    pathOrScreen: z.string(),
    platform: z.enum(["web", "mobile"]),
    sessionId: z.string(),
    ts: z.string(),
    userId: z.string().optional(),
  })
  .strict();

const schemas = {
  page_view: base.extend({ eventName: z.literal("page_view") }).strict(),

  button_click: base
    .extend({
      eventName: z.literal("button_click"),
      elementId: z.string(),
      courseId: z.string().optional(),
      courseType: z.string().optional(),
    })
    .strict(),

  login_success: base
    .extend({
      eventName: z.literal("login_success"),
      method: z.enum(["credentials", "vk"]),
    })
    .strict(),

  register_success: base
    .extend({
      eventName: z.literal("register_success"),
      flow: z.enum(["email", "vk"]).optional(),
    })
    .strict(),

  booking_start: base
    .extend({
      eventName: z.literal("booking_start"),
      courseId: z.string().optional(),
      courseType: z.string().optional(),
    })
    .strict(),

  booking_confirm: base
    .extend({
      eventName: z.literal("booking_confirm"),
      courseId: z.string().optional(),
      courseType: z.string().optional(),
    })
    .strict(),

  course_open: base
    .extend({
      eventName: z.literal("course_open"),
      courseId: z.string().optional(),
      courseType: z.string().optional(),
    })
    .strict(),

  mobile_onboarding_started: base
    .extend({
      eventName: z.literal("mobile_onboarding_started"),
      elementId: z.string(),
      version: z.string(),
      stepId: z.string().optional(),
    })
    .strict(),

  mobile_onboarding_step_viewed: base
    .extend({
      eventName: z.literal("mobile_onboarding_step_viewed"),
      elementId: z.string(),
      version: z.string(),
      stepId: z.string().optional(),
    })
    .strict(),

  mobile_onboarding_skipped: base
    .extend({
      eventName: z.literal("mobile_onboarding_skipped"),
      elementId: z.string(),
      version: z.string(),
      stepId: z.string().optional(),
    })
    .strict(),

  mobile_onboarding_completed: base
    .extend({
      eventName: z.literal("mobile_onboarding_completed"),
      elementId: z.string(),
      version: z.string(),
      stepId: z.string().optional(),
    })
    .strict(),
} as const;

/**
 * Парсинг строгих payload; без throw наружу.
 */
export function safeParseTrackPayload(
  input: unknown,
): { ok: true; value: AnalyticsTrackPayload } | { ok: false } {
  if (typeof input !== "object" || input === null) {
    return { ok: false };
  }
  const eventName = (input as { eventName?: string }).eventName;
  if (typeof eventName !== "string" || !isCanonicalEventName(eventName)) {
    return { ok: false };
  }
  const parser = schemas[eventName as keyof typeof schemas];
  if (!parser) {
    return { ok: false };
  }
  const r = parser.safeParse(input);
  if (!r.success) {
    return { ok: false };
  }
  return { ok: true, value: r.data as AnalyticsTrackPayload };
}

function utf8ByteLength(s: string): number {
  return new TextEncoder().encode(s).length;
}

/**
 * Сериализация объекта `gafus` для PostHog; при превышении лимита — только `{ truncated: true }` (F6).
 */
export function buildGafusProperties(payload: AnalyticsTrackPayload): Record<string, unknown> {
  const flat: Record<string, unknown> = { ...payload };
  const s = JSON.stringify(flat);
  if (utf8ByteLength(s) <= MAX_ANALYTICS_PROPS_BYTES) {
    return flat;
  }
  return { truncated: true };
}
