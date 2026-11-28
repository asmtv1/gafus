import type { mobileDiagnosticCatalog, MobileHttpDiagnostic } from "@gafus/types";
type DiagnosticKey<T> = T extends `${infer Key}:${string}` ? Key : never;
/** Caller-facing error metadata. Arbitrary keys/userId never enter telemetry. */
export interface ClientErrorData {
  http?: MobileHttpDiagnostic;
  userId?: string;
  issueKey: DiagnosticKey<keyof typeof mobileDiagnosticCatalog>;
  severity?: "fatal" | "error" | "warning" | "notice" | "debug";
  keys?: Record<string, string | number | boolean>;
}
