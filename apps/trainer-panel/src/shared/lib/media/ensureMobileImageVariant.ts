import {
  deleteFileFromCDN,
  downloadFileFromCDN,
  getRelativePathFromCDNUrl,
  isCDNUrl,
  uploadBufferToCDN,
} from "@gafus/cdn-upload";
import { createTrainerPanelLogger } from "@gafus/logger";
import sharp from "sharp";

const logger = createTrainerPanelLogger("trainer-mobile-image-variant");

const LEGACY_MOBILE_IMAGE_WIDTH = 800;
const LEGACY_MOBILE_IMAGE_QUALITY = 75;

type ImageVariantSize = "sm" | "md" | "lg";
type ImageVariantFormat = "webp" | "avif";

const IMAGE_VARIANT_SIZE_WIDTH: Record<ImageVariantSize, number> = {
  sm: 480,
  md: 800,
  lg: 1200,
};

const IMAGE_VARIANT_FORMAT_CONFIG: Record<
  ImageVariantFormat,
  { contentType: string; quality: number }
> = {
  webp: {
    contentType: "image/webp",
    quality: 78,
  },
  avif: {
    contentType: "image/avif",
    quality: 62,
  },
};

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

function getBasePathWithoutExtension(relativePath: string): string {
  const normalizedPath = relativePath.replace(/^\/+/, "");
  const pathWithoutQuery = normalizedPath.split("?")[0] ?? normalizedPath;
  const extensionIndex = pathWithoutQuery.lastIndexOf(".");
  return extensionIndex > 0 ? pathWithoutQuery.slice(0, extensionIndex) : pathWithoutQuery;
}

function getVariantRelativePath(
  relativePath: string,
  size: ImageVariantSize,
  format: ImageVariantFormat,
): string {
  const basePath = getBasePathWithoutExtension(relativePath);
  return `${basePath}.${size}.${format}`;
}

export function getImageVariantRelativePaths(relativePath: string): string[] {
  const paths: string[] = [relativePath];
  const variantSizes: ImageVariantSize[] = ["sm", "md", "lg"];
  const variantFormats: ImageVariantFormat[] = ["webp", "avif"];

  for (const size of variantSizes) {
    for (const format of variantFormats) {
      paths.push(getVariantRelativePath(relativePath, size, format));
    }
  }

  paths.push(getMobileVariantRelativePath(relativePath));

  return Array.from(new Set(paths));
}

export async function deleteImageWithVariantsFromLogoUrl(
  logoUrl: string | null | undefined,
): Promise<void> {
  if (!logoUrl) {
    return;
  }

  if (!isCDNUrl(logoUrl) && !isUploadsRelativePath(logoUrl)) {
    return;
  }

  const originalRelativePath = getRelativePathFromCDNUrl(logoUrl);
  const pathsToDelete = getImageVariantRelativePaths(originalRelativePath);

  await Promise.all(
    pathsToDelete.map(async (path) => {
      try {
        await deleteFileFromCDN(path);
      } catch (error) {
        logger.warn("Не удалось удалить вариант изображения", {
          path,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }),
  );
}

export interface LogoVariantsResult {
  success: boolean;
  mobileUrl?: string;
  variants?: Partial<Record<ImageVariantSize, Partial<Record<ImageVariantFormat, string>>>>;
  error?: string;
}

export async function ensureLogoImageVariantsForLogoUrl(
  originalLogoUrl: string | null | undefined,
): Promise<LogoVariantsResult> {
  if (!originalLogoUrl) {
    return { success: false, error: "Пустой URL логотипа" };
  }

  if (!isCDNUrl(originalLogoUrl) && !isUploadsRelativePath(originalLogoUrl)) {
    return { success: false, error: "Неподдерживаемый URL логотипа" };
  }

  try {
    const originalRelativePath = getRelativePathFromCDNUrl(originalLogoUrl);
    const originalBuffer = await downloadFileFromCDN(originalRelativePath);

    const variants: Partial<Record<ImageVariantSize, Partial<Record<ImageVariantFormat, string>>>> =
      {};
    const variantSizes: ImageVariantSize[] = ["sm", "md", "lg"];
    const variantFormats: ImageVariantFormat[] = ["webp", "avif"];

    for (const size of variantSizes) {
      variants[size] = {};
      const width = IMAGE_VARIANT_SIZE_WIDTH[size];

      for (const format of variantFormats) {
        const outputBuffer = await sharp(originalBuffer)
          .rotate()
          .resize({
            width,
            fit: "inside",
            withoutEnlargement: true,
          })
          [format]({
            quality: IMAGE_VARIANT_FORMAT_CONFIG[format].quality,
            effort: 4,
          })
          .toBuffer();

        const variantRelativePath = getVariantRelativePath(originalRelativePath, size, format);
        const variantUrl = await uploadBufferToCDN(
          outputBuffer,
          variantRelativePath,
          IMAGE_VARIANT_FORMAT_CONFIG[format].contentType,
        );
        variants[size]![format] = variantUrl;
      }
    }

    const mobileRelativePath = getMobileVariantRelativePath(originalRelativePath);
    const mobileBuffer = await sharp(originalBuffer)
      .rotate()
      .resize({
        width: LEGACY_MOBILE_IMAGE_WIDTH,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: LEGACY_MOBILE_IMAGE_QUALITY, effort: 4 })
      .toBuffer();
    const mobileUrl = await uploadBufferToCDN(mobileBuffer, mobileRelativePath, "image/webp");

    return { success: true, variants, mobileUrl };
  } catch (error) {
    logger.error(
      "Не удалось создать варианты логотипа",
      error instanceof Error ? error : new Error(String(error)),
      { originalLogoUrl },
    );
    return {
      success: false,
      error: error instanceof Error ? error.message : "Не удалось создать варианты логотипа",
    };
  }
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
  const result = await ensureLogoImageVariantsForLogoUrl(originalLogoUrl);
  if (!result.success) {
    return { success: false, error: result.error };
  }
  return { success: true, mobileUrl: result.mobileUrl };
}
