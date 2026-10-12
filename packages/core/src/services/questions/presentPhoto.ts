import { parsePrivateMediaLocation, signPrivateUserMedia } from "@gafus/cdn-upload";

/** DB stores an immutable provider marker; the authorized DTO gets an expiring URL. */
export async function presentQuestionPhotoUrl(location: string): Promise<string> {
  return parsePrivateMediaLocation(location) ? signPrivateUserMedia(location) : location;
}
