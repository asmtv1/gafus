"use client";

import { useData, useMutate } from "@gafus/swr";
import { getUserProfile } from "@shared/lib/user/getUserProfile";
import { getUserWithTrainings } from "@shared/lib/user/getUserWithTrainings";

import type { UserWithTrainings } from "@gafus/types";

export function useUserProfile() {
  return useData("user:profile", getUserProfile, {
    revalidateOnFocus: false,
    dedupingInterval: 300000, // 5 минут
  });
}

export function useUserWithTrainings() {
  return useData<UserWithTrainings | null>("user:with-trainings", getUserWithTrainings, {
    revalidateOnFocus: false,
    dedupingInterval: 300000, // 5 минут
  });
}

export function useProfileMutation() {
  const { mutate } = useMutate();

  const invalidateProfile = () => {
    mutate("user:profile");
  };

  const invalidateUserWithTrainings = () => {
    mutate("user:with-trainings");
  };

  const invalidateAllUserData = () => {
    mutate("user:profile");
    mutate("user:with-trainings");
  };

  return {
    invalidateProfile,
    invalidateUserWithTrainings,
    invalidateAllUserData,
  };
}
