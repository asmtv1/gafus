import { getCurrentDeviceTokens, isSameVerifiedPushActor } from "@/shared/lib/utils/notifications";
import type { PushActor } from "@/shared/lib/utils/pushRegistrationOwner";

import { useAuthStore } from "@/shared/stores/authStore";
import { newOnlyV2NativeQueues } from "@/shared/lib/offline/newOnlyV2Native";
import { reportClientError } from "@/shared/lib/tracer";
import type { ApiResponse } from "./client";
import { validatedPetsForActor } from "./petsReadValidation";
export { validatedPetsForActor } from "./petsReadValidation";
import { notesApi } from "./notes";
import { petsApi, type Pet } from "./pets";
import { subscriptionsApi, type PushSubscriptionDeviceStatus } from "./subscriptions";
import { userApi } from "./user";

/** Профиль и связанные данные — общие опции для экрана и префетча после «Курсы». */
export const userProfileQueryOptions = {
  queryKey: ["user-profile"] as const,
  queryFn: async () => {
    const res = await userApi.getProfile();
    if (!res.success) throw new Error(res.error ?? "Ошибка загрузки профиля");
    return res;
  },
};

/** Keep the existing shared ["pets"] key for Tour, prefetch and mutations. */
export type PetsReadActor = { ownerId: string; authEpoch: string };
export type VerifiedPetsListResponse = ApiResponse<Pet[]> & {
  __petsOwnerId: string;
  __petsAuthEpoch: string;
};
export function verifiedPetsActor(): PetsReadActor | null {
  const state = useAuthStore.getState();
  if (!state.isAuthenticated || state.isLoading || !state.user?.id) return null;
  const binding = newOnlyV2NativeQueues.getVerifiedBinding();
  if (!binding || binding.principalId !== state.user.id || !binding.authEpoch) return null;
  return { ownerId: state.user.id, authEpoch: binding.authEpoch };
}
export function isCurrentPetsActor(actor: PetsReadActor | null): boolean {
  if (!actor) return false;
  const now = verifiedPetsActor();
  return now?.ownerId === actor.ownerId && now.authEpoch === actor.authEpoch;
}
export function petListForActor(response: unknown, actor: PetsReadActor | null): Pet[] | null {
  if (!actor || !response || typeof response !== "object") return null;
  const read = response as Partial<VerifiedPetsListResponse>;
  if (
    read.success !== true ||
    read.__petsOwnerId !== actor.ownerId ||
    read.__petsAuthEpoch !== actor.authEpoch
  )
    return null;
  try {
    return validatedPetsForActor(read.data, actor);
  } catch {
    reportClientError(new Error("PETS_LIST_CACHE_INVALID"), {
      issueKey: "PetsList",
      keys: { operation: "cache_projection" },
    });
    return null;
  }
}
export const petsQueryOptions = {
  queryKey: ["pets"] as const,
  queryFn: async (): Promise<VerifiedPetsListResponse> => {
    const actor = verifiedPetsActor();
    if (!actor || !isCurrentPetsActor(actor)) throw new Error("PETS_SESSION_CHANGED");
    const res = await petsApi.getAll(() => isCurrentPetsActor(actor));
    if (!isCurrentPetsActor(actor)) throw new Error("PETS_SESSION_CHANGED");
    if (!res.success) throw new Error("PETS_LIST_UNAVAILABLE");
    const data = validatedPetsForActor(res.data, actor);
    return { ...res, data, __petsOwnerId: actor.ownerId, __petsAuthEpoch: actor.authEpoch };
  },
};

export const pushSubscriptionDeviceStatusQueryOptions = {
  queryKey: ["push-subscription-device-status"] as const,
  queryFn: async () => {
    const tokens = await getCurrentDeviceTokens();
    const endpoints = [tokens.expo, tokens.rustore].filter(
      (ep): ep is string => typeof ep === "string" && ep.length > 0,
    );
    const res = await subscriptionsApi.postPushDeviceStatus(endpoints);
    if (!res.success || res.data === undefined) {
      throw new Error(res.error ?? "Не удалось проверить подписку");
    }
    return res.data;
  },
};

/** Owner+epoch scoped live screen query; old principal cache cannot show "Active" on B. */
export function pushDeviceStatusForActor(actor: PushActor | null) {
  return {
    queryKey: [
      ...pushSubscriptionDeviceStatusQueryOptions.queryKey,
      actor?.ownerId ?? null,
      actor?.authEpoch ?? null,
    ] as const,
    enabled: isSameVerifiedPushActor(actor),
    staleTime: 0,
    queryFn: async (): Promise<PushSubscriptionDeviceStatus> => {
      if (!isSameVerifiedPushActor(actor)) throw new Error("PUSH_SESSION_CHANGED");
      const tokens = await getCurrentDeviceTokens();
      if (!isSameVerifiedPushActor(actor)) throw new Error("PUSH_SESSION_CHANGED");
      const endpoints = [tokens.expo, tokens.rustore].filter(
        (ep): ep is string => typeof ep === "string" && ep.length > 0,
      );
      const res = await subscriptionsApi.postPushDeviceStatus(endpoints, () =>
        isSameVerifiedPushActor(actor),
      );
      if (!isSameVerifiedPushActor(actor)) throw new Error("PUSH_SESSION_CHANGED");
      if (!res.success || !res.data) throw new Error("PUSH_STATUS_UNKNOWN");
      return res.data;
    },
  };
}

export const studentNotesQueryOptions = {
  queryKey: ["student-notes"] as const,
  queryFn: notesApi.getStudentNotes,
};

export function trainerPublicProfileQueryOptions(username: string) {
  return {
    queryKey: ["trainer-public-profile", username] as const,
    queryFn: async () => {
      const res = await userApi.getPublicProfile(username);
      if (!res.success) {
        // Preserve the already-received transport code, as the existing Mobile
        // typed Error pattern does, without changing auth or request behavior.
        const error = new Error(res.error ?? "Ошибка загрузки профиля тренера") as Error & {
          code?: string;
        };
        error.code = res.code;
        throw error;
      }
      return res;
    },
  };
}
