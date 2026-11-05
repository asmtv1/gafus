const { withDangerousMod } = require("expo/config-plugins");
const fs = require("node:fs");
const path = require("node:path");

/**
 * The RN Android Widget library snapshots React views into a bitmap, which
 * cannot animate. Override its shared RemoteViews layout with one native OS
 * Chronometer overlay (GONE by default); our patched RNWidget.java enables it
 * only for the DogWalk widget. Both light and night layouts stay identical.
 */
module.exports = function withDogWalkChronometer(config) {
  return withDangerousMod(config, ["android", async (mod) => {
    const packageRoot = path.dirname(require.resolve("react-native-android-widget/package.json", {
      paths: [mod.modRequest.projectRoot],
    }));
    const overlay = `
    <!-- GAFUS DogWalk only: enabled through RNWidget.setChronometer(). -->
    <Chronometer
        android:id="@+id/gafus_walk_chronometer"
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:layout_gravity="top|start"
        android:layout_marginTop="38dp"
        android:layout_marginStart="14dp"
        android:layout_marginEnd="14dp"
        android:visibility="gone"
        android:background="#F6F6E9"
        android:textColor="#1E271A"
        android:textSize="26sp"
        android:textStyle="bold"
        android:fontFamily="sans" />
    <!-- Updated directly by the Android foreground step service. -->
    <TextView
        android:id="@+id/gafus_walk_metrics"
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:layout_gravity="top|start"
        android:layout_marginTop="76dp"
        android:layout_marginStart="14dp"
        android:layout_marginEnd="14dp"
        android:visibility="gone"
        android:background="#F6F6E9"
        android:textColor="#1E271A"
        android:textSize="13sp"
        android:fontFamily="sans" />
`;
    for (const folder of ["layout", "layout-night"]) {
      const source = path.join(packageRoot, "android/src/main/res", folder, "rn_widget.xml");
      const original = fs.readFileSync(source, "utf8");
      if (!original.includes("</FrameLayout>")) {
        throw new Error("Android widget template changed: Chronometer overlay requires review");
      }
      const xml = original.replace(/<\/FrameLayout>\s*$/, `${overlay}</FrameLayout>\n`);
      const destination = path.join(mod.modRequest.platformProjectRoot, "app/src/main/res", folder);
      fs.mkdirSync(destination, { recursive: true });
      fs.writeFileSync(path.join(destination, "rn_widget.xml"), xml, "utf8");
    }
    return mod;
  }]);
};
