// State shape для пользователя (БЕЗ методов)

import type { UserProfile } from "../data/user";

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

  // Состояние загрузки
  isLoading: boolean;
  isUpdating: boolean;

  // Ошибки
  error: string | null;
  profileError: string | null;

  // Кэш
  lastFetched: number | null;
}

export const USER_CACHE_DURATION = 5 * 60 * 1000; // 5 минут
