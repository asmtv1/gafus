import { useWindowDimensions } from "react-native";

import {
  contentWidth,
  isTablet,
  moderateScale,
  scale,
} from "@/shared/lib/utils/layout";

/**
 * Хук для responsive layout — стабильная вёрстка на разных устройствах.
 * Используй scale() для кнопок/иконок, moderateScale() для fontSize/padding,
 * contentWidth для ширины форм.
 */
export function useLayout() {
  const { width } = useWindowDimensions();

  return {
    width,
    /** Масштабирование (кнопки, иконки) */
    scale: (value: number) => scale(value, width),
    /** Умеренное масштабирование (fontSize, padding) */
    moderateScale: (value: number, factor?: number) =>
      moderateScale(value, width, factor),
    /** Ширина контента с padding и лимитом на планшетах */
    contentWidth: (horizontalPadding?: number, max?: number) =>
      contentWidth(width, horizontalPadding ?? 32, max),
    isTablet: isTablet(width),
  };
}
