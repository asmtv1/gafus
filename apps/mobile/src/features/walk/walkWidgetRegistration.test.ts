import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const config = JSON.parse(readFileSync(new URL("../../../app.json", import.meta.url), "utf8"));
const manifest = JSON.parse(
  readFileSync(new URL("../../../package.json", import.meta.url), "utf8"),
);

function plugin(name: string) {
  return config.expo.plugins.find((item: unknown) => Array.isArray(item) && item[0] === name)?.[1];
}

describe("exactly one native dog-walk widget on each platform", () => {
  it("registers only DogWalk on iOS and Android", () => {
    expect(plugin("expo-widgets").widgets.map((item: { name: string }) => item.name)).toEqual([
      "DogWalk",
    ]);
    expect(
      plugin("react-native-android-widget").widgets.map((item: { name: string }) => item.name),
    ).toEqual(["DogWalk"]);
    expect(manifest.main).toBe("./widget-entry.ts");
  });

  it("overlays the Android system Chronometer instead of using JS intervals", () => {
    expect(config.expo.plugins).toContain("./plugins/withDogWalkChronometer");
    const pluginSource = readFileSync(
      new URL("../../../plugins/withDogWalkChronometer.js", import.meta.url),
      "utf8",
    );
    const patchedRenderer = readFileSync(
      new URL("../../../../../patches/react-native-android-widget@0.26.0.patch", import.meta.url),
      "utf8",
    );
    expect(pluginSource).toContain("<Chronometer");
    expect(patchedRenderer).toContain("remoteWidgetView.setChronometer(");
    expect(patchedRenderer).toContain("remoteWidgetView.setChronometerCountDown(");
  });

  it("registers a non-exported Android health foreground step service", () => {
    expect(config.expo.plugins).toContain("./plugins/withDogWalkBackgroundSteps");
    const plugin = readFileSync(
      new URL("../../../plugins/withDogWalkBackgroundSteps.js", import.meta.url),
      "utf8",
    );
    expect(plugin).toContain("android.permission.FOREGROUND_SERVICE_HEALTH");
    expect(plugin).toContain("android:foregroundServiceType");
    expect(plugin).toContain("android:exported");
    expect(plugin).toContain("android:stopWithTask");
    const source = readFileSync(
      new URL(
        "../../../native/android-walk/src/ru/gafus/app/walk/DogWalkStepService.java",
        import.meta.url,
      ),
      "utf8",
    );
    expect(source).toContain("Sensor.TYPE_STEP_COUNTER");
    expect(source).toContain("Sensor.TYPE_STEP_DETECTOR");
    expect(source).toContain("START_STICKY");
    expect(source).toContain("wasSensorRegistered");
    expect(source).toContain("partiallyUpdateAppWidget");
    expect(source).toContain("gafus://walk");
    expect(source).toContain("startForeground(");
    const screen = readFileSync(new URL("../../../app/(main)/walk.tsx", import.meta.url), "utf8");
    expect(screen).not.toContain("Pedometer.watchStepCount(");
    expect(screen).toContain("pauseAndroidWalkSteps(");
  });

  it("includes pedometer permissions for both stores", () => {
    expect(config.expo.android.permissions).toContain("android.permission.ACTIVITY_RECOGNITION");
    expect(config.expo.ios.infoPlist.NSMotionUsageDescription).toMatch(/шаг/);
  });
});
