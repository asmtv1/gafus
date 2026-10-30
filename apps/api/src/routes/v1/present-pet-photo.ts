/** HTTP transport projection for isolated pet photographs.
 * Core read composition remains media/provider-free and DB rows keep
 * private provider-qualified locations instead of signed query strings.
 */
import { isIsolatedAvatarLocation, presentIsolatedAvatarUrl } from "@gafus/cdn-upload";

export async function presentOwnedPetPhoto<T extends { photoUrl?: string | null }>(
  pet: T,
): Promise<T> {
  if (!pet.photoUrl || !isIsolatedAvatarLocation(pet.photoUrl)) return pet;
  const signed = await presentIsolatedAvatarUrl(pet.photoUrl, 300);
  if (!signed) throw new Error("PET_IMAGE_SIGNING_UNAVAILABLE");
  return { ...pet, photoUrl: signed };
}
