import { parsePrivateMediaLocation, signPrivateUserMedia, parsePublicQuestionLocation, presentPublicQuestionPhoto } from "@gafus/cdn-upload";

/** DB stores an immutable provider marker; the authorized DTO gets an expiring URL. */
export async function presentQuestionPhotoUrl(location: string): Promise<string> {
  if (parsePublicQuestionLocation(location)) return presentPublicQuestionPhoto(location);
  return parsePrivateMediaLocation(location) ? signPrivateUserMedia(location) : location;
}
