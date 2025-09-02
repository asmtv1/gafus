"use client";

import { useData, useMutate } from "@gafus/swr";
import { getUserPreferences } from "@shared/lib/user/getUserPreferences";
import { getUserProfile } from "@shared/lib/user/getUserProfile";
import { updateUserPreferences } from "@shared/lib/user/updateUserPreferences";
import { updateUserProfile } from "@shared/lib/user/updateUserProfile";

import type { UserProfile, UserPreferences } from "@gafus/types";

export function useUserProfile() {
  return useData<UserProfile | null>(
    "user:profile",
    async () => {
      try {
        return await getUserProfile();
      } catch (error) {
        console.error("Ошибка загрузки профиля:", error);
        return null;
      }
    },
    {
      revalidateOnFocus: false,
      dedupingInterval: 60000, // 1 минута
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
        console.error("Ошибка загрузки настроек:", error);
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
      revalidateOnFocus: false,
      dedupingInterval: 60000, // 1 минута
    },
  );
}

export function useUserMutations() {
  const { mutate } = useMutate();

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
      mutate("user:profile", updatedProfile);
      return { success: true, data: updatedProfile };
    } catch (error) {
      console.error("Ошибка обновления профиля:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Неизвестная ошибка",
      };
    }
  };

  const updatePreferences = async (data: Partial<UserPreferences>) => {
    try {
      const updatedPreferences = await updateUserPreferences(data);
      mutate("user:preferences", updatedPreferences);
      return { success: true, data: updatedPreferences };
    } catch (error) {
      console.error("Ошибка обновления настроек:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Неизвестная ошибка",
      };
    }
  };

  const invalidateUserData = () => {
    mutate("user:profile", undefined);
    mutate("user:preferences", undefined);
    // Инвалидируем достижения при изменении пользовательских данных
    mutate("user:achievements", undefined);
  };

  return {
    updateProfile,
    updatePreferences,
    invalidateUserData,
  };
}
