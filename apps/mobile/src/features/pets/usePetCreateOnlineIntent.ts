/** G05 online AddPet intent. No automatic retry or offline queue. */
import { useCallback, useEffect, useRef, useState } from "react";
import * as Crypto from "expo-crypto";
import { useAuthStore } from "@/shared/stores/authStore";
import { newOnlyV2NativeQueues } from "@/shared/lib/offline/newOnlyV2Native";
import { petsApi, type CreatePetData } from "@/shared/lib/api/pets";
import { preparePetCreateIntent, type PetCreateIntent } from "./pet-create-intent";

export function usePetCreateOnlineIntent(create: typeof petsApi.create = petsApi.create) {
  const owner = useAuthStore((s) => s.user?.id ?? null);
  const intent = useRef<PetCreateIntent | null>(null);
  const generation = useRef(0);
  const [uncertain, setUncertain] = useState(false);
  const cancel = useCallback(() => {
    generation.current++;
    intent.current = null;
    setUncertain(false);
  }, []);
  useEffect(() => cancel, [owner, cancel]);
  const submit = useCallback(
    async (draft: CreatePetData, fresh = false) => {
      const binding = newOnlyV2NativeQueues.getVerifiedBinding();
      if (!owner || !binding || binding.principalId !== owner) {
        cancel();
        throw new Error("G05_SESSION_UNVERIFIED");
      }
      const currentIntent = preparePetCreateIntent(
        fresh ? null : intent.current,
        { ownerId: owner, authEpoch: binding.authEpoch },
        draft,
        () => Crypto.randomUUID(),
      );
      intent.current = currentIntent;
      const ticket = ++generation.current;
      const sameSession = () => {
        const current = newOnlyV2NativeQueues.getVerifiedBinding();
        return (
          ticket === generation.current &&
          useAuthStore.getState().user?.id === owner &&
          current?.principalId === owner &&
          current.authEpoch === binding.authEpoch
        );
      };
      try {
        const response = await create(
          {
            ...currentIntent.payload,
            clientRequestId: currentIntent.clientRequestId,
          },
          sameSession,
        );
        if (!sameSession()) {
          cancel();
          throw new Error("G05_SESSION_CHANGED");
        }
        if (
          !response.success ||
          !response.data?.id ||
          (response.data as typeof response.data & { ownerId?: string }).ownerId !== owner
        ) {
          if (
            response.code === "PET_CREATE_REQUEST_CONFLICT" ||
            response.code === "PET_CREATE_RESULT_UNAVAILABLE"
          ) {
            cancel();
            throw new Error(response.code);
          }
          setUncertain(true);
          throw new Error(response.code ?? "G05_RESULT_UNCONFIRMED");
        }
        cancel();
        return response;
      } catch (error) {
        if (
          error instanceof Error &&
          (error.message === "PET_CREATE_REQUEST_CONFLICT" ||
            error.message === "PET_CREATE_RESULT_UNAVAILABLE")
        )
          throw error;
        if (!sameSession()) {
          cancel();
          throw new Error("G05_SESSION_CHANGED");
        }
        if (intent.current) setUncertain(true);
        throw error;
      }
    },
    [owner, create, cancel],
  );
  /** A manual retry never revalidates or reads edited form fields. */
  const retry = useCallback(() => {
    const saved = intent.current;
    const binding = newOnlyV2NativeQueues.getVerifiedBinding();
    if (
      !saved ||
      !binding ||
      binding.principalId !== saved.ownerId ||
      binding.authEpoch !== saved.authEpoch ||
      useAuthStore.getState().user?.id !== saved.ownerId
    ) {
      cancel();
      return Promise.reject(new Error("G05_SESSION_CHANGED"));
    }
    return submit(saved.payload, false);
  }, [cancel, submit]);
  return { submit, retry, cancel, uncertain };
}
