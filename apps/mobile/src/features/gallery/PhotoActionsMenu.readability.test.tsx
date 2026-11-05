// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GalleryAlbumDto, GalleryPhotoDto } from "@gafus/types";

vi.mock("react-native", async () => {
  const React = await import("react");
  const Box = ({ children }: { children?: React.ReactNode }) => React.createElement("div", null, children);
  return {
    View: Box,
    ScrollView: Box,
    TextInput: () => null,
    Pressable: ({ children, onPress, disabled }: {
      children?: React.ReactNode;
      onPress?: () => void;
      disabled?: boolean;
    }) => React.createElement("button", { onClick: onPress, disabled }, children),
    ActivityIndicator: () => null,
    Platform: { OS: "ios" },
    Alert: { alert: vi.fn() },
    StyleSheet: { create: (styles: unknown) => styles },
    useWindowDimensions: () => ({ width: 390 }),
  };
});
vi.mock("@expo/vector-icons", () => ({ MaterialCommunityIcons: () => null }));
vi.mock("react-native-paper", async () => {
  const React = await import("react");
  return {
    Text: ({ children }: { children?: React.ReactNode }) => React.createElement("span", null, children),
    Menu: Object.assign(
      ({ children }: { children?: React.ReactNode }) => React.createElement("div", null, children),
      {
        Item: ({ title, titleStyle, disabled }: {
          title: string;
          titleStyle?: { color?: string };
          disabled?: boolean;
        }) => React.createElement("button", {
          "data-menu-item": title,
          "data-title-color": titleStyle?.color,
          disabled,
        }, title),
      },
    ),
  };
});
vi.mock("./data", () => ({
  galleryError: () => "Ошибка",
  galleryKeys: { owner: () => ["gallery"] },
  requestId: () => "request-id",
  useAlbums: () => ({ data: { pages: [] }, isPending: false, isError: false, hasNextPage: false }),
  useGalleryContext: () => ({ viewer: "alice", cache: { invalidateQueries: vi.fn() } }),
}));
vi.mock("@/shared/lib/api/gallery", () => ({ galleryApi: { updatePhoto: vi.fn(), setCover: vi.fn(), deletePhoto: vi.fn() } }));
vi.mock("@/shared/components/gestures/SwipeDismissHandle", () => ({
  SwipeDismissHandle: () => null,
}));
vi.mock("./uploads", () => ({ UploadControls: () => null }));

import { PhotoActionsMenu } from "./PhotoActionsMenu";

let root: Root;
let host: HTMLDivElement;
const album = { id: "album-1", ownerUsername: "alice", coverPhotoId: null } as GalleryAlbumDto;

beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

async function renderPhoto(status: "ready" | "failed") {
  const photo = {
    id: "photo-1", status, uploadId: "upload-1", caption: "",
  } as GalleryPhotoDto;
  await act(async () => root.render(
    createElement(PhotoActionsMenu, { photo, album, onDismiss: vi.fn() }),
  ));
}

function colorOf(label: string) {
  return Array.from(host.querySelectorAll<HTMLButtonElement>("button[data-menu-item]"))
    .find(item => item.getAttribute("data-menu-item") === label)
    ?.getAttribute("data-title-color");
}

describe("photo actions menu readability", () => {
  it("renders regular photo actions black and keeps deletion red", async () => {
    await renderPhoto("ready");
    for (const label of ["Изменить подпись", "Сделать обложкой", "Переместить в альбом"]) {
      expect(colorOf(label), label).toBe("#000000");
    }
    expect(colorOf("Удалить фотографию")).toBe("#A83C24");
  });

  it("renders retry action black when processing fails", async () => {
    await renderPhoto("failed");
    expect(colorOf("Выбрать файл заново")).toBe("#000000");
    expect(colorOf("Удалить фотографию")).toBe("#A83C24");
  });
});
