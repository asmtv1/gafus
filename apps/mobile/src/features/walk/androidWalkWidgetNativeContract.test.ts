import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const native = (file: string) =>
  readFileSync(new URL(`../../../native/android-walk/${file}`, import.meta.url), "utf8");

describe("Android walk widget is a native and directly actionable home-screen card", () => {
  it("fills the assigned launcher bounds with a single native layout", () => {
    const xml = native("res/layout/gafus_walk_widget.xml");
    expect(xml).toContain('android:layout_width="match_parent"');
    expect(xml).toContain('android:layout_height="match_parent"');
    expect(xml).toContain('android:background="@drawable/gafus_walk_card"');
    expect(xml).toContain("@+id/gafus_walk_chronometer");
    expect(xml.match(/@\+id\/gafus_walk_metrics/g)).toHaveLength(1);
    for (const name of ["start", "pause", "finish"]) {
      expect(xml).toContain(`@+id/gafus_walk_${name}`);
    }
    const renderer = native("src/ru/gafus/app/walk/DogWalkWidgetRenderer.java");
    expect(renderer).toContain("R.layout.gafus_walk_widget");
    expect(renderer).toContain("setChronometerCountDown");
    expect(renderer).toContain("setOnClickPendingIntent");
    expect(renderer).not.toContain("R.layout.rn_widget");
  });

  it("three actions use explicit background broadcasts, not app-deep-links", () => {
    const renderer = native("src/ru/gafus/app/walk/DogWalkWidgetRenderer.java");
    expect(renderer).toContain('context.getPackageName() + ".WIDGET_CLICK"');
    expect(renderer).toContain('intent.putExtra("clickAction", ACTION)');
    expect(renderer).toContain('addAction(context, views, id, R.id.gafus_walk_start, "start")');
    expect(renderer).toContain('addAction(context, views, id, R.id.gafus_walk_pause, "pause")');
    expect(renderer).toContain('addAction(context, views, id, R.id.gafus_walk_finish, "finish")');
    expect(renderer).toContain("PendingIntent.getBroadcast");
    expect(renderer).not.toContain("getActivity(");
    const handler = readFileSync(new URL("./widgets/androidWalkWidgets.tsx", import.meta.url), "utf8");
    expect(handler).toContain('props.widgetAction === "WIDGET_CLICK"');
    expect(handler).toContain('props.clickAction === "WALK_CONTROL"');
    expect(handler).toContain("handleAndroidWalkWidgetClick(props.clickActionData?.action)");
    expect(handler).not.toContain('clickAction="OPEN_URI"');
  });

  it("clean Expo prebuild copies layout, provider and module for Android store binaries", () => {
    const plugin = readFileSync(
      new URL("../../../plugins/withDogWalkBackgroundSteps.js", import.meta.url),
      "utf8",
    );
    expect(plugin).toContain("gafus_walk_widget");
    expect(plugin).toContain('native/android-walk/src/ru/gafus/app/widget/DogWalk.java');
    expect(plugin).toContain('for (const folder of ["layout", "drawable"])');
    expect(native("src/ru/gafus/app/widget/DogWalk.java")).toContain("DogWalkWidgetRenderer.update");
    expect(native("src/ru/gafus/app/walk/DogWalkStepModule.java")).toContain("publishWidget(");
  });
});
