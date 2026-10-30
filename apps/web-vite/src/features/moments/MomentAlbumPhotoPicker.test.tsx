// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CURRENT_USER_QUERY_KEY } from "../../shared/auth/useAuth";
import { MomentAlbumPhotoPicker } from "./MomentAlbumPhotoPicker";
import type { MomentEditor } from "./momentComposerApi";

const editor: MomentEditor = {
  id: "post1", version: 1, status: "draft", canEdit: true,
  text: "", attachmentCount: 0,
  pendingRevision: { status: "draft", text: "С питомцем", attachmentIds: [] },
};
const album = {
  id: "album1", ownerId: "owner1", ownerUsername: "ownerA",
  name: "Собаки", description: null, isVisible: false, canEdit: true,
  photoCount: 2, urlsExpireAt: null, coverThumbUrl: null,
};
const photo = (id: string, status = "ready") => ({
  id, albumId: "album1", caption: "Фото собаки",
  status, thumbUrl: null, fullUrl: null, urlsExpireAt: null,
  width: 120, height: 120,
});
const page = (items: unknown[], nextCursor: string | null = null) => ({
  items, nextCursor, isOwner: true, enabled: true, usedSlots: 1, limit: 40,
});
const wrap = (data: unknown, status = 200) =>
  new Response(JSON.stringify({ success: status === 200, data,
    error: "PRIVATE_BACKEND_STACK" }), { status });
const ack = () => ({
  ...editor, version: 2, attachments: [],
  pendingRevision: { status: "draft", text: "С питомцем", attachmentIds: ["copied1"] },
});
const copyAck = {
  id: "copied1", kind: "photo", status: "processing", position: 0,
  width: null, height: null, durationSeconds: null, thumbUrl: null,
  fullUrl: null, posterUrl: null, urlsExpireAt: null,
};
let host: HTMLDivElement, root: Root, client: QueryClient;
let requests: ReturnType<typeof vi.fn<(path: string, options?: RequestInit) =>
  Promise<Response>>>;
const saved: MomentEditor[] = [];
const busy: boolean[] = [];
const flush = async () => act(async () => {
  await new Promise(resolve => setTimeout(resolve, 35));
});
async function click(label: string) {
  const button = [...host.querySelectorAll("button")]
    .find(node => node.textContent?.includes(label));
  expect(button, label).toBeDefined();
  await act(async () => button?.click());
  await flush();
}
async function mount() {
  await act(async () => root.render(<QueryClientProvider client={client}>
    <MomentAlbumPhotoPicker userId="owner1" editor={editor}
      onSaved={value => saved.push(value)} onBusy={value => busy.push(value)} />
  </QueryClientProvider>));
  await flush();
}
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  saved.splice(0); busy.splice(0);
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(CURRENT_USER_QUERY_KEY, {
    id: "owner1", username: "ownerA", role: "USER",
  });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  requests = vi.fn();
  vi.stubGlobal("fetch", requests);
});
afterEach(async () => {
  await act(async () => root.unmount());
  client.clear();
  host.remove();
  vi.unstubAllGlobals();
});
function setup(revisionsFailFirst = false) {
  let revisions = 0;
  requests.mockImplementation(async (path, options) => {
    if (path === "/api/v1/gallery/profiles/ownerA/albums?pageSize=20")
      return wrap(page([album]));
    if (path === "/api/v1/gallery/albums/album1/photos?pageSize=20")
      return wrap(page([photo("photo1"), photo("notready", "processing")]));
    if (path === "/api/v1/feed/posts/post1/album-copies" &&
        options?.method === "POST") {
      const body = JSON.parse(String(options.body));
      expect(body.photoId).toBe("photo1");
      expect(body.clientRequestId).toMatch(/^[a-f0-9-]{36}$/i);
      return wrap(copyAck);
    }
    if (path === "/api/v1/feed/posts/post1/revisions" &&
        options?.method === "PUT") {
      revisions++;
      expect(JSON.parse(String(options.body))).toMatchObject({
        attachmentIds: ["copied1"], expectedVersion: 1, text: "С питомцем",
      });
      return revisionsFailFirst && revisions === 1 ? wrap(null, 503) : wrap(ack());
    }
    throw Error("UNEXPECTED_REQUEST");
  });
}
describe("WEB4 Next album copy, real shared Gallery/Feed transport", () => {
  it("source Next owner selects ready photo before draft without any S3 copy or Feed revision write", async () => {
    setup();
    const selected: string[] = [];
    const select = vi.fn((id: string) => selected.push(id));
    await act(async () => root.render(<QueryClientProvider client={client}>
      <MomentAlbumPhotoPicker userId="owner1" selectedPhotoIds={[]}
        onSelectLocal={select} onBusy={value => busy.push(value)} />
    </QueryClientProvider>));
    await flush();
    await click("Из моих фотоальбомов");
    await click("Собаки");
    expect(host.textContent).toContain("Выбрать");
    await click("Выбрать");
    expect(selected).toEqual(["photo1"]);
    expect(requests.mock.calls.filter(([,init]) => init?.method === "POST" ||
      init?.method === "PUT")).toHaveLength(0);
    expect(busy).toHaveLength(0);
    expect(host.textContent).not.toContain("notready");
  });
  it("lists only owner ready photos, real copy + CAS/GET-visible editor, no signed URL leak", async () => {
    setup();
    await mount();
    expect(host.textContent).not.toContain("Собаки");
    await click("Из моих фотоальбомов");
    expect(host.textContent).toContain("Собаки");
    await click("Собаки");
    expect(host.textContent).toContain("Добавить фото");
    await click("Добавить фото");
    expect(saved).toHaveLength(1);
    expect(saved[0].pendingRevision?.attachmentIds).toEqual(["copied1"]);
    expect(busy).toEqual([true, false]);
    expect(host.textContent).toContain("Фото из альбома добавлено");
    expect(requests.mock.calls.filter(([url]) => url.endsWith("/album-copies"))).toHaveLength(1);
    expect(requests.mock.calls.filter(([url]) => url.endsWith("/revisions"))).toHaveLength(1);
    expect(host.innerHTML).not.toContain("PRIVATE_BACKEND_STACK");
  });
  it("HTTP503 revision retains copy media ID and idempotency; no duplicate reservation", async () => {
    setup(true);
    await mount();
    await click("Из моих фотоальбомов");
    await click("Собаки");
    await click("Добавить фото");
    expect(saved).toHaveLength(0);
    expect(host.textContent).toContain("Не удалось подтвердить копирование");
    await flush();
    expect(requests.mock.calls.filter(([url]) => url.endsWith("/revisions"))).toHaveLength(1);
    await click("Добавить фото");
    expect(saved).toHaveLength(1);
    expect(requests.mock.calls.filter(([url]) => url.endsWith("/album-copies"))).toHaveLength(1);
    const two = requests.mock.calls.filter(([url]) => url.endsWith("/revisions"));
    expect(two).toHaveLength(2);
    expect(JSON.parse(String(two[0][1]?.body)).clientRequestId)
      .toBe(JSON.parse(String(two[1][1]?.body)).clientRequestId);
  });
  it("foreign identity disables copy and never mutates another owner's album", async () => {
    setup();
    await mount();
    await click("Из моих фотоальбомов");
    await click("Собаки");
    await act(async () => client.setQueryData(CURRENT_USER_QUERY_KEY, {
      id: "stranger1", username: "notowner", role: "USER",
    }));
    await flush();
    expect(host.textContent).not.toContain("Собаки");
    expect(host.textContent).not.toContain("Добавить фото");
    await act(async () => client.setQueryData(CURRENT_USER_QUERY_KEY, {
      id: "owner1", username: "ownerA", role: "USER",
    }));
    await flush();
    expect(host.textContent).not.toContain("Добавить фото");
    expect(saved).toHaveLength(0);
    expect(requests.mock.calls.some(([url]) => url.includes("album-copies"))).toBe(false);
  });
});
