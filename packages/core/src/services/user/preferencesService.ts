/**
 * Preferences Service - бизнес-логика работы с настройками пользователя
 */

import { createWebLogger } from "@gafus/logger";
import type { UserPreferences } from "@gafus/types";

const logger = createWebLogger("preferences-service");

// Дефолтные настройки
const DEFAULT_PREFERENCES: UserPreferences = {
  notifications: {
    push: true,
    email: false,
    sms: false,
  },
  sound: {
    enabled: true,
    volume: 0.7,
    trainingSounds: true,
    achievementSounds: true,
  },
  interface: {
    autoPlay: false,
    showProgress: true,
    showTips: true,
    compactMode: false,
  },
  privacy: {
    showProfile: true,
    showProgress: true,
    allowAnalytics: true,
  },
};

// ========== Get User Preferences ==========

/**
 * Получает настройки пользователя
 * Пока возвращаем дефолтные настройки
 */
export async function getUserPreferences(userId: string): Promise<UserPreferences> {
  // TODO: В будущем можно добавить таблицу user_preferences в БД
  return DEFAULT_PREFERENCES;
}

// ========== Update User Preferences ==========

// Глубокий Partial тип для вложенных объектов
type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

/**
 * Обновляет настройки пользователя
 */
export async function updateUserPreferences(
  userId: string,
  preferences: DeepPartial<UserPreferences>,
): Promise<UserPreferences> {
  // TODO: В будущем сохранять в БД
  logger.info("Обновление настроек пользователя", { userId, preferences });

  return {
    notifications: {
      ...DEFAULT_PREFERENCES.notifications,
      ...preferences.notifications,
    },
    sound: {
      ...DEFAULT_PREFERENCES.sound,
      ...preferences.sound,
    },
    interface: {
      ...DEFAULT_PREFERENCES.interface,
      ...preferences.interface,
    },
    privacy: {
      ...DEFAULT_PREFERENCES.privacy,
      ...preferences.privacy,
    },
  };
}
