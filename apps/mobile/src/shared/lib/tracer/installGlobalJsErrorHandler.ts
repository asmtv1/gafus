import { reportClientError } from "./reportClientError";

type RnErrorUtils = {
  getGlobalHandler?: () => ((error: Error, isFatal?: boolean) => void) | undefined;
  setGlobalHandler?: (handler: (error: Error, isFatal?: boolean) => void) => void;
};

/**
 * Репортит необработанные JS-ошибки в Tracer, затем вызывает предыдущий handler.
 * Вызывать один раз при старте приложения (например из root layout).
 */
export function installGlobalJsErrorHandler(): void {
  const errorUtils = (globalThis as { ErrorUtils?: RnErrorUtils }).ErrorUtils;
  if (!errorUtils?.setGlobalHandler) {
    return;
  }
  const previous = errorUtils.getGlobalHandler?.();
  errorUtils.setGlobalHandler((error: Error, isFatal?: boolean) => {
    reportClientError(error, {
      issueKey: "GlobalJsError",
      keys: { isFatal: String(Boolean(isFatal)) },
    });
    previous?.(error, isFatal);
  });
}
