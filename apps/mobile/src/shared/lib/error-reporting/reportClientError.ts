import { enqueueMobileTelemetryError } from "@/shared/lib/telemetry/mobileTelemetryClient";
import { mobileDiagnosticCatalog, type TelemetrySeverity } from "@gafus/types";
import type { ClientErrorData } from "./types";

const severity: Record<NonNullable<ClientErrorData["severity"]>, TelemetrySeverity> = {
  fatal: "FATAL", error: "ERROR", warning: "WARN", notice: "INFO", debug: "DEBUG",
};
type DiagnosticSource = { code: string; module: string; screen?: string; operation?: string };
const catalog: Readonly<Record<string, DiagnosticSource>> = mobileDiagnosticCatalog;
// The same exception object may bubble through several layers. Distinct Error
// objects still represent independent occurrences.
const reported = new WeakMap<object, { at: number; fatal: boolean }>();
export async function reportClientErrorAndWait(error: unknown, data?: ClientErrorData): Promise<void> {
  const object = typeof error === "object" && error !== null ? error : undefined;
  const now = Date.now();
  const fatal = data?.severity === "fatal";
  const prior = object ? reported.get(object) : undefined;
  if (prior && now - prior.at < 1000 && (!fatal || prior.fatal)) return;
  if (object) reported.set(object, { at: now, fatal });
  const key = data?.issueKey ?? "";
  const op = typeof data?.keys?.operation === "string" ? data.keys.operation : "";
  const id = key + ":" + op;
  const source = Object.prototype.hasOwnProperty.call(catalog, id) ? catalog[id] : undefined;
  try {
    await enqueueMobileTelemetryError(error, {
      fatal: data?.severity === "fatal",
      severity: severity[data?.severity ?? "error"],
      kind: key === "GlobalPromiseRejection" ? "promise_rejection" : key === "ErrorBoundary" ? "react_error" : key === "GlobalJsError" && data?.severity === "fatal" ? "js_fatal" : data?.http ? "network_failure" : "js_handled",
      ...(data?.http?{http:data.http}:{}),
      errorCode: source?.code ?? "JS_UNKNOWN",
      ...(source ? { module: source.module, screen: source.screen, operation: source.operation } : {}),
    });
  } catch (failure) {
    if (object) reported.delete(object);
    throw failure;
  }
}

/** Fire-and-forget, never obstruct the user's action on telemetry failure. */
export function reportClientError(error: unknown, data?: ClientErrorData): void {
  void reportClientErrorAndWait(error, data).catch(() => { /* diagnostic: expected Reporter failure is isolated from caller to prevent recursive telemetry. */ return undefined; });
}
