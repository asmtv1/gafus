// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => ({
  StyleSheet: { absoluteFill: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0 } },
  View: ({
    children, style,
  }: {
    children?: React.ReactNode;
    style: { width: number; height: number };
  }) => <div data-width={style.width} data-height={style.height}>{children}</div>,
}));
vi.mock("expo-image", () => ({
  Image: ({ source }: { source: { uri: string } }) => <img src={source.uri} alt="" />,
}));
vi.mock("./loadingMascotAssets", () => ({
  getMascotPosterSource: () => ({ uri: "https://example.test/poster.png" }),
  getAnimatedMascotSource: () => ({ uri: "https://example.test/animated.gif" }),
}));

import { LoadingMascot, STANDARD_LOADING_MASCOT_PX } from "./LoadingMascot";

let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

describe("shared animated mascot sizing", () => {
  it("preserves the standard default size and static+animated dog layers", async () => {
    await act(async () => root.render(<LoadingMascot />));
    expect(host.querySelector("div")?.getAttribute("data-width"))
      .toBe(String(STANDARD_LOADING_MASCOT_PX));
    expect(host.querySelectorAll("img")).toHaveLength(2);
    expect(Array.from(host.querySelectorAll("img")).map(image => image.getAttribute("src")))
      .toEqual(["https://example.test/poster.png", "https://example.test/animated.gif"]);
  });

  it("uses a smaller size for inline cards without changing the dog assets", async () => {
    await act(async () => root.render(<LoadingMascot size={76} />));
    expect(host.querySelector("div")?.getAttribute("data-width")).toBe("76");
    expect(host.querySelector("div")?.getAttribute("data-height")).toBe("76");
    expect(host.querySelectorAll("img")).toHaveLength(2);
  });
});
