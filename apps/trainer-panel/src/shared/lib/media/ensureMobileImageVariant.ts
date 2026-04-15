import {
  downloadFileFromCDN,
  getRelativePathFromCDNUrl,
  isCDNUrl,
  uploadBufferToCDN,
} from "@gafus/cdn-upload";
import { createTrainerPanelLogger } from "@gafus/logger";
import sharp from "sharp";

const logger = createTrainerPanelLogger("trainer-mobile-image-variant");

const MOBILE_IMAGE_WIDTH = 800;
const MOBILE_IMAGE_QUALITY = 75;

function isUploadsRelativePath(path: string): boolean {
  return path.startsWith("/uploads/") || path.startsWith("uploads/");
}

function getMobileVariantRelativePath(relativePath: string): string {
  const normalizedPath = relativePath.replace(/^\/+/, "");
  const pathWithoutQuery = normalizedPath.split("?")[0] ?? normalizedPath;
  const extensionIndex = pathWithoutQuery.lastIndexOf(".");
  const basePath =
    extensionIndex > 0 ? pathWithoutQuery.slice(0, extensionIndex) : pathWithoutQuery;
  return `${basePath}.mobile.webp`;
}

/**
 * Создает mobile-вариант изображения на основе оригинала:
 * - ширина до 800px (без увеличения),
 * - формат webp,
 * - качество 75.
 */
export async function ensureMobileImageVariantForLogoUrl(
  originalLogoUrl: string | null | undefined,
): Promise<{ success: boolean; mobileUrl?: string; error?: string }> {
  if (!originalLogoUrl) {
    return { success: false, error: "Пустой URL логотипа" };
  }

  if (!isCDNUrl(originalLogoUrl) && !isUploadsRelativePath(originalLogoUrl)) {
    return { success: false, error: "Неподдерживаемый URL логотипа" };
  }

  try {
    const originalRelativePath = getRelativePathFromCDNUrl(originalLogoUrl);
    const mobileRelativePath = getMobileVariantRelativePath(originalRelativePath);

    const originalBuffer = await downloadFileFromCDN(originalRelativePath);
    const mobileBuffer = await sharp(originalBuffer)
      .rotate()
      .resize({
        width: MOBILE_IMAGE_WIDTH,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: MOBILE_IMAGE_QUALITY, effort: 4 })
      .toBuffer();

    const mobileUrl = await uploadBufferToCDN(
      mobileBuffer,
      mobileRelativePath,
      "image/webp",
    );

    return { success: true, mobileUrl };
  } catch (error) {
    logger.error(
      "Не удалось создать mobile-вариант логотипа",
      error instanceof Error ? error : new Error(String(error)),
      { originalLogoUrl },
    );
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Не удалось создать mobile-вариант логотипа",
    };
  }
}
