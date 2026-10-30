// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { GalleryAlbums } from "./GalleryAlbums";
import { ApiError } from "../../shared/api/client";
import type { AlbumSummary, AlbumPhoto, GalleryPage } from "./galleryApi";
const future = "2099-10-17T16:00:00.000Z";
const old: AlbumSummary = {
  id: "album_A",
  ownerId: "A",
  ownerUsername: "ownerA",
  name: "PRIVATE_OLD_ALBUM",
  description: "PRIVATE_ALBUM_DESCRIPTION",
  isVisible: false,
  canEdit: true,
  photoCount: 1,
  urlsExpireAt: future,
  coverThumbUrl: "https://example.invalid/old.jpg?token=PRIVATE_SIGNED",
};
const photo: AlbumPhoto = {
  id: "photo_A",
  albumId: "album_A",
  caption: "PRIVATE_PHOTO_CAPTION",
  status: "ready",
  thumbUrl: "https://example.invalid/thumb.jpg?PRIVATE_TOKEN",
  fullUrl: "https://example.invalid/full.jpg?PRIVATE_TOKEN",
  urlsExpireAt: future,
  width: 500,
  height: 500,
};
const page = <T,>(items: T[]): GalleryPage<T> => ({
  items,
  nextCursor: null,
  isOwner: true,
  enabled: true,
  usedSlots: 1,
  limit: 200,
});
function deferred<T>() {
  let resolve!: (v: T) => void, reject!: (e: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
let host: HTMLDivElement, root: Root, cache: QueryClient;
async function flush() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 35));
  });
}
async function mount(ui: React.ReactNode) {
  await act(async () =>
    root.render(<QueryClientProvider client={cache}>{ui}</QueryClientProvider>),
  );
  await flush();
}
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  cache = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  });
});
afterEach(async () => {
  await act(async () => root.unmount());
  cache.clear();
  host.remove();
  vi.unstubAllGlobals();
});
describe("owner Gallery current album/photo signed read", () => {
  it("GAL-R01 stale album card and signed cover hidden during new GET", async () => {
    const pending = deferred<GalleryPage<AlbumSummary>>();
    cache.setQueryData(["gallery", "albums", "A", "ownerA"], {
      pages: [page([old])],
      pageParams: [null],
    });
    await mount(<GalleryAlbums userId="A" username="ownerA" listAlbums={() => pending.promise} />);
    expect(host.textContent).toContain("Перепроверяем фотоальбомы");
    expect(host.textContent).not.toContain("PRIVATE_OLD_ALBUM");
    expect(host.innerHTML).not.toContain("PRIVATE_SIGNED");
    await act(async () =>
      pending.resolve(page([{ ...old, name: "Подтверждённый альбом", coverThumbUrl: null }])),
    );
    await flush();
    expect(host.textContent).toContain("Подтверждённый альбом");
  });
  it("GAL-R02 cached private detail cannot trigger photos GET before new owner approval", async () => {
    const pending = deferred<AlbumSummary>();
    const photos = vi.fn().mockResolvedValue(page([photo]));
    cache.setQueryData(["gallery", "album", "A", "ownerA", "album_A"], old);
    await mount(
      <GalleryAlbums
        userId="A"
        username="ownerA"
        routeMode
        routeAlbumId="album_A"
        getAlbum={() => pending.promise}
        getPhotos={photos}
      />,
    );
    expect(host.textContent).toContain("Перепроверяем альбом");
    expect(host.textContent).not.toContain("PRIVATE_ALBUM_DESCRIPTION");
    expect(host.innerHTML).not.toContain("PRIVATE_SIGNED");
    expect(photos).not.toHaveBeenCalled();
    await act(async () =>
      pending.resolve({ ...old, name: "Альбом подтверждён", coverThumbUrl: null }),
    );
    await flush();
    expect(host.textContent).toContain("Альбом подтверждён");
    expect(photos).toHaveBeenCalledTimes(1);
  });
  it("GAL-R03 owner denial 403 never publishes stale album or photos", async () => {
    const pending = deferred<AlbumSummary>();
    const photos = vi.fn();
    cache.setQueryData(["gallery", "album", "A", "ownerA", "album_A"], old);
    await mount(
      <GalleryAlbums
        userId="A"
        username="ownerA"
        routeMode
        routeAlbumId="album_A"
        getAlbum={() => pending.promise}
        getPhotos={photos}
      />,
    );
    await act(async () => pending.reject(new ApiError(403, "PRIVATE_SERVER_STACK")));
    await flush();
    expect(host.textContent).toContain("Нет доступа к этому альбому");
    expect(host.textContent).not.toContain("PRIVATE_ALBUM_DESCRIPTION");
    expect(host.textContent).not.toContain("PRIVATE_SERVER_STACK");
    expect(photos).not.toHaveBeenCalled();
  });
});
