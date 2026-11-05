import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const mobileRoot = resolve(__dirname, "../../../");
const startup = readFileSync(resolve(mobileRoot, "src/shared/components/StartupLoader.tsx"), "utf8");
const rootLayout = readFileSync(resolve(mobileRoot, "app/_layout.tsx"), "utf8");
const courses = readFileSync(resolve(mobileRoot, "app/(main)/(tabs)/index.tsx"), "utf8");
const app = JSON.parse(readFileSync(resolve(mobileRoot, "app.json"), "utf8")) as {
  expo: {
    splash: { image: string; resizeMode: string };
    ios: { splash: { image: string; resizeMode: string } };
    plugins: unknown[];
  };
};

describe("mobile start screen uses one bundled static poster", () => {
  it("displays the complete startup poster on tall screens without cropping", () => {
    expect(app.expo.splash.image).toBe("./assets/images/startup-splash.png");
    expect(app.expo.ios.splash.image).toBe("./assets/images/startup-splash.png");
    expect(startup).toContain('require("../../../assets/images/startup-splash.png")');
    expect(app.expo.splash.resizeMode).toBe("contain");
    expect(app.expo.ios.splash.resizeMode).toBe("contain");
    const splashPlugin = app.expo.plugins.find(
      (plugin): plugin is [string, Record<string, unknown>] =>
        Array.isArray(plugin) && plugin[0] === "expo-splash-screen",
    );
    expect(splashPlugin?.[1]).toMatchObject({ ios: { resizeMode: "contain" } });
    expect(startup).toContain('resizeMode="contain"');
    expect(startup).not.toContain('resizeMode="cover"');
    expect(startup).toContain("onLoad={() => setImageLoaded(true)}");
    expect(startup).toContain("onLayout={() => setLaidOut(true)}");
    expect(startup).toContain('width: "100%"');
    expect(startup).toContain('height: "100%"');
    expect(startup).not.toContain("style={StyleSheet.absoluteFill}");
    expect(startup).toContain("if (laidOut && imageLoaded) onReady?.()");
  });
  it("never waits on GIF animation for startup and holds native splash until JS image loads", () => {
    expect(startup).not.toContain(".gif");
    expect(startup).not.toContain("autoplay");
    expect(rootLayout).toContain("SplashScreen.preventAutoHideAsync()");
    expect(rootLayout).toContain("if (!startupImageReady) return;");
    expect(rootLayout).toContain("requestAnimationFrame");
    expect(rootLayout).toContain("appContentLaidOut");
    expect(rootLayout).toContain("nativeSplashHidden");
    expect(rootLayout).toContain("startupVisible && <StartupLoader overlay onReady={onStartupReady} />");
    expect(rootLayout).not.toContain("return <StartupLoader onReady");
    expect(rootLayout).toContain("SplashScreen.hideAsync()");
    expect(rootLayout).not.toContain("loadingMascotReady");
    expect(rootLayout).not.toContain("warmUpLoadingMascot");
  });
  it("never repeats or zooms the startup poster inside the loaded tab navigator", () => {
    expect(courses).not.toContain("import { StartupLoader }");
    expect(courses).not.toContain("return <StartupLoader");
    expect(courses).toContain("if (isLoading)");
    expect(courses).toContain("Загружаем курсы…");
    expect(courses).toContain("styles.catalogLoading");
  });
  it("keeps native Android's post-splash window sky-blue before React paints", () => {
    // android/ is generated and ignored by Git. Assert the Expo config-plugin
    // transformation directly so clean GitHub Actions checkouts can validate it.
    expect(app.expo.plugins).toContain("./plugins/withStartupWindowBackground");
    const require = createRequire(import.meta.url);
    type Styles = { style: { $: { name: string }; item?: { $: { name: string }; _: string }[] }[] };
    const { ensureStartupWindowBackground } = require(
      resolve(mobileRoot, "plugins/withStartupWindowBackground.js"),
    ) as { ensureStartupWindowBackground: (resources: Styles) => Styles };
    const resources: Styles = { style: [{ $: { name: "AppTheme" }, item: [] }] };
    const transformed = ensureStartupWindowBackground(resources);
    expect(transformed.style[0]?.item).toContainEqual({
      $: { name: "android:windowBackground" },
      _: "@color/splashscreen_background",
    });
  });
});
