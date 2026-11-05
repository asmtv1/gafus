import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const file = readFileSync(
  new URL("./RequiredOtaUpdateGate.tsx", import.meta.url),
  "utf8",
);

describe("mandatory OTA screen design", () => {
  it("uses the same complete, uncropped poster as the native splash", () => {
    expect(file).toContain('require("../../../assets/images/startup-splash.png")');
    expect(file).toContain('resizeMode="contain"');
    expect(file).not.toContain('resizeMode="cover"');
    expect(file).toContain('accessibilityLabel="Всё у тебя получится!"');
  });

  it("positions a styled card above the gesture area near the bottom", () => {
    expect(file).toContain('justifyContent: "flex-end"');
    expect(file).toContain("const bottomOffset = Math.max(insets.bottom");
    expect(file).toContain("paddingBottom: bottomOffset");
    expect(file).toContain("backgroundColor: \"rgba(250, 247, 238, 0.97)\"");
  });

  it("shows honest MB, percentage, and an individual retry action", () => {
    expect(file).toContain('getOtaMainBundleBytes(result.manifest)');
    expect(file).toContain('Основной файл: ');
    expect(file).toContain(' МБ · доп. ресурсы отдельно');
    expect(file).toContain('accessibilityRole="progressbar"');
    expect(file).toContain('label="Повторить загрузку"');
    expect(file).toContain('Размер файла не предоставлен сервером');
  });
});
