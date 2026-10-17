// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GalleryAlbumDto } from "@gafus/types";

vi.mock("react-native", () => ({
  StyleSheet: { create: (styles: object) => styles },
  View: ({
    children,
    style,
  }: {
    children: React.ReactNode;
    style?: Record<string, unknown>;
  }) => <div data-background={style?.backgroundColor}>{children}</div>,
  Pressable: ({
    children, accessibilityRole, accessibilityLabel, accessibilityState, onPress,
  }: {
    children: React.ReactNode;
    accessibilityRole?: string;
    accessibilityLabel?: string;
    accessibilityState?: { expanded?: boolean };
    onPress: () => void;
  }) => (
    <button
      role={accessibilityRole}
      aria-label={accessibilityLabel}
      aria-expanded={accessibilityState?.expanded}
      onClick={onPress}
    >{children}</button>
  ),
}));
vi.mock("react-native-paper", () => ({
  Text: ({
    children, accessibilityRole, numberOfLines,
  }: {
    children: React.ReactNode;
    accessibilityRole?: string;
    numberOfLines?: number;
  }) => (
    <span role={accessibilityRole} data-lines={numberOfLines}>{children}</span>
  ),
}));
vi.mock("@expo/vector-icons", () => ({
  MaterialCommunityIcons: ({ name }: { name: string }) => <i data-icon={name} />,
}));
vi.mock("@/shared/config", () => ({
  COLORS: {
    primary: "#4D5C2D",
    text: "#352E2E",
    textSecondary: "#37373D",
  },
  FONTS: {
    montserrat: "Montserrat",
    montserratMedium: "MontserratMedium",
    montserratBold: "MontserratBold",
  },
}));
import { AlbumDetailHeader } from "./AlbumDetailHeader";

const album = (overrides: Partial<GalleryAlbumDto> = {}) => ({
  name: "Патри",
  description: "делает гаф",
  photoCount: 1,
  isVisible: true,
  ...overrides,
} as GalleryAlbumDto);

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

describe("AlbumDetailHeader mobile layout", () => {
  it("groups title, labelled description, photo count and visibility in one compact surface", async () => {
    await act(async () => root.render(
      <AlbumDetailHeader album={album()} usedSlots={1} actions={<button>Меню альбома</button>} />,
    ));
    expect(host.querySelector('[data-background="#FFFCF5"]')).not.toBeNull();
    expect(host.querySelector('[role="header"]')?.textContent).toBe("Патри");
    expect(host.textContent).toContain("Описание альбома");
    expect(host.textContent).toContain("делает гаф");
    expect(host.textContent).toContain("1 фото");
    expect(host.textContent).toContain("Виден в GAFUS");
    expect(host.textContent).toContain("В галерее: 1 из 200");
    expect(host.textContent).toContain("Меню альбома");
    expect(host.querySelector('[data-icon="eye-outline"]')).not.toBeNull();
  });

  it("does not show an empty description and keeps private album privacy clear", async () => {
    await act(async () => root.render(
      <AlbumDetailHeader album={album({
        description: "   ", photoCount: 0, isVisible: false,
      })} />,
    ));
    expect(host.querySelector('[role="header"]')?.textContent).toBe("Патри");
    expect(host.textContent).not.toContain("Описание альбома");
    expect(host.textContent).toContain("0 фото");
    expect(host.textContent).toContain("Только для вас");
    expect(host.querySelector('[data-icon="lock-outline"]')).not.toBeNull();
    expect(host.textContent).not.toContain("В галерее:");
  });

  it("collapses long descriptions to two lines, then expands and collapses on demand", async () => {
    const longDescription = "Наши прогулки, истории и приключения с любимой собакой. ".repeat(5);
    await act(async () => root.render(
      <AlbumDetailHeader album={album({ description: longDescription })} />,
    ));
    const description = Array.from(host.querySelectorAll("span")).find(item =>
      item.textContent === longDescription.trim());
    expect(description?.getAttribute("data-lines")).toBe("2");
    const more = host.querySelector<HTMLButtonElement>('[aria-label="Развернуть описание"]');
    expect(more?.getAttribute("aria-expanded")).toBe("false");
    await act(async () => more?.click());
    expect(description?.getAttribute("data-lines")).toBeNull();
    const collapse = host.querySelector<HTMLButtonElement>('[aria-label="Свернуть описание"]');
    expect(collapse?.getAttribute("aria-expanded")).toBe("true");
    await act(async () => collapse?.click());
    expect(description?.getAttribute("data-lines")).toBe("2");
  });
});
