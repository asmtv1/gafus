"use client";

import { useData, useMutate } from "@gafus/swr";
import { getUserPets } from "@shared/lib/pets/getUserPets";

import type { Pet } from "@gafus/types";

export function useUserPets() {
  return useData<Pet[]>("user:pets", getUserPets, {
    revalidateOnFocus: false,
    dedupingInterval: 300000, // 5 минут
  });
}

export function usePetsMutation() {
  const { mutate } = useMutate();

  const invalidatePets = () => {
    mutate("user:pets");
  };

  return { invalidatePets };
}
