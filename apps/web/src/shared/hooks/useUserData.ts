"use client";

import { reportClientError } from "@gafus/error-handling";
import { createWebLogger } from "@gafus/logger";
import { useData, useMutate, useQueryClient } from "@gafus/react-query";
import type { UserPreferences, UserProfile } from "@gafus/types";

import { getUserPreferences } from "@shared/lib/user/getUserPreferences";
import { getUserProfile } from "@shared/lib/user/getUserProfile";
import { updateUserProfile } from "@shared/lib/user/updateUserProfile";

// Создаем логгер для useUserData hooks
const logger = createWebLogger("web-use-user-data");

export function useUserProfile() {
  return useData<UserProfile | null>(
    "user:profile",
    async () => {
      try {
        return await getUserProfile();
      } catch (error) {
        reportClientError(error, { issueKey: "UseUserData", keys: { operation: "load_user_profile" } });
        logger.error("Ошибка загрузки профиля", error as Error, {
          operation: "load_user_profile_error",
        });
        return null;
      }
    },
    {
      refetchOnWindowFocus: false,
      staleTime: 60000, // 1 минута
    },
  );
}

export function useUserPreferences() {
  return useData<UserPreferences>(
    "user:preferences",
    async () => {
      try {
        const preferences = await getUserPreferences();
        return (
          preferences || {
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
          }
        );
      } catch (error) {
        reportClientError(error, {
          issueKey: "UseUserData",
          keys: { operation: "load_user_preferences" },
        });
        logger.error("Ошибка загрузки настроек", error as Error, {
          operation: "load_user_preferences_error",
        });
        return {
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
      }
    },
    {
      refetchOnWindowFocus: false,
      staleTime: 60000, // 1 минута
    },
  );
}

export function useUserMutations() {
  const { mutate } = useMutate();
  const queryClient = useQueryClient();

  const updateProfile = async (data: Partial<UserProfile>) => {
    try {
      // Преобразуем Partial<UserProfile> в UpdateUserProfileInput
      const updateData = {
        fullName: data.fullName || "",
        about: data.about || "",
        telegram: data.telegram || "",
        instagram: data.instagram || "",
        website: data.website || "",
        birthDate: data.birthDate ? data.birthDate.toISOString().split("T")[0] : "",
      };

      const updatedProfile = await updateUserProfile(updateData);
      queryClient.setQueryData(["user:profile"], updatedProfile);
      return { success: true, data: updatedProfile };
    } catch (error) {
      reportClientError(error, { issueKey: "UseUserData", keys: { operation: "update_user_profile" } });
      logger.error("Ошибка обновления профиля", error as Error, {
        operation: "update_user_profile_error",
        profileData: data,
      });
      return {
        success: false,
        error: error instanceof Error ? error.message : "Неизвестная ошибка",
      };
    }
  };

  return {
    updateProfile,
    // Экспортируем базовую мутацию, чтобы не считалась неиспользуемой
    mutate,
  };
}
