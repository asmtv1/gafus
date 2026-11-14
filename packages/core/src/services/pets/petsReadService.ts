/**
 * Pet list/detail policy: caller chooses authenticated owner; the injected
 * adapter performs owner-scoped SQL reads and has no actor override options.
 */
import { createWebLogger } from "@gafus/logger";

const logger = createWebLogger("core-pets");

export interface PetReadPorts<ListItem, DetailItem> {
  readOwnedPets(ownerId: string): Promise<ListItem[]>;
  readOwnedPetDetail(petId: string, ownerId: string): Promise<DetailItem | null>;
}

/** Preserve strict Hono failures and old lenient Web fallback independently
 * from the persistence implementation. Never log raw DB errors or owner IDs.
 */
export async function getUserPets<T>(
  userId: string,
  options: { throwOnError?: boolean } = {},
  readOwnedPets: (ownerId: string) => Promise<T[]>,
): Promise<T[]> {
  try {
    return await readOwnedPets(userId);
  } catch (error) {
    logger.error("PET_LIST_FAILED");
    if (options.throwOnError) throw error;
    return [];
  }
}

/** A foreign or missing pet stays null; the adapter requires BOTH keys. */
export async function getPetById<T>(
  petId: string,
  userId: string,
  readOwnedPetDetail: (petId: string, ownerId: string) => Promise<T | null>,
): Promise<T | null> {
  return readOwnedPetDetail(petId, userId);
}
