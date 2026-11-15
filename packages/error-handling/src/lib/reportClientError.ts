import { reportBrowserDiagnostic } from "../browserTelemetry";

export interface ClientErrorData {
  userId?: string;
  issueKey?: string;
  severity?: "fatal" | "error" | "warning" | "notice" | "debug";
  keys?: Record<string, string | number | boolean>;
}

/** Errors reach the same-origin, anonymous GAFUS browser telemetry collector.
 * Caller metadata is intentionally ignored: it may contain PII or signed URLs. */
export function reportClientError(error: unknown, _data?: ClientErrorData): void {
  if (typeof window === "undefined") return;
  reportBrowserDiagnostic(error, "react_error", "WEB_REACT_RENDER");
}
