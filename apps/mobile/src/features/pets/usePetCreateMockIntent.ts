/** AG4 G05 mounted mock only: no real POST or automatic replay. */
import { useCallback, useEffect, useRef, useState } from "react";
import * as Crypto from "expo-crypto";
import { useAuthStore } from "@/shared/stores/authStore";
import { newOnlyV2NativeQueues } from "@/shared/lib/offline/newOnlyV2Native";
import type { CreatePetData } from "@/shared/lib/api/pets";
import { preparePetCreateIntent, type PetCreateIntent } from "./pet-create-intent";
export type MockPetCreateTransport = (
  body: Readonly<CreatePetData> & { clientRequestId: string },
) => Promise<"UNCERTAIN">;
const mockTransport: MockPetCreateTransport = async () => "UNCERTAIN";
export function usePetCreateMockIntent(transport: MockPetCreateTransport = mockTransport) {
  const owner = useAuthStore((s) => s.user?.id ?? null);
  const intent = useRef<PetCreateIntent | null>(null);
  const epoch = useRef<string | null>(null);
  const seq = useRef(0);
  const pending = useRef(false);
  const [status, setStatus] = useState<"IDLE" | "UNCERTAIN" | "ERROR">("IDLE");
  const cancel = useCallback(() => {
    seq.current++;
    pending.current = false;
    intent.current = null;
    epoch.current = null;
    setStatus("IDLE");
  }, []);
  useEffect(() => cancel, [owner, cancel]);
  const submit = useCallback(
    async (draft: CreatePetData, newIntent = false) => {
      if (pending.current) return;
      const binding = newOnlyV2NativeQueues.getVerifiedBinding();
      if (!owner || !binding || binding.principalId !== owner) {
        cancel();
        setStatus("ERROR");
        return;
      }
      if (epoch.current && epoch.current !== binding.authEpoch) cancel();
      try {
        const chosen = preparePetCreateIntent(
          newIntent ? null : intent.current,
          { ownerId: owner, authEpoch: binding.authEpoch },
          draft,
          () => Crypto.randomUUID(),
        );
        intent.current = chosen;
        epoch.current = binding.authEpoch;
        const ticket = ++seq.current;
        pending.current = true;
        await transport({ ...chosen.payload, clientRequestId: chosen.clientRequestId });
        const current = newOnlyV2NativeQueues.getVerifiedBinding();
        if (
          ticket !== seq.current ||
          useAuthStore.getState().user?.id !== owner ||
          !current ||
          current.principalId !== owner ||
          current.authEpoch !== binding.authEpoch
        ) {
          cancel();
          return;
        }
        setStatus("UNCERTAIN");
      } catch {
        const current = newOnlyV2NativeQueues.getVerifiedBinding();
        if (
          !current ||
          current.principalId !== owner ||
          current.authEpoch !== binding.authEpoch ||
          useAuthStore.getState().user?.id !== owner
        ) {
          cancel();
        } else {
          setStatus("ERROR");
        }
      } finally {
        pending.current = false;
      }
    },
    [owner, cancel, transport],
  );
  return { status, submit, cancel };
}
