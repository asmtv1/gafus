/**
 * Референсная ширина экрана (iPhone SE / типичный телефон)
 * Все размеры масштабируются относительно неё
 */
export const REFERENCE_WIDTH = 375;

/** Ширина планшета (переход на tablet layout) */
export const TABLET_BREAKPOINT = 768;

/** Максимальная ширина контента для центрирования на планшетах */
export const MAX_CONTENT_WIDTH = 420;

/**
 * Линейное масштабирование по ширине экрана.
 * Используй для кнопок, иконок, отступов — чтобы пропорции сохранялись.
 */
export function scale(value: number, width: number): number {
  return Math.round((value * width) / REFERENCE_WIDTH);
}

/**
 * Умеренное масштабирование — не растёт так сильно на больших экранах.
 * factor 0.5 = половина масштаба, 1 = полный scale.
 * Подходит для fontSize, padding.
 */
export function moderateScale(value: number, width: number, factor = 0.5): number {
  const scaled = scale(value, width);
  return Math.round(value + (scaled - value) * factor);
}

/**
 * Ширина контента с учётом отступов и лимита на планшетах.
 * Контент не растягивается на планшетах — остаётся центрированным.
 * @param max — опциональный лимит (для форм, кнопок)
 */
export function contentWidth(
  width: number,
  horizontalPadding: number = 32,
  max?: number,
): number {
  const available = width - horizontalPadding;
  const limit = max ?? MAX_CONTENT_WIDTH;
  return Math.min(available, limit);
}

export function isTablet(width: number): boolean {
  return width >= TABLET_BREAKPOINT;
}
