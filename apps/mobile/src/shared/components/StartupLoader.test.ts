import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const mobileRoot = resolve(__dirname, "../../../");
const startup = readFileSync(resolve(mobileRoot, "src/shared/components/StartupLoader.tsx"), "utf8");
const rootLayout = readFileSync(resolve(mobileRoot, "app/_layout.tsx"), "utf8");
const courses = readFileSync(resolve(mobileRoot, "app/(main)/(tabs)/index.tsx"), "utf8");
const app = JSON.parse(readFileSync(resolve(mobileRoot, "app.json"), "utf8")) as {
  expo: {
    splash: { image: string };
    ios: { splash: { image: string } };
    plugins: unknown[];
  };
};

describe("mobile start screen uses one bundled static poster", () => {
  it("shares the identical PNG between native splash and the React cover", () => {
    expect(app.expo.splash.image).toBe("./assets/images/startup-splash.png");
    expect(app.expo.ios.splash.image).toBe("./assets/images/startup-splash.png");
    expect(startup).toContain('require("../../../assets/images/startup-splash.png")');
    expect(startup).toContain('resizeMode="cover"');
    expect(startup).toContain("onLoadEnd={onReady}");
  });
  it("never waits on GIF animation for startup and holds native splash until JS image loads", () => {
    expect(startup).not.toContain(".gif");
    expect(startup).not.toContain("autoplay");
    expect(rootLayout).toContain("SplashScreen.preventAutoHideAsync()");
    expect(rootLayout).toContain("if (startupImageReady)");
    expect(rootLayout).toContain("SplashScreen.hideAsync()");
    expect(rootLayout).not.toContain("loadingMascotReady");
    expect(rootLayout).not.toContain("warmUpLoadingMascot");
  });
  it("keeps the poster visible instead of a spinner during the first courses fetch", () => {
    expect(courses).toContain('import { StartupLoader } from "@/shared/components/StartupLoader"');
    expect(courses).toMatch(/if \(isLoading\)\s*\{\s*return <StartupLoader \/>;/);
    expect(courses).not.toContain('message="Загрузка курсов..."');
  });
});
