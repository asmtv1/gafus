// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MomentComposer } from "./MomentComposer";
import { CURRENT_USER_QUERY_KEY } from "../../shared/auth/useAuth";

const KEY = "550e8400-e29b-41d4-a716-446655440000";
const draft = {
  id: "post-1",
  status: "draft",
  version: 0,
  text: "",
  canEdit: true,
  attachments: [],
  pendingRevision: null,
};
const pendingRevision = { status: "draft", text: "", attachmentIds: ["copied1"] };
const ack = (data: unknown) =>
  new Response(JSON.stringify({ success: true, data }), { status: 200 });
const album = {
  id: "album1",
  ownerId: "viewer",
  ownerUsername: "ownerA",
  name: "Собаки",
  description: null,
  isVisible: false,
  canEdit: true,
  photoCount: 1,
  urlsExpireAt: null,
  coverThumbUrl: null,
};
const photo = {
  id: "photo1",
  albumId: "album1",
  caption: "Питомец",
  status: "ready",
  thumbUrl: null,
  fullUrl: null,
  urlsExpireAt: null,
  width: 120,
  height: 120,
};
const page = (items: unknown[]) => ({
  items,
  nextCursor: null,
  isOwner: true,
  enabled: true,
  usedSlots: 1,
  limit: 40,
});
const copy = {
  id: "copied1",
  kind: "photo",
  status: "processing",
  position: 0,
  width: null,
  height: null,
  durationSeconds: null,
  thumbUrl: null,
  fullUrl: null,
  posterUrl: null,
  urlsExpireAt: null,
};
const flush = async () =>
  act(async () => {
    await new Promise((done) => setTimeout(done, 45));
  });

afterEach(() => {
  vi.unstubAllGlobals();
});
describe("WEB4 source Next pre-draft album selection into one Core publish action", () => {
  it("copies owner selected album photo only on publish, CAS adds media then publishes pending", async () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const requests = vi.fn(async (path: string, init?: RequestInit): Promise<Response> => {
      if (path === "/api/v1/feed/status") return ack({ enabled: true });
      if (path === "/api/v1/gallery/profiles/ownerA/albums?pageSize=20") return ack(page([album]));
      if (path === "/api/v1/gallery/albums/album1/photos?pageSize=20") return ack(page([photo]));
      if (path === "/api/v1/feed/posts" && init?.method === "POST") return ack(draft);
      if (path === "/api/v1/feed/posts/post-1/album-copies" && init?.method === "POST")
        return ack(copy);
      if (path === "/api/v1/feed/posts/post-1/revisions" && init?.method === "PUT")
        return ack({ ...draft, version: 1, pendingRevision });
      if (path === "/api/v1/feed/posts/post-1/publish" && init?.method === "POST")
        return ack({
          ...draft,
          version: 1,
          status: "pending",
          pendingRevision: { ...pendingRevision, status: "pending" },
        });
      if (path === "/api/v1/feed/posts/post-1/editor")
        return ack({
          ...draft,
          version: 1,
          status: "pending",
          pendingRevision: { ...pendingRevision, status: "pending" },
        });
      throw new Error("UNEXPECTED_TEST_REQUEST:" + path);
    });
    vi.stubGlobal("fetch", requests);
    vi.stubGlobal("crypto", { randomUUID: () => KEY });
    window.history.replaceState(null, "", "/moments/new");
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(CURRENT_USER_QUERY_KEY, { id: "viewer", username: "ownerA", role: "USER" });
    const click = async (text: string) => {
      const control = Array.from(host.querySelectorAll<HTMLButtonElement>("button")).find(
        (button) => button.textContent?.includes(text),
      );
      expect(control, text).toBeDefined();
      await act(async () => control?.click());
      await flush();
    };
    try {
      await act(async () =>
        root.render(
          createElement(
            QueryClientProvider,
            { client },
            createElement(MomentComposer, { userId: "viewer" }),
          ),
        ),
      );
      await flush();
      expect(host.querySelector('section[aria-label="Фото из альбомов"]')).not.toBeNull();
      // The original Next editor always displays a disabled empty publish action.
      // A disabled click must not create a Core draft or duplicate a request.
      const emptyPublish = [...host.querySelectorAll<HTMLButtonElement>("button")].find(
        (button) => button.textContent?.trim() === "Опубликовать",
      );
      expect(emptyPublish).toBeDefined();
      expect(emptyPublish?.disabled).toBe(true);
      // Next has no disabled secondary draft action on the empty form.
      expect(
        [...host.querySelectorAll("button")].some(
          (button) => button.textContent?.trim() === "Сохранить черновик",
        ),
      ).toBe(false);
      await act(async () => emptyPublish?.click());
      expect(requests.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);
      await click("Из моих фотоальбомов");
      await click("Собаки");
      await click("Выбрать");
      expect(host.textContent).toContain("✓ Выбрано");
      expect(requests.mock.calls.filter(([path]) => path.endsWith("/album-copies"))).toHaveLength(
        0,
      );
      expect(requests.mock.calls.filter(([path]) => path === "/api/v1/feed/posts")).toHaveLength(0);
      await click("Опубликовать");
      for (let i = 0; i < 14 && window.location.pathname !== "/moments"; i++) await flush();
      expect(window.location.pathname).toBe("/moments");
      const writes = requests.mock.calls.filter(
        ([, opts]) => opts?.method === "POST" || opts?.method === "PUT",
      );
      expect(writes.map(([path]) => path)).toEqual([
        "/api/v1/feed/posts",
        "/api/v1/feed/posts/post-1/album-copies",
        "/api/v1/feed/posts/post-1/revisions",
        "/api/v1/feed/posts/post-1/publish",
      ]);
      expect(JSON.parse(String(writes[1]![1]?.body))).toEqual({
        photoId: "photo1",
        clientRequestId: KEY,
      });
      expect(JSON.parse(String(writes[2]![1]?.body))).toMatchObject({
        expectedVersion: 0,
        attachmentIds: ["copied1"],
        text: "",
        clientRequestId: KEY,
      });
      expect(JSON.parse(String(writes[3]![1]?.body))).toEqual({ clientRequestId: KEY });
    } finally {
      await act(async () => root.unmount());
      client.clear();
      host.remove();
      window.history.replaceState(null, "", "/moments/new");
    }
  });
});
