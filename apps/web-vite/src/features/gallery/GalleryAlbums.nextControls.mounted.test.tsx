// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { GalleryAlbums, nextMediaRefresh } from "./GalleryAlbums";
import type { AlbumSummary, AlbumPhoto, GalleryPage, GalleryAlbumCommands } from "./galleryApi";

const future = "2099-12-31T12:00:00.000Z";
const me = "owner_A",
  username = "ownerA";
let album: AlbumSummary;
const photo: AlbumPhoto = {
  id: "photo_01",
  albumId: "album_01",
  caption: "Мой пёс",
  status: "ready",
  width: 400,
  height: 300,
  thumbUrl: "https://cdn.example.test/thumbnail?token=synthetic",
  fullUrl: "https://cdn.example.test/full?token=synthetic",
  urlsExpireAt: future,
};
const page = <T,>(items: T[]): GalleryPage<T> => ({
  items,
  enabled: true,
  nextCursor: null,
  isOwner: true,
  usedSlots: 1,
  limit: 20,
});
let host: HTMLDivElement, root: Root, client: QueryClient;
let commands: GalleryAlbumCommands;
let checkCover: ReturnType<
  typeof vi.fn<
    (id: string, ownerId: string, user: string, photoId: string | null) => Promise<boolean>
  >
>;
let photoRead: (id: string, cursor: string | null) => Promise<GalleryPage<AlbumPhoto>>;
let albumRead: (id: string, viewerId: string, ownerUsername: string) => Promise<AlbumSummary>;
const flush = async () => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 25));
  });
};
const button = (label: string) =>
  [...host.querySelectorAll<HTMLButtonElement>("button")].find(
    (item) => item.textContent?.trim() === label,
  );
const click = async (label: string) => {
  const item = button(label);
  expect(item, `missing button ${label}`).toBeDefined();
  await act(async () => {
    item?.click();
  });
  await flush();
};
async function mount() {
  await act(async () =>
    root.render(
      <QueryClientProvider client={client}>
        <GalleryAlbums
          userId={me}
          username={username}
          manage
          listAlbums={async () => page([album])}
          getAlbum={(id, viewerId, name) => albumRead(id, viewerId, name)}
          getPhotos={(id, cursor) => photoRead(id, cursor)}
          commands={commands}
          checkCover={checkCover}
        />
      </QueryClientProvider>,
    ),
  );
  await flush();
  await act(async () =>
    host.querySelector<HTMLButtonElement>('button[aria-label="Открыть альбом Собака"]')?.click(),
  );
  await flush();
}
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw Error("LIVE_NETWORK_FORBIDDEN");
    }),
  );
  album = {
    id: "album_01",
    ownerId: me,
    ownerUsername: username,
    name: "Собака",
    description: null,
    isVisible: true,
    canEdit: true,
    photoCount: 1,
    coverPhotoId: null,
    coverThumbUrl: null,
    urlsExpireAt: future,
  };
  checkCover = vi.fn(async (_id, _owner, _user, id) => album.coverPhotoId === id);
  photoRead = async () => page([photo]);
  albumRead = async () => ({ ...album });
  commands = {
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    updateCaption: vi.fn(),
    removePhoto: vi.fn(),
    movePhoto: vi.fn(),
    setCover: vi.fn(async (_id, id) => {
      album = { ...album, coverPhotoId: id };
      return { ...album };
    }),
  };
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  });
});
afterEach(async () => {
  await act(async () => root.unmount());
  client.clear();
  host.remove();
  vi.unstubAllGlobals();
});

describe("Next owner gallery status polling", () => {
  it("revalidates pending or processing photos even without a single signed URL", () => {
    const statusPage = page([
      {
        ...photo,
        thumbUrl: null,
        fullUrl: null,
        urlsExpireAt: null,
        status: "processing" as const,
      },
    ]);
    expect(nextMediaRefresh([statusPage])).toBe(3000);
    // Public albums, detail covers and photos reuse bounded signed URL refresh.
    const publicExpiry = new Date(Date.now() + 40_000).toISOString();
    const publicDelay = nextMediaRefresh([{ items: [{ urlsExpireAt: publicExpiry }] }]);
    expect(publicDelay).not.toBe(false);
    expect(publicDelay).toBeGreaterThanOrEqual(1000);
    expect(
      nextMediaRefresh([
        page([
          {
            ...photo,
            thumbUrl: null,
            fullUrl: null,
            urlsExpireAt: null,
            status: "pending" as const,
          },
        ]),
      ]),
    ).toBe(3000);
    expect(
      nextMediaRefresh([
        page([
          {
            ...photo,
            thumbUrl: null,
            fullUrl: null,
            urlsExpireAt: null,
            status: "moving" as const,
          },
        ]),
      ]),
    ).toBe(3000);
    expect(
      nextMediaRefresh([
        page([
          { ...photo, thumbUrl: null, fullUrl: null, urlsExpireAt: null, status: "ready" as const },
        ]),
      ]),
    ).toBe(false);
  });
});
describe("Owner gallery background refresh behavior", () => {
  it("keeps an open photo actions dialog mounted while a background GET is in flight", async () => {
    await mount();
    const trigger = host.querySelector<HTMLButtonElement>(
      'button[aria-label="Управление фотографией: Мой пёс"]',
    );
    expect(trigger).not.toBeNull();
    await act(async () => trigger?.click());
    const dialog = host.querySelector('[role="dialog"][aria-label="Фотография"]');
    expect(dialog).not.toBeNull();
    let resolveRead: (value: GalleryPage<AlbumPhoto>) => void = vi.fn();
    photoRead = () =>
      new Promise((resolve) => {
        resolveRead = resolve;
      });
    await act(async () => {
      void client.refetchQueries({ queryKey: ["gallery", "photos", me, username, "album_01"] });
    });
    expect(host.querySelector('[role="dialog"][aria-label="Фотография"]')).toBe(dialog);
    expect(trigger?.isConnected).toBe(true);
    await act(async () => resolveRead(page([photo])));
    await flush();
    expect(host.querySelector('[role="dialog"][aria-label="Фотография"]')).toBe(dialog);
  });
  it("preserves an open photo dialog during a background album metadata GET", async () => {
    await mount();
    const trigger = host.querySelector<HTMLButtonElement>(
      'button[aria-label="Управление фотографией: Мой пёс"]',
    );
    await act(async () => trigger?.click());
    const dialog = host.querySelector('[role="dialog"][aria-label="Фотография"]');
    expect(dialog).not.toBeNull();
    let resolveAlbum: (value: AlbumSummary) => void = vi.fn();
    albumRead = () =>
      new Promise((resolve) => {
        resolveAlbum = resolve;
      });
    await act(async () => {
      void client.refetchQueries({ queryKey: ["gallery", "album", me, username, "album_01"] });
    });
    expect(host.querySelector('[role="dialog"][aria-label="Фотография"]')).toBe(dialog);
    await act(async () => resolveAlbum({ ...album }));
    await flush();
    expect(host.querySelector('[role="dialog"][aria-label="Фотография"]')).toBe(dialog);
  });
  it("revokes the photo dialog when a fresh album GET denies owner access", async () => {
    await mount();
    const trigger = host.querySelector<HTMLButtonElement>(
      'button[aria-label="Управление фотографией: Мой пёс"]',
    );
    await act(async () => trigger?.click());
    albumRead = async () => {
      throw new Error("REVOKED");
    };
    await act(async () => {
      await client.refetchQueries({ queryKey: ["gallery", "album", me, username, "album_01"] });
    });
    await flush();
    expect(host.querySelector('[role="dialog"][aria-label="Фотография"]')).toBeNull();
    expect(host.textContent).toContain("Альбом недоступен");
  });
  it("backs off expired signed links instead of polling an unchanged API result every second", () => {
    expect(
      nextMediaRefresh([
        page([{ ...photo, urlsExpireAt: new Date(Date.now() - 60_000).toISOString() }]),
      ]),
    ).toBeGreaterThanOrEqual(30_000);
  });
});
describe("Next owner album controls", () => {
  it("presents album description and public access as labeled structured facts", async () => {
    album = { ...album, description: "делает гаф", photoCount: 3, isVisible: true };
    await mount();
    const description = host.querySelector('[aria-label="Описание альбома"]');
    expect(description?.textContent).toContain("Об альбоме");
    expect(description?.querySelector("p")?.textContent).toBe("делает гаф");
    const facts = host.querySelector('dl[aria-label="Информация об альбоме"]');
    expect(facts?.querySelectorAll("dt")).toHaveLength(2);
    expect(facts?.textContent).toContain("Фотографии");
    expect(facts?.textContent).toContain("3 фото");
    expect(facts?.textContent).toContain("Кто видит альбом");
    expect(facts?.textContent).toContain("Пользователи GAFUS");
    expect(facts?.textContent).toContain("Доступен после входа в аккаунт");
    expect(facts?.querySelectorAll("svg")).toHaveLength(2);
    expect(host.textContent).not.toContain("Виден авторизованным");
  });
  it("shows private album visibility with clear explanation, no fake placeholder description", async () => {
    album = { ...album, description: null, isVisible: false, photoCount: 0 };
    await mount();
    expect(host.querySelector('[aria-label="Описание альбома"]')).toBeNull();
    const facts = host.querySelector('dl[aria-label="Информация об альбоме"]');
    expect(facts?.textContent).toContain("0 фото");
    expect(facts?.textContent).toContain("Только вы");
    expect(facts?.textContent).toContain("Другие пользователи не видят альбом");
  });
  it("settings and deletion are collapsed by default and settings match original flow", async () => {
    await mount();
    expect(button("Настройки альбома")).toBeDefined();
    expect(host.querySelector('[aria-label="Настройки альбома"]')).toBeNull();
    expect(button("Удалить альбом")).toBeUndefined();
    await click("Настройки альбома");
    expect(host.querySelector('[aria-label="Настройки альбома"]')).not.toBeNull();
    expect(button("Удалить альбом")).toBeDefined();
    expect(button("Сохранить изменения")).toBeDefined();
    await click("Закрыть настройки");
    expect(button("Удалить альбом")).toBeUndefined();
  });
  it("chooses and removes a cover only after write ACK and fresh scope GET", async () => {
    await mount();
    await click("Выбрать обложку");
    expect(host.textContent).toContain("Выберите фотографию ниже");
    const trigger = host.querySelector<HTMLButtonElement>(
      'button[aria-label="Сделать обложкой фотографию Мой пёс"]',
    );
    expect(trigger).not.toBeNull();
    await act(async () => trigger?.click());
    await flush();
    expect(commands.setCover).toHaveBeenCalledWith("album_01", "photo_01");
    expect(checkCover).toHaveBeenCalledWith("album_01", me, username, "photo_01");
    expect(button("Убрать обложку")).toBeDefined();
    expect(host.querySelector(".gallery-cover-tag")?.textContent).toBe("Обложка");
    await click("Убрать обложку");
    expect(commands.setCover).toHaveBeenCalledWith("album_01", null);
    expect(checkCover).toHaveBeenCalledWith("album_01", me, username, null);
    expect(button("Убрать обложку")).toBeUndefined();
  });
  it("unknown cover ACK never marks a cover or retries the server write", async () => {
    commands.setCover = vi.fn(async () => ({ ...album, coverPhotoId: "unrelated_photo" }));
    await mount();
    await click("Выбрать обложку");
    const trigger = host.querySelector<HTMLButtonElement>(
      'button[aria-label="Сделать обложкой фотографию Мой пёс"]',
    );
    await act(async () => trigger?.click());
    await flush();
    expect(commands.setCover).toHaveBeenCalledTimes(1);
    expect(checkCover).not.toHaveBeenCalled();
    expect(host.textContent).toContain("Не удалось подтвердить изменение обложки");
    expect(host.textContent).toContain("Выберите фотографию ниже");
    expect(host.querySelector(".gallery-cover-tag")).toBeNull();
  });
  it("opens photo management through three dots and restores focus on Escape", async () => {
    await mount();
    expect(button("Изменить подпись")).toBeUndefined();
    const menu = host.querySelector<HTMLButtonElement>(
      'button[aria-label="Управление фотографией: Мой пёс"]',
    );
    expect(menu).not.toBeNull();
    await act(async () => menu?.click());
    await flush();
    expect(host.querySelector('[role="dialog"][aria-label="Фотография"]')).not.toBeNull();
    expect(button("Сохранить подпись")).toBeDefined();
    expect(button("Переместить фото")).toBeDefined();
    await act(async () =>
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })),
    );
    expect(host.querySelector('[role="dialog"][aria-label="Фотография"]')).toBeNull();
    expect(document.activeElement).toBe(menu);
  });
});
