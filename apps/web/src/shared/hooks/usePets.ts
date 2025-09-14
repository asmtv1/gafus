"use client";

import { useData, useMutate } from "@gafus/react-query";
import { getUserPets } from "@shared/lib/pets/getUserPets";
import { isOnline } from "@shared/utils/offlineCacheUtils";

import type { Pet } from "@gafus/types";

export function useUserPets() {
  return useData<Pet[]>("user:pets", getUserPets, {
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    staleTime: 60 * 60 * 1000, // 1 час - питомцы редко изменяются
    gcTime: 24 * 60 * 60 * 1000, // 24 часа
    networkMode: "offlineFirst",
    retry: (failureCount, error) => {
      if (!isOnline()) return false;
      if (error instanceof Error && error.message.includes('fetch')) {
        return failureCount < 2;
      }
      return failureCount < 3;
    },
  });
}

export function usePetsMutation() {
  const { mutate } = useMutate();

  const invalidatePets = () => {
    mutate("user:pets");
  };

  return { invalidatePets };
}
