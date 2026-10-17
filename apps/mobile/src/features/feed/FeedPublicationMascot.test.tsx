// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => ({
  StyleSheet: { create: (styles: object) => styles },
  View: ({
    children, accessibilityRole, accessibilityLabel,
  }: {
    children?: React.ReactNode;
    accessibilityRole?: string;
    accessibilityLabel?: string;
  }) => <div role={accessibilityRole} aria-label={accessibilityLabel}>{children}</div>,
}));
vi.mock("@/shared/components/ui/LoadingMascot", () => ({
  LoadingMascot: ({ size = 168 }: { size?: number }) => (
    <div data-mascot-size={size} data-loader="dog" />
  ),
}));

import { FeedPublicationMascot } from "./FeedPublicationMascot";

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

describe("Moments publication pending loader", () => {
  it("uses the standard shared dog instead of a spinner", async () => {
    await act(async () => root.render(<FeedPublicationMascot />));
    expect(host.querySelector('[role="progressbar"]')?.getAttribute("aria-label"))
      .toBe("Обрабатываем публикацию");
    expect(host.querySelector('[data-loader="dog"]')?.getAttribute("data-mascot-size"))
      .toBe("168");
    expect(host.querySelector("svg, progress")).toBeNull();
  });
});
