import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ nativeLoads: 0 }));
vi.mock("react-native", () => ({
  Linking: { openURL: vi.fn() },
  StyleSheet: { create: (s: unknown) => s },
  Text: "span",
  View: "div",
  TurboModuleRegistry: { get: () => null },
}));
vi.mock("@/shared/components/TexturedSafeAreaView", () => ({ TexturedSafeAreaView: "main" }));
vi.mock("@/shared/components/ui/Button", () => ({
  Button: ({ label }: { label: string }) => createElement("button", null, label),
}));
vi.mock("@/shared/components/ui/Loading", () => ({ Loading: "div" }));
vi.mock("@/shared/config", () => ({
  COLORS: { primary: "olive", text: "black" },
  FONTS: { montserrat: "sans-serif", montserratBold: "sans-serif" },
}));
vi.mock("./NativeChatScreen", () => {
  mock.nativeLoads++;
  throw new Error("Native SDK must not load in Expo Go");
});
vi.mock("./NativeCommunityChatScreen", () => {
  mock.nativeLoads++;
  throw new Error("Community SDK must not load in Expo Go");
});
import ChatScreen from "./ChatScreen";

describe("chat route in a binary without Stream", () => {
  it("renders client and trainer routes without importing the native SDK", () => {
    vi.stubGlobal("__DEV__", true);
    for (const props of [{}, { chatId: "trainer-dialog" }, { community: true }]) {
      const html = renderToStaticMarkup(createElement(ChatScreen, props));
      expect(html).toContain("Expo Go");
      expect(html).toContain("Открыть чат на сайте");
    }
    expect(mock.nativeLoads).toBe(0);
    vi.unstubAllGlobals();
  });
});
