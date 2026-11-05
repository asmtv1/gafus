/** Narrow, non-sensitive lifecycle stage for native media diagnostics. */
export type PhotoUploadStage = "jpeg" | "webp" | "reserve" | "transfer" | "confirm";

export class PhotoUploadStageError extends Error {
  readonly stage: PhotoUploadStage;
  readonly original: unknown;

  constructor(stage: PhotoUploadStage, original: unknown) {
    super(`PHOTO_${stage.toUpperCase()}_FAILED`);
    this.name = "PhotoUploadStageError";
    this.stage = stage;
    this.original = original;
  }
}

/** Files, signed URLs, account data and image bytes must never enter the JS console. */
function safeDiagnosticMessage(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/(?:https?:\/\/|file:\/\/|content:\/\/|ph:\/\/)[^\s"'<>]+/gi, "[URI]")
    .replace(/\/(?:Users|private|var|data|storage|tmp)\/[^\s"'<>]+/gi, "[PATH]")
    .replace(/(?:token|signature|secret|credential|password)=\S+/gi, "[REDACTED]")
    .slice(0, 180);
}

export function photoStageDiagnostic(error: unknown) {
  const stage = error instanceof PhotoUploadStageError ? error.stage : "unknown";
  const underlying = error instanceof PhotoUploadStageError ? error.original : error;
  return {
    stage,
    name: underlying instanceof Error ? underlying.name : typeof underlying,
    code: typeof underlying === "object" && underlying !== null &&
      "code" in underlying && typeof underlying.code === "string" &&
      /^[A-Z0-9_]{2,64}$/.test(underlying.code)
      ? underlying.code : "none",
    description: safeDiagnosticMessage(underlying instanceof Error ? underlying.message : ""),
  };
}

export function logPhotoUploadFailure(surface: string, error: unknown): void {
  if (typeof __DEV__ !== "undefined" && __DEV__) {
    console.warn("[gafus:photo-upload]", { surface, ...photoStageDiagnostic(error) });
  }
}
