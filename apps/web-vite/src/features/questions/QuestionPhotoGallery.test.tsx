// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { QuestionPhotoGallery } from "./QuestionPhotoGallery";
import type { PhotoLocation } from "./questionPhotoRead";

function envelope(data: unknown, status = 200) {
  return new Response(JSON.stringify({ success: status === 200, data }), { status });
}
const photo = (id: string) => ({ id, url: `https://cdn.example/${id}?token=ephemeral` });
async function flush() {
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 18)); });
}
async function render(
  fetcher: ReturnType<typeof vi.fn>, overrides: Partial<PhotoLocation> = {}, manual = false,
) {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal("fetch", fetcher);
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host);
  const location = { questionId: "question-1", photoIds: ["photo-1"], ...overrides };
  await act(async () => root.render(createElement(QuestionPhotoGallery, { location, manual })));
  return {
    host,
    async click(selector: string) {
      const button = document.querySelector<HTMLButtonElement>(selector);
      expect(button).not.toBeNull();
      await act(async () => button?.click());
      await flush();
    },
    async cleanup() { await act(async () => root.unmount()); host.remove(); },
  };
}
afterEach(() => { vi.unstubAllGlobals(); document.body.style.overflow = ""; });

describe("VK-inspired inline question photo previews", () => {
  it("does not crop a preview or force the original photo into a square or 4:3 frame", () => {
    const css = readFileSync("src/features/questions/QuestionPhotoGallery.css", "utf8");
    const tile = css.match(/\.question-photo-preview-tile \{([^}]*)\}/)?.[1];
    const image = css.match(/\.question-photo-preview-tile img \{([^}]*)\}/)?.[1];
    expect(tile).toBeDefined();
    expect(tile).not.toContain("aspect-ratio:");
    expect(image).toContain("width: auto;");
    expect(image).toContain("height: auto;");
    expect(image).toContain("object-fit: contain;");
    expect(css).not.toContain("object-fit: cover;");
    expect(css).not.toContain("transform: scale(");
  });
  it("displays an authorized thumbnail automatically and opens a fresh verified photo viewer", async () => {
    const fake = vi.fn((_url: string, _options?: RequestInit) =>
      Promise.resolve(envelope({ photos: [photo("photo-1")] })));
    const ui = await render(fake);
    try {
      await flush();
      expect(fake).toHaveBeenCalledTimes(1);
      expect(fake.mock.calls[0][0]).toBe("/api/v1/questions/question-1?page=1");
      expect(ui.host.textContent).not.toContain("Показать фотографии");
      const image = ui.host.querySelector(".question-photo-preview-tile img");
      expect(image?.getAttribute("src")).toContain("token=ephemeral");
      expect(image?.getAttribute("referrerpolicy")).toBe("no-referrer");
      await ui.click(".question-photo-preview-tile");
      expect(fake).toHaveBeenCalledTimes(2);
      await flush();
      expect(document.querySelector('[role="dialog"][aria-modal="true"]')).not.toBeNull();
      expect(document.querySelector(".question-photo-lightbox-image")?.getAttribute("src"))
        .toContain("token=ephemeral");
      await act(async () => window.dispatchEvent(new KeyboardEvent("keydown", {key:"Escape"})));
      expect(document.querySelector(".question-photo-lightbox")).toBeNull();
      expect(ui.host.querySelector(".question-photo-preview-tile img")).not.toBeNull();
    } finally { await ui.cleanup(); }
  });

  it("uses real width srcset for thumbnails and a larger fullscreen rendition",async()=>{
    const fake=vi.fn(()=>Promise.resolve(envelope({photos:[{
      id:"photo-1",url:"https://cdn.example/m.webp?sig=1",
      smallUrl:"https://cdn.example/s.webp?sig=1",
      smallWidth:360,smallHeight:576,width:720,height:1152,
    }]})));
    const ui=await render(fake);
    try{
      await flush();
      const image=ui.host.querySelector<HTMLImageElement>(".question-photo-preview-tile img");
      expect(image?.getAttribute("src")).toContain("/s.webp");
      expect(image?.getAttribute("srcset")).toContain("360w");
      expect(image?.getAttribute("srcset")).toContain("720w");
      expect(image?.getAttribute("sizes")).toContain("180px");
      expect(image?.getAttribute("width")).toBe("360");
      await ui.click(".question-photo-preview-tile");
      const viewer=document.querySelector<HTMLImageElement>(".question-photo-lightbox-image");
      expect(viewer?.getAttribute("src")).toContain("/m.webp");
      expect(viewer?.getAttribute("sizes")).toBe("100vw");
      expect(viewer?.getAttribute("height")).toBe("1152");
    }finally{await ui.cleanup();}
  });
  it("keeps queued media as a processing placeholder and hides failed originals",async()=>{
    const pending=vi.fn(()=>Promise.resolve(envelope({
      photos:[{id:"photo-1",url:"",status:"PROCESSING"}]})));
    const first=await render(pending);
    try{
      await flush();
      expect(first.host.querySelector(".question-photo-preview-tile img")).toBeNull();
      expect(first.host.textContent).toContain("Обрабатываем фото");
    }finally{await first.cleanup();}
    const failed=vi.fn(()=>Promise.resolve(envelope({
      photos:[{id:"photo-1",url:"",status:"FAILED"}]})));
    const second=await render(failed);
    try{
      await flush();
      expect(second.host.querySelector("img")).toBeNull();
      expect(second.host.textContent).toContain("Фото не удалось обработать");
      expect(second.host.textContent).toContain("замените его при редактировании");
      expect(second.host.textContent).not.toContain("Повторить загрузку");
    }finally{await second.cleanup();}
  });
  it("identifies legacy photos unavailable from a different S3 provider, without fake retry",async()=>{
    const fake=vi.fn(()=>Promise.resolve(envelope({
      photos:[{id:"photo-1",url:"",status:"UNAVAILABLE"}]})));
    const ui=await render(fake);
    try{
      await flush();
      expect(ui.host.textContent).toContain("Фото недоступно");
      expect(ui.host.textContent).toContain("из прежнего хранилища");
      expect(ui.host.textContent).not.toContain("Ошибка обработки");
      expect(ui.host.querySelector(".question-photo-preview-error button")).toBeNull();
    }finally{await ui.cleanup();}
  });
  it("keeps the photo open on image click, but closes on every dark area", async () => {
    const fake = vi.fn((_url: string, _options?: RequestInit) =>
      Promise.resolve(envelope({ photos: [photo("photo-1")] })));
    const ui = await render(fake);
    try {
      await flush();
      const thumbnail = ui.host.querySelector<HTMLButtonElement>(
        ".question-photo-preview-tile",
      );
      expect(thumbnail).not.toBeNull();
      await ui.click(".question-photo-preview-tile");
      const close = document.querySelector<HTMLButtonElement>(
        ".question-photo-lightbox-close",
      );
      expect(close?.querySelector("svg path")?.getAttribute("d"))
        .toBe("M18 6 6 18M6 6l12 12");
      expect(close?.textContent).not.toContain("×");
      await act(async () => document.querySelector<HTMLImageElement>(
        ".question-photo-lightbox-image",
      )?.click());
      expect(document.querySelector(".question-photo-lightbox")).not.toBeNull();

      // This full-viewport inner container previously swallowed backdrop hits.
      await act(async () => document.querySelector<HTMLElement>(
        ".question-photo-lightbox-content",
      )?.click());
      expect(document.querySelector(".question-photo-lightbox")).toBeNull();
      expect(document.activeElement).toBe(thumbnail);
      await ui.click(".question-photo-preview-tile");
      await act(async () => document.querySelector<HTMLElement>(
        ".question-photo-lightbox",
      )?.click());
      expect(document.querySelector(".question-photo-lightbox")).toBeNull();
      expect(document.activeElement).toBe(thumbnail);

      await ui.click(".question-photo-preview-tile");
      await ui.click(".question-photo-lightbox-close");
      expect(document.querySelector(".question-photo-lightbox")).toBeNull();
    } finally { await ui.cleanup(); }
  });

  it("keeps out-of-viewport media idle until intersection and does not cache signed URLs", async () => {
    let show!: () => void;
    class FakeObserver {
      constructor(callback: (entries: {isIntersecting:boolean}[]) => void) {
        show = () => callback([{ isIntersecting: true }]);
      }
      observe() { /* no visible intersection yet */ }
      disconnect() { /* viewport disconnected */ }
    }
    vi.stubGlobal("IntersectionObserver", FakeObserver);
    const fake = vi.fn(() => Promise.resolve(envelope({ photos: [photo("photo-1")] })));
    const ui = await render(fake);
    try {
      await flush();
      expect(fake).not.toHaveBeenCalled();
      expect(ui.host.querySelector(".question-photo-preview-placeholder")).not.toBeNull();
      await act(async () => show());
      await flush();
      expect(fake).toHaveBeenCalledTimes(1);
      expect(ui.host.querySelector(".question-photo-preview-tile img")).not.toBeNull();
    } finally { await ui.cleanup(); }
  });

  it("owner editor keeps a small on-demand attachment control, not eager signed GETs", async () => {
    const fake = vi.fn(() => Promise.resolve(envelope({ photos: [photo("photo-1")] })));
    const ui = await render(fake, {}, true);
    try {
      await flush();
      expect(fake).not.toHaveBeenCalled();
      expect(ui.host.textContent).toContain("Фотографии · 1");
      expect(ui.host.textContent).not.toContain("Показать фотографии");
      await ui.click(".question-photo-manual-toggle");
      expect(fake).toHaveBeenCalledTimes(1);
      expect(ui.host.querySelector(".question-photo-preview-tile img")).not.toBeNull();
      await ui.click(".question-photo-manual-toggle");
      expect(ui.host.querySelector("img")).toBeNull();
    } finally { await ui.cleanup(); }
  });

  it("falls back from CDN to public Questions S3 for both thumbnail and viewer", async () => {
    const cdn="https://ebiteskukingusk.begetcdn.cloud/questions/uploads/questions/v2/owner-1/id/v1/image";
    const s3="https://gafus-questions-public.s3.cloud.ru/questions/uploads/questions/v2/owner-1/id/v1/image";
    const fake=vi.fn(()=>Promise.resolve(envelope({ photos: [{
      id:"photo-1",url:cdn+"/m.webp",smallUrl:cdn+"/s.webp",
      fallbackUrl:s3+"/m.webp",fallbackSmallUrl:s3+"/s.webp",
      smallWidth:360,width:720,
    }] })));
    const ui=await render(fake);
    try {
      await flush();
      let thumbnail=ui.host.querySelector<HTMLImageElement>(".question-photo-preview-tile img");
      expect(thumbnail?.src).toBe(cdn+"/s.webp");
      await act(async()=>thumbnail?.dispatchEvent(new Event("error")));
      thumbnail=ui.host.querySelector(".question-photo-preview-tile img");
      expect(thumbnail?.src).toBe(s3+"/s.webp");
      expect(thumbnail?.getAttribute("srcset")).toBeNull();
      await ui.click(".question-photo-preview-tile");
      let full=document.querySelector<HTMLImageElement>(".question-photo-lightbox-image");
      expect(full?.src).toBe(cdn+"/m.webp");
      await act(async()=>full?.dispatchEvent(new Event("error")));
      full=document.querySelector(".question-photo-lightbox-image");
      expect(full?.src).toBe(s3+"/m.webp");
      expect(full?.getAttribute("srcset")).toBeNull();
      expect(document.querySelector(".question-photo-lightbox-error")).toBeNull();
      await act(async()=>full?.dispatchEvent(new Event("error")));
      expect(document.querySelector(".question-photo-lightbox-error")).not.toBeNull();
    } finally { await ui.cleanup(); }
  });

  it("an expired or broken thumbnail offers an explicit safe re-read", async () => {
    const fake = vi.fn(() => Promise.resolve(envelope({ photos: [photo("photo-1")] })));
    const ui = await render(fake);
    try {
      await flush();
      const image = ui.host.querySelector(".question-photo-preview-tile img");
      await act(async () => image?.dispatchEvent(new Event("error")));
      expect(ui.host.querySelector(".question-photo-preview-tile img")).toBeNull();
      expect(ui.host.textContent).toContain("Некоторые фотографии не загрузились");
      await ui.click(".question-photo-preview-error button");
      expect(fake).toHaveBeenCalledTimes(2);
      expect(ui.host.querySelector(".question-photo-preview-tile img")).not.toBeNull();
    } finally { await ui.cleanup(); }
  });

  it("a denied read does not reveal an image; retry performs only a fresh GET", async () => {
    const fake = vi.fn()
      .mockResolvedValueOnce(envelope(null, 403))
      .mockResolvedValueOnce(envelope({ photos: [photo("photo-1")] }));
    const ui = await render(fake);
    try {
      await flush();
      expect(ui.host.querySelector("img")).toBeNull();
      expect(ui.host.querySelector('[role="alert"]')?.textContent)
        .toContain("Не удалось загрузить фотографии");
      await ui.click(".question-photo-preview-error button");
      expect(fake).toHaveBeenCalledTimes(2);
      expect(fake.mock.calls.every(call => call[1]?.method === "GET")).toBe(true);
      expect(ui.host.querySelector(".question-photo-preview-tile img")).not.toBeNull();
    } finally { await ui.cleanup(); }
  });

  it("renders a bounded two-image grid, keyboard gallery navigation and no extra read for each step", async () => {
    const fake = vi.fn(() => Promise.resolve(envelope({
      answers: [{ id: "answer-1", photos: [photo("photo-1"), photo("photo-2")] }],
    })));
    const ui = await render(fake, { answerId: "answer-1", photoIds: ["photo-1", "photo-2"] });
    try {
      await flush();
      expect(ui.host.querySelectorAll(".question-photo-preview-tile")).toHaveLength(2);
      await ui.click(".question-photo-preview-tile");
      expect(document.querySelector(".question-photo-lightbox-bottom")?.textContent)
        .toContain("1 из 2");
      await act(async () => window.dispatchEvent(new KeyboardEvent("keydown", {key:"ArrowRight"})));
      expect(document.querySelector(".question-photo-lightbox-bottom")?.textContent)
        .toContain("2 из 2");
      await ui.click('[aria-label="Предыдущая фотография"]');
      expect(document.querySelector(".question-photo-lightbox-bottom")?.textContent)
        .toContain("1 из 2");
      expect(fake).toHaveBeenCalledTimes(2);
    } finally { await ui.cleanup(); }
  });

  it("on viewer revalidation failure never displays the thumbnail signature as fullscreen media", async () => {
    const fake = vi.fn()
      .mockResolvedValueOnce(envelope({ photos: [photo("photo-1")] }))
      .mockResolvedValueOnce(envelope(null, 403));
    const ui = await render(fake);
    try {
      await flush();
      await ui.click(".question-photo-preview-tile");
      expect(document.querySelector(".question-photo-lightbox-image")).toBeNull();
      expect(document.querySelector('.question-photo-lightbox [role="alert"]')?.textContent)
        .toContain("Фотография недоступна");
      await ui.click('[aria-label="Закрыть просмотр"]');
      expect(document.querySelector(".question-photo-lightbox-image")).toBeNull();
      expect(fake).toHaveBeenCalledTimes(2);
    } finally { await ui.cleanup(); }
  });
});
