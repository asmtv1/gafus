/**
 * Строит URL mobile-версии картинки по соглашению:
 * original.ext -> original.mobile.webp
 */
export function getMobileImageVariantUrl(
  imageUrl: string | null | undefined,
): string | null {
  if (!imageUrl) return null;

  const [pathPart, queryPart] = imageUrl.split("?");
  const extensionIndex = pathPart.lastIndexOf(".");
  if (extensionIndex <= 0) return null;

  const basePath = pathPart.slice(0, extensionIndex);
  const mobilePath = `${basePath}.mobile.webp`;
  return queryPart ? `${mobilePath}?${queryPart}` : mobilePath;
}
