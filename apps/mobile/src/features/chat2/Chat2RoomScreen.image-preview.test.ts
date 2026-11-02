import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./Chat2RoomScreen.tsx", import.meta.url), "utf8");
const image = source.slice(source.indexOf("function NativeChat2Image("),
  source.indexOf("/** Mount the paused native player"));

describe("Native Chat2 image delivery and lightbox", () => {
  it("requests an authorized media URL and an exact matching fallback for the preview", () => {
    expect(image).toContain("readProcessedChat2Media(");
    expect(image).toContain("() => chat2.media(conversationId, file.id), controller.signal");
    expect(image).toContain("Обрабатываем фото…");
    expect(image).toContain("chat2ImageSource(result.renditions?.image, 220, PixelRatio.get(),");
    expect(image).toContain("chat2MatchedS3Variant(primary, result)");
    expect(image).toContain("chat2CdnS3FailoverAllowed(original, fallbackUrl, fetch, true)");
    expect(image).toContain("setFailed(true)");
    expect(image).toContain('cachePolicy={isCacheableChat2FinalUrl(url) ? "memory-disk" : "memory"}');
  });

  it("shows a retry when a thumbnail failed rather than hiding the attachment", () => {
    expect(image).toContain("setReload(previous => previous + 1)");
    expect(image).toContain("failed ? `Повторить загрузку ${file.name}`");
    expect(image).toContain('"Не удалось загрузить фото · Повторить"');
    expect(image).toContain("requestGeneration.current !== generation");
  });

  it("opens a fresh authorized full-size image inside the app, not in a browser", () => {
    expect(image).toContain("const refreshed = await chat2.media(conversationId, file.id)");
    expect(image).toContain("refreshed.renditions?.image?.[720] ?? refreshed.url");
    expect(image).toContain("chat2MatchedS3Variant(primary, refreshed)");
    expect(image).toContain("<Modal visible={Boolean(viewer)} transparent");
    expect(image).toContain('accessibilityLabel="Закрыть фотографию"');
    expect(image).toContain("chat2CdnS3FailoverAllowed(original, backup, fetch, true)");
    expect(image).toContain('accessibilityLabel="Повторить открытие фотографии"');
    expect(image).not.toContain("Linking.openURL");
    const documentViewer = source.slice(source.indexOf("function NativeChat2Document("),
      source.indexOf("function NativeChat2Image("));
    expect(documentViewer).toContain("Linking.openURL(media.url)");
  });
});
