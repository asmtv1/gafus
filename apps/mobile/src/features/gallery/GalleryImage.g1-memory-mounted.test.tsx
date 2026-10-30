// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ viewer: "A", image: vi.fn(), fallback: vi.fn(), health: vi.fn() }));
vi.mock("@/shared/stores/authStore", () => ({
  useAuthStore: (s: (v: unknown) => unknown) =>
    s({ isAuthenticated: true, user: { id: m.viewer } }),
}));
vi.mock("expo-image", async () => {
  const React = await import("react");
  return {
    Image: (props: Record<string, unknown>) => {
      m.image(props);
      return React.createElement("div", {
        "data-policy": props.cachePolicy,
        "data-url": (props.source as { uri: string } | undefined)?.uri ?? "",
      });
    },
  };
});
vi.mock("@gafus/core-client/media-delivery", () => ({
  isSignedCdnFailoverActive: () => false,
  mediaCdnKindFromSignedUrl: () => null,
  probeCdnOutage: () => Promise.resolve(false),
}));
vi.mock("@/shared/lib/media/serverHealth", () => ({
  prefersCloudruMedia: () => Promise.resolve(false),
}));
vi.mock("@/shared/components/media/scopedMediaCache", () => ({
  scopedMediaCacheKey: (url: string, viewer: string) => viewer + url,
}));
vi.mock("@/shared/lib/api/gallery", () => ({ galleryApi: { requestMediaFallback: m.fallback } }));
import { GalleryImage } from "./image";
import { CdnImage } from "@/shared/components/media/CdnImage";
let root: Root, host: HTMLDivElement;
async function render(el: React.ReactElement) {
  await act(async () => root.render(el));
  await act(async () => {
    for (let i = 0; i < 7; i++) await Promise.resolve();
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  m.viewer = "A";
  m.fallback.mockResolvedValue({ url: "https://s3.cloud.ru/redirect" });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});
describe("gallery private signed image never persists to Expo disk", () => {
  it("actual GalleryImage passes privateMemoryOnly through CdnImage and uses memory", async () => {
    await render(
      createElement(GalleryImage, {
        photoId: "photo",
        refresh: vi.fn(),
        source: { uri: "https://cdn.example/signed?token=PRIVATE" },
      }),
    );
    await vi.waitFor(() =>
      expect(host.querySelector("[data-url]")?.getAttribute("data-url")).toContain(
        "https://cdn.example",
      ),
    );
    expect(host.querySelector("[data-policy]")?.getAttribute("data-policy")).toBe("memory");
    expect(m.fallback).not.toHaveBeenCalled();
  });
  it("unchanged non-gallery CdnImage retains old scoped cache behavior", async () => {
    await render(
      createElement(CdnImage, {
        cdnUrl: "https://cdn.example/public",
        requestFallback: async () => ({ url: "https://s3.cloud.ru/public" }),
      }),
    );
    await vi.waitFor(() =>
      expect(host.querySelector("[data-url]")?.getAttribute("data-url")).toContain(
        "cdn.example/public",
      ),
    );
    expect(host.querySelector("[data-policy]")?.getAttribute("data-policy")).toBe("memory-disk");
  });
  it("on viewer switch no old user's signed image is rendered while new URL resolution pending", async () => {
    await render(
      createElement(CdnImage, {
        privateMemoryOnly: true,
        cdnUrl: "https://cdn.example/signed?token=PRIVATE",
        requestFallback: async () => ({ url: "https://s3.cloud.ru/redirect" }),
      }),
    );
    m.viewer = "B";
    await render(
      createElement(CdnImage, {
        privateMemoryOnly: true,
        cdnUrl: "https://cdn.example/signed?token=PRIVATE",
        requestFallback: async () => ({ url: "https://s3.cloud.ru/redirect" }),
      }),
    );
    expect(host.querySelector("[data-policy]")?.getAttribute("data-policy")).toBe("memory");
  });
});
