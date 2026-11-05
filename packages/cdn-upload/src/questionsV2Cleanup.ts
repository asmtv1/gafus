/** Derive *only* the exact four possible Questions V2 keys for a leased photo.
 * Shared by Hono (lease) and existing GAFUS Worker (physical S3 delete).
 * No user-supplied keys or prefix-wide deletion are accepted.
 */
export type QuestionsV2CleanupKind = "SOURCE" | "ALL";
export interface QuestionsV2CleanupIdentity {
  ownerId: string;
  mediaId: string;
  sourceKey: string;
  sourceMime: string;
  cleanupKind: QuestionsV2CleanupKind;
}
const ownerPattern = /^[A-Za-z0-9_-]{1,128}$/;
const mediaPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const mimeExt: Record<string,string> = {
  "image/jpeg":"jpg", "image/png":"png", "image/webp":"webp",
};
export function questionsV2CleanupKeys(input: QuestionsV2CleanupIdentity): string[] {
  if (!ownerPattern.test(input.ownerId) || !mediaPattern.test(input.mediaId) ||
      !Object.prototype.hasOwnProperty.call(mimeExt,input.sourceMime) || !["SOURCE","ALL"].includes(input.cleanupKind))
    throw Error("QUESTIONS_V2_UNTRUSTED_CLEANUP_IDENTITY");
  const origin=`questions/v2/${input.ownerId}/${input.mediaId}/incoming`;
  const expectedSource=`${origin}/source.${mimeExt[input.sourceMime]}`;
  if (input.sourceKey !== expectedSource)
    throw Error("QUESTIONS_V2_UNTRUSTED_CLEANUP_SOURCE");
  const stage = input.sourceMime === "image/webp"
    ? [expectedSource,`${origin}/small.webp`] : [expectedSource];
  if (input.cleanupKind === "SOURCE") return stage;
  const finals=`questions/uploads/questions/v2/${input.ownerId}/${input.mediaId}/v1/image`;
  return [...stage,`${finals}/s.webp`,`${finals}/m.webp`];
}
