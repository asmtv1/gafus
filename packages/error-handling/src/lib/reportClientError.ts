export interface ClientErrorData {
  userId?: string;
  issueKey?: string;
  severity?: "fatal" | "error" | "warning" | "notice" | "debug";
  keys?: Record<string, string | number | boolean>;
}

declare global {
  interface Window {
    __gafusReportError?: (error: unknown, data?: ClientErrorData) => void;
  }
}

/**
 * Отправляет ошибку в Tracer через bridge, установленный TracerProvider.
 * No-op если bridge недоступен (dev без TOKEN, SSR).
 */
export function reportClientError(error: unknown, data?: ClientErrorData): void {
  if (typeof window === "undefined") return;
  window.__gafusReportError?.(error, data);
}
