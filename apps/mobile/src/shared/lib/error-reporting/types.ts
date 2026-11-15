/** Caller-facing error metadata. Arbitrary keys/userId never enter telemetry. */
export interface ClientErrorData {
  userId?: string;
  issueKey?: string;
  severity?: "fatal" | "error" | "warning" | "notice" | "debug";
  keys?: Record<string, string | number | boolean>;
}
