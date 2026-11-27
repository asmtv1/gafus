import { enqueueMobileTelemetryError } from "@/shared/lib/telemetry/mobileTelemetryClient";
import type { ClientErrorData } from "./types";

/** One canonical JS error sink: locally queued, privacy-filtered GAFUS telemetry.
 * Never forward message, user identifiers, raw HTTP URLs or caller-controlled tags. */
export async function reportClientErrorAndWait(error: unknown, data?: ClientErrorData): Promise<void> {
  const codes: Record<string, string> = {
    GlobalJsError: "JS_UNHANDLED",
    ScreenOrientation: "SCREEN_ORIENTATION",
    SplashScreen: "SPLASH_SCREEN",
    FontLoad: "FONT_LOAD",
    MobileTelemetrySelfTest: "MOBILE_TELEMETRY_SELF_TEST",
    DogWalkGpsNoPoints: "GPS_WALK_NO_POINTS",
    DogWalkGpsInsufficientFix: "GPS_WALK_INSUFFICIENT_FIX",
    DogWalkGpsStorageUnavailable: "GPS_WALK_STORAGE_UNAVAILABLE",
    OtaSignatureRejected: "OTA_SIGNATURE_REJECTED",
    OtaMandatoryIncomplete: "OTA_MANDATORY_INCOMPLETE",
  };
  const code = data?.issueKey ? codes[data.issueKey] : undefined;
  await enqueueMobileTelemetryError(error, {
    fatal: data?.severity === "fatal",
    kind: data?.issueKey === "GlobalJsError" && data.severity === "fatal"
      ? "js_fatal" : "js_handled",
    ...(code ? { errorCode: code } : {}),
  });
}

/** Fire-and-forget, never obstruct the user's action on telemetry failure. */
export function reportClientError(error: unknown, data?: ClientErrorData): void {
  void reportClientErrorAndWait(error, data).catch(() => undefined);
}
