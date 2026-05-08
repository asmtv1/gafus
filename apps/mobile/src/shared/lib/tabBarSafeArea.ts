type MainTabBarPlatform = "android" | "ios" | "macos" | "web" | "windows";

const BASE_TAB_BAR_MIN_HEIGHT = 72;
const BASE_TAB_BAR_PADDING_BOTTOM = 8;

export function getMainTabBarSafeAreaStyle(
  platform: MainTabBarPlatform,
  bottomInset: number,
) {
  if (platform !== "android") {
    return {
      minHeight: BASE_TAB_BAR_MIN_HEIGHT,
      paddingBottom: BASE_TAB_BAR_PADDING_BOTTOM,
    };
  }

  const androidBottomInset = Math.max(0, bottomInset);

  return {
    minHeight: BASE_TAB_BAR_MIN_HEIGHT + androidBottomInset,
    paddingBottom: BASE_TAB_BAR_PADDING_BOTTOM + androidBottomInset,
  };
}
