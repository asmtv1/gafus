import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("expo-application", () => ({
  nativeBuildVersion: "101",
}));
vi.mock("expo-updates", () => ({
  updateId: null,
}));
vi.mock("react-native", () => ({
  Platform: { OS: "ios" },
}));
vi.mock("./tracerConfig", () => ({
  getTracerJsConfig: () => ({ appVersion: "ag3-local-test" }),
}));

import {
  addTracerBreadcrumb,
  getMobileJsTracerContext,
  redactTracerText,
  sanitizeTracerValue,
  setTracerScreen,
} from "./mobileJsTracer";

const s3SignedUrl =
  "https://media.example.invalid/private/user-a/lesson.m3u8?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=demo%2Fregion&X-Amz-Signature=sensitive-signature";
const googleSignedUrl =
  "https://media.example.invalid/private/user-a/photo.jpg?X-Goog-Credential=example&X-Goog-Signature=private-goog-signature";
const cloudFrontSignedUrl =
  "https://media.example.invalid/private/user-a/asset.mp4?Policy=private-policy&Signature=private-signature&Key-Pair-Id=ABC";

describe("AG3-OBS-052 sensitive native telemetry redaction", () => {
  beforeEach(() => {
    setTracerScreen("/profile");
  });

  it.each([
    ["S3 X-Amz signature", s3SignedUrl],
    ["Google signed URL", googleSignedUrl],
    ["CDN policy/signature", cloudFrontSignedUrl],
  ])("never sends a full %s URL through text sanitization", (_name, signedUrl) => {
    const output = redactTracerText("media request failed: " + signedUrl);
    expect(output).toContain("[REDACTED_SIGNED_URL]");
    expect(output).not.toContain("user-a");
    expect(output).not.toContain("private/");
    expect(output).not.toContain("signature");
    expect(output).not.toContain("Credential=");
    expect(output).not.toContain("Policy=");
  });

  it("redacts presigned URLs in nested telemetry values and signedUrl property names", () => {
    const input = {
      request: { url: s3SignedUrl, signedUrl: "https://media.example.invalid/secret/image" },
      error: { detail: "download from " + googleSignedUrl },
    };

    const result = JSON.stringify(sanitizeTracerValue(input));
    expect(result).not.toContain("private/");
    expect(result).not.toContain("sensitive-signature");
    expect(result).not.toContain("user-a");
    expect(result).not.toContain("/secret/image");
    expect(result).toContain("[REDACTED_SIGNED_URL]");
    expect(result).toContain("[REDACTED]");
  });

  it("does not keep raw signed URLs in current screen or navigation breadcrumbs", () => {
    setTracerScreen(s3SignedUrl);
    addTracerBreadcrumb("api", "Media request rejected: " + cloudFrontSignedUrl, {
      url: googleSignedUrl,
    });

    const context = JSON.stringify(getMobileJsTracerContext());
    expect(context).not.toContain("private/");
    expect(context).not.toContain("user-a");
    expect(context).not.toContain("sensitive-signature");
    expect(context).not.toContain("private-goog-signature");
    expect(context).toContain("[REDACTED_SIGNED_URL]");
  });

  it("retains non-sensitive routes and masks Bearer token and email as before", () => {
    expect(redactTracerText("GET /api/v1/courses?page=2")).toBe("GET /api/v1/courses?page=2");
    const text = redactTracerText("Bearer hidden-value; email alice@example.invalid");
    expect(text).toContain("Bearer [REDACTED]");
    expect(text).toContain("[REDACTED_EMAIL]");
    expect(text).not.toContain("hidden-value");
    expect(text).not.toContain("alice@example.invalid");
  });
});
