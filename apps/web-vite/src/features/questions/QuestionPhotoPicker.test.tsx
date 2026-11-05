// @vitest-environment jsdom
import { act, createElement, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../shared/media/browserPhotoWebp", () => ({
  prepareBrowserPhotoWebp: vi.fn(async (_original: File, edges: Record<string, number>) =>
    Object.fromEntries(Object.entries(edges).map(([name, edge]) => [name, {
      file: new File([new Uint8Array(128)], `${name}.webp`, { type: "image/webp" }),
      width: edge, height: Math.round(edge * 0.75),
    }]))),
}));
import { prepareBrowserPhotoWebp } from "../../shared/media/browserPhotoWebp";
import { QuestionPhotoPicker } from "./QuestionPhotoPicker";
import type { PendingQuestionPhoto } from "./questionMedia";

const jpeg = () => new File([new Uint8Array([255, 216, 255])], "pet.jpg", {
  type: "image/jpeg",
});
function response(data: unknown, status = 200) {
  return new Response(JSON.stringify({
    success: status === 200 || status === 201, data, error: "Storage temporarily unavailable",
  }), { status });
}
function Harness({ existingCount = 0 }: { existingCount?: number }) {
  const [photos, setPhotos] = useState<PendingQuestionPhoto[]>([]);
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [submitted, setSubmitted] = useState<string[]>([]);
  const flushRef = useRef<(() => Promise<PendingQuestionPhoto[]>) | null>(null);
  return createElement("section", {},
    createElement("output", { "data-testid": "busy" }, busy ? "busy" : "idle"),
    createElement("output", { "data-testid": "local-ids" }, photos.map(photo => photo.id).join(",")),
    createElement("output", { "data-testid": "submitted" }, submitted.join(",")),
    createElement("button", { type: "button", "aria-label": "Опубликовать тест", onClick: () => {
      setSubmitError("");
      void flushRef.current?.().then(files => setSubmitted(files.map(item => item.id)))
        .catch(error => setSubmitError(String(error)));
    } }, "Опубликовать тест"),
    submitError && createElement("output", { "data-testid": "submit-error" }, submitError),
    createElement(QuestionPhotoPicker, {
      photos, onChange: setPhotos, onBusy: setBusy, existingCount,
      submitUploadsRef: flushRef,
    }));
}
async function mount(fetcher: ReturnType<typeof vi.fn>, existingCount = 0) {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  let serial = 0, urlSerial = 0;
  vi.stubGlobal("crypto", { randomUUID: () =>
    `00000000-0000-4000-8000-${String(++serial).padStart(12, "0")}` });
  const revoked = vi.fn();
  const posts: string[] = [];
  class FakeXHR {
    status = 204;
    upload: { onprogress?: ((event: ProgressEvent) => void) | null } = {};
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    ontimeout: (() => void) | null = null;
    onabort: (() => void) | null = null;
    withCredentials = false;
    timeout = 0;
    open(method: string, url: string) { posts.push(`${method} ${url}`); }
    send() { queueMicrotask(() => { this.onload?.(); }); }
    abort() { this.onabort?.(); }
  }
  vi.stubGlobal("XMLHttpRequest", FakeXHR);
  const OriginalURL = URL;
  class FakeURL extends OriginalURL {
    static createObjectURL = vi.fn(() => `blob:local-${++urlSerial}`);
    static revokeObjectURL = revoked;
  }
  vi.stubGlobal("URL", FakeURL);
  vi.stubGlobal("fetch", async (path: string, init?: RequestInit) => {
    if (String(path).endsWith("/client-confirm"))
      return response({ id: String(path).split("/").at(-2), status: "READY" });
    const res = await (fetcher as (path: string, init?: RequestInit) => Promise<Response>)(path, init);
    if (String(path).endsWith("/client-reservations") && res.ok) {
      const payload = await res.clone().json() as { data: { id: string } };
      const upload = { url: "https://s3.cloud.ru/gafus-questions-public", method: "POST",
        fields: { key: "questions/v2/owner/test/source.webp" } };
      return response({ id: payload.data.id, upload, smallUpload: upload }, 201);
    }
    return res;
  });
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => root.render(createElement(Harness, { existingCount })));
  return {
    host, revoked, posts,
    async select(files: File[]) {
      const input = host.querySelector<HTMLInputElement>('input[type="file"]')!;
      Object.defineProperty(input, "files", { configurable: true, value: files });
      await act(async () => input.dispatchEvent(new Event("change", { bubbles: true })));
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 15)); });
    },
    async click(label: string) {
      const button = [...host.querySelectorAll<HTMLButtonElement>("button")]
        .find(item => item.textContent?.includes(label) || item.getAttribute("aria-label")?.includes(label));
      expect(button).toBeDefined();
      await act(async () => button?.click());
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 15)); });
    },
    async submit() { await this.click("Опубликовать тест"); },
    async cleanup() { await act(async () => root.unmount()); host.remove(); },
  };
}
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe("Questions WebP: only upload after question/answer submit", () => {
  it("prepares a preview locally; cancel without publication sends no reserve/DELETE to S3", async () => {
    const fetcher = vi.fn();
    const screen = await mount(fetcher);
    try {
      await screen.select([jpeg()]);
      expect(screen.host.querySelector(".question-photo-slot img")?.getAttribute("src"))
        .toBe("blob:local-1");
      expect(screen.host.textContent).toContain("Готово к отправке");
      expect(screen.host.querySelector('[data-testid="local-ids"]')?.textContent)
        .toContain("local-");
      expect(fetcher).not.toHaveBeenCalled();
      expect(screen.posts).toHaveLength(0);
      await screen.click("Убрать фото");
      expect(fetcher).not.toHaveBeenCalled();
      expect(screen.host.querySelectorAll(".question-photo-slot img")).toHaveLength(0);
      expect(screen.revoked).toHaveBeenCalledWith("blob:local-1");
    } finally { await screen.cleanup(); }
  });

  it("uploads both ready variants on Publish, then passes only confirmed IDs", async () => {
    const fetcher = vi.fn().mockResolvedValue(response({ id: "photo-1" }));
    const screen = await mount(fetcher);
    try {
      await screen.select([jpeg()]);
      expect(fetcher).not.toHaveBeenCalled();
      await screen.submit();
      expect(fetcher.mock.calls.filter(([path]) => String(path).endsWith("client-reservations")))
        .toHaveLength(1);
      expect(screen.posts).toHaveLength(2);
      expect(screen.host.querySelector('[data-testid="submitted"]')?.textContent)
        .toBe("photo-1");
      expect(screen.host.querySelector('[data-testid="local-ids"]')?.textContent)
        .toBe("photo-1");
    } finally { await screen.cleanup(); }
  });

  it("does not remove an already-uploaded orphan until server DELETE succeeds", async () => {
    const fetcher = vi.fn((path: string, init?: RequestInit) => Promise.resolve(
      init?.method === "DELETE" ? response(null, 503) : response({ id: "photo-1" })));
    const screen = await mount(fetcher);
    try {
      await screen.select([jpeg()]);
      await screen.submit();
      await screen.click("Убрать фото");
      expect(screen.host.querySelectorAll(".question-photo-slot img")).toHaveLength(1);
      expect(screen.host.querySelector('[role="alert"]')?.textContent)
        .toContain("Storage temporarily unavailable");
      expect(fetcher.mock.calls.some(([path, init]) => String(path).endsWith("/photo-1") &&
        init?.method === "DELETE")).toBe(true);
    } finally { await screen.cleanup(); }
  });

  it("enforces the 5-photo cap locally, no network traffic before submit", async () => {
    const fetcher = vi.fn().mockResolvedValue(response({ id: "photo-1" }));
    const screen = await mount(fetcher, 4);
    try {
      await screen.select([jpeg(), jpeg()]);
      expect(screen.host.querySelector('[role="alert"]')?.textContent).toContain("не более 5");
      expect(fetcher).not.toHaveBeenCalled();
      await screen.select([jpeg()]);
      expect(screen.host.textContent).toContain("5 из 5");
      expect(screen.host.querySelector(".question-photo-add")).toBeNull();
      expect(fetcher).not.toHaveBeenCalled();
    } finally { await screen.cleanup(); }
  });

  it("rejects GIF and invalid source without any S3 request", async () => {
    const fetcher = vi.fn();
    const screen = await mount(fetcher);
    try {
      await screen.select([new File([new Uint8Array(10)], "bad.gif", { type: "image/gif" })]);
      expect(screen.host.querySelector('[role="alert"]')?.textContent).toContain("JPG");
      expect(fetcher).not.toHaveBeenCalled();
      expect(screen.posts).toHaveLength(0);
    } finally { await screen.cleanup(); }
  });

  it("on local encoding failure retries only the failed picture without S3", async () => {
    vi.mocked(prepareBrowserPhotoWebp).mockRejectedValueOnce(Error("decode"));
    const fetcher = vi.fn();
    const screen = await mount(fetcher);
    try {
      await screen.select([jpeg()]);
      expect(screen.host.querySelectorAll(".question-photo-slot-pending")).toHaveLength(1);
      await screen.click("Повторить обработку фото pet.jpg");
      expect(screen.host.querySelectorAll(".question-photo-slot-pending")).toHaveLength(0);
      expect(screen.host.textContent).toContain("Готово к отправке");
      expect(fetcher).not.toHaveBeenCalled();
    } finally { await screen.cleanup(); }
  });

  it("failed second upload retains first confirmed ID, and retries only the second", async () => {
    let reserves = 0;
    const fetcher = vi.fn((path: string) => Promise.resolve(
      String(path).endsWith("client-reservations")
        ? (++reserves === 2 ? response(null, 503) : response({ id: `photo-${reserves}` }))
        : response({ id: "unused" })));
    const screen = await mount(fetcher);
    try {
      await screen.select([jpeg(), jpeg()]);
      expect(fetcher).not.toHaveBeenCalled();
      await screen.submit();
      expect(reserves).toBe(2);
      expect(screen.host.querySelector('[data-testid="submit-error"]')?.textContent)
        .toContain("Не удалось загрузить");
      expect(screen.host.querySelectorAll(".question-photo-retry")).toHaveLength(1);
      await screen.submit();
      expect(reserves).toBe(3);
      expect(screen.host.querySelector('[data-testid="submitted"]')?.textContent)
        .toBe("photo-1,photo-3");
      expect(screen.posts).toHaveLength(4);
    } finally { await screen.cleanup(); }
  });

  it("releases every local blob preview on navigation/unmount", async () => {
    const screen = await mount(vi.fn());
    await screen.select([jpeg()]);
    await screen.cleanup();
    expect(screen.revoked).toHaveBeenCalledWith("blob:local-1");
  });
});
