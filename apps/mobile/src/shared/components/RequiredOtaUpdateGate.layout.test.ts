import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const file = readFileSync(
  new URL("./RequiredOtaUpdateGate.tsx", import.meta.url),
  "utf8",
);

describe("mandatory OTA screen design", () => {
  it("uses separate letter-free full-screen cloud wallpaper, never the busy splash poster", () => {
    expect(file).toContain('require("../../../assets/images/sky-background.png")');
    expect(file).toContain('resizeMode="cover"');
    expect(file).not.toContain('require("../../../assets/images/startup-splash.png")');
    expect(file).toContain('style={styles.wallpaper}');
    expect(file).toContain('width: "100%", height: "100%"');
    expect(file).toContain('accessibilityLabel="Небесный фон"');
  });

  it("positions a styled card above the gesture area near the bottom", () => {
    expect(file).toContain('justifyContent: "flex-end"');
    expect(file).toContain("const bottomOffset = Math.max(insets.bottom");
    expect(file).toContain("paddingBottom: bottomOffset");
    expect(file).toContain("backgroundColor: \"rgba(250, 247, 238, 0.97)\"");
  });

  it("shows honest MB, a finite download progress and an individual retry action", () => {
    expect(file).toContain('getOtaMainBundleBytes(result.manifest)');
    expect(file).toContain('Основной файл: ');
    expect(file).toContain(' МБ · доп. ресурсы отдельно');
    expect(file).toContain('accessibilityRole="progressbar"');
    expect(file).toContain('getRequiredOtaProgressPresentation(phase, progress)');
    expect(file).toContain('Завершаем загрузку и проверку ресурсов…');
    expect(file).toContain('label="Повторить загрузку"');
    expect(file).toContain('Размер файла не предоставлен сервером');
  });
});
