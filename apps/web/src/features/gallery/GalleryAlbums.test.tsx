// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  createAlbum: vi.fn(),
  invalidateQueries: vi.fn(),
  refetch: vi.fn(),
  result: {
    authenticated: true,
    viewerId: "viewer-1",
    albums: [] as {
      id: string;
      name: string;
      photoCount: number;
      canEdit: boolean;
      isVisible: boolean;
      coverPhotoId: null;
      coverDisplayPhotoId: null;
      coverThumbUrl: null;
    }[],
    info: { enabled: true, isOwner: true, usedSlots: 0 },
    query: {
      isPending: false,
      error: null as Error | null,
      hasNextPage: false,
      isFetchingNextPage: false,
      refetch: vi.fn(),
      fetchNextPage: vi.fn(),
    },
  },
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: mocks.invalidateQueries }),
}));
vi.mock("./GalleryScope", () => ({
  GalleryScope: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("./hooks", () => ({
  useGalleryAlbums: () => mocks.result,
  galleryMessage: (error: Error) => error.message,
}));
vi.mock("./api", () => ({ galleryApi: { createAlbum: mocks.createAlbum } }));
vi.mock("./AlbumCover", () => ({ AlbumCover: () => <div>Обложка</div> }));
vi.mock("./AlbumForm", () => ({
  AlbumForm: ({
    cancel,
    save,
  }: {
    cancel: () => void;
    save: (input: { name: string; description: null; isVisible: boolean }) => Promise<void>;
  }) => (
    <div>
      <button onClick={() => void save({ name: "Лето", description: null, isVisible: true })}>
        Подтвердить создание
      </button>
      <button onClick={cancel}>Отмена</button>
    </div>
  ),
}));
vi.mock("@/shared/components/ui", () => ({
  LoadingState: () => <span>Загрузка</span>,
  PrimaryButton: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
  SecondaryButton: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
  SecondaryButtonLink: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

import { GalleryAlbums } from "./GalleryAlbums";

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  mocks.push.mockReset();
  mocks.createAlbum.mockReset();
  mocks.invalidateQueries.mockReset();
  mocks.result.info.isOwner = true;
  mocks.result.albums = [];
  mocks.result.query.error = null;
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

async function click(label: string) {
  const button = [...host.querySelectorAll("button")].find(
    (item) => item.textContent?.trim() === label,
  );
  expect(button, `Expected button: ${label}`).toBeDefined();
  await act(async () => button?.click());
}

describe("Gallery albums UX", () => {
  it("shows one create action without a profile button or unassigned upload", async () => {
    await act(async () => root.render(<GalleryAlbums username="owner" />));
    expect(host.textContent).toContain("Фотоальбомы");
    expect(host.textContent).toContain("Создайте первый");
    expect(host.textContent).not.toContain("В профиль");
    expect(host.textContent).not.toContain("Добавить фотографии");
    expect(
      [...host.querySelectorAll("button")].filter((button) =>
        button.textContent?.includes("Создать альбом"),
      ),
    ).toHaveLength(1);
  });

  it("shows only the creation flow and restores the list after cancellation", async () => {
    await act(async () => root.render(<GalleryAlbums username="owner" />));
    await click("Создать альбом");
    expect(host.querySelector("h1")?.textContent).toBe("Новый альбом");
    expect(host.textContent).toContain("непосредственно в этот альбом");
    expect(host.textContent).not.toContain("Создайте первый");
    expect(host.textContent).not.toContain("Добавить фотографии");
    expect(
      [...host.querySelectorAll("button")].filter((button) =>
        button.textContent?.includes("Создать альбом"),
      ),
    ).toHaveLength(0);
    await click("Отмена");
    expect(host.querySelector("h1")?.textContent).toBe("Фотоальбомы");
  });

  it("opens the new album after creation, where uploads are album-scoped", async () => {
    mocks.createAlbum.mockResolvedValue({ id: "album-1" });
    await act(async () => root.render(<GalleryAlbums username="owner" />));
    await click("Создать альбом");
    await click("Подтвердить создание");
    expect(mocks.createAlbum).toHaveBeenCalledWith({
      name: "Лето",
      description: null,
      isVisible: true,
    });
    expect(mocks.push).toHaveBeenCalledExactlyOnceWith("/profile/albums/album-1");
    expect(mocks.invalidateQueries).toHaveBeenCalled();
  });

  it("keeps the form open and shows an error on failed creation", async () => {
    mocks.createAlbum.mockRejectedValue(new Error("Не удалось создать альбом"));
    await act(async () => root.render(<GalleryAlbums username="owner" />));
    await click("Создать альбом");
    await click("Подтвердить создание");
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("Не удалось создать");
    expect(mocks.push).not.toHaveBeenCalled();
    expect(host.querySelector("h1")?.textContent).toBe("Новый альбом");
  });

  it("shows all-albums navigation, but no inline creation in profile preview", async () => {
    await act(async () => root.render(<GalleryAlbums username="owner" preview />));
    expect(host.querySelector('a[href="/profile/albums?username=owner"]')).not.toBeNull();
    expect(host.textContent).not.toContain("Создать альбом");
    expect(host.textContent).not.toContain("Добавить фотографии");
  });
});
