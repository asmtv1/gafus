type CourseLogoVariant = "sm-avif" | "sm-webp" | "mobile-webp" | "original";

function splitUrl(imageUrl: string): { pathPart: string; queryPart: string } {
  const [pathPart, queryPart] = imageUrl.split("?");
  return {
    pathPart,
    queryPart: queryPart ?? "",
  };
}

function appendQuery(path: string, queryPart: string): string {
  return queryPart ? `${path}?${queryPart}` : path;
}

function getBasePathWithoutExtension(pathPart: string): string | null {
  const extensionIndex = pathPart.lastIndexOf(".");
  if (extensionIndex <= 0) {
    return null;
  }
  return pathPart.slice(0, extensionIndex);
}

/**
 * Строит URL mobile-версии картинки по соглашению:
 * original.ext -> original.mobile.webp
 */
export function getMobileImageVariantUrl(
  imageUrl: string | null | undefined,
): string | null {
  if (!imageUrl) return null;

  const { pathPart, queryPart } = splitUrl(imageUrl);
  const basePath = getBasePathWithoutExtension(pathPart);
  if (!basePath) {
    return null;
  }

  return appendQuery(`${basePath}.mobile.webp`, queryPart);
}

function getCourseLogoVariantUrl(
  imageUrl: string,
  variant: CourseLogoVariant,
): string | null {
  const { pathPart, queryPart } = splitUrl(imageUrl);

  if (variant === "original") {
    return appendQuery(pathPart, queryPart);
  }

  const basePath = getBasePathWithoutExtension(pathPart);
  if (!basePath) {
    return null;
  }

  if (variant === "sm-avif") {
    return appendQuery(`${basePath}.sm.avif`, queryPart);
  }
  if (variant === "sm-webp") {
    return appendQuery(`${basePath}.sm.webp`, queryPart);
  }
  return appendQuery(`${basePath}.mobile.webp`, queryPart);
}

/**
 * Возвращает URL-кандидаты логотипа в порядке приоритета:
 * sm.avif -> sm.webp -> mobile.webp -> original.
 */
export function getCourseLogoVariantCandidates(
  imageUrl: string | null | undefined,
): string[] {
  if (!imageUrl) {
    return [];
  }

  const variantsOrder: CourseLogoVariant[] = ["sm-avif", "sm-webp", "mobile-webp", "original"];
  const candidates = variantsOrder
    .map((variant) => getCourseLogoVariantUrl(imageUrl, variant))
    .filter((url): url is string => Boolean(url));

  return Array.from(new Set(candidates));
}

/** Для обложек статей используется тот же порядок fallback, что и для курсов. */
export function getArticleLogoVariantCandidates(
  imageUrl: string | null | undefined,
): string[] {
  return getCourseLogoVariantCandidates(imageUrl);
}
