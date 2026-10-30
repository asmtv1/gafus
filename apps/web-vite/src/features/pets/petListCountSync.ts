import type { QueryClient } from "@tanstack/react-query";
import { CURRENT_USER_QUERY_KEY } from "../../shared/auth/useAuth";
import type { AuthUser } from "../../shared/auth/authApi";
import type { PetCard } from "./petApi";

/** A completed mutation does not change the compact footer until the exact
 * owner GET has confirmed the count. Never create or reuse another actor's
 * private list, and never mark a pending write as completed optimistically. */
export function syncVerifiedPetCount(
  cache: QueryClient,
  ownerId: string,
  petId: string,
  key: "preventionCount" | "documentCount",
  value: number,
): void {
  if (!Number.isSafeInteger(value) || value < 0 || value > 1_000_000) return;
  if (cache.getQueryData<AuthUser | null>(CURRENT_USER_QUERY_KEY)?.id !== ownerId) return;
  const queryKey = ["pets", "mine", ownerId] as const;
  const pets = cache.getQueryData<PetCard[]>(queryKey);
  if (!pets || !pets.some(pet => pet.id === petId)) return;
  cache.setQueryData<PetCard[]>(queryKey, pets.map(pet =>
    pet.id === petId ? { ...pet, [key]: value } : pet,
  ));
}
