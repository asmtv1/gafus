// @vitest-environment jsdom
import { act, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GalleryAlbums, GalleryViewerPhoto } from "./GalleryAlbums";
import type { AlbumPhoto, AlbumSummary, GalleryPage } from "./galleryApi";

const future = "2099-10-17T16:00:00.000Z";
const album: AlbumSummary = {
  id: "album_01",
  ownerId: "owner_A",
  ownerUsername: "ownerA",
  name: "Собаки",
  description: "Фотоальбом",
  isVisible: false,
  canEdit: true,
  photoCount: 2,
  urlsExpireAt: future,
  coverThumbUrl: null,
};
const photo = (id: string, albumId = album.id): AlbumPhoto => ({
  id,
  albumId,
  caption: `Фото ${id}`,
  status: "ready",
  width: 720,
  height: 480,
  thumbUrl: `https://cdn.example.test/${id}/thumb.jpg?sig=synthetic`,
  fullUrl: `https://cdn.example.test/${id}/full.jpg?sig=synthetic`,
  urlsExpireAt: future,
});
const page = <T,>(items: T[], nextCursor: string | null = null): GalleryPage<T> => ({
  items,
  nextCursor,
  isOwner: true,
  enabled: true,
  usedSlots: 2,
  limit: 200,
});

let host: HTMLDivElement;
let root: Root;
let client: QueryClient;
let getPhotos: ReturnType<
  typeof vi.fn<(id: string, cursor: string | null) => Promise<GalleryPage<AlbumPhoto>>>
>;
const flush = async () => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
};
async function mount() {
  await act(async () =>
    root.render(
      <QueryClientProvider client={client}>
        <GalleryAlbums
          userId="owner_A"
          username="ownerA"
          listAlbums={async () => page([album])}
          getAlbum={async () => album}
          getPhotos={getPhotos}
        />
      </QueryClientProvider>,
    ),
  );
  await flush();
}
async function openAlbum() {
  const button = host.querySelector<HTMLButtonElement>(
    'button[aria-label="Открыть альбом Собаки"]',
  );
  expect(button).not.toBeNull();
  await act(async () => button?.click());
  await flush();
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw Error("REAL_NETWORK_FORBIDDEN");
    }),
  );
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  });
  getPhotos = vi.fn().mockResolvedValue(page([photo("photo_01")]));
});
afterEach(async () => {
  await act(async () => root.unmount());
  client.clear();
  host.remove();
  vi.unstubAllGlobals();
});

describe("original Next owner route fresh media GET on open",()=>{
  async function routeMount(){
    await act(async()=>root.render(<QueryClientProvider client={client}>
      <GalleryAlbums userId="owner_A" username="ownerA" routeMode routeAlbumId="album_01"
        getAlbum={async()=>album} getPhotos={async()=>page([photo("photo_01")])}/>
    </QueryClientProvider>));
    await flush();
  }
  it("does not render stale full URL before authorized owner photo GET",async()=>{
    let answer!:(result:Response)=>void;
    const fetcher=vi.fn(()=>new Promise<Response>(resolve=>{answer=resolve;}));
    vi.stubGlobal("fetch",fetcher);
    await routeMount();
    const trigger=host.querySelector<HTMLButtonElement>(
      'button[aria-label="Открыть фотографию Фото photo_01"]');
    expect(trigger).not.toBeNull();
    await act(async()=>trigger?.click());
    const dialog=host.querySelector('[role="dialog"][aria-label="Просмотр фотографии"]');
    expect(dialog).not.toBeNull();
    // The shared dog-loader may show its static, public poster. Private gallery
    // media must remain absent until the authorized owner GET returns.
    expect(dialog?.querySelector('img:not([src^="/images/loading-mascot-router"])'))
      .toBeNull();
    expect(dialog?.textContent).toContain("Загрузка");
    expect(fetcher).toHaveBeenCalledWith("/api/v1/gallery/photos/photo_01",
      expect.objectContaining({method:"GET",credentials:"include"}));
    const authorized={...photo("photo_01"),
      fullUrl:"https://cdn.example.test/fresh/photo_01.jpg?sig=synthetic"};
    await act(async()=>answer(new Response(JSON.stringify({success:true,data:authorized}),
      {status:200})));
    await flush();
    expect(dialog?.querySelector("img")?.getAttribute("src")).toBe(authorized.fullUrl);
    expect(dialog?.innerHTML).not.toContain("/photo_01/full.jpg");
  });
  it("denied owner GET never exposes list-provided full media",async()=>{
    vi.stubGlobal("fetch",vi.fn(async()=>new Response(JSON.stringify({
      success:false,error:{code:"FORBIDDEN",message:"denied"}}),{status:403})));
    await routeMount();
    await act(async()=>host.querySelector<HTMLButtonElement>(
      'button[aria-label="Открыть фотографию Фото photo_01"]')?.click());
    await flush();
    const dialog=host.querySelector('[role="dialog"][aria-label="Просмотр фотографии"]');
    expect(dialog?.querySelector("img")).toBeNull();
    expect(dialog?.textContent).toContain("Фото недоступно");
    expect(dialog?.innerHTML).not.toContain("/photo_01/full.jpg");
  });
});
describe("owner viewer signed-media renewal",()=>{
  it("StrictMode rehearsal leaves an authorized photo GET recovery usable",async()=>{
    const initial=photo("photo_01");
    const newer={...initial,fullUrl:"https://cdn.example.test/new/photo.jpg?sig=fresh"};
    const fetcher=vi.fn(async()=>new Response(JSON.stringify({success:true,data:newer}),
      {status:200}));
    vi.stubGlobal("fetch",fetcher);
    await act(async()=>root.render(<StrictMode>
      <GalleryViewerPhoto photo={initial} albumId="album_01"/>
    </StrictMode>));
    const img=host.querySelector("img");
    expect(img).not.toBeNull();
    await act(async()=>img?.dispatchEvent(new Event("error",{bubbles:true})));
    await flush();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(host.querySelector("img")?.getAttribute("src")).toBe(newer.fullUrl);
  });
  it("parent album refresh provides renewed signed URL to the still-open viewer",async()=>{
    const initial=photo("photo_01");
    const renewed={...initial,fullUrl:"https://cdn.example.test/renewed/full.jpg?sig=fresh"};
    await act(async()=>root.render(<GalleryViewerPhoto photo={initial} albumId="album_01"/>));
    expect(host.querySelector("img")?.getAttribute("src")).toBe(initial.fullUrl);
    await act(async()=>root.render(<GalleryViewerPhoto photo={renewed} albumId="album_01"/>));
    await flush();
    expect(host.querySelector("img")?.getAttribute("src")).toBe(renewed.fullUrl);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
describe("owner-scoped gallery photos and responsive viewer", () => {
  it("shows original Next cover marker only for the server-selected photo", async () => {
    album.coverPhotoId = "photo_01";
    getPhotos.mockResolvedValueOnce(page([photo("photo_01"),photo("photo_02")]));
    await mount();
    await openAlbum();
    const cards = [...host.querySelectorAll(".gallery-photo-card")];
    expect(cards).toHaveLength(2);
    expect(cards[0].querySelector(".gallery-cover-tag")?.textContent).toBe("Обложка");
    expect(cards[1].querySelector(".gallery-cover-tag")).toBeNull();
    album.coverPhotoId = null;
  });

  it("shows original Next Russian processing/failed states, not internal English status",async()=>{
    getPhotos.mockResolvedValueOnce(page([
      {...photo("photo_pending"),status:"pending",thumbUrl:null,fullUrl:null},
      {...photo("photo_failed"),status:"failed",thumbUrl:null,fullUrl:null},
    ]));
    await mount();
    await openAlbum();
    expect(host.textContent).toContain("Ожидает обработки");
    expect(host.textContent).toContain("Ошибка обработки");
    expect(host.textContent).not.toContain("Обработка фотографии: pending");
    expect(host.textContent).not.toContain("Обработка фотографии: failed");
  });
  it("G-P01 rejects a foreign album photo on first page before private render", async () => {
    getPhotos.mockResolvedValueOnce(page([photo("foreign_01", "album_B")]));
    await mount();
    await openAlbum();
    expect(host.textContent).toContain("Не удалось загрузить фотоальбомы.");
    expect(host.textContent).not.toContain("Фото foreign_01");
    expect(host.querySelector(".gallery-photo-card")).toBeNull();
  });

  it("G-P02 rejects a photo page that does not prove owner scope", async () => {
    getPhotos.mockResolvedValueOnce({ ...page([photo("photo_01")]), isOwner: false });
    await mount();
    await openAlbum();
    expect(host.textContent).toContain("Не удалось загрузить фотоальбомы.");
    expect(host.querySelector(".gallery-photo-card")).toBeNull();
  });

  it("G-P03 never appends foreign photos from pagination", async () => {
    getPhotos.mockImplementation(async (_id, cursor) =>
      cursor === null
        ? page([photo("photo_01")], "next")
        : page([photo("photo_02"), photo("foreign_02", "album_B")]),
    );
    await mount();
    await openAlbum();
    const more = [...host.querySelectorAll<HTMLButtonElement>("button")].find(
      (button) => button.textContent === "Показать ещё фотографии",
    );
    expect(more).toBeDefined();
    await act(async () => more?.click());
    await flush();
    expect(getPhotos).toHaveBeenCalledWith("album_01", "next");
    expect(host.querySelectorAll(".gallery-photo-card")).toHaveLength(1);
    expect(host.textContent).not.toContain("foreign_02");
  });

  it.each([360, 1280])(
    "G-P04 modal at viewport %ipx supports Escape and focus return",
    async (width) => {
      vi.stubGlobal("innerWidth", width);
      await mount();
      await openAlbum();
      const trigger = host.querySelector<HTMLButtonElement>(
        'button[aria-label="Открыть фотографию Фото photo_01"]',
      );
      expect(trigger).not.toBeNull();
      await act(async () => trigger?.click());
      expect(host.querySelector('[role="dialog"][aria-modal="true"]')).not.toBeNull();
      const close = [...host.querySelectorAll<HTMLButtonElement>("button")].find(
        (button) => button.textContent === "Закрыть фотографию",
      );
      expect(document.activeElement).toBe(close);
      await act(async () =>
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })),
      );
      expect(host.querySelector('[role="dialog"]')).toBeNull();
      expect(document.activeElement).toBe(trigger);
      expect(globalThis.fetch).not.toHaveBeenCalled();
    },
  );

  it("G-P05 viewer navigates loaded ready photos by buttons and arrows without extra HTTP", async () => {
    getPhotos.mockResolvedValueOnce(page([photo("photo_01"), photo("photo_02")]));
    await mount();
    await openAlbum();
    const trigger = host.querySelector<HTMLButtonElement>(
      'button[aria-label="Открыть фотографию Фото photo_01"]',
    );
    await act(async () => trigger?.click());
    const viewer = () => host.querySelector<HTMLElement>('[role="dialog"]');
    const viewedSrc = () => viewer()?.querySelector("img")?.getAttribute("src");
    const previous = viewer()?.querySelector<HTMLButtonElement>(
      'button[aria-label="Предыдущая фотография"]',
    );
    const next = viewer()?.querySelector<HTMLButtonElement>(
      'button[aria-label="Следующая фотография"]',
    );
    const close = viewer()?.querySelector<HTMLButtonElement>(
      'button[aria-label="Закрыть фотографию"]',
    );
    expect(viewer()?.textContent).toContain("1 / 2");
    expect(viewedSrc()).toContain("photo_01/full.jpg");
    expect(previous?.disabled).toBe(true);
    expect(next?.disabled).toBe(false);
    await act(async () => next?.click());
    expect(viewer()?.textContent).toContain("2 / 2");
    expect(viewedSrc()).toContain("photo_02/full.jpg");
    expect(next?.disabled).toBe(true);
    await act(async () =>
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true })),
    );
    expect(viewedSrc()).toContain("photo_01/full.jpg");
    await act(async () =>
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })),
    );
    expect(viewedSrc()).toContain("photo_02/full.jpg");
    await act(async () => {
      previous?.focus();
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
    });
    expect(document.activeElement).toBe(close);
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", {
        key: "Tab", shiftKey: true, bubbles: true,
      }));
    });
    expect(document.activeElement).toBe(previous);
    await act(async () =>
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })),
    );
    expect(viewer()).toBeNull();
    expect(document.activeElement).toBe(trigger);
    expect(getPhotos).toHaveBeenCalledOnce();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("G-P11 backdrop closes the viewer, image tap stays and focus returns",async()=>{
    await mount();await openAlbum();
    const trigger=host.querySelector<HTMLButtonElement>(
      'button[aria-label="Открыть фотографию Фото photo_01"]');
    await act(async()=>trigger?.click());
    const dialog=host.querySelector<HTMLElement>('[role="dialog"]');
    expect(dialog).not.toBeNull();
    await act(async()=>dialog?.querySelector("img")?.dispatchEvent(
      new MouseEvent("click",{bubbles:true})));
    expect(host.querySelector('[role="dialog"]')).not.toBeNull();
    await act(async()=>dialog?.dispatchEvent(new MouseEvent("click",{bubbles:true})));
    expect(host.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("G-P10 horizontal swipe navigates ready photos, vertical/multitouch does not",async()=>{
    getPhotos.mockResolvedValueOnce(page([photo("photo_01"),photo("photo_02")]));
    await mount();await openAlbum();
    const trigger=host.querySelector<HTMLButtonElement>(
      'button[aria-label="Открыть фотографию Фото photo_01"]');
    await act(async()=>trigger?.click());
    const inner=host.querySelector<HTMLElement>(".gallery-image-viewer-inner")!;
    const touch=(kind:string,x:number,y:number,touches=1)=>{
      const event=new Event(kind,{bubbles:true,cancelable:true});
      const points=Array.from({length:touches},()=>({clientX:x,clientY:y}));
      Object.defineProperty(event,"touches",{value:kind==="touchstart"?points:[]});
      Object.defineProperty(event,"changedTouches",{value:points});
      inner.dispatchEvent(event);
    };
    const src=()=>inner.querySelector("img")?.getAttribute("src");
    await act(async()=>{touch("touchstart",300,200);touch("touchend",60,201);});
    expect(src()).toContain("photo_02/full.jpg");
    await act(async()=>{touch("touchstart",100,200);touch("touchend",100,60);});
    expect(src()).toContain("photo_02/full.jpg");
    await act(async()=>{touch("touchstart",60,200,2);touch("touchend",300,200,2);});
    expect(src()).toContain("photo_02/full.jpg");
    await act(async()=>{touch("touchstart",60,200);touch("touchend",300,201);});
    expect(src()).toContain("photo_01/full.jpg");
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("G-P09 broken thumbnail triggers one bounded owner-album GET without mutation",async()=>{
    await mount();
    await openAlbum();
    expect(getPhotos).toHaveBeenCalledTimes(1);
    const thumb=host.querySelector(".gallery-photo-card img");
    expect(thumb).not.toBeNull();
    await act(async()=>thumb?.dispatchEvent(new Event("error",{bubbles:true})));
    await flush();
    expect(getPhotos).toHaveBeenCalledTimes(2);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("G-P07 recovers a broken full image only after a fresh Hono owner photo GET", async () => {
    await mount();
    await openAlbum();
    const trigger = host.querySelector<HTMLButtonElement>(
      'button[aria-label="Открыть фотографию Фото photo_01"]',
    );
    await act(async () => trigger?.click());
    const dialog = () => host.querySelector<HTMLElement>('[role="dialog"]');
    const oldSrc = dialog()?.querySelector("img")?.getAttribute("src");
    const newer = { ...photo("photo_01"),
      fullUrl:"https://cdn.example.test/photo_01/full-new.jpg?sig=synthetic" };
    const fetcher = vi.fn(async (_url:string,_init?:RequestInit) => new Response(
      JSON.stringify({success:true,data:newer}),{status:200}));
    vi.stubGlobal("fetch",fetcher);
    await act(async () => dialog()?.querySelector("img")?.dispatchEvent(
      new Event("error",{bubbles:true})));
    await flush();
    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher.mock.calls[0][0]).toBe("/api/v1/gallery/photos/photo_01");
    expect(fetcher.mock.calls[0][1]).toMatchObject({method:"GET",credentials:"include"});
    expect(dialog()?.querySelector("img")?.getAttribute("src")).toBe(newer.fullUrl);
    expect(oldSrc).not.toEqual(newer.fullUrl);
    expect(dialog()?.textContent).not.toContain("Фото недоступно");
  });

  it("G-P08 rejects a foreign photo on recovery without rendering its signed URL", async () => {
    await mount();
    await openAlbum();
    const trigger = host.querySelector<HTMLButtonElement>(
      'button[aria-label="Открыть фотографию Фото photo_01"]',
    );
    await act(async () => trigger?.click());
    const foreign = {...photo("photo_01","album_B"),
      fullUrl:"https://cdn.example.test/privateB/full.jpg?sig=secret"};
    const fetcher=vi.fn(async()=>new Response(JSON.stringify({success:true,data:foreign}),
      {status:200}));
    vi.stubGlobal("fetch",fetcher);
    await act(async () => host.querySelector('[role="dialog"] img')?.dispatchEvent(
      new Event("error",{bubbles:true})));
    await flush();
    expect(fetcher).toHaveBeenCalledOnce();
    expect(host.querySelector('[role="dialog"]')?.textContent).toContain("Фото недоступно");
    expect(host.querySelector('[role="dialog"] img')).toBeNull();
    expect(host.innerHTML).not.toContain("privateB");
  });

  it("G-P06 viewer excludes processing and expired full photos from navigation", async () => {
    getPhotos.mockResolvedValueOnce(page([
      photo("photo_01"),
      { ...photo("photo_02"), status: "processing", fullUrl: null },
      { ...photo("photo_03"), urlsExpireAt: "2020-01-01T00:00:00Z" },
    ]));
    await mount();
    await openAlbum();
    const trigger = host.querySelector<HTMLButtonElement>(
      'button[aria-label="Открыть фотографию Фото photo_01"]',
    );
    await act(async () => trigger?.click());
    const viewer = host.querySelector('[role="dialog"]');
    expect(viewer?.textContent).toContain("1 / 1");
    expect(viewer?.querySelector<HTMLButtonElement>(
      'button[aria-label="Предыдущая фотография"]',
    )?.disabled).toBe(true);
    expect(viewer?.querySelector<HTMLButtonElement>(
      'button[aria-label="Следующая фотография"]',
    )?.disabled).toBe(true);
    expect(host.querySelector<HTMLButtonElement>(
      'button[aria-label="Открыть фотографию Фото photo_02"]',
    )?.disabled).toBe(true);
    expect(host.querySelector<HTMLButtonElement>(
      'button[aria-label="Открыть фотографию Фото photo_03"]',
    )?.disabled).toBe(true);
  });
});
