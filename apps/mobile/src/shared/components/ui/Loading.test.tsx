// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => ({
  View: ({ children, style, accessibilityRole, accessibilityLabel }: {
    children?: React.ReactNode;
    style?: Record<string, unknown> | (Record<string, unknown> | false)[];
    accessibilityRole?: string;
    accessibilityLabel?: string;
  }) => {
    const layers = Array.isArray(style) ? style : [style];
    const merged = Object.assign({}, ...layers.filter(Boolean));
    return <div role={accessibilityRole} aria-label={accessibilityLabel}
      data-background={String(merged.backgroundColor ?? "none")}
      data-layout={String(merged.flexDirection ?? "none")}>{children}</div>;
  },
  StyleSheet: { create: (styles: object) => styles },
}));
vi.mock("react-native-paper", () => ({
  Text: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
}));
vi.mock("@/shared/config", () => ({
  COLORS: { background: "#edf6e8", primary: "#4b5c30" },
  FONTS: { montserratMedium: "Mont" },
  SPACING: { md: 16, xs: 4, lg: 24 },
  BORDER_RADIUS: { lg: 18 },
}));
vi.mock("../TexturedSafeAreaView", () => ({
  TexturedSafeAreaView: ({ children }: { children: React.ReactNode }) =>
    <div data-safe-area="true">{children}</div>,
}));
vi.mock("./LoadingMascot", () => ({
  LoadingMascot: () =>
    <span data-mascot-size="168">🐶</span>,
}));

import { Loading } from "./Loading";
import { MascotSpinner } from "./MascotSpinner";

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

describe("unified mobile loading states", () => {
  it("shows the enlarged mascot above centered text inside a cream card", async () => {
    await act(async () => root.render(<Loading variant="inline" message="Загрузка публикаций…" />));
    expect(host.querySelector('[role="progressbar"]')?.getAttribute("aria-label"))
      .toBe("Загрузка публикаций…");
    expect(host.querySelector('[data-background="#FFFAF0"]')?.getAttribute("data-layout"))
      .toBe("column");
    expect(host.querySelector('[data-mascot-size="168"]')).not.toBeNull();
  });

  it("keeps the larger vertical mascot without another frame inside existing cards", async () => {
    await act(async () => root.render(<Loading variant="embedded" message="Получаем данные…" />));
    expect(host.querySelector('[data-background="transparent"]')).not.toBeNull();
    expect(host.querySelector('[data-mascot-size="168"]')).not.toBeNull();
  });

  it("places the same card into the safe-area layout for full-screen loading", async () => {
    await act(async () => root.render(<Loading fullScreen message="Загрузка курсов…" />));
    expect(host.querySelector('[data-safe-area="true"]')).not.toBeNull();
    expect(host.querySelector('[data-background="#FFFAF0"]')).not.toBeNull();
    expect(host.textContent).toContain("Загрузка курсов…");
    expect(host.querySelector('[data-mascot-size="168"]')).not.toBeNull();
  });

  it("contains pagination loading and keeps the standard mascot size", async () => {
    await act(async () => root.render(<MascotSpinner />));
    expect(host.querySelector('[data-background="#FFFAF0"]')).not.toBeNull();
    expect(host.textContent).toContain("Загружаем ещё…");
    expect(host.querySelector('[data-mascot-size="168"]')).not.toBeNull();
  });
});
