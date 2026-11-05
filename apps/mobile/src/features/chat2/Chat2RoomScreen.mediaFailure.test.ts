import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const code = readFileSync(new URL("./Chat2RoomScreen.tsx", import.meta.url), "utf8");

describe("Chat2 attached video retry layout", () => {
  it("keeps a failed video actionable and displays the complete error below its filename", () => {
    expect(code).toContain("retryOneVideo(file.localId)");
    expect(code).toContain('style={styles.mediaFailure}');
    expect(code).toContain('<ScrollView style={styles.mediaPending}');
    expect(code).toContain("mediaPendingContent:");
    expect(code).toContain("mediaChipTop:");
    expect(code).toContain("mediaFailure: { color:");
    expect(code).not.toMatch(/maxWidth: 215/);
    expect(code).not.toMatch(/mediaPending: \{[^}]*maxHeight: 90/);
  });
  it("distinguishes native video preparation errors without recording filenames or URIs", () => {
    expect(code).toContain('reason: failureCode ?? "VIDEO720_NATIVE_ERROR"');
    expect(code).toContain('operation: "video_prepare"');
    expect(code).toContain('CHAT2_VIDEO_PREPARE_FAILED');
  });
});
