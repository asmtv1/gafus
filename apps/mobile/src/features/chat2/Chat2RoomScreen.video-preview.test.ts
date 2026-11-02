import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./Chat2RoomScreen.tsx", import.meta.url), "utf8");
const player = source.slice(source.indexOf("function NativeChat2VideoPlayer("), source.indexOf("function NativeChat2Video("));
const preview = source.slice(source.indexOf("function NativeChat2Video("));

describe("Chat2 Mobile video preview parity with Web", () => {
  it("loads the authorized signed URL and poster when a message mounts", () => {
    expect(preview).toContain("useEffect(() => {");
    expect(preview).toContain("() => chat2.media(conversationId, file.id), controller.signal");
    expect(preview).toContain("readProcessedChat2Media(");
    expect(preview).toContain("Обрабатываем видео…");
    expect(preview).toContain("media?.renditions?.poster");
    expect(preview).toContain("source={{ uri: poster }}");
    expect(preview).toContain("!everPlayed && !playing && (poster || thumbnail?.url === url)");
    expect(preview).toContain("<ExpoImage source={thumbnail.frame}");
    expect(player).toContain("player.generateThumbnailsAsync(0, { maxWidth: 440, maxHeight: 440 })");
    expect(preview).not.toContain("▶ {file.name}");
  });

  it("mounts a paused MP4 player, and only starts after Play", () => {
    const setup = player.slice(player.indexOf("const player = useVideoPlayer("), player.indexOf("useEffect(() => {"));
    expect(setup).toContain("instance.pause()");
    expect(setup).not.toContain("instance.play()");
    expect(player).toContain("onPlayingChange(isPlaying)");
    expect(player).toContain('surfaceType={Platform.OS === "android" ? "textureView" : undefined}');
    expect(preview).toContain("accessibilityLabel={`Воспроизвести ${file.name}`}");
    expect(preview).toContain("playerRef.current?.play()");
    expect(preview).toContain("controlsVisible={everPlayed}");
    expect(player).toContain("nativeControls={controlsVisible}");
    expect(player).toContain("requestThumbnail: boolean");
  });

  it("supports quality selection, S3 fallback, expired URLs and a visible retry", () => {
    expect(preview).toContain("chat2VideoSource(variants, quality, { width: 220 })");
    expect(preview).toContain("chat2MatchedS3Variant(primary, media)");
    expect(preview).toContain("chat2CdnS3FailoverAllowed(primary, backup, fetch, true)");
    expect(preview).toContain("setPosterViaS3(true)");
    expect(preview).toContain("Math.max(0, media.expiresIn - 30) * 1000");
    expect(preview).toContain("setResumeOnReady(playIntent.current || Boolean(playerRef.current?.playing))");
    expect(preview).toContain('accessibilityLabel="Повторить загрузку видео"');
    expect(preview).toContain("setReload(value => value + 1)");
    expect(preview).toContain("if (recoveryInProgress.current) return;");
    expect(preview).toContain("playIntent.current = true;");
  });
});
