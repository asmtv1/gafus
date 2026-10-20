import { parsePublicQuestionLocation, presentPublicQuestionPhoto } from "@gafus/cdn-upload";

/** Questions use only public, processed Cloud.ru media served by the CDN. */
export async function presentQuestionPhotoUrl(location: string): Promise<string> {
  if (!parsePublicQuestionLocation(location)) throw new Error("QUESTION_PUBLIC_INVALID_LOCATION");
  return presentPublicQuestionPhoto(location);
}
