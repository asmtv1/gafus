import * as Location from "expo-location";
import { AppState, Linking, Platform } from "react-native";

export type WalkLocationDisclosureDetails = "permission" | "background-settings" | "app-settings";

async function readPermissions() {
  const foreground = await Location.getForegroundPermissionsAsync();
  const background = await Location.getBackgroundPermissionsAsync();
  return { foreground, background };
}

/** Used by restoration and the widget. This check never opens system UI. */
export async function hasWalkLocationAccess(): Promise<boolean> {
  if (!(await Location.hasServicesEnabledAsync())) return false;
  const { foreground, background } = await readPermissions();
  return foreground.granted && background.granted;
}

async function openAppSettings(signal: AbortSignal): Promise<void> {
  let leftApp = false;
  let subscription: ReturnType<typeof AppState.addEventListener> | undefined;
  let resolveReturn!: () => void;
  const returned = new Promise<void>((resolve) => {
    resolveReturn = resolve;
    subscription = AppState.addEventListener("change", (state) => {
      if (state === "background") leftApp = true;
      if (leftApp && state === "active") resolve();
    });
  });
  signal.addEventListener("abort", resolveReturn, { once: true });
  try {
    if (!signal.aborted) {
      await Linking.openSettings();
      await returned;
    }
  } finally {
    subscription?.remove();
    signal.removeEventListener("abort", resolveReturn);
  }
}

/** Call only from an explicit walk action. Native requests always follow confirmation on Android. */
export async function requestWalkLocationAccess({
  confirm,
  isCurrent,
  signal,
}: {
  confirm: (details: WalkLocationDisclosureDetails) => Promise<boolean>;
  isCurrent: () => boolean;
  signal: AbortSignal;
}): Promise<boolean> {
  const canContinue = () => !signal.aborted && isCurrent();
  if (!canContinue() || !(await Location.hasServicesEnabledAsync())) return false;
  const { foreground, background } = await readPermissions();
  if (!canContinue()) return false;
  if (foreground.granted && background.granted) return true;

  if (Platform.OS === "android") {
    const needsAppSettings =
      (!foreground.granted && !foreground.canAskAgain) ||
      (foreground.granted && !background.granted && !background.canAskAgain);
    const details = needsAppSettings
      ? "app-settings"
      : Number(Platform.Version) >= 30
        ? "background-settings"
        : "permission";
    if (!(await confirm(details)) || !canContinue()) return false;
    if (needsAppSettings) {
      await openAppSettings(signal);
      return canContinue() && (await hasWalkLocationAccess());
    }
  }

  if (!foreground.granted) {
    if (!(await Location.requestForegroundPermissionsAsync()).granted || !canContinue()) {
      return false;
    }
  }

  // The foreground prompt can affect background access. Check again before
  // requesting it, and handle the real access state after returning from Android settings.
  if (!(await Location.getBackgroundPermissionsAsync()).granted) {
    if (!canContinue()) return false;
    await Location.requestBackgroundPermissionsAsync();
  }
  return canContinue() && (await hasWalkLocationAccess());
}
