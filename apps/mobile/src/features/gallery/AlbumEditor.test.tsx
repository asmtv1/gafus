// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GalleryAlbumDto } from "@gafus/types";

const mocks = vi.hoisted(() => ({
  createAlbum: vi.fn(),
  updateAlbum: vi.fn(),
  invalidateQueries: vi.fn(),
  close: vi.fn(),
}));

vi.mock("react-native", () => {
  const Container = ({ children, testID }: { children?: React.ReactNode; testID?: string }) =>
    <div data-testid={testID}>{children}</div>;
  return {
    Platform: { OS: "ios" },
    View: Container, Modal: Container, KeyboardAvoidingView: Container, ScrollView: Container,
    Pressable: ({ children, onPress }: { children?: React.ReactNode; onPress?: () => void }) =>
      <button onClick={onPress}>{children}</button>,
    Switch: ({ value, onValueChange, disabled, accessibilityLabel }: {
      value: boolean;
      onValueChange: (value: boolean) => void;
      disabled?: boolean;
      accessibilityLabel: string;
    }) => <button
      type="button"
      role="switch"
      aria-label={accessibilityLabel}
      aria-checked={value}
      disabled={disabled}
      onClick={() => onValueChange(!value)}
    >{value ? "on" : "off"}</button>,
    StyleSheet: { create: (styles: object) => styles, hairlineWidth: 1 },
  };
});
vi.mock("react-native-paper", () => ({
  Text: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
  IconButton: () => null,
}));
vi.mock("@expo/vector-icons", () => ({ MaterialCommunityIcons: () => null }));
vi.mock("expo-image", () => ({ Image: () => null }));
vi.mock("expo-router", () => ({ useRouter: () => ({ navigate: vi.fn() }) }));
vi.mock("react-native-safe-area-context", () => ({
  SafeAreaProvider: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  initialWindowMetrics: null,
}));
vi.mock("@/shared/components", () => ({
  Loading: () => null,
  TexturedSafeAreaView: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/shared/components/ui", () => ({
  Input: ({ label, value, onChangeText, maxLength, multiline }: {
    label: string;
    value: string;
    onChangeText: (value: string) => void;
    maxLength: number;
    multiline?: boolean;
  }) => (
    <div
      data-label={label}
      data-value={value}
      data-max-length={maxLength}
      data-multiline={!!multiline}
    >
      <button aria-label={`Изменить ${label}`} onClick={() => onChangeText(
        label.startsWith("Название") ? "  Новый альбом  " : "  О прогулках  ",
      )}>Изменить</button>
      {label.startsWith("Описание") ? (
        <button aria-label="Очистить описание" onClick={() => onChangeText("   ")}>Очистить</button>
      ) : null}
    </div>
  ),
  Button: ({ label, onPress, disabled, variant }: {
    label: string; onPress: () => void; disabled?: boolean; variant?: string;
  }) =>
    <button data-variant={variant ?? "primary"} disabled={disabled} onClick={onPress}>
      {label}
    </button>,
}));
vi.mock("@/shared/lib/api/gallery", () => ({
  galleryApi: { createAlbum: mocks.createAlbum, updateAlbum: mocks.updateAlbum },
}));
vi.mock("./data", () => ({
  galleryError: (error: unknown) => String(error),
  galleryKeys: { owner: (viewer: string, owner: string) => ["gallery", viewer, owner] },
  useGalleryContext: () => ({
    viewer: "trainer", cache: { invalidateQueries: mocks.invalidateQueries },
  }),
  useAlbums: vi.fn(),
}));
vi.mock("./uploads", () => ({ UploadControls: () => null }));
vi.mock("./AlbumTile", () => ({ AlbumTile: () => null }));
vi.mock("@/shared/config", () => ({
  COLORS: { background: "#fff", primary: "#556633", text: "#222", textSecondary: "#888" },
  FONTS: { montserrat: "Mont", montserratMedium: "Mont", montserratBold: "Mont" },
  SPACING: { sm: 8, md: 16, lg: 24, xl: 32, xs: 4 },
}));

import { AlbumEditor } from "./components";

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.clearAllMocks();
  mocks.createAlbum.mockResolvedValue({});
  mocks.updateAlbum.mockResolvedValue({});
  mocks.invalidateQueries.mockResolvedValue(undefined);
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

const click = async (label: string) => {
  const element = Array.from(host.querySelectorAll("button")).find(
    button => button.getAttribute("aria-label") === label || button.textContent === label,
  );
  expect(element, `Не найдена кнопка ${label}`).toBeDefined();
  await act(async () => element?.click());
};

describe("AlbumEditor", () => {
  it("creates album with trimmed optional description and correct limit", async () => {
    await act(async () => root.render(<AlbumEditor owner="trainer" close={mocks.close} />));
    const input = host.querySelector('[data-label="Описание (необязательно)"]');
    expect(input?.getAttribute("data-max-length")).toBe("2000");
    expect(input?.getAttribute("data-multiline")).toBe("true");
    await click("Изменить Название альбома");
    await click("Изменить Описание (необязательно)");
    expect(host.textContent).toContain("15 / 2000 символов");
    await click("Сохранить");
    expect(mocks.createAlbum).toHaveBeenCalledWith({
      name: "Новый альбом", description: "О прогулках", isVisible: true,
    });
    expect(mocks.invalidateQueries).toHaveBeenCalled();
    expect(mocks.close).toHaveBeenCalledOnce();
  });

  it("cancels without saving using the shared red button below Save", async () => {
    await act(async () => root.render(<AlbumEditor owner="trainer" close={mocks.close} />));
    const save = Array.from(host.querySelectorAll("button")).find(
      button => button.textContent === "Сохранить",
    );
    const cancel = Array.from(host.querySelectorAll("button")).find(
      button => button.textContent === "Отмена",
    );
    expect(save).toBeDefined();
    expect(cancel).toBeDefined();
    expect(cancel?.getAttribute("data-variant")).toBe("secondary");
    expect(host.querySelector('[aria-label="Закрыть"]')).toBeNull();
    if (!save || !cancel) throw new Error("Save and Cancel buttons must exist");
    expect(save.compareDocumentPosition(cancel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await click("Отмена");
    expect(mocks.close).toHaveBeenCalledOnce();
    expect(mocks.createAlbum).not.toHaveBeenCalled();
    expect(mocks.updateAlbum).not.toHaveBeenCalled();
  });

  it("blocks cancellation while the album is being saved", async () => {
    let completeSave!: (value: object) => void;
    mocks.createAlbum.mockImplementationOnce(() => new Promise(resolve => {
      completeSave = resolve;
    }));
    await act(async () => root.render(<AlbumEditor owner="trainer" close={mocks.close} />));
    await click("Изменить Название альбома");
    await act(async () => {
      const save = Array.from(host.querySelectorAll("button")).find(
        button => button.textContent === "Сохранить",
      );
      save?.click();
    });
    const cancel = Array.from(host.querySelectorAll("button")).find(
      button => button.textContent === "Отмена",
    );
    expect(cancel?.disabled).toBe(true);
    await click("Отмена");
    expect(mocks.close).not.toHaveBeenCalled();
    await act(async () => completeSave({}));
    expect(mocks.close).toHaveBeenCalledOnce();
  });

  it("keeps the visibility label, switch and explanatory text in one grouped card", async () => {
    await act(async () => root.render(<AlbumEditor owner="trainer" close={mocks.close} />));
    const card = host.querySelector('[data-testid="album-visibility-card"]');
    expect(card).not.toBeNull();
    expect(card?.textContent).toContain("Виден всем авторизованным");
    expect(card?.textContent).toContain(
      "Альбом и фотографии доступны всем авторизованным пользователям GAFUS.",
    );
    const toggle = card?.querySelector('[role="switch"]');
    expect(toggle?.getAttribute("aria-checked")).toBe("true");

    await click("Виден всем авторизованным");
    expect(card?.querySelector('[role="switch"]')?.getAttribute("aria-checked")).toBe("false");
    expect(card?.textContent).toContain("Альбом и фотографии доступны только вам.");
    await click("Изменить Название альбома");
    await click("Сохранить");
    expect(mocks.createAlbum).toHaveBeenCalledWith({
      name: "Новый альбом", description: null, isVisible: false,
    });
  });

  it("loads existing description and sends null when it is cleared", async () => {
    const album = {
      id: "album-1", name: "Поездка", description: "Наши фотографии", isVisible: false,
    } as GalleryAlbumDto;
    await act(async () => root.render(
      <AlbumEditor owner="trainer" album={album} close={mocks.close} />,
    ));
    expect(host.querySelector('[data-label="Описание (необязательно)"]')
      ?.getAttribute("data-value")).toBe("Наши фотографии");
    await click("Очистить описание");
    await click("Сохранить");
    expect(mocks.updateAlbum).toHaveBeenCalledWith("album-1", {
      name: "Поездка", description: null, isVisible: false,
    });
    expect(mocks.close).toHaveBeenCalledOnce();
  });
});
