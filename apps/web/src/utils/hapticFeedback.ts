/**
 * Утилита для haptic feedback в PWA
 * Обеспечивает нативное ощущение через Vibration API
 */

type HapticPattern = "light" | "medium" | "heavy" | "success" | "warning" | "error";

interface HapticPatterns {
  light: number | number[];
  medium: number | number[];
  heavy: number | number[];
  success: number | number[];
  warning: number | number[];
  error: number | number[];
}

const HAPTIC_PATTERNS: HapticPatterns = {
  light: 10,
  medium: 20,
  heavy: 30,
  success: [10, 50, 10], // Короткая пауза короткая
  warning: [15, 100, 15, 100, 15], // Три коротких с паузами
  error: [50, 100, 50], // Две средних с паузой
};

/**
 * Проверяет доступность Vibration API
 */
function isVibrationSupported(): boolean {
  if (typeof window === "undefined") return false;
  return "vibrate" in navigator;
}

/**
 * Вызывает haptic feedback с заданным паттерном
 * @param pattern - Тип вибрации
 * @returns true если вибрация была вызвана, false если не поддерживается
 */
export function triggerHaptic(pattern: HapticPattern = "light"): boolean {
  if (!isVibrationSupported()) {
    return false;
  }

  try {
    const vibrationPattern = HAPTIC_PATTERNS[pattern];
    navigator.vibrate(vibrationPattern);
    return true;
  } catch (error) {
    console.warn("Failed to trigger haptic feedback:", error);
    return false;
  }
}

/**
 * Останавливает текущую вибрацию
 */
export function cancelHaptic(): void {
  if (isVibrationSupported()) {
    navigator.vibrate(0);
  }
}

/**
 * Haptic feedback для старта действия (таймер, шаг)
 */
export function hapticStart(): void {
  triggerHaptic("medium");
}

/**
 * Haptic feedback для завершения шага
 */
export function hapticComplete(): void {
  triggerHaptic("success");
}

/**
 * Haptic feedback для получения достижения
 */
export function hapticAchievement(): void {
  triggerHaptic("success");
}

/**
 * Haptic feedback для ошибки
 */
export function hapticError(): void {
  triggerHaptic("error");
}

/**
 * Haptic feedback для предупреждения
 */
export function hapticWarning(): void {
  triggerHaptic("warning");
}

/**
 * Легкий тактильный отклик для UI взаимодействий
 */
export function hapticLight(): void {
  triggerHaptic("light");
}

/**
 * Тяжелый тактильный отклик для важных действий
 */
export function hapticHeavy(): void {
  triggerHaptic("heavy");
}



