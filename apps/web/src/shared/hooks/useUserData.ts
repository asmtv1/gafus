"use client";

import { reportClientError } from "@gafus/error-handling";
import { createWebLogger } from "@gafus/logger";
import { useData, useMutate, useQueryClient } from "@gafus/react-query";
import type { UserProfile } from "@gafus/types";

import { getUserProfile } from "@shared/lib/user/getUserProfile";
import { updateUserProfile } from "@shared/lib/user/updateUserProfile";

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
      staleTime: 60000,
    },
  );
}

export function useUserMutations() {
  const { mutate } = useMutate();
  const queryClient = useQueryClient();

  const updateProfile = async (data: Partial<UserProfile>) => {
    try {
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
    mutate,
  };
}
