// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PhotoManagement } from "./GalleryManage";
import type { AlbumPhoto, AlbumSummary, GalleryAlbumCommands } from "./galleryApi";

const owner = "owner_A", username = "ownerA";
const album: AlbumSummary = { id: "source_01", ownerId: owner, ownerUsername: username,
  name: "Исходный", description: null, isVisible: true, canEdit: true, photoCount: 1,
  coverThumbUrl: null, urlsExpireAt: null };
const target: AlbumSummary = { ...album, id: "target_01", name: "Целевой" };
const photo: AlbumPhoto = { id: "photo_01", albumId: album.id, status: "ready",
  thumbUrl: null, fullUrl: null, caption: null,
  urlsExpireAt: null, width: null, height: null };
const response = (data: unknown) => new Response(JSON.stringify({success:true,data}), {status:200});
let host: HTMLDivElement, root: Root, cache: QueryClient;
let commands: GalleryAlbumCommands;
let read: ReturnType<typeof vi.fn<(photoId: string, albumId: string) => Promise<AlbumPhoto>>>;
let changed: ReturnType<typeof vi.fn<() => void>>;
const settle = async () => act(async () => new Promise(r => setTimeout(r, 25)));
async function click(label: string) {
  const btn = [...host.querySelectorAll<HTMLButtonElement>("button")]
    .find(b => b.textContent?.trim() === label);
  expect(btn, label).toBeDefined();
  await act(async () => btn?.click()); await settle();
}
async function choose() {
  await click("Переместить");
  const select = host.querySelector<HTMLSelectElement>('select[aria-label="Целевой альбом"]') ??
    host.querySelector<HTMLSelectElement>("select");
  expect(select).not.toBeNull();
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
    setter?.call(select, target.id);
    select?.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await settle();
}
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  changed = vi.fn<() => void>();
  read = vi.fn<(photoId: string, albumId: string) => Promise<AlbumPhoto>>();
  commands = { create: vi.fn(), update: vi.fn(), remove: vi.fn(),
    updateCaption: vi.fn(), removePhoto: vi.fn(), setCover: vi.fn(), movePhoto: vi.fn() };
  vi.stubGlobal("fetch", vi.fn(async (url: string, req: RequestInit) => {
    expect(req.method).toBe("GET");
    expect(url).toBe("/api/v1/gallery/profiles/ownerA/albums?pageSize=20");
    return response({ items: [album, target], nextCursor: null, enabled: true,
      isOwner: true, usedSlots: 2, limit: 200 });
  }));
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount()); cache.clear(); host.remove(); vi.unstubAllGlobals();
});
async function mount(status: AlbumPhoto["status"] = "ready") {
  await act(async () => root.render(<QueryClientProvider client={cache}>
    <PhotoManagement album={album} photo={{...photo,status}}
      getPhoto={read} commands={commands} onChanged={changed}/>
  </QueryClientProvider>)); await settle();
}
describe("actual owner gallery queued media relocation", () => {
  it("one POST job ACK status moving and source GET confirms queued without false finished message", async () => {
    vi.mocked(commands.movePhoto).mockResolvedValue({jobId:"job_1",photo:{
      id:photo.id,albumId:album.id,status:"moving" }});
    read.mockResolvedValueOnce({...photo,status:"moving"});
    await mount(); await choose(); await click("Переместить фото");
    expect(commands.movePhoto).toHaveBeenCalledTimes(1);
    expect(read).toHaveBeenCalledWith(photo.id,album.id);
    expect(changed).toHaveBeenCalledTimes(1);
    expect(host.textContent).toContain("Перемещение запущено");
    expect(host.textContent).not.toContain("Фото перенесено");
  });
  it("background worker can finish before source GET, destination owner GET confirms completion", async () => {
    vi.mocked(commands.movePhoto).mockResolvedValue({jobId:"job_1",photo:{
      id:photo.id,albumId:album.id,status:"moving" }});
    read.mockRejectedValueOnce(Error("INVALID_GALLERY_PHOTO"))
      .mockResolvedValueOnce({...photo,albumId:target.id,status:"ready"});
    await mount(); await choose(); await click("Переместить фото");
    expect(read.mock.calls.map(args => args[1])).toEqual([album.id,target.id]);
    expect(host.textContent).toContain("Фото перенесено");
    expect(changed).toHaveBeenCalledTimes(1);
  });
  it("V2 move ACK is already READY; verifies destination only and reports completion", async () => {
    vi.mocked(commands.movePhoto).mockResolvedValue({jobId:"receipt_v2",photo:{
      id:photo.id,albumId:target.id,status:"ready" }});
    read.mockResolvedValueOnce({...photo,albumId:target.id,status:"ready"});
    await mount(); await choose(); await click("Переместить фото");
    expect(read.mock.calls.map(args => args[1])).toEqual([target.id]);
    expect(host.textContent).toContain("Фото перенесено");
    expect(changed).toHaveBeenCalledTimes(1);
  });
  it("lost move ACK retains identical idempotency UUID for explicit retry", async () => {
    vi.mocked(commands.movePhoto).mockRejectedValueOnce(Error("UNCERTAIN_ACK"))
      .mockResolvedValueOnce({jobId:"job_1",photo:{
        id:photo.id,albumId:album.id,status:"moving" }});
    read.mockResolvedValueOnce({...photo,status:"moving"});
    await mount(); await choose(); await click("Переместить фото");
    expect(host.textContent).toContain("Результат неизвестен");
    await click("Переместить фото");
    expect(commands.movePhoto).toHaveBeenCalledTimes(2);
    expect(vi.mocked(commands.movePhoto).mock.calls[0]?.[2]).toBe(
      vi.mocked(commands.movePhoto).mock.calls[1]?.[2]);
    expect(changed).toHaveBeenCalledTimes(1);
  });
  it("status not ready excludes move and never sends POST", async () => {
    await mount("processing");
    expect(host.textContent).not.toContain("Переместить");
    expect(commands.movePhoto).not.toHaveBeenCalled();
  });
});
