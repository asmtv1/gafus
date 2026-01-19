// State shape для пользователя (БЕЗ методов)

import type { UserProfile } from "../data/user";

export interface UserPreferences {
  // Настройки уведомлений
  notifications: {
    push: boolean;
    email: boolean;
    sms: boolean;
  };

  // Настройки звука
  sound: {
    enabled: boolean;
    volume: number;
    trainingSounds: boolean;
    achievementSounds: boolean;
  };

  // Настройки интерфейса
  interface: {
    autoPlay: boolean;
    showProgress: boolean;
    showTips: boolean;
    compactMode: boolean;
  };

  // Настройки приватности
  privacy: {
    showProfile: boolean;
    showProgress: boolean;
    allowAnalytics: boolean;
  };
}

export interface UserData {
  id: string;
  username: string;
  phone: string;
  role: "USER" | "ADMIN" | "MODERATOR" | "TRAINER" | "PREMIUM";
  isConfirmed: boolean;
  avatarUrl?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserStateData {
  // Основные данные пользователя
  user: UserData | null;
  profile: UserProfile | null;

  // Настройки пользователя
  preferences: UserPreferences;

  // Состояние загрузки
  isLoading: boolean;
  isUpdating: boolean;
  isUpdatingPreferences: boolean;

  // Ошибки
  error: string | null;
  profileError: string | null;
  preferencesError: string | null;

  // Кэш
  lastFetched: number | null;
  preferencesLastFetched: number | null;
}

// Константы
export const DEFAULT_USER_PREFERENCES: UserPreferences = {
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

export const USER_CACHE_DURATION = 5 * 60 * 1000; // 5 минут
export const USER_PREFERENCES_CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 часа
