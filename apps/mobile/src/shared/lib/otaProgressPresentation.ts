/** Expo's downloadProgress does not include post-download asset verification.
 * Never paint a misleading 99–100% while fetchUpdateAsync is still pending. */
export function getRequiredOtaProgressPresentation(
  phase: "checking" | "downloading" | "installing" | "error",
  progress: number | null | undefined,
): { percent: number | null; finishing: boolean } {
  if (phase !== "downloading" || typeof progress !== "number" || !Number.isFinite(progress)) {
    return { percent: null, finishing: false };
  }
  const value = Math.max(0, Math.min(progress, 1));
  if (value >= 0.98) return { percent: null, finishing: true };
  return { percent: Math.floor(value * 100), finishing: false };
}
