/** Native NEW-only Phase1 persistence entrypoint. Never dispatches HTTP. */
import * as Crypto from "expo-crypto";
import type { CreatePreventionEntryData } from "@/shared/lib/api/pets";
import { newOnlyV2NativeQueues } from "./newOnlyV2Native";
import { enqueueNewOnlyPrevention } from "./newOnlyV2PreventionWriter";

export function enqueueNewOnlyPreventionNative(petId: string, data: CreatePreventionEntryData) {
  return enqueueNewOnlyPrevention(newOnlyV2NativeQueues, petId, data, () => Crypto.randomUUID());
}
