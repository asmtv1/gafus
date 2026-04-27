/**
 * Контракт product analytics (Яндекс.Метрика и др.). Без сырого PII в props — см. F6 плана.
 * Расширение allowlist — только через PR (ANALYTICS_EVENT_NAMES + Zod в @gafus/analytics).
 */

/** Канонические имена (MVP, F1) — единый источник для веба и mobile. */
export const ANALYTICS_EVENT_NAMES = {
  page_view: "page_view",
  button_click: "button_click",
  register_success: "register_success",
  login_success: "login_success",
  booking_start: "booking_start",
  booking_confirm: "booking_confirm",
  course_open: "course_open",
} as const;

/** Зарезервировано для Phase 2; в MVP не используется в инструментации. */
export const ANALYTICS_EVENT_NAMES_EXTENSION = {
  login_failure: "login_failure",
  screen_view: "screen_view",
  logout_success: "logout_success",
  course_start_day: "course_start_day",
} as const;

export type AnalyticsEventName =
  (typeof ANALYTICS_EVENT_NAMES)[keyof typeof ANALYTICS_EVENT_NAMES];

export type AnalyticsPlatform = "web" | "mobile";

/** Базовые поля payload после нормализации в @gafus/analytics. */
export interface AnalyticsBaseFields {
  userId?: string;
  sessionId: string;
  platform: AnalyticsPlatform;
  pathOrScreen: string;
  ts: string;
}

export type AnalyticsTrackPayload =
  | (AnalyticsBaseFields & { eventName: "page_view" })
  | (AnalyticsBaseFields & {
      eventName: "button_click";
      elementId: string;
      courseType?: string;
      courseId?: string;
    })
  | (AnalyticsBaseFields & {
      eventName: "login_success";
      method: "credentials" | "vk";
    })
  | (AnalyticsBaseFields & {
      eventName: "register_success";
      flow?: "email" | "vk";
    })
  | (AnalyticsBaseFields & {
      eventName: "booking_start";
      courseType?: string;
      courseId?: string;
    })
  | (AnalyticsBaseFields & {
      eventName: "booking_confirm";
      courseType?: string;
      courseId?: string;
    })
  | (AnalyticsBaseFields & {
      eventName: "course_open";
      courseType?: string;
      courseId?: string;
    });

type SessionTsOptional = { sessionId?: string; ts?: string };

/**
 * Вход для trackEvent: sessionId/ts подставляются в клиенте; явный union — корректный narrow в вызовах.
 */
export type AnalyticsTrackEventInput =
  | ({ eventName: "page_view"; platform: AnalyticsPlatform; pathOrScreen: string; userId?: string } & SessionTsOptional)
  | ({
      eventName: "button_click";
      platform: AnalyticsPlatform;
      pathOrScreen: string;
      elementId: string;
      courseType?: string;
      courseId?: string;
      userId?: string;
    } & SessionTsOptional)
  | ({
      eventName: "login_success";
      platform: AnalyticsPlatform;
      pathOrScreen: string;
      method: "credentials" | "vk";
      userId?: string;
    } & SessionTsOptional)
  | ({
      eventName: "register_success";
      platform: AnalyticsPlatform;
      pathOrScreen: string;
      flow?: "email" | "vk";
      userId?: string;
    } & SessionTsOptional)
  | ({
      eventName: "booking_start";
      platform: AnalyticsPlatform;
      pathOrScreen: string;
      courseType?: string;
      courseId?: string;
      userId?: string;
    } & SessionTsOptional)
  | ({
      eventName: "booking_confirm";
      platform: AnalyticsPlatform;
      pathOrScreen: string;
      courseType?: string;
      courseId?: string;
      userId?: string;
    } & SessionTsOptional)
  | ({
      eventName: "course_open";
      platform: AnalyticsPlatform;
      pathOrScreen: string;
      courseType?: string;
      courseId?: string;
      userId?: string;
    } & SessionTsOptional);
