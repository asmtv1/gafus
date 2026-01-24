/**
 * Константы для метаданных проекта GAFUS
 */

export const SITE_CONFIG = {
  name: "Гафус",
  url: process.env.NEXT_PUBLIC_SITE_URL || "https://gafus.ru",
  title: "Гафус — тренировки для собак от профессиональных кинологов",
  description:
    "Приложение для занятий с собакой: обучайтесь по урокам вашего кинолога, выполняйте задания каждый день, отслеживайте прогресс и получайте обратную связь.",
  locale: "ru_RU" as const,
  themeColor: "#DAD3C1",
} as const;

/**
 * Описания для разных аудиторий
 */
export const DESCRIPTIONS = {
  trainers:
    "Познакомьтесь с нашим приложением и начните уже сейчас создавать на нём уроки для своих клиентов. С Гафусом тренировки будут эффективнее, а коммуникация с клиентами проще!",
  students: "Умные пошаговые тренировки для собак онлайн с опытными кинологами",
} as const;

export const DEFAULT_OG_IMAGE = {
  url: "https://gafus.ru/uploads/logo.png",
  width: 1200,
  height: 630,
  alt: "Гафус",
} as const;

export const SOCIAL = {
  twitterCard: "summary_large_image" as const,
} as const;
