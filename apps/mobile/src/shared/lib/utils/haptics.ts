import * as Haptics from "expo-haptics";
import { Platform } from "react-native";

/**
 * Утилиты для haptic feedback
 * Обёртка над expo-haptics с проверкой платформы
 */
export const hapticFeedback = {
  /**
   * Лёгкий feedback (нажатие кнопки)
   */
  light: async () => {
    if (Platform.OS !== "web") {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  },

  /**
   * Средний feedback (старт таймера, выбор)
   */
  medium: async () => {
    if (Platform.OS !== "web") {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
  },

  /**
   * Тяжёлый feedback (важное действие)
   */
  heavy: async () => {
    if (Platform.OS !== "web") {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    }
  },

  /**
   * Успех (завершение шага, сохранение)
   */
  success: async () => {
    if (Platform.OS !== "web") {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  },

  /**
   * Ошибка
   */
  error: async () => {
    if (Platform.OS !== "web") {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  },

  /**
   * Предупреждение
   */
  warning: async () => {
    if (Platform.OS !== "web") {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    }
  },

  /**
   * Выбор элемента (picker, slider)
   */
  selection: async () => {
    if (Platform.OS !== "web") {
      await Haptics.selectionAsync();
    }
  },
};
