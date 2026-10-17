// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  isAlbumError: false,
  isPhotoError: false,
  albumsPending: false,
  photosPending: false,
  emptyAlbums: false,
  emptyPhotos: false,
  hasMoreAlbums: false,
  hasMorePhotos: false,
  fetchAlbums: vi.fn(),
  fetchPhotos: vi.fn(),
  refetchAlbums: vi.fn(),
  refetchPhotos: vi.fn(),
}));
const albums = [
  { id: "a", name: "Патри", isVisible: true },
  { id: "b", name: "Личное", isVisible: false },
];
const photos = {
  a: [
    { id: "a1", status: "ready", thumbUrl: "https://example.test/a1.jpg" },
    { id: "a2", status: "ready", thumbUrl: "https://example.test/a2.jpg" },
    { id: "a3", status: "processing", thumbUrl: "https://example.test/a3.jpg" },
  ],
  b: [{ id: "b1", status: "ready", thumbUrl: "https://example.test/b1.jpg" }],
};

vi.mock("@tanstack/react-query", () => ({
  useInfiniteQuery: ({ queryKey }: { queryKey: string[] }) => {
    if (queryKey[1] === "own-albums") {
      return {
        data: mocks.emptyAlbums
          ? { pages: [{ items: [], nextCursor: null }] }
          : { pages: [{ items: albums, nextCursor: null }] },
        isPending: mocks.albumsPending,
        isError: mocks.isAlbumError,
        hasNextPage: mocks.hasMoreAlbums,
        isFetchingNextPage: false,
        fetchNextPage: mocks.fetchAlbums,
        refetch: mocks.refetchAlbums,
      };
    }
    const current = queryKey[2] as "a" | "b";
    return {
      data: {
        pages: [{ items: mocks.emptyPhotos ? [] : photos[current] ?? [], nextCursor: null }],
      },
      isPending: mocks.photosPending,
      isError: mocks.isPhotoError,
      hasNextPage: mocks.hasMorePhotos,
      isFetchingNextPage: false,
      fetchNextPage: mocks.fetchPhotos,
      refetch: mocks.refetchPhotos,
    };
  },
}));
vi.mock("@/shared/stores", () => ({
  useAuthStore: (select: (s: { user: { username: string } }) => unknown) =>
    select({ user: { username: "owner" } }),
}));
vi.mock("@/shared/lib/api/gallery", () => ({
  galleryApi: { listAlbums: vi.fn(), listPhotos: vi.fn() },
}));
vi.mock("@/shared/components", () => ({
  Loading: ({ message }: { message: string }) => <span>{message}</span>,
}));
vi.mock("@/shared/config", () => ({
  COLORS: {
    primary: "#4D5C2D", text: "#352E2E", textSecondary: "#37373d",
    background: "#E6E2D8",
  },
  FONTS: {
    montserrat: "Montserrat", montserratBold: "MontserratBold",
    montserratMedium: "MontserratMedium",
  },
}));
vi.mock("expo-image", () => ({
  Image: ({ source, style }: { source: { uri: string }; style: { width: string } }) => (
    <img src={source.uri} alt="" data-image-width={style.width} />
  ),
}));
vi.mock("@expo/vector-icons", () => ({
  MaterialCommunityIcons: ({ name }: { name: string }) => <i data-icon={name} />,
}));
vi.mock("react-native", () => ({
  StyleSheet: { create: (styles: object) => styles, absoluteFillObject: { position: "absolute" } },
  View: ({ children, style }: { children?: React.ReactNode; style?: { flexWrap?: string } }) => (
    <div data-wrap={style?.flexWrap}>{children}</div>
  ),
  Text: ({
    children, accessibilityLabel,
  }: { children: React.ReactNode; accessibilityLabel?: string }) => (
    <span aria-label={accessibilityLabel}>{children}</span>
  ),
  ScrollView: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Pressable: ({
    children, accessibilityLabel, accessibilityState, disabled, onPress, style,
  }: {
    children: React.ReactNode;
    accessibilityLabel?: string;
    accessibilityState?: { selected?: boolean; disabled?: boolean };
    disabled?: boolean;
    onPress: () => void;
    style?: object | ((state: { pressed: boolean }) => object);
  }) => {
    const resolved = typeof style === "function" ? style({ pressed: false }) : style;
    const parts = Array.isArray(resolved) ? resolved : [resolved];
    const width = parts.find(part => part?.width)?.width;
    return (
      <button
        type="button"
        aria-label={accessibilityLabel}
        aria-pressed={accessibilityState?.selected}
        disabled={disabled}
        onClick={onPress}
        data-width={width}
      >
        {children}
      </button>
    );
  },
}));
import { FeedAlbumPicker } from "./FeedAlbumPicker";

function ControlledPicker({ maxSelectable = 10, disabled = false }: {
  maxSelectable?: number; disabled?: boolean;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  return (
    <FeedAlbumPicker
      selected={selected}
      onChange={setSelected}
      maxSelectable={maxSelectable}
      disabled={disabled}
    />
  );
}
let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  mocks.isAlbumError = false;
  mocks.isPhotoError = false;
  mocks.albumsPending = false;
  mocks.photosPending = false;
  mocks.emptyAlbums = false;
  mocks.emptyPhotos = false;
  mocks.hasMoreAlbums = false;
  mocks.hasMorePhotos = false;
  [mocks.fetchAlbums, mocks.fetchPhotos, mocks.refetchAlbums, mocks.refetchPhotos]
    .forEach(fn => fn.mockReset());
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});
async function render(options: { maxSelectable?: number; disabled?: boolean } = {}) {
  await act(async () => root.render(<ControlledPicker {...options} />));
}
async function tap(label: string) {
  const button = Array.from(host.querySelectorAll<HTMLButtonElement>("button")).find(
    element => element.getAttribute("aria-label") === label,
  );
  expect(button, `Missing ${label}`).toBeDefined();
  await act(async () => button?.click());
}
function photoButton(id: string) {
  return Array.from(host.querySelectorAll<HTMLButtonElement>("button")).find(button =>
    button.getAttribute("aria-label")?.startsWith(`Фотография ${id},`));
}

describe("Mobile Moments album media picker", () => {
  it("shows first album immediately with a dense thumbnail grid, compact header and privacy notice", async () => {
    await render();
    expect(host.textContent).toContain("Из альбомов");
    expect(host.textContent).toContain("0 из 10");
    expect(host.querySelector('[aria-label="Альбом Патри"]')?.getAttribute("aria-pressed")).toBe("true");
    expect(host.querySelectorAll('button[data-width="31.5%"]')).toHaveLength(2);
    expect(host.querySelectorAll('img[data-image-width="100%"]')).toHaveLength(2);
    expect(photoButton("a3")).toBeUndefined(); // unfinished uploads are hidden
    expect(host.textContent).toContain("создаётся копия");
    expect(host.textContent).toContain("даже из скрытых альбомов");
    expect(host.textContent).not.toContain("✓ Выбрано");
    expect(host.textContent).not.toContain("Выбрано фотографий:");
  });

  it("maintains ordered selection across albums, with numbered badges and deselection", async () => {
    await render({ maxSelectable: 3 });
    await tap("Фотография a1, выбрать");
    expect(host.textContent).toContain("1 из 3");
    expect(photoButton("a1")?.getAttribute("aria-label")).toContain("номером 1");
    await tap("Альбом Личное, скрытый");
    expect(host.querySelector('[aria-label="Альбом Личное, скрытый"]')?.getAttribute("aria-pressed")).toBe("true");
    await tap("Фотография b1, выбрать");
    expect(photoButton("b1")?.getAttribute("aria-label")).toContain("номером 2");
    expect(host.textContent).toContain("2 из 3");
    await tap("Альбом Патри");
    expect(photoButton("a1")?.getAttribute("aria-pressed")).toBe("true");
    await tap("Фотография a1, выбрана под номером 1");
    await tap("Альбом Личное, скрытый");
    expect(photoButton("b1")?.getAttribute("aria-label")).toContain("номером 1");
    expect(host.textContent).toContain("1 из 3");
  });

  it("enforces combined attachment capacity but always allows removing a selected photo", async () => {
    await render({ maxSelectable: 1 });
    await tap("Фотография a1, выбрать");
    expect(photoButton("a2")?.disabled).toBe(true);
    expect(photoButton("a1")?.disabled).toBe(false);
    await tap("Фотография a1, выбрана под номером 1");
    expect(photoButton("a2")?.disabled).toBe(false);
    await tap("Фотография a2, выбрать");
    expect(host.textContent).toContain("1 из 1");
  });

  it("makes all thumbnails non-interactive while publishing", async () => {
    await render({ disabled: true });
    expect(photoButton("a1")?.disabled).toBe(true);
    await tap("Фотография a1, выбрать");
    expect(host.textContent).toContain("0 из 10");
  });

  it("preserves retry controls, pagination and empty state", async () => {
    mocks.isAlbumError = true;
    await render();
    await tap("Не удалось загрузить альбомы. Повторить");
    expect(mocks.refetchAlbums).toHaveBeenCalledOnce();
    mocks.isAlbumError = false;
    mocks.isPhotoError = true;
    await render();
    await tap("Ошибка загрузки фотографий. Повторить");
    expect(mocks.refetchPhotos).toHaveBeenCalledOnce();

    mocks.isPhotoError = false;
    mocks.hasMoreAlbums = true;
    mocks.hasMorePhotos = true;
    await render();
    await tap("Показать ещё альбомы");
    await tap("Показать ещё фото");
    expect(mocks.fetchAlbums).toHaveBeenCalledOnce();
    expect(mocks.fetchPhotos).toHaveBeenCalledOnce();

    mocks.hasMoreAlbums = false;
    mocks.hasMorePhotos = false;
    mocks.emptyPhotos = true;
    await render();
    expect(host.textContent).toContain("нет готовых фотографий");
  });
});
