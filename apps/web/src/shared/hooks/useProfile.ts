"use client";

import { useData, useMutate } from "@gafus/react-query";
import { getUserProfile } from "@shared/lib/user/getUserProfile";
import { getUserWithTrainings } from "@shared/lib/user/getUserWithTrainings";
import { isOnline } from "@shared/utils/offlineCacheUtils";

import type { UserWithTrainings } from "@gafus/types";

export function useUserProfile() {
  return useData("user:profile", getUserProfile, {
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    staleTime: 30 * 60 * 1000, // 30 минут - профиль может изменяться чаще
    gcTime: 12 * 60 * 60 * 1000, // 12 часов
    networkMode: "offlineFirst",
    retry: (failureCount, error) => {
      if (!isOnline()) return false;
      if (error instanceof Error && error.message.includes("fetch")) {
        return failureCount < 2;
      }
      return failureCount < 3;
    },
  });
}

export function useUserWithTrainings() {
  return useData<UserWithTrainings | null>("user:with-trainings", getUserWithTrainings, {
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    staleTime: 15 * 60 * 1000, // 15 минут - тренировки могут обновляться чаще
    gcTime: 6 * 60 * 60 * 1000, // 6 часов
    networkMode: "offlineFirst",
    retry: (failureCount, error) => {
      if (!isOnline()) return false;
      if (error instanceof Error && error.message.includes("fetch")) {
        return failureCount < 2;
      }
      return failureCount < 3;
    },
  });
}

export function useProfileMutation() {
  const { mutate: _mutate } = useMutate();
  return {};
}
