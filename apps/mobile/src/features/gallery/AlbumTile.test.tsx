// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GalleryAlbumDto } from "@gafus/types";

const mocks = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("expo-router", () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock("react-native", () => {
  type StubProps = {
    children?: React.ReactNode;
    style?: Record<string, unknown> | (Record<string, unknown> | false)[]
      | ((state: { pressed: boolean }) => Record<string, unknown>[]);
    onPress?: () => void;
    accessibilityLabel?: string;
    accessibilityRole?: string;
  };
  const layout = (value: StubProps["style"]) => {
    const styles = typeof value === "function" ? value({ pressed: false }) : value;
    const layers = Array.isArray(styles) ? styles : [styles];
    return Object.assign({}, ...layers.filter(Boolean)) as Record<string, unknown>;
  };
  return {
    StyleSheet: { create: (styles: object) => styles },
    View: ({ children, style }: StubProps) => (
      <div data-aspect={layout(style).aspectRatio}
        data-cover-background={layout(style).backgroundColor}>{children}</div>
    ),
    Pressable: ({ children, style, accessibilityLabel, onPress }: StubProps) => (
      <button aria-label={accessibilityLabel} data-background={layout(style).backgroundColor}
        onClick={onPress}>{children}</button>
    ),
  };
});
vi.mock("react-native-paper", () => ({
  Text: ({ children, numberOfLines }: {
    children?: React.ReactNode;
    numberOfLines?: number;
  }) => <span data-lines={numberOfLines}>{children}</span>,
}));
vi.mock("@expo/vector-icons", () => ({
  MaterialCommunityIcons: ({ name }: { name: string }) => <i data-icon={name} />,
}));
vi.mock("@/shared/config", () => ({
  COLORS: { text: "#333", textSecondary: "#777", primary: "#506237", cardBackground: "#fffaee" },
  FONTS: { montserrat: "Mont", montserratBold: "MontBold", montserratMedium: "MontMedium" },
  SPACING: { md: 16, sm: 8, xs: 4, xl: 32, lg: 24 },
}));
vi.mock("./image", () => ({
  GalleryImage: ({ source, contentFit }: { source: { uri: string }; contentFit: string }) => (
    <span data-cover-url={source.uri} data-fit={contentFit} />
  ),
}));

import { AlbumTile } from "./AlbumTile";

const album = (overrides: Partial<GalleryAlbumDto> = {}) => ({
  id: "album-1",
  ownerUsername: "trainer",
  name: "Патри",
  photoCount: 14,
  isVisible: true,
  coverPhotoId: "photo-1",
  coverDisplayPhotoId: "photo-1",
  coverThumbUrl: "https://photos.example/cover",
  ...overrides,
} as GalleryAlbumDto);

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  mocks.push.mockClear();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

describe("AlbumTile", () => {
  it("visually identifies cover artwork as an album rather than a loose photo", async () => {
    await act(async () => root.render(<AlbumTile album={album()} refresh={vi.fn()} compact />));
    expect(host.querySelector("button")?.getAttribute("data-background")).toBe("#FFFDF8");
    expect(host.querySelector('[data-aspect="1.15"]')).not.toBeNull();
    expect(host.querySelector('[data-cover-url="https://photos.example/cover"]')
      ?.getAttribute("data-fit")).toBe("cover");
    expect(host.textContent).toContain("Альбом");
    expect(host.textContent).toContain("Патри");
    expect(host.textContent).toContain("14 фото");
    expect(host.querySelector('[data-icon="image-multiple-outline"]')).not.toBeNull();
  });

  it("shows a recognisable empty album and its private state without needing a cover", async () => {
    await act(async () => root.render(
      <AlbumTile album={album({
        coverThumbUrl: null, photoCount: 0, isVisible: false, name: "Очень длинное название альбома",
      })} refresh={vi.fn()} compact />,
    ));
    expect(host.querySelector("[data-cover-url]")).toBeNull();
    expect(host.querySelectorAll('[data-icon="image-multiple-outline"]')).toHaveLength(2);
    expect(host.textContent).toContain("0 фото · Только вам");
    expect(host.querySelector("button")?.getAttribute("aria-label"))
      .toContain("только для вас");
  });

  it("shows an optional album description between title and photo count in two lines", async () => {
    await act(async () => root.render(
      <AlbumTile album={album({ description: "  Наши прогулки и приключения  " })}
        refresh={vi.fn()} compact />,
    ));
    const texts = Array.from(host.querySelectorAll("span"));
    const description = texts.find(item => item.textContent === "Наши прогулки и приключения");
    expect(description?.getAttribute("data-lines")).toBe("2");
    expect(host.textContent?.indexOf("Патри")).toBeLessThan(
      host.textContent?.indexOf("Наши прогулки") ?? -1,
    );
    expect(host.textContent?.indexOf("Наши прогулки")).toBeLessThan(
      host.textContent?.indexOf("14 фото") ?? -1,
    );
  });

  it("does not leave an empty description row", async () => {
    await act(async () => root.render(
      <AlbumTile album={album({ description: "   " })} refresh={vi.fn()} compact />,
    ));
    expect(host.textContent).toContain("Патри");
    expect(host.textContent).toContain("14 фото");
    expect(host.textContent).not.toContain("прогулки");
    expect(host.querySelectorAll('span[data-lines="2"]')).toHaveLength(2);
  });

  it("opens the same album route with its owner username", async () => {
    await act(async () => root.render(<AlbumTile album={album()} refresh={vi.fn()} />));
    await act(async () => host.querySelector("button")?.click());
    expect(mocks.push).toHaveBeenCalledWith({
      pathname: "/profile/albums/[albumId]",
      params: { albumId: "album-1", username: "trainer" },
    });
  });
});
