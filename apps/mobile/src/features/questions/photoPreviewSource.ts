import type { QuestionPhotoDto } from "@gafus/types";

type Preview = {
  url: string;
  fallbackUrl?: string;
  variant: "small" | "medium";
};

/** Pick the smallest rendition with enough *actual pixels* for the rendered
 * cell and device pixel density. Older photos lack smallWidth; use medium
 * rather than upscaling an unknown (often 360px-wide) thumbnail.
 */
export function questionPhotoPreviewSource(
  photo: QuestionPhotoDto,
  cellWidth: number,
  density: number,
  isSingle: boolean,
): Preview {
  const medium: Preview = {
    url: photo.url,
    fallbackUrl: photo.fallbackUrl,
    variant: "medium",
  };
  if (isSingle || !photo.smallUrl) return medium;
  const requiredWidth = cellWidth * (Number.isFinite(density) && density > 0 ? density : 2);
  if (!Number.isFinite(requiredWidth) || !Number.isFinite(photo.smallWidth) ||
      !photo.smallWidth || photo.smallWidth < requiredWidth) return medium;
  return {
    url: photo.smallUrl,
    fallbackUrl: photo.fallbackSmallUrl,
    variant: "small",
  };
}
