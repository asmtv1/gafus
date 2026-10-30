// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MomentLocalMediaPreview } from "./MomentLocalMediaPreview";

const photo = new File(["photo"], "avatar.webp", { type: "image/webp", lastModified: 3 });
const video = new File(["video"], "training.mp4", { type: "video/mp4", lastModified: 4 });
const urls: string[] = [];
const revoked: string[] = [];

afterEach(() => { vi.unstubAllGlobals(); urls.length = 0; revoked.length = 0; });

describe("Moment selected photo and video local previews", () => {
  it("previews image and video immediately without uploading; removes and revokes local URLs", async () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn(() => {
        const next = `blob:fake-preview-${urls.length}`;
        urls.push(next);
        return next;
      }),
      revokeObjectURL: vi.fn((url: string) => revoked.push(url)),
    });
    const host = document.createElement("div"); document.body.append(host);
    const root = createRoot(host);
    const onRemove = vi.fn();
    try {
      await act(async () => root.render(<MomentLocalMediaPreview
        files={[photo, video]} disabled={false} onRemove={onRemove}/>));
      const img = host.querySelector<HTMLImageElement>("img");
      const player = host.querySelector<HTMLVideoElement>("video");
      expect(img?.alt).toBe("Предпросмотр фото avatar.webp");
      expect(img?.src).toContain("blob:fake-preview-0");
      expect(player?.getAttribute("aria-label")).toBe("Предпросмотр видео training.mp4");
      expect(player?.controls).toBe(true);
      expect(player?.getAttribute("preload")).toBe("auto");
      expect(host.querySelectorAll(".web4-compose-media-preview li")).toHaveLength(2);
      const remove = host.querySelector<HTMLButtonElement>(
        'button[aria-label="Убрать файл avatar.webp"]');
      await act(async () => remove?.click());
      expect(onRemove).toHaveBeenCalledExactlyOnceWith(0);
      await act(async () => root.render(<MomentLocalMediaPreview
        files={[video]} disabled={false} onRemove={onRemove}/>));
      expect(host.querySelector("img")).toBeNull();
      expect(host.querySelector("video")).not.toBeNull();
      expect(revoked).toContain("blob:fake-preview-0");
      expect(revoked).toContain("blob:fake-preview-1");
    } finally {
      await act(async () => root.unmount());
      host.remove();
    }
    expect(urls).toHaveLength(revoked.length);
    expect(new Set(urls)).toEqual(new Set(revoked));
  });
  it("does not use upload or media resource API when selection is empty", async () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const create = vi.fn(() => "blob:unexpected");
    vi.stubGlobal("URL", { createObjectURL: create, revokeObjectURL: vi.fn() });
    const host = document.createElement("div"); document.body.append(host);
    const root = createRoot(host);
    try {
      await act(async () => root.render(<MomentLocalMediaPreview
        files={[]} disabled={false} onRemove={vi.fn()}/>));
      expect(host.innerHTML).toBe("");
      expect(create).not.toHaveBeenCalled();
    } finally { await act(async () => root.unmount()); host.remove(); }
  });
});
