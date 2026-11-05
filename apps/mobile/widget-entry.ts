// Required for Android headless GPS delivery: the Expo entrypoint executes
// TaskManager registration before Expo Router mounts any React tree.
import "./src/features/walk/walkGpsTask";
import "expo-router/entry";
import { NativeModules, Platform, TurboModuleRegistry } from "react-native";
import type { WidgetTaskHandlerProps } from "react-native-android-widget";

// A previously built binary can receive a JS update before it has the new
// widget native module. Never import the module on that old runtime.
if (
  Platform.OS === "android" &&
  (NativeModules.AndroidWidget || TurboModuleRegistry.get("AndroidWidget"))
) {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const { registerWidgetTaskHandler } = require("react-native-android-widget") as {
    registerWidgetTaskHandler: (handler: (props: WidgetTaskHandlerProps) => Promise<void>) => void;
  };
  const { androidWalkWidgetTaskHandler } =
    require("./src/features/walk/widgets/androidWalkWidgets") as {
      androidWalkWidgetTaskHandler: (props: WidgetTaskHandlerProps) => Promise<void>;
    };
  /* eslint-enable @typescript-eslint/no-require-imports */
  registerWidgetTaskHandler(androidWalkWidgetTaskHandler);
}
