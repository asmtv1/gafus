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

  it("keeps play/pause available after the first play instead of relying on native auto-hidden controls", () => {
    expect(preview).toContain('{everPlayed && <Pressable accessibilityRole="button"');
    expect(preview).toContain('accessibilityLabel={playing ? "Пауза" : "Продолжить видео"}');
    expect(preview).toContain("onPress={event => { event.stopPropagation(); togglePlayback(); }}");
    expect(preview).toContain("player.pause()");
    expect(preview).toContain("playIntent.current = false;");
    expect(preview).toContain("void play();");
    expect(preview).toContain("setPlaying(false);");
    expect(preview).toContain("controlsVisible={everPlayed}");
    expect(player).toContain("onPlayingChange(isPlaying)");
  });

  it("renders settings gear inside the video instead of a permanent quality toolbar",()=>{
    expect(preview).toContain('<VideoQualitySettings value={quality} onChange={choose} available={variants} />');
    expect(preview).not.toContain('{multiple && url && <View accessibilityLabel="Качество видео"');
    expect(preview).toContain('setSeekTo(playerRef.current?.currentTime ?? 0)');
    expect(preview).toContain('setResumeOnReady(playerRef.current?.playing ?? false)');
  });
  it("supports quality selection, S3 fallback, expired URLs and a visible retry", () => {
    expect(preview).toContain("chat2VideoSource(variants, quality, qualityHints.current)");
    expect(preview).toContain("chat2MatchedS3Variant(primary, media)");
    expect(preview).toContain("chat2CdnS3FailoverAllowed(primary, backup, fetch, true)");
    expect(preview).toContain("setPosterViaS3(true)");
    expect(preview).toContain("Math.max(0, media.expiresIn - 30) * 1000");
    expect(preview).toContain("setResumeOnReady(playIntent.current || Boolean(playerRef.current?.playing))");
    expect(preview).toContain('accessibilityLabel="Проверить доступность видео ещё раз"');
    expect(preview).toContain("setReload(value => value + 1)");
    expect(preview).toContain("if (recoveryInProgress.current) return;");
    expect(preview).toContain("playIntent.current = true;");
  });
});
