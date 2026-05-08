import { describe, expect, it } from "vitest";

import { getMainTabBarSafeAreaStyle } from "./tabBarSafeArea";

describe("getMainTabBarSafeAreaStyle", () => {
  it("keeps the existing tab bar spacing on iOS", () => {
    expect(getMainTabBarSafeAreaStyle("ios", 34)).toEqual({
      minHeight: 72,
      paddingBottom: 8,
    });
  });

  it("adds Android bottom safe area to keep tabs above system navigation buttons", () => {
    expect(getMainTabBarSafeAreaStyle("android", 24)).toEqual({
      minHeight: 96,
      paddingBottom: 32,
    });
  });

  it("keeps the base Android spacing when there is no bottom inset", () => {
    expect(getMainTabBarSafeAreaStyle("android", 0)).toEqual({
      minHeight: 72,
      paddingBottom: 8,
    });
  });
});
