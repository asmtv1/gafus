/** The backend reports real file transfer progress, but no server processing percentage. */
export function getFeedPublicationPercent(
  phase: "uploading" | "processing",
  progress?: number | null,
): number | null {
  if (phase !== "uploading" || progress == null || !Number.isFinite(progress)) return null;
  return Math.max(0, Math.min(100, progress));
}
